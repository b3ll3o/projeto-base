# Specialist-Router + Docker-Specialist + Dockerização — Plano Mestre

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) ou superpowers:executing-plans. Steps em checkbox (`- [ ]`).

**Goal:** Criar specialist-router + docker-specialist + docker skill, integrar nos workflows existentes, e aplicar imediatamente à demanda de dockerização de apps/api + apps/web (NestJS + Next.js + Postgres) com TDD + revisões por tarefa + PR para main.

**Architecture:** Specialist-router é um orquestrador (mirror do review-router) que classifica demandas (keywords + paths + scope) via matriz externa, despacha specialists em paralelo via Agent tool, e bloqueia planning se `gap_detected`. Docker-specialist é um specialist novo que cobre Dockerfile/Compose/hardening/BuildKit/registries/runtime/integração com monorepo pnpm+turbo. Aplicação: docker-specialist + monorepo-specialist planejam a dockerização em paralelo; plan unificado executa com TDD (Dockerfile "build verde" como test) + 2-stage reviews por tarefa.

**Tech Stack:** Node 20 + pnpm 9.12.0 + Turborepo + NestJS 11 (Fastify) + Prisma 6 + Next.js 15 (App Router + RSC) + Docker (multi-stage, BuildKit) + Docker Compose (multi-file) + postgres:16-alpine. TypeScript ESM. Markdown pt-BR.

**Spec de origem:** `docs/superpowers/specs/2026-09-23-specialist-router-docker-design.md`

---

## Estrutura de Arquivos

### Fase 1 — Infra do specialist-router

| Arquivo | Responsabilidade |
|---|---|
| `.agents/agents/specialist-router.md` | Agent definition (orquestrador) |
| `.agents/memory/specialist-router.md` | Memória acumulada |
| `.agents/skills/specialist-routing/SKILL.md` | Workflow do controller para invocar router |
| `.agents/specs/conventions/specialist-routing.md` | Matriz de roteamento v1.0 (source of truth) |
| `.agents/specs/conventions/specialist-routing-examples.md` | Apêndice com exemplos D+E (≥3 cenários) |
| `tooling/scripts/specialist-router.ts` | Classificador headless TDD |
| `tooling/scripts/specialist-router.spec.ts` | Testes do classificador |
| `tooling/scripts/lint-specialist-routing.ts` | Lint da matriz |
| `tooling/scripts/lint-specialist-routing.spec.ts` | Testes do lint |
| `tooling/scripts/package.json` | Adicionar scripts `specialist:route` + `specialist:lint` |
| `package.json` (root) | Adicionar scripts `specialist:route` + `specialist:lint` |
| `AGENTS.md` | §3 — adicionar 2 linhas (docker-specialist + specialist-router) |
| `WORKFLOWS.md` (.agents) | Adicionar `specialist-routing` na tabela + bloco §`specialist-routing` |
| `.agents/workflows/{monorepo-change,backend-feature,frontend-feature,ci-defense-mode,release-mode,retrospective-mode}.md` | Adicionar bloco "Passo Pré-Planner" |
| `.agents/specs/conventions/evolucao-agents.md` | Adicionar parágrafo sobre `gap_detected` (regra de bloqueio) |

### Fase 2 — docker-specialist + docker skill

| Arquivo | Responsabilidade |
|---|---|
| `.agents/agents/docker-specialist.md` | Specialist em containerização |
| `.agents/memory/docker-specialist.md` | Memória inicial |
| `.agents/skills/docker/SKILL.md` | Skill com convenções docker do projeto |

### Fase 3 — Dockerização (aplicação)

| Arquivo | Responsabilidade |
|---|---|
| `.dockerignore` | Exclude patterns (node_modules, .turbo, dist, .next, coverage, *.log, etc.) |
| `apps/web/next.config.mjs` | Adicionar `output: 'standalone'` |
| `apps/web/Dockerfile` | Multi-stage dev+prod (deps → builder → runtime) |
| `apps/api/Dockerfile` | Multi-stage dev+prod (deps → builder → runtime, com db:generate antes de tsc) |
| `docker-compose.yml` | Estender com api + web (prod targets) |
| `docker-compose.dev.yml` | Override dev (tsx watch, next dev, bind mounts) |
| `apps/api/src/modules/health/health.controller.ts` | GET /api/v1/health (verifica DB via SELECT 1) |
| `apps/api/src/modules/health/health.module.ts` | Module do health controller |
| `apps/api/src/app.module.ts` | Importar HealthModule + ativar CORS via env |
| `apps/api/src/main.ts` | Habilitar CORS via app.enableCors() condicional por NODE_ENV |
| `apps/web/app/api/health/route.ts` | GET /api/health (Next.js route handler) |
| `docs/STACK.md` | Seção Docker + bump footer version |
| `docs/MONOREPO.md` | Seção Docker + bump footer version |
| `.tooling/scripts/ci/preflight.ts` | Drift check: dockerignore, Dockerfile LOC, version consistency |
| `.tooling/scripts/ci/check-docker-drift.ts` | (Novo) Implementação do drift check |
| `.tooling/scripts/ci/check-docker-drift.spec.ts` | Testes do drift check |

