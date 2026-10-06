---
name: fluxo-desenvolvimento
description: Documento canonico do fluxo de desenvolvimento do repositorio, do primeiro comando ao merge — das 3 camadas (hooks locais, CI remoto, processo de agents) aos gates que cada uma dispara, com o estado real (wired / unwired) de cada mecanismo.
version: 1.1.0
updated: 2026-10-03
maintainer: stack-code-reviewer
---

# FLUXO DE DESENVOLVIMENTO — do primeiro comando ao merge

> Documento canônico do **fluxo**. Para *o que* o repo faz, veja [`MONOREPO.md`](./MONOREPO.md) e [`STACK.md`](./STACK.md).
> Para *por que* existem 3 camadas, veja [`ci-defense-in-depth.md`](../.agents/specs/conventions/ci-defense-in-depth.md).
> Este documento é **factual**: onde um gate não existe ou não bloqueia, está escrito que não existe.

---

## §1. TL;DR

1. **Antes de qualquer coisa**: `pnpm install` e, se for planejar, gerar um *state-snapshot* (camada de agents).
2. **Commit** dispara `pre-commit`: `lint-staged` (só Prettier) + `stack-code-reviewer` (único que aborta em pre-commit) + `doc-sync` (roda mas nunca aborta — ver §7.2).
3. **Push** dispara `pre-push`: `pnpm ci:preflight` — os gates estruturais declarados em
   [`preflight.ts`](../.tooling/scripts/ci/preflight.ts); aborta com exit 1 se algum falhar.
4. **PR para `main`** dispara 3 jobs de CI (`preflight`, `quality`, `docker-build-prod`) + `stack-code-review` + `docs-sync`. **Pós-#44** os jobs `preflight` e `quality` rodam a suíte do tooling, que valida os próprios dentes dele — contagem por `pnpm tooling:test` (dois roots).
5. **Merge em `main`** só dispara `release-template` (auto-tag) **se** o commit tocar `docs/MONOREPO.md`.

> **Ressalva crítica:** nenhum check de CI é *required_status_check* (apenas `quality` em `main` é *required* via ruleset — ver §7.2). A garantia real é a cadeia do workflow (`preflight` bloqueia `quality` via `needs:`), não o check isolado.

---

## §2. As 3 camadas

```text
        git checkout main
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│ (C) PROCESSO DE AGENTS — antes de codar                      │
│     state-aware-planning → state-snapshot-<ts>.md            │
│     specialist-router  → classifica demanda                  │
│     specialist         → implementa (DDD/Hexagonal)          │
│     review-router      → dispara reviewers em paralelo       │
│     retrospective-mode → captura aprendizados                │
│   ⚠ wired em prosa. Só 2 agents (stack-code-reviewer,       │
│     doc-sync) são invocados por hook — os outros 17 são      │
│     prosa pura (ver §7).                                     │
└──────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│ (A) ENFORCEMENT LOCAL — antes de qualquer push               │
│     pre-commit ─ lint-staged      → prettier --write         │
│                  stack-code-reviewer → exit 1 se blocker     │
│                  doc-sync          → NUNCA aborta (§7)       │
│     pre-push   ─ ci:preflight     → exit 1 se falhar       │
│   ✅ IMPOSTO localmente, burlável com --no-verify            │
└──────────────────────────────────────────────────────────────┘
               │
               ▼  git push / PR
┌──────────────────────────────────────────────────────────────┐
│ (B) CI/CD REMOTO — .github/workflows/                        │
│     ci.yml: preflight → quality (needs: preflight)           │
│            └ quality = db:generate, lint, typecheck,         │
│                        test:coverage, test:unit,             │
│                        integration, e2e                      │
│            └ docker-build-prod (paralelo, sem needs)         │
│     review-stack.yml  → stack-code-reviewer --mode=ci        │
│     sync-docs.yml     → doc-sync --mode=full                 │
│     release-template  → tag annotated no merge em main       │
│   ⚠ NENHUM é required_status_check (§7)                     │
└──────────────────────────────────────────────────────────────┘
```

**Ordem de encadeamento dentro do CI:** `preflight` → (`quality` | `docker-build-prod`). Só o `quality` declara `needs: preflight`; o `docker-build-prod` roda em paralelo e tem `if: github.event_name == 'pull_request'`.

---

## §3. Fluxo detalhado, passo a passo

