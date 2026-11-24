---
generated_at: 2026-11-23T20:30:15Z
agent: claude-code (camada 0, thread principal)
demand_slug: atualizacao-de-dependencias-prs-abertos
branch_at_snapshot: chore/atualizacao-de-dependencias-2026-11-23
main_sha: 9c6d9efad552736094e6712a2e33d4ee9ee40ef4
template_version_tag: v1.31.0
working_tree: clean
working_tree_files: []
last_commit:
  sha: 9c6d9efad552736094e6712a2e33d4ee9ee40ef4
  author: Leonardo Andreazzi
  message: "feat(agents): o especialista em cobertura e2e de fluxos de usuário (#172)"
  conventional: true
schema_drift_prisma: "não medido nesta camada (a issue #183 está aberta e reporta P3006/P1014 no `prisma migrate dev`; o `db:generate` do CI passa)"
coverage_aggregate_lines: 88.19
coverage_aggregate_branches: 91.47
coverage_aggregate_funcs: 89.73
coverage_threshold_met: true
coverage_per_app:
  api: "88.19 stmts / 91.47 branch / 89.73 funcs / 88.19 lines"
  web: "98.65 stmts / 94.43 branch / 97.19 funcs / 98.65 lines"
preflight_checks: all_passed
preflight_command: "pnpm ci:preflight (exit 0, 2026-11-23, com a árvore de `main` intacta)"
install_frozen_lockfile: "exit 0, sem aviso de peer dependency"
health_endpoint:
  api: não_medido
  web: não_medido
otel_env_vars_declared:
  - OTEL_EXPORTER_OTLP_ENDPOINT
  - OTEL_RESOURCE_ATTRIBUTES
  - OTEL_SDK
  - OTEL_SDK_DISABLED
  - OTEL_SERVICE_NAME
  - OTEL_SERVICE_VERSION
otel_collector_running: true
matrix_specialist_routing_lint: passed
written_at: 2026-11-23T20:35:00Z
preflight_skipped: []
matrix_specialist_routing_warnings: 2
matrix_specialist_routing_warnings_detail: "path_glob com blocking:true sem rationale (pre-existentes): pnpm-workspace.yaml, turbo.json"
proceed: true
proceed_rationale: "Nenhum gap de severidade blocker. A `main` está verde no preflight (exit 0), o `pnpm install --frozen-lockfile` sai limpo, a cobertura está acima do teto de 80% nos dois apps e o Postgres local está no ar (`projeto-base-pg-local` UP). A demanda é de ATUALIZAÇÃO de dependência: o risco não está no estado atual, está no bump — e o bump é o que este snapshot delimita."

gaps_detectados:
  - id: G-001
    categoria: "Dependência — os 5 PRs do Dependabot estão presos a uma base velha"
    severity: important
    file: ".github/dependabot.yml"
    rationale: "Os 5 PRs abertos (#173–#177) foram abertos sobre uma `main` ANTERIOR à correção do advisory do `effect` (CVE-2026-121707, PR #181). Os 4 que não são do `prisma` **revertem** o `override` de `effect@3.22.1` e o registro de medição de `.tooling/scripts/ci/excecoes-de-dependencias.json` (`medidoEm` volta de 2026-11-23 para 2026-11-18). MEDIDO: o `preflight` dos 4 reprova com `advisory high em effect (1248071) … Não há exceção declarada para ela`."
    source: "logs do `preflight` dos PRs #173–#177 (run 45148489887, job 137603595063) + `git diff main origin/dependabot/...`"
    status: open
  - id: G-002
    categoria: "Dependência — o `prisma` 6→7 é breaking de schema, não é bump"
    severity: important
    file: "apps/api/prisma/schema.prisma"
    rationale: "O CI do PR #176 reprova em `db:generate` com `P1012`: `The datasource property 'url' is no longer supported in schema files` e o mesmo para `directUrl`. O schema do repo (apps/api/prisma/schema.prisma:17-18) declara as DUAS propriedades. O Prisma 7 exige `prisma.config.ts` + driver adapter + reescrita do client — é migração, não atualização."
    source: "log do job 137604323520 (run 45148706372)"
    status: open
  - id: G-003
    categoria: "Dependência — a família OpenTelemetry está em gerações diferentes"
    severity: important
    file: "apps/web/package.json"
    rationale: "MEDIDO no lockfile: `@opentelemetry/core` 1.27.0/1.30.1 e `@opentelemetry/resources` 1.30.1 (geração do `sdk-node` 0.54.2), enquanto `@opentelemetry/core` 2.12.0 já aparece na árvore. O `sdk-node` 0.301.2 exige `core` 3.1.1 + `resources` 3.1.1, e o `instrumentation-user-interaction` 0.69.1 exige `core` ^3.0.0. Bump isolado = duas gerações do `core` na mesma árvore."
    source: "pnpm-lock.yaml:1294-1316 + `npm view` dos alvos"
    status: open
  - id: G-004
    categoria: "Frescor — 3 pendências de major do OpenTelemetry já declaradas"
    severity: info
    file: ".tooling/scripts/ci/dependencias-major-pendentes.json"
    rationale: "`@opentelemetry/resources` (1→3), `@opentelemetry/sdk-trace-base` (1→2) e `@opentelemetry/sdk-trace-web` (1→2) estão na tabela de majors pendentes, com o motivo `renomeia pacotes e muda a API de tracing`. O `check-dependency-freshness` reprova quando a pendência envelhece (a faixa já permite a major) — então subir essas majorsobriga REMOVER as pendências correspondentes e ajustar o `total`."
    source: ".tooling/scripts/ci/dependencias-major-pendentes.json:15-38 + check-dependency-freshness.ts:264-300"
    status: open
