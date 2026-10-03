---
name: melhorias-fluxo-fase-3-p1-docs-part-01
description: Fase 3 (P1 docs) parte 1 — 2 tasks que corrigem README.md e docs/STACK.md, que afirmam que apps/api e apps/web nao existem, e atualizam a arvore de estrutura e as 5 contagens desatualizadas do README.
version: 1.1.0
updated: 2026-10-02
maintainer: doc-writer
state_snapshot: .agents/runs/state-snapshot-<ts>.md
related:
  - ./2026-10-02-melhorias-fluxo-desenvolvimento.md
  - ./2026-10-02-melhorias-fluxo-desenvolvimento-fase-3-p1-docs-part-02.md
  - ../../fluxo-desenvolvimento.md
---

# Fase 3 (P1 docs) — Parte 1: os documentos que mentem sobre o produto

> **Pré-requisito:** Fase 2 completa.
> **Próxima parte:** [F3-P1-P02](./2026-10-02-melhorias-fluxo-desenvolvimento-fase-3-p1-docs-part-02.md)
> **Agente responsável:** `doc-writer` (redação) · `code-reviewer` (revisão).
> **Por que P1 e não P2.** A convenção
> [`state-aware-planning.md`](../../../.agents/specs/conventions/state-aware-planning.md)
> obriga gerar um `state-snapshot` **antes** de planejar, e o snapshot é feito
> lendo os documentos canônicos. Se o README afirma que o produto não existe,
> **todo plano futuro começa de uma base factual errada**.
> **As duas tasks desta parte são doc-only.** Nenhum arquivo de código.

---

## F3-T1 — Corrigir `README.md` e `docs/STACK.md`, que afirmam que os apps não existem

**Arquivos tocados**

- Modify: `README.md:251` (título da seção), `README.md:259` (blockquote)
- Modify: `docs/STACK.md:4`

**Contexto verificado.**

```bash
sed -n '259p' README.md
```

> **⚠️ IMPORTANTE:** A stack está **configurada** (agents specialists prontos, convenções documentadas) mas os apps `apps/api` e `apps/web` ainda **não foram criados**. Crie-os somente quando for implementar a primeira feature.

Realidade no disco:

```bash
find apps -name '*.spec.ts*' | wc -l
find apps/api/src/modules/users -maxdepth 2 -type d | sort
```

```text
41
apps/api/src/modules/users
apps/api/src/modules/users/application          …/application/dto
apps/api/src/modules/users/application          …/application/exceptions
apps/api/src/modules/users/domain               …/domain/events
apps/api/src/modules/users/domain               …/domain/exceptions
apps/api/src/modules/users/domain               …/domain/ports
apps/api/src/modules/users/domain               …/domain/value-objects
apps/api/src/modules/users/infrastructure      …/infrastructure/http
apps/api/src/modules/users/infrastructure      …/infrastructure/persistence
```

A mesma frase está em `docs/STACK.md:4` — e **esse arquivo se contradiz**:
`docs/STACK.md:83` é o título `## Containerização`, e a entrada de histórico na
`:146` do próprio arquivo descreve *"Dockerfiles multi-stage (api+web),
docker-compose (prod)"*.

**Passos**

1. `README.md:251` — renomear a seção:
   `## Stack Configurada (configurar, não criar ainda)` → `## Stack e Apps Implementados`.

2. `README.md:259` — substituir o blockquote por 1 parágrafo de estado real,
   reaproveitando o procedimento que **já existe** em `README.md` (§Como
   executar localmente) — não inventar comando novo:

   > Os apps `apps/api` (NestJS 11 + Fastify + Prisma 6 + PostgreSQL, 41 arquivos
   > de spec) e `apps/web` (Next.js 15 App Router) **já estão implementados** —
   > bounded context `users` com auditoria, em camadas `domain/`,
   > `application/` e `infrastructure/` conforme o
   > [ADR-0001](../../adr/0001-arquitetura-ddd-hexagonal-auditoria.md).
   > Para subir localmente, ver a seção "Como executar localmente" do README
   > (`README.md:74`).
   > **Correção sobre a v1.0.0:** ela citava
   > `.agents/specs/conventions/estrutura-e-versionamento.md` como se fosse o
   > ADR. O ADR-0001 real é `docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md`
   > (`ls docs/adr/` → 1 arquivo). `estrutura-e-versionamento.md` é a convenção
   > que **referencia** o ADR — trocá-los inverteria a fonte da verdade.