---

## Plano Detalhado por Fase

Os passos detalhados (TDD step-by-step) estão em arquivos separados:

- **Fase 1 — Infra do specialist-router:** [`2026-09-23-specialist-router-docker-fase-01-infra-router.md`](./2026-09-23-specialist-router-docker-fase-01-infra-router.md)
- **Fase 2 — docker-specialist + docker skill:** [`2026-09-23-specialist-router-docker-fase-02-docker-specialist.md`](./2026-09-23-specialist-router-docker-fase-02-docker-specialist.md)
- **Fase 3a — Dockerfiles + Compose (Tasks 11-16):** [`2026-09-23-specialist-router-docker-fase-03a-dockerfiles-compose.md`](./2026-09-23-specialist-router-docker-fase-03a-dockerfiles-compose.md)
- **Fase 3b — Apps (health/CORS), Docs, CI, PR (Tasks 17-21):** [`2026-09-23-specialist-router-docker-fase-03b-apps-health-docs-pr.md`](./2026-09-23-specialist-router-docker-fase-03b-apps-health-docs-pr.md)

Cada fase termina com:
- TDD verde (testes passando)
- 2-stage review (spec + code quality) por tarefa
- Commit atômico por tarefa
- Verificação branch antes de commit

---

## Critérios de Done Globais

| # | Critério | Verificação |
|---|---|---|
| D1 | specialist-router agent + skill + matriz + classifier + lint criados | `ls .agents/agents/specialist-router.md tooling/scripts/specialist-router.ts` |
| D2 | Matriz v1.0 cobre 8 specialists | `pnpm specialist:lint` exit 0 |
| D3 | docker-specialist + docker skill criados | `ls .agents/agents/docker-specialist.md .agents/skills/docker/SKILL.md` |
| D4 | AGENTS.md §3 + WORKFLOWS.md atualizados | `grep -c 'specialist-router\|docker-specialist' AGENTS.md .agents/WORKFLOWS.md` ≥ 2 cada |
| D5 | 6 workflows têm bloco "Passo Pré-Planner" | `grep -l 'specialist-router' .agents/workflows/*.md` retorna 6 |
| D6 | Dockerfiles api + web build verde | `docker build -f apps/api/Dockerfile --target prod . && docker build -f apps/web/Dockerfile --target prod .` exit 0 |
| D7 | docker-compose up funcional | `docker compose up -d postgres api web && curl -f http://localhost:3000/api/v1/health && curl -f http://localhost:3001/api/health` exit 0 |
| D8 | docker-compose.dev.yml hot reload funciona | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up` + edit em apps/api/src/users.test.ts + reload observado |
| D9 | Testes api + web passam dentro de container | `docker compose exec api pnpm test:unit && docker compose exec web pnpm test:unit` exit 0 |
| D10 | PR para main com CI verde | `gh pr create` + `gh pr checks` 4/4 verde |
| D11 | Retro captura aprendizados v1.0 | `b<N>-result.md` salvo em `.agents/memory/specialist-router.md` e `docker-specialist.md` |

---

## Estratégia de Review (2-stage por tarefa)

Após cada task, dispatch 2 reviewers em paralelo via Agent tool:

1. **spec-compliance-reviewer** (sub-fresh) — verifica se a task atende a spec §N+1 e ao plan correspondente. Output: lista de gaps (severity).
2. **code-quality-reviewer** (sub-fresh) — verifica qualidade (TDD verde, sem over-engineering, padrões do projeto, <300 linhas, convenções pt-BR).

Convergência: se AMBOS retornam 0 IMPORTANT/BLOCKING, tarefa é aceita. Se QUALQUER retorna IMPORTANT/BLOCKING, fix-implementer é despachado para corrigir, e o ciclo repete.

---

## Riscos e Mitigações

| Risco | Mitigação |
|---|---|
| Docker build context = repo root infla imagem | `.dockerignore` agressivo (Phase 3 Task 1) + multi-stage |
| Prisma binary target mismatch (alpine vs debian) | Usar `node:20-bookworm-slim` (debian) — decisão D8 do spec |
| ESM .js import suffixes quebram com bundler | Não introduzir bundler; `tsc` direto (mirror do api build atual) |
| Next.js standalone precisa de `public/` e configs | Criar `apps/web/public/.gitkeep` se não existir; copiar `next.config.mjs` no stage runtime |
| Migrations não idempotentes em multi-réplica | `prisma migrate deploy` é idempotente; advisory lock implícito do postgres para serializar |
| Compose dev com bind mounts perde `node_modules` host | Anonymous volume em `/repo/node_modules` (mesmo padrão do Next.js) |

---

## Execução

Após aprovação deste plano mestre, executar Fase 1 → 2 → 3 sequencialmente. Cada fase:
1. Implementer fresh subagent por task
2. 2-stage review por task
3. Fix loop se IMPORTANT/BLOCKING
4. Avançar quando 0 IMPORTANT/BLOCKING

PR para main ao final da Fase 3 (após todas as tasks e reviews verde).

---

**Mantido por:** projeto-base contributors