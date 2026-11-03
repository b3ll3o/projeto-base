---
name: specialist-routing
version: 1.6
updated: 2026-10-16
maintainer: specialist-router
description: "Matriz canônica de roteamento de demanda — mapeia paths/keywords/scopes para 27 specialists. Source of truth do classificador headless (tooling/scripts/specialist-router.ts) e do lint da matriz. Atualizada por PR."
---

# Convenção: specialist-routing

> Fonte da verdade que o `specialist-router` consulta para classificar
> uma demanda (texto + paths + scope) e despachar os specialists.
> Edite aqui quando: novo specialist for criado, nova classe de arquivos
> surgir, regra de skip precisar ajuste, ou demand keyword/escopo novo
> for identificado (≥ 3 demandas).

## 1. PATH GLOBS
```yaml
path_globs:
  - pattern: "apps/api/**"
    specialists: [nestjs-specialist]
    rationale: "Backend NestJS (controllers, use cases, Prisma, infra)"
  - pattern: "apps/api/**/domain/**"
    specialists: [nestjs-specialist]
    stacks: [ddd-hexagonal]
    rationale: "Pureza DDD é crítica em domain/"
  - pattern: "apps/api/**/application/**"
    specialists: [nestjs-specialist]
    stacks: [ddd-hexagonal]
  - pattern: "apps/api/**/infrastructure/**"
    specialists: [nestjs-specialist]

  - pattern: "**/prisma/**"
    specialists: [nestjs-specialist]
    rationale: "Schema, migrations, seed"

  - pattern: "**/auth/**"
    specialists: [security-auditor]
    rationale: "Auth code (guards, strategies, JWT handlers)"

  - pattern: "**/secrets/**"
    specialists: [security-auditor]
    rationale: "Secrets/credentials storage"
  - pattern: "**/.env*"
    specialists: [security-auditor]
    rationale: "Environment files (may contain secrets)"
  - pattern: "apps/web/**"
    specialists: [nextjs-specialist]
    rationale: "Frontend Next.js (app/, components/, lib/, styles/)"

  - pattern: "apps/web/components/**"
    specialists: [nextjs-specialist, ux-design-specialist]
    rationale: "Componentes de UI (aparência, estados, acessibilidade)"

  - pattern: "apps/web/app/**.tsx"
    specialists: [ux-design-specialist]
    rationale: "Páginas e componentes de rota (layout visual, microcopy, estados de tela)"

  - pattern: "apps/web/app/globals.css"
    specialists: [ux-design-specialist]
    rationale: "Tokens de design (cor, espaçamento, tipografia) e resets"

  - pattern: "packages/**"
    specialists: [monorepo-specialist]
  - pattern: "pnpm-workspace.yaml"
    specialists: [monorepo-specialist]
    blocking: true
  - pattern: "turbo.json"
    specialists: [monorepo-specialist]
    blocking: true

  - pattern: "tsconfig*.json"
    specialists: [monorepo-specialist]

  - pattern: "**/Dockerfile*"
    specialists: [docker-specialist]
  - pattern: "**/docker-compose*.yml"
    specialists: [docker-specialist]
  - pattern: "**/.dockerignore"
    specialists: [docker-specialist]

  - pattern: "apps/api/**/telemetry/**"
    specialists: [telemetry-specialist]
    rationale: "Backend telemetry (OpenTelemetry SDK Node: tracing.ts, instrumentations NestJS/Fastify/Prisma/Pino, OTel Logs bridge)"

  - pattern: "apps/web/**/instrumentation*"
    specialists: [telemetry-specialist]
    rationale: "Next.js OpenTelemetry instrumentation hook (instrumentation.ts / instrumentation-client.ts / instrumentation-node.ts / instrumentation.edge.ts)"
  - pattern: "apps/web/**/web-vitals*"
    specialists: [telemetry-specialist]
    rationale: "Browser Real User Monitoring (LCP, CLS, INP, FID, TTFB) via web-vitals reporter"
  - pattern: "infra/otelcol/**"
    specialists: [telemetry-specialist]
    rationale: "OpenTelemetry Collector config (receivers, processors, exporters, pipelines)"

  # v1.3 — Specialists de auditoria. Em geral, `finding-orchestrator` dispara
  # todos os 5 em paralelo (cron `weekly-findings-scan` ou sob demanda). Aqui,
  # roteamos para auditoria sob demanda do `specialist-router` quando a demanda cita
  # o path. Ver WORKFLOWS.md §audit-mode.
  - pattern: "apps/api/prisma/**"
    specialists: [prisma-db-specialist]
  - pattern: "apps/api/openapi.json"
    specialists: [openapi-contract-specialist]
  - pattern: "apps/api/src/modules/**/controllers/**"
    specialists: [openapi-contract-specialist, nestjs-specialist]
  - pattern: "apps/api/src/modules/**/application/dto/**"
    specialists: [openapi-contract-specialist, nestjs-specialist]
  - pattern: "apps/*/Dockerfile"
    specialists: [docker-prod-specialist, docker-specialist]
  - pattern: "docker-compose*.yml"
    specialists: [docker-prod-specialist, docker-specialist]
  - pattern: ".dockerignore"
    specialists: [docker-prod-specialist, docker-specialist]
  - pattern: "docs/{MONOREPO,STACK}.md"
    specialists: [release-versioning-specialist, doc-writer]
  - pattern: ".agents/specs/conventions/estrutura-e-versionamento.md"
    specialists: [release-versioning-specialist, doc-writer]
  - pattern: ".github/workflows/release-template.yml"
    specialists: [release-versioning-specialist, monorepo-specialist]

  # v1.6 — tenancy. NÃO duplica `apps/api/prisma/**` (schema é do prisma-db).
  # MEDIDO 2026-10-17: só BASENAME, case-sensitive, e `tenancy` NÃO contém `tenant`.
  - pattern: "**/*tenant*"
    specialists: [multi-tenant-specialist]
    rationale: "Tenant, TenantMembership, filtro por tenant_id, RLS — o domínio de tenancy, não o de schema"
  - pattern: "**/*tenancy*"
    specialists: [multi-tenant-specialist]
  - pattern: ".github/workflows/**"
    specialists: [monorepo-specialist, security-auditor]
  - pattern: "**/.agents/**"
    specialists: [refactorer, doc-writer, documentation-specialist]
    domain: "agents-meta"
  - pattern: "tooling/scripts/**"
    specialists: [refactorer]
  - pattern: "docs/**"
    specialists: [doc-writer, documentation-specialist]
  - pattern: "docs/adr/**"
    specialists: [doc-writer, documentation-specialist]
  - pattern: "**/*.md"
    specialists: [doc-writer, documentation-specialist]
  - pattern: "**/*.spec.ts"
    specialists: [test-writer]
  - pattern: "**/*.test.ts"
    specialists: [test-writer]
  - pattern: "vitest.config.*"
    specialists: [tdd-enforcer, test-writer]
  - pattern: "**/TODO*"
    specialists: [task-manager]
  - pattern: "package.json"
    specialists: [monorepo-specialist, orchestrator]
  - pattern: "**/auth/**"
    specialists: [security-auditor, nestjs-specialist]
  - pattern: ".agents/agents/agent-architect.md"
    specialists: [agent-architect]
  - pattern: ".agents/agents/orchestrator.md"
    specialists: [orchestrator, specialist-router]
  - pattern: ".agents/agents/explorer.md"
    specialists: [explorer]
  - pattern: ".agents/agents/code-reviewer.md"
    specialists: [code-reviewer]
  - pattern: ".agents/agents/stack-code-reviewer.md"
    specialists: [stack-code-reviewer]
  - pattern: ".agents/agents/doc-sync.md"
    specialists: [doc-sync]
  - pattern: ".agents/agents/documentation-specialist.md"
    specialists: [documentation-specialist]
  - pattern: ".agents/agents/review-router.md"
    specialists: [review-router]
  - pattern: ".agents/agents/specialist-router.md"
    specialists: [specialist-router]
  - pattern: ".agents/agents/tdd-enforcer.md"
    specialists: [tdd-enforcer]
  - pattern: ".agents/agents/task-manager.md"
    specialists: [task-manager]
  - pattern: ".agents/agents/otelcol-infra-specialist.md"
    specialists: [otelcol-infra-specialist, telemetry-specialist]
  - pattern: "infra/otelcol/**"
    specialists: [otelcol-infra-specialist, telemetry-specialist]