| # | Passo | Comando | Gate que dispara |
|---|-------|---------|------------------|
| 1 | Sincronizar a base | `git pull --ff-only origin main` | nenhum — [git-workflow.md](../.agents/specs/conventions/git-workflow.md) classifica a base atualizada como **convenção**, não hook |
| 2 | Criar branch | `git checkout -b feat/<slug>` | nenhum |
| 3 | Instalar / validar deps | `pnpm install` | nenhum |
| 4 | (Camada C) Snapshot de estado | ver §5 | nenhum — prosa em [`state-aware-planning.md`](../.agents/workflows/state-aware-planning.md) |
| 5 | Codar com o specialist | ver `.agents/agents/<specialist>.md` | nenhum — prosa |
| 6 | Commit | `git add -A && git commit -m "…"` | **pre-commit**: lint-staged, stack-code-reviewer, doc-sync |
| 7 | Verificação completa local | `pnpm ci:local` | **nenhum** — `ci:local` não está em nenhum hook (§7) |
| 8 | Push | `git push -u origin <branch>` | **pre-push**: `pnpm ci:preflight` |
| 9 | Abrir PR | `gh pr create` | — |
| 10 | CI do PR | automático em `pull_request` | `preflight` → `quality`; `docker-build-prod` em paralelo; `stack-code-review` e `docs-sync` em workflows separados |
| 11 | Revisão / fix loop | `gh pr merge` só após CI verde | **NENHUM** — sem `required_status_checks`, o botão decide (§7) |
| 12 | Release | automático | `release-template` roda **só** em push para `main` que toque `docs/MONOREPO.md` |

### 3.1 Detalhe do pre-commit

O hook filtra por extensão. São dois blocos independentes:

```sh
# Bloco 1 — se houver staged casando com \.(ts|tsx|json|yaml|yml)$
pnpm exec lint-staged || exit 1

# Bloco 2 — se houver staged casando com \.(ts|tsx|prisma)$
pnpm tsx tooling/scripts/stack-code-reviewer.ts --files="$changed" --mode=pre-commit || exit 1
pnpm tsx tooling/scripts/doc-sync.ts --files="$changed" --mode=incremental || exit 1
```

**Consequência prática:** um commit que mexa só em `.md` ou `Dockerfile` **não passa por nenhum dos dois** (`.yml`/`.yaml` passam pelo Bloco 1, mas só como `prettier --write`). O gate que poderia ver esses arquivos (`checkDocRefs`) não roda no `pre-commit`: roda no `pre-push` e no job `preflight` do CI, e desde a correção do escopo (§F2-T2) ele cobre **todo `.md` versionado** (`git ls-files '*.md'`), não só `docs/` e `.agents/specs/`.

### 3.2 Detalhe do pre-push

`.husky/pre-push` roda **exclusivamente** `pnpm ci:preflight`. Ele **não** roda lint, typecheck nem teste — apesar de [`git-workflow.md`](../.agents/specs/conventions/git-workflow.md) recomendar `pnpm ci:local` como "Pre-Push Quality Gate".

Os gates registrados são os `name:` de
[`preflight.ts`](../.tooling/scripts/ci/preflight.ts) — **essa lista é a fonte de
verdade, não este doc**. Uma cópia enumerada aqui envelhece a cada gate novo sem
aviso nenhum; o veredito sai de `pnpm ci:preflight`, que separa `✓` / `✗` /
`skipped`. Para quantos são agora:

```bash
grep -cE "^\s+name: '" .tooling/scripts/ci/preflight.ts
```

---

## §4. Tabela de gates

