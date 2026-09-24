# Catálogo de Flows da Aplicação

> Índice dos 78 flows diagramáveis de `base/`. Gerado em 2026-09-24 via discovery 7-domínios (`workflows-discovery` workflow, run `wf_032f2074-6af`).

**Status:** 0/78 gerados. Phase 0 = scaffold (este README). Phase 1 = 8 critical/auto. Phase 2+ = backlog.

## Como ler

- **Tier:** 🔴 critical (gate), 🟡 important (documentação ativa), 🟢 nice (futuro).
- **Mecanismo:** `auto` = parser Markdown → JSON (determinístico); `hand` = JSON autoral via schema.
- **Outdir:** Cada flow gera 1 diretório `<outdir>/` com `*.json` + `*.html`.

## Por domínio

### agent-workflows (18 flows)

| Flow ID | Tier | Mecanismo | Tipo | Subject |
|---------|------|-----------|------|---------|
| `flow-backend-feature` | 🔴 critical | auto | workflow | backend-feature — Implementar Feature no Backend NestJS |
| `flow-frontend-feature` | 🔴 critical | auto | workflow | frontend-feature — Implementar Feature no Frontend Next.js |
| `flow-monorepo-change` | 🔴 critical | auto | workflow | monorepo-change — Adicionar/Mover/Remover Pacote ou App |
| `flow-specialist-routing` | 🔴 critical | auto | workflow | specialist-routing — Orquestrador de Demanda Pré-Planning |
| `flow-state-aware-planning` | 🔴 critical | auto | workflow | state-aware-planning — Snapshot Pré-Planner (Camada 0) |
| `flow-bugfix-mode` | 🟡 important | auto | workflow | bugfix-mode — Corrigir Bug (genérico, com loop) |
| `flow-ci-defense-mode` | 🟡 important | auto | workflow | ci-defense-mode — Blindagem/Auditoria do CI |
| `flow-feature-mode` | 🟡 important | auto | workflow | feature-mode — Implementar Nova Funcionalidade (genérico) |
| `flow-release-mode` | 🟡 important | auto | workflow | release-mode — Bump de Versão do Template |
| `flow-retrospective-mode` | 🟡 important | auto | workflow | retrospective-mode — Captura de Aprendizados Pós-Atividade |
| `flow-archive-demand` | 🟢 nice | auto | workflow | archive-demand — Arquivar Demanda Implementada |
| `flow-docs-mode` | 🟢 nice | auto | workflow | docs-mode — Documentação (genérico) |
| `flow-explore-mode` | 🟢 nice | auto | workflow | explore-mode — Exploração Read-Only (single agent) |
| `flow-refactor-mode` | 🟢 nice | auto | workflow | refactor-mode — Refatoração Incremental (genérico) |
| `flow-review-mode` | 🟢 nice | auto | workflow | review-mode — Revisão de Código (genérico) |
| `flow-review-routing` | 🟢 nice | hand | workflow | review-routing — Orquestrador de Revisão Pós-Task (pendente Fase 3) |
| `flow-security-mode` | 🟢 nice | auto | workflow | security-mode — Auditoria de Segurança (genérico) |
| `flow-task-mode` | 🟢 nice | auto | workflow | task-mode — Gestão de Tarefas (single agent) |

### http-api (17 flows)

| Flow ID | Tier | Mecanismo | Tipo | Subject |
|---------|------|-----------|------|---------|
| `http-api-global-error-mapping` | 🔴 critical | hand | workflow | Cross-cutting — Exception → GlobalExceptionFilter → RFC 7807 |
| `http-api-health-check` | 🔴 critical | hand | sequence | Health check — DB liveness via Fastify/NestJS boundary |
| `http-api-optimistic-locking-protocol` | 🔴 critical | hand | workflow | Cross-cutting — RFC 7232 If-Match/ETag optimistic locking |
| `http-api-users-create` | 🔴 critical | hand | sequence | POST /users — criar user + audit record (INSERT) |
| `http-api-users-get-by-id` | 🔴 critical | hand | sequence | GET /users/:id — buscar por ID (soft-deleted omitido por default) |
| `http-api-users-history` | 🔴 critical | hand | sequence | GET /users/:id/history — histórico de auditoria paginado |
| `http-api-users-list` | 🔴 critical | hand | sequence | GET /users — listar paginado por cursor (includeDeleted case-insensitive) |
| `http-api-users-restore` | 🔴 critical | hand | sequence | POST /users/:id/restore — restaurar soft-deletado (optimistic lock) |
| `http-api-users-soft-delete` | 🔴 critical | hand | sequence | DELETE /users/:id — soft delete + audit (DELETE op + archive) |
| `http-api-users-update-name` | 🔴 critical | hand | sequence | PATCH /users/:id — rename com optimistic locking (If-Match) |
| `http-api-audit-context-propagation` | 🟡 important | hand | lifecycle | Cross-cutting — AuditContext via AsyncLocalStorage (correlationId W3C) |
| `http-api-domain-events-to-audit` | 🟡 important | hand | workflow | Cross-cutting — domain events → audit operations (mapping) |
| `http-api-nestjs-module-composition` | 🟡 important | hand | architecture | Arquitetura — composição de módulos NestJS e bindings DI |
| `http-api-zod-validation-pipeline` | 🟡 important | hand | workflow | Cross-cutting — Zod validation na borda HTTP (defense-in-depth) |
| `http-api-etag-versioning-lifecycle` | 🟢 nice | hand | lifecycle | Lifecycle — User aggregate version/ETag transitions |
| `http-api-planned-endpoints-roadmap` | 🟢 nice | hand | workflow | Roadmap — endpoints planejados (Fase 8+) ainda não implementados |
| `http-api-update-email-flow` | 🟢 nice | hand | sequence | UPDATE email — use case existente (sem rota HTTP dedicada ainda) |