```

## 2. DEMAND KEYWORDS

```yaml
demand_keywords:
  - regex: "(?i)docker(izar|ize)?|container(iza[çc][ãa]o)?|compose"
    specialists: [docker-specialist]
  - regex: "(?i)monorepo|workspace|\\bturbo\\b|pnpm.?workspace"
    specialists: [monorepo-specialist]
  - regex: "(?i)nestjs|fastify|prisma|controller|module"
    specialists: [nestjs-specialist]
  - regex: "(?i)next\\.?js|nextjs|react|tailwind|rsc|server.?component"
    specialists: [nextjs-specialist]
  - regex: "(?i)seguran[çc]a|vulnerab|owasp|secrets?|cve|exploit|\\bauth\\b|\\bjwt\\b"
    specialists: [security-auditor]

  - regex: "(?i)refactor|simplificar|simplify|dry|limpar|cleanup"
    specialists: [refactorer]
  - regex: "(?i)\\bprisma\\b|schema\\.prisma|\\bmigrations?\\b|query lente|n\\+\\+1|índices?"
    specialists: [prisma-db-specialist]
  - regex: "(?i)multi.?tenant|tenant_?id|\\btenants?\\b|\\bmembership\\b|isolamento entre (empresas|tenants)|row level security|\\brls\\b"
    specialists: [multi-tenant-specialist]
  - regex: "(?i)openapi|swagger|contrato (http|api)|endpoint (sem|com) docs"
    specialists: [openapi-contract-specialist]
  - regex: "(?i)\\bprod.?readiness|hardening|cap_drop|non-root|healthcheck|imagem.*pinar"
    specialists: [docker-prod-specialist]
  - regex: "(?i)\\bbumpar\\b|semver|tag v|conventional commit|changelog.*drift"
    specialists: [release-versioning-specialist]
  - regex: "(?i)rodar (auditoria|scan)|analisar (a )?stack|encontrar (bugs|drifts?|gaps?)"
    specialists: [finding-orchestrator]
  - regex: "(?i)\\btest(es)?\\b|tdd|cobertura|coverage|\\bspec\\b"
    specialists: [test-writer]
  - regex: "(?i)\\bdoc(umenta[çc][ãa]o)?\\b|readme|adr|spec(ification)?|catálogo de rotas"
    specialists: [doc-writer, documentation-specialist]
  - regex: "(?i)telemetry|tracing|opentelemetry|\\botel\\b|spans?"
    specialists: [telemetry-specialist]
  - regex: "(?i)\\btela(s)?\\b|\\bux\\b|\\bdesign\\b|layout|formul[áa]rio|acessibilidade|\\ba11y\\b|EmptyState|estados? de"
    specialists: [ux-design-specialist]
