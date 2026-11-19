---
name: pr-review-mode
description: Revisão orquestrada de PR — classifica o diff, despacha um specialist por parte alterada, consolida os achados e publica UM comentário de revisão no PR. Use quando um PR é aberto, quando a branch avança, ou quando o pedido for "revisar o PR".
type: workflow
---

# Workflow: `pr-review-mode`

> A regra que este workflow cumpre está em
> [`pr-review.md`](../specs/conventions/pr-review.md). O instrumento que a cobra
> está em [`tooling/scripts/pr-review-gate.ts`](../../tooling/scripts/pr-review-gate.ts).

## Composição

**parallel → merge**: um specialist por **parte do diff**, em paralelo; o
orquestrador consolida; **um** comentário no PR.

```
diff do PR
   │
   ├─ pnpm review:route ──────────────► despacho (reviewers + evidência)
   │
   ├─ specialist PARTE 1  ┐
   ├─ specialist PARTE 2  ├─ em paralelo (mesma mensagem do Agent tool)
   ├─ specialist PARTE 3  ┤
   └─ specialist PARTE N  ┘
   │
   ▼
consolidação (dedup + severidade) ──► 1 comentário no PR (marcador)
   │
   ▼
gate `review-comment` (CI) ──► verde
```

## Quando disparar

| Situação | Dispara? |
|---|---|
| PR aberto / reaberto | ✅ sim |
| Branch avançou depois da revisão | ✅ sim — o diff mudou, a revisão anterior não vale |
| Pedido explícito ("revisar o PR #N") | ✅ sim |
| PR já revisado e **sem** push novo | ❌ não — repetir seria o mesmo relatório |
| PR **merged** ou **closed** | ❌ não — o histórico é imutável |

## Passo 1 — Medir o diff

```bash
PR=<n>
BASE=origin/main
git fetch origin "$BASE" --quiet
git diff --name-only "$BASE"...HEAD > /tmp/pr-paths.txt
git log --format=%s "$BASE"..HEAD        > /tmp/pr-commits.txt
git diff "$BASE"...HEAD                  > /tmp/pr.diff
```

`BASE` é a base **do PR**, não `main` por hábito: `gh pr view "$PR" --json
baseRefName` é a fonte. Em PR para `main`, `origin/main` serve.

## Passo 2 — Classificar (o roteamento decide quem)

O roteamento **já existe** e é determinístico: a matriz
[`review-routing.md`](../specs/conventions/review-routing.md) casa `path_glob` e
tipos de commit com reviewers.

```bash
cd tooling/scripts
pnpm review:route \
  --paths=/tmp/pr-paths.txt \
  --commits=/tmp/pr-commits.txt \
  --matrix=../../.agents/specs/conventions/review-routing.md \
  --output=/tmp/pr-dispatch.yaml < /tmp/pr.diff
```

A saída é o despacho. **Exit 3** = há `diff_pattern` com `blocking: true` — o
diff toca área que exige revisão bloqueante; isso não impede o passo 3.

> ⚠️ A matriz devolve **reviewers**, não **partes**. Um reviewer pode cobrir
> várias partes e uma parte pode merecer **dois** reviewers. O passo 3 divide
> por **área do diff**, não pela lista de reviewers.

## Passo 3 — Dividir o diff em partes

Uma parte = um grupo de arquivos com **um** dono de especialidade. Não é o
arquivo: é a área.

