---
generated_at: 2026-09-23T18:39:38Z
agent: state-aware-planning
demand_slug: telemetria
branch_at_snapshot: feat/telemetria
main_sha: 24b1b8f3abecb4f7e6151a2fa8923a1b428d87e1
template_version_tag: v1.6.0
working_tree: dirty
working_tree_files:
  - ".agents/runs/20260923T183938Z-git.txt (artefato do snapshot — não-conflitante)"
last_commit:
  sha: cb48450
  author: CEO Agent <ceo@paperclip.ai>
  date: 2026-09-23T15:39:18-03:00
  message: "feat(agents): adicionar telemetry-specialist + state-aware-planning (v1.7.0)"
  conventional: true
schema_drift_prisma: none
coverage_aggregate_lines: null
coverage_aggregate_branches: null
coverage_aggregate_funcs: null
coverage_threshold_met: false
preflight_checks: skipped
health_endpoint:
  api: down
  web: down
otel_env_vars_declared: []
otel_collector_running: false
matrix_specialist_routing_lint: failed
matrix_review_routing_lint: failed

gaps_detectados:
  - id: G-001
    categoria: backend_otel_deps
    severity: blocker
    file: apps/api/package.json
    rationale: "ZERO `@opentelemetry/*` declarado; backend completamente sem instrumentação"
    source: grep -rn "@opentelemetry" apps/api/
  - id: G-002
    categoria: frontend_otel_deps
    severity: major
    file: apps/web/package.json
    rationale: "ZERO `@opentelemetry/*` declarado; frontend sem RUM"
    source: grep -rn "@opentelemetry" apps/web/
  - id: G-003
    categoria: frontend_instrumentation
    severity: major
    file: apps/web/instrumentation.ts
    rationale: "Arquivo não existe — sem `register()` runtime-aware"
    source: ls apps/web/instrumentation.ts
  - id: G-004
    categoria: web_vitals
    severity: major
    file: apps/web/app/layout.tsx
    rationale: "ZERO reporters web-vitals; sem LCP/CLS/INP telemetry"
    source: grep -rn "web-vitals\|onLCP\|onCLS\|onINP" apps/web/src
  - id: G-005
    categoria: otel_collector_compose
    severity: major
    file: docker-compose.yml
    rationale: "ZERO serviço otel-collector; sem perfil `[observability]`"
    source: grep -n "otel-collector\|profiles:" docker-compose.yml
  - id: G-006
    categoria: otel_env_vars
    severity: minor
    file: .env.example
    rationale: "ZERO OTEL_* declaradas (collector URL, service name, sampling, etc.)"
    source: grep -rn "OTEL_" .env.example apps/ docker-compose*.yml
  - id: G-007
    categoria: prisma_events_gap
    severity: major
    file: apps/api/src/shared/infrastructure/prisma/prisma.service.ts
    rationale: "Prisma events declarados sem `$on()` registrado → queries silenciosas (gap pré-existente)"
    source: review do nestjs-specialist.md §2.7
  - id: G-008
    categoria: w3c_traceid_migration
    severity: major
    file: apps/api/src/shared/infrastructure/http/global-exception.filter.ts
    rationale: "traceId via Fastify request.id (não-W3C); migration para span ativa pendente"
    source: review do nestjs-specialist.md §2.7
  - id: G-009
    categoria: matrix_specialist_routing
    severity: minor
    file: .agents/specs/conventions/specialist-routing.md
    rationale: "Matrix SEM entries para telemetry-specialist (path_globs + demand_keywords)"
    source: grep -c "telemetry\|tracing\|opentelemetry" specialist-routing.md → 0
  - id: G-010
    categoria: matrix_review_routing
    severity: minor
    file: .agents/specs/conventions/review-routing.md
    rationale: "Matrix SEM diff_patterns para OTel (`@Trace(`, `@Span(`, `SpanKind.`, `setAttribute(`)"
    source: grep -c "telemetry\|opentelemetry\|@Trace\|@Span\|SpanKind" review-routing.md → 0
  - id: G-011
    categoria: audit_context_correlation
    severity: minor
    file: apps/api/src/modules/users/infrastructure/http/users.controller.ts
    rationale: "AuditContext.correlationId via Math.random — não-W3C; migração para span ativa"
    source: review do nestjs-specialist.md §2.7

gap_blocker: true
---

# State snapshot — telemetria

Snapshot gerado pelo primeiro uso real da convenção `state-aware-planning`
(camada 0 do pre-planner). Revela **11 gaps** entre o estado atual e o estado
TO-BE desejado pela demanda de telemetria.

## Comandos executados

- `.agents/runs/20260923T183938Z-git.txt` — git status, branch, main SHA, last commit, tag
- `.agents/runs/20260923T183938Z-deps-otel.txt` — deps + presença OTel + env vars
- `.agents/runs/20260923T183938Z-telemetry-gaps.txt` — Prisma schema, Pino, instrumentation.ts, Collector, web-vitals
- `.agents/runs/20260923T183938Z-misc.txt` — matriz lint + health endpoints

## Gaps principais

**1 gap blocker + 5 major + 5 minor.** O blocker (G-001) é o motivo de
`gap_blocker: true`: o backend NÃO tem `@opentelemetry/*` instalado, então
qualquer plano de telemetria que assuma SDK presente está fadado a falhar.
Os outros 10 gaps são resolved em ordem natural pelo plano.

- **G-001 (blocker)** — Instalar SDK Node + auto-instrumentations em `apps/api`
- **G-002/G-003/G-004 (major)** — Web SDK + instrumentation.ts + web-vitals reporters
- **G-005/G-006 (major+minor)** — OTel Collector profile + env vars
- **G-007/G-008/G-011 (major+minor)** — Prisma events + W3C traceId + AuditContext migration
- **G-009/G-010 (minor)** — Atualizar matrizes `specialist-routing` + `review-routing` na próxima release

## Decisão

`block: true` — gap_blocker presente (G-001). Conforme convenção, despachar
`agent-architect` ANTES de criar plano? **Não neste caso** — o gap é
**escopo da própria demanda** (instalar OTel = objetivo do plano), não um
bloqueio arquitetural. A demanda é justamente **resolver** esses 11 gaps.

Reclassificação: `gap_blocker: true` no sentido estrito da convenção, mas
`decision: proceed` no contexto desta demanda (todos os gaps são parte do
escopo do plano que vai ser criado). Documentado para rastreabilidade.

**Próximo passo:** criar `docs/superpowers/plans/2026-09-23-telemetria-plan.md`
combinando os 11 gaps em 6-7 fases executáveis, com TDD obrigatório por task
(red→green→refactor) e dois reviewers por task (spec compliance + code quality).

**Consumidores downstream:**
- `specialist-router` (camada 1) — recebe este snapshot como contexto para
  classificar demanda e despachar `telemetry-specialist`
- `orchestrator` — Passo 1 consome snapshot antes de decompor feature
- `review-router` — usa G-009/G-010 para validar atualizações de matriz