```

## 3. DEMAND SCOPES

```yaml
demand_scopes:
  feat:
    specialists_added: [test-writer, doc-writer]
  fix:
    specialists_added: [test-writer]
  refactor:
    specialists_added: [refactorer]
  infra:
    specialists_added: [docker-specialist, monorepo-specialist]
  security:
    specialists_added: [security-auditor]
  docs:
    specialists_added: [doc-writer, documentation-specialist]
  test:
    specialists_added: [test-writer]
  perf:
    specialists_added: []
    rationale: "P3 — perf-specialist não existe em v1.0; v1.1 deve incluir"
```

## 4. SKIP HEURISTICS

```yaml
skip_rules:
  nestjs-specialist:
    skip_if: "todos os paths estão em apps/web/** E nenhum path em apps/api/** E nenhum keyword nestjs|fastify|prisma|controller|module match"
    rationale: "Demanda puramente frontend não precisa de nestjs-specialist"

  nextjs-specialist:
    skip_if: "todos os paths estão em apps/api/** E nenhum path em apps/web/** E nenhum keyword nextjs|react|tailwind|rsc match"
    rationale: "Demanda puramente backend não precisa de nextjs-specialist"

  docker-specialist:
    skip_if: "scope != infra E nenhum keyword docker|container|compose match E nenhum path **/Dockerfile*|**/docker-compose*|**/.dockerignore"
    rationale: "Demanda sem menção a containerização não precisa de docker-specialist"

  security-auditor:
    skip_if: "scope != security E nenhum keyword segurança|vulnerab|owasp|secrets|cve|exploit|auth|jwt match"
    rationale: "Auditoria só dispara quando demanda explicitamente toca segurança"

  refactorer:
    skip_if: "nenhum path em tooling/scripts/** nem .agents/** E nenhum keyword refactor|simplificar|dry|limpar match E scope != refactor"
    rationale: "Refactorer só quando paths ou keywords sinalizam refactor"

always_on:
  - monorepo-specialist
```

## 5. EXEMPLOS

> [specialist-routing-examples.md](./specialist-routing-examples.md) traz os 3 cenários
> E2E (D: docker+monorepo, E: security+test, F: refactor simples) com demands, paths,
> scopes, expected output e justificativas.
> O **histórico de gaps conhecidos (v1.0)** foi migrado para
> [`specialist-routing-gaps-v1.0.md`](./specialist-routing-gaps-v1.0.md)
> (apenas leitura), preservando o limite de 300 linhas deste spec.

## 6. DERIVED TAGS (v1.1)

> Tags derivadas de paths que sinalizam requisitos técnicos. O classificador
> `tooling/scripts/specialist-router.ts` expoe `derived_tags` em
> `ClassifyResult` para o controller aplicar convenções (ex: ENTRYPOINT usa
> `pnpm exec prisma`, compose precisa de healthcheck block).

```yaml
derived_tags:
  prisma_binary:
    path_match: "**/prisma/schema.prisma"
    rationale: "Prisma CLI precisa do binary engine debian-openssl-3.0.x (não alpine). ENTRYPOINT em Dockerfile prod deve usar `pnpm exec prisma` (pnpm strict layout não cria .bin/prisma)."
  compose_with_healthcheck:
    path_match: "**/docker-compose*.yml"
    rationale: "Compose services com /health endpoint devem declarar block `healthcheck:` (compose level) — Dockerfile HEALTHCHECK sozinho não é suficiente para `docker compose ps` mostrar healthy."
```

## 7. Histórico de Versões

> Completo em [`specialist-routing-historico.md`](./specialist-routing-historico.md)
> (apenas leitura), para preservar o limite de 300 linhas deste spec.