3. `docs/STACK.md:4` — mesma correção em 1 linha, remetendo a `docs/MONOREPO.md`
   e à própria seção `## Containerização` (`:83`).

4. **Regra de ouro desta fase:** a lista de *"o que ainda não existe"*
   (Redis/BullMQ, auth, `packages/ui`, Playwright) só permanece se **cada item
   vier de um comando reproduzível**:

   ```bash
   ls packages/
   grep -rln 'bullmq\|ioredis' apps/*/package.json
   ```

   > Item de "o que falta" sem comando é exatamente a mesma memória
   > desatualizada que esta task está corrigindo — e é pior, porque se
   > autoincende. Preferir **omitir** a seção a mantê-la sem prova.

5. Commit:

   ```bash
   git add README.md docs/STACK.md
   git commit -m "fix(docs): README e STACK afirmavam que apps/api e apps/web nao existem

   README.md:259 e docs/STACK.md:4 diziam 'ainda nao foram criados'. Os dois
   existem: apps/api (NestJS 11 + Prisma 6 + Postgres) com BC 'users' em
   domain/application/infrastructure, 41 arquivos de spec; e apps/web
   (Next.js 15 App Router). O proprio docs/STACK.md se contradizia — :83 e a
   secao 'Containerizacao' e :146 descreve os Dockerfiles de api+web.

   O ADR citado e docs/adr/0001-arquitetura-ddd-hexagonal-auditoria.md, nao
   .agents/specs/conventions/estrutura-e-versionamento.md (que apenas o
   referencia).

   Impacto: state-aware-planning exige mapear o estado antes de planejar e
   o snapshot e feito lendo os docs canonicos — todo plano comeca de uma
   base factual errada.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

**Critério de aceite**

```bash
grep -c 'não foram criados' README.md docs/STACK.md
```

**Output esperado:** `0` nos dois. Baseline **B15**: `1` → `0`.

> O `grep -c` em 2 arquivos imprime `arquivo:N`, não escalar — por isso o
> verificador (§F1-T2) nega o `grep -q` e compara o **status**: hoje `1`,
> depois `0`.

**Gate que valida:** revisão do PR + `checkDocRefs` (§F2-T2 passa a cobrir
`docs/`), que acusa link quebrado introduzido na reescrita.

---

## F3-T2 — Atualizar a árvore de estrutura e as contagens do `README.md`

**Arquivos tocados**

- Modify: `README.md:20-70` (árvore), `:28` (`13 agents`), `:42` (`13 arquivos`
  de memória), `:58` (`11 workflows`)

**Contexto verificado — contagens declaradas vs. medidas.**

| Métrica | Linha | Declarado | Comando | Real |
|---|---|---|---|---|
| agents | `README.md:28` | `13 agents (10 genéricos + 3 specialists de stack)` | `ls .agents/agents/*.md \| wc -l` | **19** |
| memórias | `README.md:42` | `Memória acumulada por agent (13 arquivos)` | `ls .agents/memory/*.md \| wc -l` | **21** |
| skills | `README.md:43-44` | 1 (só `agents-coordinate`, enumerado) | `ls .agents/skills/ \| wc -l` | **9** |
| convenções | `README.md:49-57` | 6 listadas | `ls .agents/specs/conventions/*.md \| wc -l` | **19** |
| workflows | `README.md:58` | `11 workflows` | `ls .agents/workflows/*.md \| wc -l` | **10** |

A árvore (`:20-70`) **não lista** `apps/`, `packages/`, `tooling/`, `turbo.json`
nem `pnpm-workspace.yaml` — só `.agents/` e `docs/`. A fonte correta já existe:
`docs/MONOREPO.md §1`.

**A enumeração de agents também está incompleta.** `README.md:29-41` lista 13
arquivos; os **6 que faltam** são `docker-specialist.md`, `doc-sync.md`,
`review-router.md`, `specialist-router.md`, `stack-code-reviewer.md` e
`telemetry-specialist.md`.

**Margem disponível.** `wc -l README.md` → **284** contra o teto de 300
(`.agents/specs/conventions/tamanho-e-revisao.md`): folga de **16 linhas**.
A task insere **6** linhas de agent + **5** de diretórios = **11**. Sobram **5**.

**Passos**

1. Inserir na árvore apenas os diretórios que faltam — **5 linhas**, espelhando
   `docs/MONOREPO.md §1`:

   ```text
   │   ├── apps/                          # api (NestJS) + web (Next.js)
   │   ├── packages/                      # eslint-config, shared-types, tsconfig
   │   ├── tooling/scripts/               # stack-code-reviewer, doc-sync, routers
   │   ├── turbo.json                     # pipeline cacheado (turbo)
   │   └── pnpm-workspace.yaml
   ```

2. Completar a enumeração de agents com os **6** que faltam e corrigir a
   contagem: `13 agents (10 genéricos + 3 specialists de stack)` →
   `19 agents (10 genéricos + 7 specialists + 2 routers)`.
   Verificar a composição: dos 19, 10 são genéricos (§3 de `AGENTS.md`),
   7 são specialists de stack e 2 são routers (`review-router`,
   `specialist-router`).

3. Corrigir as 2 contagens restantes: `13 arquivos` de memória → `21`;
   `11 workflows` → `10`.

4. **Deletar as contagens que não são parseáveis** (skills e convenções estão
   representadas por enumeração parcial; o número é a própria raiz do drift):

   ```text
   │   ├── skills/                         # coordination, routing, validação
   │   └── specs/conventions/              # tdd, git-workflow, cobertura, tamanho…
   ```

   > Preferir referência a `AGENTS.md §3` e `AGENTS.md §6` a replicar o número.
   > Contagem manual em árvore ASCII-art é o que produz o drift; um check de
   > contagem no CI custaria mais do que previne (backlog **BL4** do §F4-T5).

5. **Conferir a margem antes de commitar:**

   ```bash
   wc -l README.md
   ```

   **Output esperado:** `≤ 295`. Se exceder, cortar a enumeração de skills.

6. Commit:

   ```bash
   git add README.md
   git commit -m "fix(docs): arvore e contagens do README desatualizadas

   Declarava 13 agents (real 19), 13 memorias (real 21) e 11 workflows
   (real 10); a enumeracao de agents omitia 6 arquivos (docker-specialist,
   doc-sync, review-router, specialist-router, stack-code-reviewer,
   telemetry-specialist). A arvore (linhas 20-70) nao listava apps/,
   packages/, tooling/, turbo.json nem pnpm-workspace.yaml.

   Espelha docs/MONOREPO.md §1, que ja estava correta. Remove as contagens
   de skills (9) e convencoes (19) em vez de replica-las: contagem manual
   em arvore ASCII-art e a propria raiz do drift. 11 linhas inseridas;
   README vai de 284 para 295 contra o teto de 300.

   Co-Authored-By: Claude Code <noreply@anthropic.com>"
   ```

**Critério de aceite**

```bash
grep -c '19 agents' README.md
wc -l README.md
```

**Output esperado:** `1` e `≤ 295`. Baseline **B16**: `0` → `1`.

**Gate que valida:** `checkDocRefs` (§F2-T2) para os links da árvore reescrita.
> **Não há gate de formatação de markdown:** `format:check`
> (`package.json:27`) só cobre `"**/*.{ts,tsx,json,yaml,yml}"` e
> `.prettierignore` lista `*.md`; o `.markdownlint.json` existe mas o
> `markdownlint` não está em `node_modules/.bin` nem em script/CI. Por isso o
> critério acima é `wc -l`, não formatter.

---

**Mantido por:** projeto-base contributors
**Licença:** MIT · **Versão:** 1.1.0 · **Atualizado:** 2026-10-02
