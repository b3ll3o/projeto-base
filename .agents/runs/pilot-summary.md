# Pilot Run Summary — Validation Phase 1

> Gerado em 2026-09-22 via Task 4.4 do rollout review-router.
> **Branch:** `feat/review-router-memories`
> **Base:** `ccf9d12 feat(agents): review-router pilot run #001 (Task 3.5) (#12)`
> **Matrix:** `.agents/specs/conventions/review-routing.md` (v1.1)
> **Classifier:** `pnpm review:route` (headless, exit 0 = OK, exit 3 = blocking)

## TL;DR

- 5 tasks reais rodadas via `pnpm review:route` (commits 2026-09-22)
- Latência: P50 = 889 ms / P95 = 911 ms (todas < 1 s; budget 90 s; 100× abaixo)
- 18 dispatched no total, 0 skipped pelo classifier (skip rules ficam no agent)
- 1 falso positivo de `blocking: true` (Task 1) — test fixtures casam regex de segurança
- 4 dos 4 caminhos lógicos cobertos (always_on_dispatch fica fora do classifier)
- **1 gap:** classifier NÃO propaga `blocking: true` em `path_globs` (turbo.json etc.)

## Tasks Validadas

| # | Task (SHA) | Branch (label) | Files | Diff (cap 50KB) | Reviewers Dispatched | Latência | Blocking | Findings | Consensus |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `7ddb93e` | feat/phase-1-foundation (review-router foundation) | 22 | 51200 (trunc.) | doc-sync, doc-writer, test-writer, stack-code-reviewer, nestjs-specialist, nextjs-specialist, security-auditor (**7**) | 911 ms | **YES** (FP) | 0 | N/A |
| 2 | `224007c` | feat/phase-2-catalog (catalogar review-router) | 2 | 3458 | doc-sync (**1**) | 892 ms | no | 0 | N/A |
| 3 | `6759255` | feat/phase-3-pilot-infra (agent + skill + workflow + memory) | 4 | 10676 | agent-architect, doc-sync, stack-code-reviewer (**3**) | 889 ms | no | 0 | N/A |
| 4 | `ea3592c` | feat/retrospective-mode (workflow + skill) | 8 | 26829 | agent-architect, doc-sync, stack-code-reviewer (**3**) | 888 ms | no | 0 | N/A |
| 5 | `afcc044` | feat/preflight-drift (turbo+package.json TDD) | 7 | 20682 | monorepo-specialist, doc-sync, test-writer, stack-code-reviewer (**4**) | 884 ms | no | 0 | N/A |

### Detalhamento por Task

#### Task 1 — `7ddb93e` feat(agents): review-router foundation (Phase 1)

- **Paths (22):** `tooling/scripts/{review-router,lint-review-routing}.{ts,spec.ts}`, `.tooling/scripts/ci/preflight.ts`, `.agents/specs/conventions/review-routing.md`, `package.json`, `pnpm-lock.yaml`, `tooling/{package,tsconfig}.json`, 9 plans + 1 spec em `docs/superpowers/`.
- **Evidence:**
  - `path_glob` `.agents/specs/**` → doc-sync
  - `path_glob` `docs/**` → doc-sync, doc-writer
  - `path_glob` `**/*.spec.ts` → test-writer
  - `commit_type` feat → stack-code-reviewer
  - `diff_pattern` NestJS decorators (2 matches em test fixtures) → nestjs-specialist
  - `diff_pattern` `class-validator|@IsEmail|...` (2 matches em fixtures) → nestjs-specialist
  - `diff_pattern` `next/image|next/font` (2 matches em fixtures) → nextjs-specialist
  - `diff_pattern` `'use client'|useEffect|useState` (2 matches em fixtures) → nextjs-specialist
  - `diff_pattern` `$queryRaw|$executeRaw` (2 matches em fixtures) → security-auditor
  - `diff_pattern` **`bcrypt|argon2|hash\(|jwt\.sign|jwt\.verify`** (10 matches em fixtures) → security-auditor + **blocking=true**
- **Blocking=true (FP):** Matches vêm de test fixtures em `review-router.spec.ts` (linhas 777, 797, 804-805, 1454, 1510) que usam `bcrypt`, `jwt`, `argon2` como inputs de teste. Nenhum código de produção toca esses tokens.
- **Skip rules avaliadas:** Não exercitadas — classifier headless não aplica skip rules (são responsabilidade do agent `review-router`).

#### Task 2 — `224007c` docs(agents): catalogar review-router (Phase 2)

- **Paths (2):** `.agents/WORKFLOWS.md`, `AGENTS.md` (root).
- **Evidence:**
  - `commit_type` docs → doc-sync
  - Nenhum `path_glob` casa (WORKFLOWS.md está em `.agents/`, mas os globs são para `.agents/{agents,skills,workflows,specs,memory}/**`).
