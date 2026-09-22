# Review-Router Implementation Plan (Índice)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o agent `review-router` + classificador headless + matriz externa + skill/convention que orquestram revisão pós-task via classificação tri-sinal (paths + commit type + diff content).

**Architecture:** Router agent (subagent) recebe `task{scope} + branch{base,head} + implementer_output_path`, classifica diff via 3 sinais, lê matriz YAML em `.agents/specs/conventions/review-routing.md`, despacha N reviewers em paralelo via Agent tool, agrega findings (com detecção de consensus), retorna YAML ao controller. Controller mantém triage final.

**Tech Stack:** TypeScript (Node ≥ 20), Jest (testes), YAML (matriz), Conventional Commits, Git CLI, Markdown (memórias/conventions).

**Spec de referência:** [`docs/superpowers/specs/2026-09-22-review-router-design.md`](../specs/2026-09-22-review-router-design.md)

---

## Plano de Migração (6 Fases, 10 arquivos)

| Fase | Arquivos | Tasks | Entrega | Validação |
|---|---|---|---|---|
| 1 (Foundation) | [fase-01-foundation-part-01](./2026-09-22-review-router-fase-01-foundation-part-01.md) → [part-05](./2026-09-22-review-router-fase-01-foundation-part-05.md) | 1.0–1.11 (12 tasks) | Tooling (classifier headless TDD + matrix lint + matriz v1) + PR | `pnpm review:lint` verde, ≥17 testes PASS, `pnpm ci:local` verde |
| 2 (Catalog) | [fase-02-catalog-part-01](./2026-09-22-review-router-fase-02-catalog-part-01.md) | 2.1–2.3 (3 tasks) | AGENTS.md §3 + WORKFLOWS.md | `pnpm ci:preflight` verde, 1 PR |
| 3 (Pilot) | [fase-03-pilot-part-01](./2026-09-22-review-router-fase-03-pilot-part-01.md) | 3.1–3.6 (6 tasks) | Agent + memory + skill + monorepo-change + 1 task real | Router dispatcha reviewers esperados, latency < 90s, consensus OK |
| 4 (Memories) | [fase-04-memories-part-01](./2026-09-22-review-router-fase-04-memories-part-01.md) | 4.1–4.5 (5 tasks) | 3 memórias reescritas + validação 3-5 tasks | Memórias citam router; matriz ajustada se gaps |
| 5 (Migration) | [fase-05-migration-part-01](./2026-09-22-review-router-fase-05-migration-part-01.md) | 5.1–5.7 (7 tasks) | 5 workflows + 1 sprint produção | P95 < 90s, FP rate < 10%, util ≥ 60% |
| 6 (Consolidation) | [fase-06-consolidation-part-01](./2026-09-22-review-router-fase-06-consolidation-part-01.md) | 6.1–6.3 (3 tasks) | Retrospective + bumps + tag v1.5.0 | Proposals viram tasks, tag criada, footer atualizado |

**Total:** 30 tasks, ~6 PRs (1 por fase), 7 arquivos novos + 5 atualizados.

---

## Acceptance Criteria (DoD Final)

Antes de declarar Fase 6 completa, validar:

- [ ] Todos os 7 arquivos novos criados (`tooling/scripts/review-router.ts`, `tooling/scripts/lint-review-routing.ts`, `tooling/scripts/review-router.spec.ts`, `tooling/scripts/lint-review-routing.spec.ts`, `.agents/agents/review-router.md`, `.agents/memory/review-router.md`, `.agents/skills/review-routing/SKILL.md`, `.agents/specs/conventions/review-routing.md`)
- [ ] 5 arquivos atualizados (AGENTS.md §3, WORKFLOWS.md, 3 memórias globais, ≥5 workflows)
- [ ] Todos os testes passam (`pnpm test` em `tooling/scripts/`)
- [ ] `pnpm ci:local` verde (3 camadas: pre-push + preflight + quality)
- [ ] `pnpm review:lint` verde (matriz válida)
- [ ] 1 sprint de produção sem regressão
- [ ] Métricas dentro dos targets:
  - Latência P50 < 30s, P95 < 90s, P99 < 180s
  - False positive rate < 10%
  - Reviewer utilization (1+ specialist) ≥ 60% em tasks medium+
- [ ] Tag v1.5.0 criada
- [ ] Footer de versão atualizado em `estrutura-e-versionamento.md`

---

## Cross-refs Canônicos

- **Spec de design:** [`docs/superpowers/specs/2026-09-22-review-router-design.md`](../specs/2026-09-22-review-router-design.md)
- **Matriz (fonte da verdade):** [`.agents/specs/conventions/review-routing.md`](../../.agents/specs/conventions/review-routing.md)
- **Agent:** [`.agents/agents/review-router.md`](../../.agents/agents/review-router.md)
- **Memory:** [`.agents/memory/review-router.md`](../../.agents/memory/review-router.md)
- **Skill:** [`.agents/skills/review-routing/SKILL.md`](../../.agents/skills/review-routing/SKILL.md)
- **Tooling:** [`tooling/scripts/review-router.ts`](../../tooling/scripts/review-router.ts), [`tooling/scripts/lint-review-routing.ts`](../../tooling/scripts/lint-review-routing.ts)
- **Memórias globais:** `two-stage-review-after-each-task.md`, `review-and-fix-after-each-task.md`, `subagent-driven-development-always.md` (todas em `~/.claude/projects/-home-leo-Documentos-projetos-base/memory/`)
- **Conventions relacionadas:** `ci-defense-in-depth.md`, `retrospective-capture.md`, `estrutura-e-versionamento.md`

---

## Notas de Execução

**Modo recomendado:** Subagent-Driven (per user choice) — fresh subagent por task + two-stage review entre tasks (per memory `reviewer-must-differ-from-implementer`).

**Branch de trabalho:** `feat/review-router-agent` (criada em Fase 1, Task 1.0).

**Rollback:** `export REVIEW_ROUTER_ENABLED=false` desabilita router; controller volta a usar two-stage manual. Por fase: reverter PR; restaurar memórias.

**Comando útil:**
```bash
# Verificar tamanho de cada arquivo
wc -l docs/superpowers/plans/2026-09-22-review-router-*

# Validar cross-refs
pnpm ci:preflight
```