| Área | Paths | Specialist | Skill de processo |
|---|---|---|---|
| API — domínio/aplicação | `apps/api/src/**/{domain,application}/**` | `nestjs-specialist` | `ddd-hexagonal-validation` |
| API — infraestrutura/contrato | `apps/api/src/**/{infrastructure,http}/**`, `*.controller.ts` | `nestjs-specialist` + `openapi-contract-specialist` | `openapi-audit` |
| API — dados | `apps/api/prisma/**`, queries de repositório | `prisma-db-specialist` | `prisma-audit` |
| Web — rotas e server | `apps/web/app/**/page.tsx`, `layout.tsx` | `nextjs-specialist` | — |
| Web — UI e componentes | `apps/web/components/**`, `apps/web/app/**/*.tsx` | `ux-design-specialist` | `ui-review` |
| Tenancy | `apps/api/src/**/tenancy*`, `apps/web/lib/tenancy.ts` | `multi-tenant-specialist` | `multi-tenant-audit` |
| Segurança | auth, guards, secrets, auditoria | `security-auditor` | — |
| Testes | `**/*.spec.ts`, `**/e2e/**` | `code-reviewer` | — |
| Docs | `docs/**`, `.agents/specs/**` | `documentation-specialist` | `documentation-audit` |
| CI e tooling | `.tooling/**`, `tooling/**`, `.github/**`, `turbo.json` | `monorepo-specialist` | `ci-defense-in-depth` |

**Regras de partilha:**

- Uma parte com **nenhum** arquivo alterado **não** vira specialist.
- O mesmo arquivo pode aparecer em **duas** partes (ex.: um controller é API e
  é contrato) — o specialist vê o arquivo inteiro.
- **Specialist de segurança** é acrescentado a qualquer parte que toque auth,
  tenant, auditoria ou segredo. O roteamento não cobre isso.

## Passo 4 — Despachar em paralelo

**Um agent por parte, todos na mesma mensagem do Agent tool** (o paralelismo é
da chamada, não do texto). O prompt de cada um segue o formato canônico de
[`agents-coordinate`](../skills/agents-coordinate/SKILL.md):

```
## Task
Revisar a parte <ÁREA> do PR #<n> — o que está errado e o que poderia ter
sido feito melhor.

## Context
- Repo: <path>. Branch: <branch>. Base: <base>.
- Diff: `git diff <base>...HEAD`.
- Arquivos do seu escopo: <paths>.
- Convenções: <as da área> (leia o arquivo da convenção).

## Expected Output
Markdown, pt-BR, sem praise. Por achado: severidade (P0/ALTO/MÉDIO/BAIXO/INFO),
`arquivo:linha`, o que está errado, impacto concreto, conserto. Fecha com
"## Veredito desta parte".

## Success Criteria
- Todo achado aponta arquivo:linha do código novo.
- Afirmação de bug cita o trecho e o cenário que ele produz.
- "Sem problema" é resposta válida e vai no veredito.
```

**Os agents de review são read-only.** Nenhum edita arquivo, não commita, não
faz `checkout`/`stash`/`reset` — o reviewer que mexe no worktree quebra o
tree de quem está implementando.

## Passo 5 — Consolidar

1. **Dedup**: o mesmo defeito reportado por duas partes é **um** achado. A
   fonte é a linha `arquivo:linha`, não o texto.
2. **Severidade**: a mais alta entre as áreas. `P0` = dado errado, segredo
   exposto, vazamento entre empresas, doc que mente. `ALTO` = quebra em
   produção. `MÉDIO` = defeito com contorno. `BAIXO` = dívida. `INFO` =
   melhoria de forma.
3. **Ordem**: P0 → ALTO → MÉDIO → BAIXO → INFO.
4. **O que não foi verificado** entra no relatório (ver §O comentário).

## Passo 6 — Publicar UM comentário

```bash
PR=<n>
cat > /tmp/pr-review.md <<'MD'
<!-- pr-review -->
## Revisão orquestrada do PR #<n>

**Partes analisadas:** <área> (<specialist>) · …
**Achados:** <N> (P0: <n> · ALTO: <n> · MÉDIO: <n> · BAIXO: <n> · INFO: <n>)

### [P0] título
- **Arquivo:** `caminho:linha`
- **O que está errado:** …
- **Impacto:** …
- **Conserto:** …

### Não verificado
- <o que ficou de fora, e por quê>
MD

gh api -X POST "repos/$REPO/pulls/$PR/reviews" \
  -F body=@/tmp/pr-review.md -f event=COMMENT
```