| Gate | Comando | Camada | O que bloqueia | Buraco coberto pelo CI? |
|------|---------|--------|----------------|------------------------|
| `lint-staged` | `pnpm exec lint-staged` | A (pre-commit) | Nada semântico: as 2 entradas são `prettier --write` | Sim — `format:check` roda no `ci.yml` |
| `stack-code-reviewer` | `pnpm tsx tooling/scripts/stack-code-reviewer.ts` | A (pre-commit) | `blocker` > 0 ou `major` > 3 (`exit 1`) | Sim — `review-stack.yml` chama o mesmo script |
| `doc-sync` | `pnpm tsx tooling/scripts/doc-sync.ts` | A (pre-commit) | **Nada** — `grep -c 'process.exit' tooling/scripts/doc-sync.ts` = 0 | Não — e o job de CI também nunca falha |
| `ci:preflight` | `pnpm ci:preflight` | A (pre-push) + B | os checks estruturais | Sim — `ci.yml` roda o mesmo script |
| `format:check` | `pnpm format:check` | B (preflight job) | Arquivo não formatado | — |
| `test:coverage` | `pnpm turbo run test:coverage` | B (quality job) | Cobertura de `apps/api` < 80% (`COVERAGE_FLOOR`, só quando `isCoverageEnforced`) | — |
| `test:integration` / `test:e2e` | `pnpm turbo run test:integration test:e2e --filter=@projeto/api` | B (quality job) | Teste falhando (exige Docker) | — |
| `stack-code-review` (job) | `pnpm stack:review --files=… --mode=ci` | B (PR job) | Mesmo `blocker`/`major` do local | — |
| `docker-build-prod` | `docker buildx build … --target prod` | B (só PR) | Dockerfile quebrado | Não — não roda em push |
| `release-template` | automático | B (merge em main) | Nada — e o noop foi desfeito: o footer pede `1.9.0`, tag `v1.9.0` não existe, então a criação sairia. O que falta é o check que amarra footer↔tag (**BL1**) | — |
| `specialist:lint` | `pnpm specialist:lint` | **NENHUMA** | Nada — script existe, 12 testes verdes, fora do preflight | Não |
| `review:lint` | `pnpm review:lint` | A+B (via preflight #8) | YAML inválido, LOC, regex, reviewer inexistente | Sim |
| `archive:lint` | `pnpm archive:lint` | A+B (via preflight #9) | Frontmatter canônico; com o diretório vazio (só `.gitkeep`) o check se declara `skipped` em vez de verde | Sim |
| `tooling:test` | `pnpm tooling:test` | B (job `preflight` do `ci.yml`) | Spec vermelho da própria camada de tooling | Sim |
| `turbo-redirect-differential` | `.tooling/scripts/ci/turbo-redirect-differential.sh` | A+B (via preflight #13) | Forma de `pnpm turbo run …` que o parser extrai diferente do turbo real — **classe 6** (especificação local diverge do sistema real) | Sim (se Node ≥ 22.6) |

---

## §5. Estratégias de fluxo e classificação de problemas

Derivado do framework de Rojas (*vetorial = similaridade, grafo = relação multi-hop, fine-tuning = comportamento, e às vezes a resposta é software convencional*).

| Tipo de regra | Onde vive | Como falha | Exemplos neste repo |
|---------------|-----------|------------|---------------------|
| **Determinística** (regra fixa, verificável) | `.tooling/scripts/ci/*.ts`, `.husky/*`, `tooling/scripts/*.ts` | Erra **alto e nomeado**: exit 1, arquivo, linha, regra | `stack-code-reviewer` (DDD imports bloqueados), `checkTsconfigDrift`, `checkPackageJsonDrift` |
| **Agente / roteamento** (YAML + regex executado por TS — *não* é IA) | `.agents/specs/conventions/{review,specialist}-routing.md` + `tooling/scripts/*-router.ts` | Erra **baixo e anônimo**: classifica para o reviewer errado, sem sinal | `review-router.ts` (30 testes), `specialist-router.ts` (39 testes) |
| **Memória / prosa** | `.agents/memory/*.md`, `.agents/runs/*.md` | **Evapora** — não existe evento detectável quando envelhece | 21 memórias versionadas; as retrospectivas `b<N>-result.md` gravam **fora** do repo |

> **Tese honesta:** nenhum problema medido neste repo pede IA. `grep -rniE 'embedding\|openai\|langchain\|pgvector\|neo4j' apps/*/package.json packages/*/package.json` retorna zero. A camada "agentic" é regex em YAML executado por TypeScript — é **regra determinística com prosa em volta**. O custo do rótulo errado já apareceu: `review:lint` está dentro do preflight, `specialist:lint` (mesma família, 12 testes verdes) está fora.

**Regra de bolso:** se a pergunta é "esse valor é igual ao esperado?" ou "esse import é proibido?", a resposta é regra determinística. Se o dado expira com o tempo (contagem de agents, versão de um footer, existência de um arquivo), ele pertence a um **check de drift**, não a um `.md` versionado.

---

## §6. Referência rápida de comandos

| Comando | O que faz | Camada |
|---------|-----------|--------|
| `pnpm ci:preflight` | checks estruturais de drift; aborta com exit 1 | A + B |
| `pnpm ci:local` | `ci:preflight` + `turbo run lint typecheck test:unit test:coverage --filter=@projeto/api --filter=@projeto/web` | manual (não está em hook) |
| `pnpm format:check` | Prettier em modo check sobre ts/tsx/json/yaml/yml | B |
| `pnpm stack:review` | `stack-code-reviewer` standalone (mesmo gate do pre-commit e do CI) | A + B |
| `pnpm docs:sync` | `doc-sync` standalone — **só relatório** | A + B |
| `pnpm review:lint` | Valida a matriz `review-routing.md` (YAML, LOC, reviewer refs) | A + B |
| `pnpm specialist:lint` | Idem para a matriz `specialist-routing.md` — **fora do preflight** | nenhuma |
| `pnpm archive:lint` | Valida frontmatter de `.agents/runs/archive/*.md` — ainda **sem arquivo** no repo | nenhuma |
| `pnpm tooling:test` | Suíte de testes do próprio tooling, em **dois roots** — a contagem total é `pnpm tooling:test \| grep -E 'Test Files\|Tests '`, e ela **envelhece**: re-meça, não cite | nenhuma |
| `pnpm review:route` / `pnpm specialist:route` | Roteamento headless: emite YAML de despacho | nenhuma |
| `pnpm test:unit` / `test:coverage` / `test:integration` / `test:e2e` | Suítes via turbo | B |
| `pnpm lint` | `turbo run lint` — no `apps/api` é stub `echo 'apps/api lint stub…' && exit 0` | B (parcial) |
| `pnpm typecheck` | `turbo run typecheck` — real em `apps/api` (`tsc --noEmit`) | B |

---

## §7. Estado atual (AS-IS)

### 7.1 Wired e funcionando

- `pre-commit` / `pre-push` instalados e executando.
- `stack-code-reviewer` — gate com dentes reais em pre-commit: `process.exit(1)` em blocker.
- `ci:preflight` — registrado e executando. **O veredito não é um número fixo:**
  rode `pnpm ci:preflight` e leia a linha final — ela separa `✓` / `✗` /
  `skipped`, e "todos passaram" é mentira enquanto houver skip. (2026-10-06 neste
  working tree: 15 ✓, 0 ✗, 2 skipped — os dois skips são por **ausência de
  alvo**, um deles porque `.agents/runs/archive/` está vazio.)
- Job `quality` do CI — encadeado por `needs: preflight`, roda cobertura 80% de `apps/api#unit` (gate era inerte até #40/#41).
- Job `preflight` do CI — **pós-#44** roda a suíte `pnpm tooling:test`, que valida os próprios dentes do tooling (dois roots; a contagem por `grep -E 'Test Files|Tests '` envelhece a cada spec nova).
- `docker-build-prod` — build real dos 2 Dockerfiles `prod` em toda PR.
- `release-template` — syntaticamente correto (idempotência via `git rev-parse --verify`, `concurrency`, `contents: write`) e **já não é noop**: quando a tag existe ele emite `::warning::` em vez de encerrar em silêncio. O que falta: check que amarra footer↔tag (**BL1**).
- Boundary DDD/Hexagonal **existe de fato** em `apps/api/src/modules/users/{domain,application,infrastructure}`.
- **Pós-#44**: 5 gates novos sobre as 7 classes de guard, incluindo o `turbo-redirect-differential` (classe 6 — spec local diverge do sistema real) e o `check-self-firing-guard` (classe 3 — guard que dispara em si mesmo). Detalhes em [`docs/superpowers/plans/2026-10-03-guard-classes.md`](./superpowers/plans/2026-10-03-guard-classes.md) e [`docs/superpowers/plans/2026-10-03-guard-classes-decisoes.md`](./superpowers/plans/2026-10-03-guard-classes-decisoes.md).

### 7.2 Unwired / aspiracional

> **Re-medido em 2026-10-06 pós-#44 (`249ad9a`) e pós-#50 (`af6af0a`).** Os 5 itens residuais da auditoria original caíram para **2** que permanecem unwired (sem mudança de fato). Os fechados estão em [`backlog-2026-10-02.md`](../.agents/runs/backlog-2026-10-02.md) §Remissões + §Achados durante a execução, e o que segue adiado está em `BL1`–`BL10` + `X1`–`X15`. Toda linha abaixo foi **re-medida** no merge — não copiada da auditoria.

| Item | Evidência de que não funciona |
|------|------------------------------|
| **Nenhum check bloqueia merge** *(parcialmente corrigido)* | O ruleset `master` (id 23853096) tem `required_status_checks: [{context: "quality"}]` e `main` só é atualizável por PR. O que sobra: `required_approving_review_count = 0` e `required_reviewers = []` (contribuidor único). Só **1 dos 3** contexts é exigido — a garantia real é a cadeia do workflow (`preflight` bloqueia `quality` via `needs:`), não o check isolado. |
| `lint-staged` não é linter | `node -e "console.log(Object.values(require('./package.json')['lint-staged']).join(' \| '))"` → `prettier --write \| prettier --write`. Nenhum eslint, tsc ou vitest. O ESLint entra pelo turbo. |
| `doc-sync` nunca aborta | `grep -c 'process.exit' tooling/scripts/doc-sync.ts` → **0** (re-medido 2026-10-06). O `\|\| exit 1` do hook e o job de CI são guarda de crash, não gate. O contrato **documentado** diz report-only, em vez de prometer bloqueio que não existe. |
| `specialist:lint` fora do preflight | `grep -c specialist .tooling/scripts/ci/preflight.ts` → **1**, e o hit é um **comentário** que cita `nestjs-specialist` — não uma invocação. É classe 3: o sweep dispara em si mesmo. `review:lint` roda no preflight, `specialist:lint` não: duas matrizes de routing, dois scripts, um só no gate. |
| Limite de 300 linhas não é imposto | `wc -l .agents/WORKFLOWS.md` → **189** (re-meça; a régua é do repo, não deste arquivo). **Mas** a regra `tamanho-e-revisao.md` segue sem gate mecânico: `grep -rn 'MAX_LOC' tooling/scripts/ .tooling/scripts/ \| grep -v spec` acha **só** `tooling/scripts/lint-review-routing.ts:29`, que mede `review-routing.md` apenas. **Cuidado com o path**: procurar por `.tooling/scripts/ci/*.ts` devolve **0** e leva à conclusão errada de que não existe limite nenhum. |

### 7.3 Regra que resume a camada

> **Gate não ligado não é gate fraco — é pior que ausência, porque consome confiança.**
> E o token de sucesso não pode ser o mesmo para "verifiquei e passou" e "não havia nada para verificar": todo check que faz short-circuit por ausência do alvo precisa de um terceiro estado (`skipped`) com motivo.

---

## §8. Referências

- [`ci-defense-in-depth.md`](../.agents/specs/conventions/ci-defense-in-depth.md) — a estratégia de 3 camadas
- [`git-workflow.md`](../.agents/specs/conventions/git-workflow.md) — regras de branch/PR/merge
- [`cobertura-testes.md`](../.agents/specs/conventions/cobertura-testes.md) — o piso de 80% e suas exceções
- [`tamanho-e-revisao.md`](../.agents/specs/conventions/tamanho-e-revisao.md) — limite de 300 linhas
- [`guard-classes.md`](../.agents/specs/conventions/guard-classes.md) — as 7 classes pelas quais um controle falha reportando verde
- [`MONOREPO.md`](./MONOREPO.md) · [`STACK.md`](./STACK.md) · [`TEMPLATE_USAGE.md`](./TEMPLATE_USAGE.md)

### Planos e backlog ativos

- [`docs/superpowers/plans/2026-09-21-cadastro-usuario-com-auditoria-plan.md`](./superpowers/plans/2026-09-21-cadastro-usuario-com-auditoria-plan.md) — plano de fundação do BC `users`
- [`docs/superpowers/plans/2026-10-02-melhorias-fluxo-desenvolvimento.md`](./superpowers/plans/2026-10-02-melhorias-fluxo-desenvolvimento.md) — plano de melhorias que produziu o #43 e #44
- [`docs/superpowers/plans/2026-10-03-guard-classes.md`](./superpowers/plans/2026-10-03-guard-classes.md) — plano das 7 classes de guard (gates do #44)
- [`.agents/runs/backlog-2026-10-02.md`](../.agents/runs/backlog-2026-10-02.md) — backlog vivo de itens adiados + achados durante a execução (BL1–BL10 + X1–X15)

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
**Versão do documento:** 1.1.0
**Última atualização:** 2026-10-06