### ci-cd-and-defenses (12 flows)

| Flow ID | Tier | Mecanismo | Tipo | Subject |
|---------|------|-----------|------|---------|
| `ci-pipeline-defense-in-depth` | 🔴 critical | hand | workflow | Pipeline CI principal: preflight → quality (gated) + docker-build-prod smoke |
| `defense-in-depth-3-camadas` | 🔴 critical | hand | workflow | Estratégia defense-in-depth: pre-push local + preflight CI + quality CI gated |
| `docker-pipeline-apps-api` | 🔴 critical | hand | workflow | Pipeline Docker multi-stage apps/api: base → dev → builder → prod + healthcheck |
| `docker-pipeline-apps-web` | 🔴 critical | hand | workflow | Pipeline Docker multi-stage apps/web: base → dev → builder → prod + healthcheck |
| `post-merge-release-tagging` | 🔴 critical | hand | workflow | Post-merge release tagging: docs/MONOREPO.md footer → annotated tag vX.Y.Z |
| `preflight-ci-orchestrator` | 🔴 critical | hand | workflow | Orquestrador preflight.ts: 10 checks estruturais agregados |
| `ci-docs-sync-pr` | 🟡 important | hand | workflow | CI docs-sync em PR: sync-docs.yml → pnpm docs:sync --mode=full |
| `ci-stack-code-review-pr` | 🟡 important | hand | workflow | CI stack-code-review em PR: review-stack.yml → pnpm stack:review --mode=ci |
| `pre-commit-hook-stack-review-docsync` | 🟡 important | hand | workflow | Pre-commit hook: lint-staged + stack-code-reviewer + doc-sync |
| `pre-push-local-gate` | 🟡 important | hand | workflow | Pre-push local gate: pnpm ci:preflight (~10s) bloqueia drift estrutural |
| `docker-compose-local-stack` | 🟢 nice | hand | architecture | Stack local Docker Compose: postgres + api + web + otel-collector (observability profile) |
| `openapi-export-pipeline` | 🟢 nice | hand | workflow | Pipeline export-openapi: NestFactory + SwaggerModule → apps/api/openapi.json |

### tooling-and-skills (11 flows)

| Flow ID | Tier | Mecanismo | Tipo | Subject |
|---------|------|-----------|------|---------|
| `fs-archify-flow-auto` | 🔴 critical | auto | workflow | archify flow — geração automática de workflow diagram a partir do git diff (pre-push) |
| `fs-review-routing-classify` | 🔴 critical | auto | workflow | review-routing — classificador pós-implementer com consensus e exit code 3 (bloqueio) |
| `fs-specialist-routing-classify` | 🔴 critical | auto | workflow | specialist-routing — classificador headless + gate de gap_detected |
| `fs-archify-cli-deliver` | 🟡 important | hand | workflow | archify CLI render/validate/deliver/compare — pipeline de validação + entrega |
| `fs-ci-defense-preflight` | 🟡 important | auto | architecture | ci-defense-mode — preflight (defense-in-depth) com 11 checks + gates |
| `fs-doc-sync-mapping` | 🟡 important | auto | dataflow | doc-sync — mapeamento code→doc que dispara ações review/update/create/alert |
| `fs-retrospective-capture-pipeline` | 🟡 important | hand | workflow | retrospective-capture — captura de aprendizados em 3 estágios com gate de confidence ≥ 70 |
| `fs-stack-code-reviewer-rules` | 🟡 important | auto | workflow | stack-code-reviewer — pipeline de regras DDD/NestJS/Prisma/Next.js com gating blocker→exit |
| `fs-archive-lint-validate` | 🟢 nice | auto | workflow | archive-lint — validador de frontmatter canônico para archive de demands |
| `fs-demand-archiving-flow` | 🟢 nice | hand | workflow | archive-demand — pipeline de elegibilidade + commit atômico |
| `fs-state-aware-planning-snapshot` | 🟢 nice | hand | workflow | state-aware-planning — snapshot pré-planner com gates proceed | block | gap_blocker |

### telemetry-observability (8 flows)