> ⚠️ **`-F`, não `-f`**: `gh api -f body=@arquivo` manda o **literal**
> `"@arquivo"` como corpo e responde **200** — o comentário sai publicado com
> o texto errado. `-F body=@arquivo` lê o arquivo. Depois de publicar, **releia**
> e compare.

O `<!-- pr-review -->` é obrigatório: é o que o gate procura.

## Passo 7 — Conferir o gate

```bash
pnpm pr:review-check --pr=<n> --repo=owner/nome   # local, usa o `gh` autenticado
```

> ⚠️ O `--repo` é o que o comando usa **fora de um clone**; dentro do repo, o
> `origin` do git serve e a flag é redundante. MEDIDO 2026-11-18 na 5ª revisão
> do PR #171: o comando **sem** a flag saía 1 ("não sei qual repositório ler")
> — e quem segue o passo lia vermelho DEPOIS de publicar, e publicava de novo.

Verde = o gate enxerga o comentário. **Vermelho depois de publicar** = o
comentário não carrega o marcador, ou não foi publicado no PR certo.

**`NÃO VERIFICADO`** = o gate não mediu nada, e a mensagem diz **qual** dos
dois motivos foi: "o número {n} não é um PR" (o número é de uma issue) ou "a
API não respondeu" (o `gh` sem token ou sem permissão). Os dois têm conserto
próprio — e o de "não é PR" NÃO é autenticar o `gh`.

## O comentário consolidado — formato

O gate mede o **marcador**; o conteúdo é o que faz a revisão valer:

```markdown
<!-- pr-review -->
## Revisão orquestrada do PR #171

**Partes analisadas:** API/auditoria (nestjs-specialist) · Web/UI
(ux-design-specialist) · Tenancy (multi-tenant-specialist) · Segurança
(security-auditor) · Testes (code-reviewer) · Docs/CI (documentation-specialist)

**Achados: 12** (P0: 1 · ALTO: 2 · MÉDIO: 5 · BAIXO: 3 · INFO: 1)

### [P0] O cursor de outra trilha devolve uma página errada
- **Arquivo:** `apps/api/src/shared/audit/infrastructure/prisma-audit.service.ts:88`
- **O que está errado:** o subselect do cursor filtra por `version` e **não** por `entity_id`.
- **Impacto:** o cursor de uma trilha devolve a página **errada** — e não um erro, então nada acusa.
- **Conserto:** filtrar o subselect por `entity_id` e trocar o offset por range de `version`.

### Não verificado
- A query real não foi rodada contra o Postgres do CI (só contra o adapter in-memory).
```

A seção **"Não verificado"** não é cortesia: um relatório que não diz o que
ficou de fora lê como "não tinha nada".

## Erros conhecidos

| Erro | Sinal | Conserto |
|---|---|---|
| Reviewer edita o worktree | `git status` sujo depois do despacho | Dispatch read-only; nunca despachar reviewer que commita |
| `gh api -f body=@arq` publica `"@arq"` | comentário com o texto literal | usar `-F` e **reler** o publicado |
| O gate fica vermelho depois da revisão | nenhum evento disparou | o `pull_request_review` precisa estar no `on:` do workflow |
| O mesmo defeito reportado 2× | 2 achados com o mesmo `arquivo:linha` | dedup por `arquivo:linha` na consolidação |
| O `review:route` não roda | exit 2 | `pnpm install` em `tooling/scripts` (o pacote é isolado) |

## Referências

- [`pr-review.md`](../specs/conventions/pr-review.md) — a regra
- [`review-routing.md`](../specs/conventions/review-routing.md) — a matriz do roteamento
- [`agents-coordinate`](../skills/agents-coordinate/SKILL.md) — o formato do despacho
- [`pr-pendencias.md`](./pr-pendencias.md) — o irmão que resolve pendência por pendência
