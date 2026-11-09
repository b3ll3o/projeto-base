---
generated_at: 2026-11-09T00:56:17Z
agent: claude-code
demand_slug: "issues-p1-130-139"
branch_at_snapshot: main
main_sha: 7e067e8fa3fa1a3164838fd21205e19b60776f81
template_version_tag: v1.21.0
working_tree: clean
working_tree_files: []
last_commit:
  sha: 7e067e8fa3fa1a3164838fd21205e19b60776f81
  author: "Leonardo Andreazzi <andreazzi-leonardo@hotmail.com>"
  message: "docs(runbook): a borda Cloudflare da publicação ganha o contrato de verificação (#146)"
  conventional: true
schema_drift_prisma: "chaves_de_assinatura existe nas migrations e não no schema — MEDIDO com `prisma migrate diff --from-url <db> --to-schema-datamodel`: emite `DROP TABLE \"chaves_de_assinatura\"`"
coverage_aggregate_lines: 88.18
coverage_aggregate_branches: 92.5
coverage_aggregate_funcs: 89.53
coverage_threshold_met: true
coverage_scope: "api 88.18% stmts (All files); web 98.46% stmts"
preflight_checks: all_passed
health_endpoint:
  api: ok
  web: down
otel_env_vars_declared:
  - OTEL_DEPLOYMENT_ENVIRONMENT
  - OTEL_EXPORTER_OTLP_ENDPOINT
  - OTEL_EXPORTER_OTLP_PROTOCOL
  - OTEL_LOGS_EXPORTER
  - OTEL_METRICS_EXPORTER
  - OTEL_RESOURCE_ATTRIBUTES
  - OTEL_SDK
  - OTEL_SDK_DISABLED
  - OTEL_SERVICE_NAME
  - OTEL_SERVICE_VERSION
  - OTEL_TRACES_EXPORTER
  - OTEL_TRACES_SAMPLER
  - OTEL_TRACES_SAMPLER_ARG
otel_collector_running: true
matrix_specialist_routing_lint: passed
written_at: 2026-11-09T00:56:17Z
preflight_skipped:
  - "archive integrity (.agents/runs/archive/*.md) — skipped: archive vazio (0 arquivo .md)"
  - "drift agent↔memória — skipped: nenhum agent alterado em origin/main...HEAD"
matrix_specialist_routing_warnings: 2
matrix_specialist_routing_warnings_detail: "path_glob com blocking:true sem rationale (illegível): pnpm-workspace.yaml, turbo.json"
---

# State snapshot — as 10 issues P1 do scan de 2026-11-02

## O que este snapshot mede

O `preflight` (40 gates) rodou **inteiro e verde** (`EXIT=0`). A cobertura
foi medida **antes** de qualquer alteração — 88.18% de statements na api
(limite: 80%, declarado no config raiz) e 98.46% no web.

## Três medições que NÃO estão no repositório e que decidem o desenho

1. **`migrate deploy` tolera migration aplicada e MODIFICADA.** MEDIDO num
   Postgres efêmero (`postgres:16-alpine`): as 15 migrations aplicadas, o
   arquivo `20261020000000` alterado, `migrate deploy` de novo → `EXIT=0`,
   "No pending migrations to apply". Com uma migration pendente junto →
   `EXIT=0`, aplicada. `migrate status` → "Database schema is up to date!".
   → **reescrever a migration da senha publicada é seguro** para quem já
   aplicou.
2. **`prisma migrate dev` está quebrado por OUTRO motivo** (não pelo #134):
   a migration `20261020000003` revoga privilégios de `_prisma_migrations`, e o
   shadow DB do Prisma não tem essa tabela → `P3006`/`P1014`. O critério
   "não propõe DROP" da #134 tem de ser medido por **`prisma migrate diff`**,
   que é o que emite o DROP de verdade.
3. **`prisma migrate diff --from-url <db> --to-schema-datamodel`** emite
   `DROP TABLE "chaves_de_assinatura"` — a #134 é real e destrutiva.
   (O mesmo diff mostra drift pré-existente de `DEFAULT` em `users_history.id`
   e `users_archive.id`, fora do escopo das 10 issues.)

## Ressalvas

- `health.web` = **down**: o serviço `web` não estava no ar no momento da
  medição (`curl localhost:3001` → conexão recusada). A api responde `ok` com
  `database: ok`. Isso não bloqueia o trabalho — a suíte e2e sobe web e api
  por conta própria.
- O `preflight` pulou 2 gates por ausência de corpus (`archive` vazio e
  "nenhum agent alterado"), como em toda rodada em `main`.