| Flow ID | Tier | Mecanismo | Tipo | Subject |
|---------|------|-----------|------|---------|
| `telemetry.backend.bootstrap.lifecycle` | 🔴 critical | hand | workflow | Backend NodeSDK bootstrap (apps/api: process startup → SDK ready) |
| `telemetry.collector.otlp.pipeline.dataflow` | 🔴 critical | hand | dataflow | OTel Collector pipeline (receiver → processor → exporter) |
| `telemetry.frontend.nodejs.bootstrap.sequence` | 🔴 critical | hand | sequence | Frontend Next.js server-side OTel init (RSC/API routes via NodeSDK) |
| `telemetry.http.w3c.traceid.propagation.sequence` | 🔴 critical | hand | sequence | HTTP request → W3C traceId propagation (controller → AuditContext/ProblemDetails) |
| `telemetry.pino.otel.bridge.dataflow` | 🔴 critical | hand | dataflow | Pino ↔ OTel correlation bridge (log JSON enrichment com W3C trace_id/span_id) |
| `telemetry.compose.architecture.deployment` | 🟡 important | hand | architecture | Docker Compose observability stack (otel-collector service + observability profile) |
| `telemetry.frontend.browser.sdk.init.dataflow` | 🟡 important | hand | dataflow | Browser-side OTel SDK init (WebTracerProvider + auto-instrumentations) |
| `telemetry.webvitals.metrics.dataflow` | 🟡 important | hand | dataflow | Web Vitals → OTel Metrics (LCP/CLS/INP/FID/TTFB como Histograms) |

### web-app (8 flows)

| Flow ID | Tier | Mecanismo | Tipo | Subject |
|---------|------|-----------|------|---------|
| `web-app-flow-02` | 🔴 critical | hand | sequence | Web App: Users List Page (RSC data fetch via ApiClient) |
| `web-app-flow-04` | 🔴 critical | hand | dataflow | Web App: Web Vitals Telemetry Pipeline |
| `web-app-flow-01` | 🟡 important | hand | sequence | Web App: Home Page SSR Render (RSC) |
| `web-app-flow-03` | 🟡 important | hand | sequence | Web App: Health Check API Route |
| `web-app-flow-05` | 🟡 important | hand | lifecycle | Web App: Server-side OTel SDK Init (Node Runtime) |
| `web-app-flow-06` | 🟡 important | hand | sequence | Web App: API Client Error Path (ProblemDetails -> ApiError) |
| `web-app-flow-08` | 🟡 important | hand | architecture | Web App: API Client Component Topology |
| `web-app-flow-07` | 🟢 nice | hand | workflow | Web App: Next.js Standalone Build Pipeline (Docker) |

### data-and-shared-types (4 flows)

| Flow ID | Tier | Mecanismo | Tipo | Subject |
|---------|------|-----------|------|---------|
| `df-user-crud-lifecycle` | 🔴 critical | hand | dataflow | User CRUD request/response data flow (HTTP DTO → service → repository → Prisma → PostgreSQL → UserOutput) |
| `df-audit-history-archive` | 🟡 important | hand | dataflow | Audit lineage — domain events drained from aggregate written to users_history and users_archive |
| `df-prisma-schema-to-db` | 🟡 important | hand | dataflow | Schema-to-DB lineage — apps/api/prisma/schema.prisma → generated migration.sql → PostgreSQL tables/indexes/enum |
| `df-shared-types-contract` | 🟢 nice | hand | dataflow | Shared-types package contract flow — @projeto/shared-types exports consumed by apps/api (and planned apps/web) |

## Estratégia de geração

Conforme `generation_strategy` da discovery (workflow_integrity_notes):

- **Phase 1 (agora, ~30-60min):** 8 critical/auto (5 agent-workflows + 3 tooling-and-skills).
- **Phase 2 (backlog, ≥4-6h):** 24 critical/hand (http-api 10 + web-app 2 + ci-cd 6 + data 1 + telemetry 5).
- **Phase 3 (backlog):** 8 important/auto.
- **Phase 4 (backlog):** 20 important/hand.
- **Phase 5 (backlog):** 8 nice/auto + 10 nice/hand.

## Triggers de regeneração

- `.agents/workflows/*.md` ou `.agents/WORKFLOWS.md` → invalida 18 (agent-workflows).
- `apps/api/src/**/*.ts` ou `apps/api/prisma/schema.prisma` → invalida 17 (http-api) + 4 (data) + 5 (telemetry backend).
- `apps/web/**` → invalida 8 (web-app) + 3 (telemetry frontend).
- `.github/workflows/*.yml`, `.husky/*`, Dockerfile*, `docker-compose*.yml`, `infra/otelcol/*` → invalida 12 (ci-cd).
- `tooling/scripts/**`, `dev-archify/bin/**/*.mjs`, `.agents/agents/*.md`, `.agents/skills/**` → invalida 11 (tooling).

## Cross-references (regeneração em par)

- `http-api-audit-context-propagation` ↔ `telemetry.http.w3c.traceid.propagation.sequence` (correlationId W3C).
- `defense-in-depth-3-camadas` + `pre-push-local-gate` + `preflight-ci-orchestrator` + `ci-pipeline-defense-in-depth` (bundle atômico).
- `docker-compose-local-stack` + todos os flows Docker do domínio ci-cd + `telemetry.compose.architecture.deployment`.

**Mantido por:** projeto-base contributors · Descoberta via Workflow wgjqs0gef em 2026-09-24.