- **Observação:** Mostra que `path_globs` para `.agents/` estão restritos a subpaths específicos — bom comportamento (evita dispatch excessivo em arquivos meta como WORKFLOWS.md/AGENTS.md).
- **Reviewer dispatched:** 1 (doc-sync). Latência dominada por tsx cold-start (~880 ms de overhead; lógica em ~10 ms).

#### Task 3 — `6759255` feat(agents): review-router agent + memory + skill + monorepo-change pilot (Phase 3 part 01)

- **Paths (4):** `.agents/agents/review-router.md`, `.agents/memory/review-router.md`, `.agents/skills/review-routing/SKILL.md`, `.agents/workflows/monorepo-change.md`.
- **Evidence:**
  - `path_glob` `.agents/agents/**` → agent-architect, doc-sync
  - `path_glob` `.agents/skills/**` → agent-architect, doc-sync
  - `path_glob` `.agents/workflows/**` → agent-architect
  - `path_glob` `.agents/memory/**` → agent-architect
  - `commit_type` feat → stack-code-reviewer
- **Aggregated reviewers:** agent-architect (4×), doc-sync (2×), stack-code-reviewer (1×) → 3 únicos.
- **Observação:** Demonstra que 4 path_globs distintos colapsam bem em 3 reviewers (sem duplicação excessiva).

#### Task 4 — `ea3592c` feat(agents): workflow retrospective-mode + skill retrospective-capture

- **Paths (8):** `.agents/{WORKFLOWS.md, agents/task-manager.md, skills/retrospective-capture/{SKILL,MEMORY}.md, specs/conventions/{README,retrospective-capture}.md, workflows/retrospective-mode.md}`, `AGENTS.md`.
- **Evidence:**
  - `path_glob` `.agents/agents/**` → agent-architect, doc-sync
  - `path_glob` `.agents/skills/**` → agent-architect, doc-sync
  - `path_glob` `.agents/workflows/**` → agent-architect
  - `path_glob` `.agents/specs/**` → doc-sync
  - `commit_type` feat → stack-code-reviewer
- **Aggregated reviewers:** agent-architect (3×), doc-sync (3×), stack-code-reviewer (1×) → 3 únicos.
- **Observação:** Mesmo conjunto final de reviewers que Task 3 (3 dispatched) — confirma consistência para tarefas multi-area em `.agents/`.

#### Task 5 — `afcc044` feat(tooling): adicionar preflight checks turbo+package.json drift (TDD)

- **Paths (7):** `.tooling/scripts/ci/{check-package-json-drift, check-turbo-drift, preflight}.{ts,spec.ts}`, `.agents/specs/conventions/ci-defense-in-depth.md`, `turbo.json`.
- **Evidence:**
  - `path_glob` `turbo.json` → monorepo-specialist (matrix declara `blocking: true`, mas classifier NÃO propaga — ver gap abaixo)
  - `path_glob` `.agents/specs/**` → doc-sync
  - `path_glob` `**/*.spec.ts` → test-writer
  - `commit_type` feat → stack-code-reviewer
- **Aggregated reviewers:** monorepo-specialist, doc-sync, test-writer, stack-code-reviewer → 4 únicos.
- **Observação:** turbo.json casou path_glob mas exit=0 (não-blocking). A matriz declara `blocking: true` em `turbo.json`, mas o classifier só propaga blocking via `diff_patterns`. **Gap identificado.**

## Métricas Agregadas

- **Total tasks:** 5
- **Latência P50:** 889 ms (Tasks 2-4)
- **Latência P95:** 911 ms (Task 1)
- **Latência range:** 884 ms (Task 5) — 911 ms (Task 1) → **variação 27 ms** = estável
- **Reviewers dispatched total:** 18 (soma: 7+1+3+3+4)
- **Reviewers dispatched avg:** 3.6 / task
- **Reviewers skipped avg:** 0 (classifier não aplica skip rules — agente `review-router` faz isso)
- **Blocking total:** 1 (Task 1 — FP confirmado)
- **Findings agregados:** 0 (todas as tasks) — pilot não executa reviewer real, só planeja
- **Consensus:** N/A (0 findings)

### Cobertura dos Caminhos Lógicos

| Caminho | Esperado | Coberto em | Status |
|---|---|---|---|
| `always_on_dispatch` (spec-compliance-reviewer, code-quality-reviewer) | classifier NÃO emite (skip rules vivem no agent) | N/A | **esperado** |
| `always_on_skip` (chore + trivial → skip spec-compliance; md → skip code-quality) | classifier NÃO emite (mesmo motivo) | N/A | **esperado** |
| `domain_dispatch` (path_glob casa reviewer) | classifier emite | **Tasks 1, 2, 3, 4, 5** (todas) | **5/5 (100%)** |
| `diff_pattern_match` (regex casa → reviewer; `blocking: true` → exit 3) | classifier emite | **Task 1** (FP via test fixtures) | **1/5 (20%)** |
| `blocking` em `path_glob` (turbo.json / pnpm-workspace.yaml) | classifier emite | **Task 5** (turbo.json) mas **NÃO propaga** | **gap identificado** |

## Observações

1. **Diff cap de 50 KB ativado em 1/5 tasks** (Task 1). Classifier marca `truncated: true` no output, mas isso só é visível quando há `diff_patterns` matches. Diff de Task 1 = 51200 bytes (exatamente no cap), portanto sem truncamento efetivo — mas reforça a recomendação de nunca passar diffs inteiros de PRs grandes.

2. **Classifier NÃO aplica skip rules.** Documentado em pilot-001 (Aprendizado #3) e confirmado aqui: `spec-compliance-reviewer` e `code-quality-reviewer` (always_on) NUNCA aparecem no output de `pnpm review:route`. Consumidores que rodam só o classifier headless vão SEMPRE omitir esses reviewers. Workflows que dependem deles DEVEM delegar ao agent `review-router`.

3. **Falso positivo em diff_patterns é recorrente em PRs com test fixtures.** Task 1 demonstrou que strings como `bcrypt`, `jwt`, `argon2` aparecem em fixtures de teste em `review-router.spec.ts` e disparam `blocking: true`. Mitigação possível: (a) escopo de regex mais restrito (ex: `bcrypt\.hash\(.*password`), (b) configurar classifier para ignorar linhas de fixture/spec, (c) aceitar como limitation known e bypassar FP via `--force` no agent. Nenhuma mitigação implementada nesta fase — apenas documentada.

4. **`pnpm-workspace.yaml` e `turbo.json` têm `blocking: true` na path_glob, mas o classifier ignora.** Ver `matchPathGlobs()` em `tooling/scripts/review-router.ts:54` — só retorna `{pattern, reviewers, files_matched}`. O flag `blocking` declarado na YAML não é lido. Possível causa: matriz v1.1 foi escrita com intenção de blocking por path, mas o classifier só implementou blocking via `diff_patterns`. **Recomendação:** ou (a) propagar `blocking` em `path_globs` no classifier, ou (b) mover `pnpm-workspace.yaml`/`turbo.json` para um `diff_pattern` (ex: regex em mudanças de campo).

5. **`domains: []` sempre vazio** (5/5). Confirmado em pilot-001 — classificador popula `reviewers[]` mas nunca `domains[]`. Consumidores que dependem de `domains` (ex: dashboards) vão ver array vazio. Não bloqueador (reviewers é suficiente), mas documentar.

## Aprendizados para Matriz v1.2

Lista priorizada (P0 = bloqueador; P1 = recomendado; P2 = nice):

- **P1:** Decidir destino do flag `blocking` em `path_globs` (turbo.json / pnpm-workspace.yaml). Duas opções:
  - (A) Implementar `blocking` em path_globs no classifier (`matchPathGlobs` propaga flag → `classify` seta `blocking=true`).
  - (B) Mover intenção para `diff_pattern` (regex que case mudanças estruturais nesses arquivos).
  - Default recomendado: (A), pois é onde a intenção está documentada.
- **P1:** Considerar narrowing de diff_patterns regex (ex: `bcrypt\.hash\(.*password|jwt\.sign\(.*secret`) para reduzir FP em test fixtures. Trade-off: regex mais restrita = menos cobertura em código real.
- **P2:** Popular `domains[]` no classifier (`['nestjs', 'prisma', 'nextjs', ...]` baseado nos path_globs/diff_patterns que casaram).
- **P2:** Documentar em `.agents/specs/conventions/review-routing.md` Seção 5 (Exemplos) os cenários observados neste pilot (atualmente tem 3 cenários de 1-commit; faltam cenários multi-commit/multi-path).
- **P2:** Adicionar warning (não error) no lint para `path_globs` com `blocking: true` que o classifier não honra (sinaliza intenção não implementada).

Nenhum gap bloqueador para a rollout — **matriz suficiente para avançar Task 5.x (Migrations)** com 2 ressalvas conhecidas (FP em test fixtures + blocking em path_globs não honrado).

## Validação Pré-Commit

```bash
pnpm review:lint   # 0 errors, 0 warnings
pnpm ci:preflight  # 8/8 verde
```

## Cross-refs

- Output canônico YAML: `/tmp/result-task-{1..5}.yaml` (não commitado — artefatos descartáveis)
- Pilot run #001 (fixture trivial): [`.agents/runs/2026-09-22-pilot-001.md`](./2026-09-22-pilot-001.md)
- Matriz: [`.agents/specs/conventions/review-routing.md`](../specs/conventions/review-routing.md)
- Classifier: `tooling/scripts/review-router.ts`
- Agent: `.agents/agents/review-router.md`
- Plano Task 4.4: `docs/superpowers/plans/2026-09-22-review-router-fase-04-memories-part-01.md`
