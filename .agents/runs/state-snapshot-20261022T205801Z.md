---
generated_at: 2026-10-22T20:58:01Z
agent: specialist-router
demand_slug: "admin-visao-empresas-usuarios"
branch_at_snapshot: main
main_sha: 404a245
template_version_tag: v1.11.0
working_tree: clean
working_tree_files: []
last_commit:
  sha: 404a245
  author: "CEO Agent"
  message: "feat(tenancy): toda conta pertence a uma empresa, e a empresa nasce com três perfis (#116)"
  conventional: true
schema_drift_prisma: pending
coverage_aggregate_lines: 87.87
coverage_aggregate_branches: 92.14
coverage_aggregate_funcs: 89.46
coverage_threshold_met: true
preflight_checks: all_passed
health_endpoint:
  api: ok
  web: not_running
otel_env_vars_declared: ["OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_SDK_DISABLED", "OTEL_SERVICE_NAME", "OTEL_SERVICE_VERSION"]
otel_collector_running: true
matrix_specialist_routing_lint: passed
written_at: 2026-10-22T21:05:00Z
preflight_skipped:
  - "archive integrity — .agents/runs/archive/ vazio (0 arquivo .md)"
  - "drift agent↔memória — nenhum agent alterado em origin/main...HEAD"
matrix_specialist_routing_warnings: 2
matrix_specialist_routing_warnings_detail: "path_glob com blocking:true sem rationale (pnpm-workspace.yaml, turbo.json) — dívida pré-existente, não desta demanda"
proceed: true
proceed_rationale: "Nenhum gap com severity blocker. A migration pendente (G-001) é backfill de valor ('owner' → 'gerente') e não afeta leitura; o web não rodando (G-002) é estado de dev local, e a suíte e2e sobe o próprio servidor."

gaps_detectados:
  - id: G-001
    categoria: "Migration Prisma pendente no banco local"
    severity: major
    file: "apps/api/prisma/migrations/20261022000001_papel_gerente_legado/migration.sql"
    rationale: "`prisma migrate status` aponta a migration 20261022000001 como não aplicada. É backfill de valor gravado ('owner' → 'gerente'), que não afeta a leitura que esta demanda implementa, mas deixa o banco local atrás do schema."
    source: "pnpm exec prisma migrate status (apps/api)"
    status: open
  - id: G-002
    categoria: "Servidor web de dev não rodando"
    severity: info
    file: "apps/web"
    rationale: "curl em localhost:3001 falha. A API (3000) responde 200 em /api/v1/health. O e2e do web sobe o próprio servidor, então não bloqueia a execução."
    source: "curl -fsS http://localhost:3001"
    status: open
  - id: G-003
    categoria: "Dívida DRY declarada (6 termos)"
    severity: info
    file: "tooling/scripts/.../dry-termos.json"
    rationale: "Preflight mede 6 termos com dono parcial ('gerente', 'member', 'VALIDATION_ERROR', 'users.read', 'tenancy.invites', 'convite'). Dívida pré-existente com plano próprio (docs/superpowers/plans/2026-10-22-termos-de-dominio.md); esta demanda não precisa tocar em nenhum deles."
    source: "pnpm ci:preflight — gate 'termo de domínio tem UM dono'"
    status: open

gap_blocker: false
---

# State snapshot — admin-visao-empresas-usuarios

O repositório está em `main`, na altura do commit `404a245` (tenancy: toda conta
pertence a uma empresa), com a working tree limpa antes da coleta. O preflight
rodou com **0 erro** (2 checks pulados por ausência de material, não por
falha), a cobertura agregada está em **87,87%** de linhas na API e **99,53%**
no web (ambos acima do piso de 80%), e a API responde `200` em
`/api/v1/health` com o banco `ok`. O collector de OTel está de pé e as quatro
chaves `OTEL_*` estão declaradas. O que impede um plano limpo é o **drift de
migration**: a `20261022000001_papel_gerente_legado` está no repositório mas
não aplicada no banco local — é um backfill de valor gravado (`'owner'` →
`'gerente'`) e, por ser escrita pura, não muda nenhuma leitura que a demanda
"admin vê empresas e usuários" vai fazer. O web de dev não está rodando, o
que é estado de ambiente e não do código.

## Comandos executados

- `.agents/runs/20261022T205801Z-wt.txt` — `git status --short` (vazio antes da coleta)
- `.agents/runs/20261022T205801Z-branch.txt` — `git branch --show-current`
- `.agents/runs/20261022T205801Z-main-sha.txt` — `git rev-parse origin/main`
- `.agents/runs/20261022T205801Z-last-commit.txt` — `git log -1 --pretty=fuller`
- `.agents/runs/20261022T205801Z-template-tag.txt` — `git tag --list 'v*' --sort=-v:refname | head -1`
- `.agents/runs/20261022T205801Z-deps.txt` — deps de api/web/tooling (via `node`, sem `jq` — ausente na máquina)
- `.agents/runs/20261022T205801Z-prisma-migrate.txt` — `pnpm exec prisma migrate status`
- `.agents/runs/20261022T205801Z-preflight.txt` — `pnpm ci:preflight`
- `.agents/runs/20261022T205801Z-otel-vars.txt` — chaves `OTEL_*` (só nomes, sem valores)
- `/tmp/coverage-out.txt` — `pnpm test:coverage` (exit 0)

## Gaps principais

1. **G-001 (major)** — migration `20261022000001_papel_gerente_legado` pendente no
   banco local. Backfill de valor gravado; não afeta leitura. Resolver com
   `prisma migrate deploy` antes de medir contra o banco.
2. **G-002 (info)** — web de dev fora do ar; a API responde. A suíte e2e sobe o
   próprio servidor.
3. **G-003 (info)** — dívida DRY de 6 termos, com plano próprio em
   `docs/superpowers/plans/2026-10-22-termos-de-dominio.md`. Não é desta demanda.

## Decisão

`proceed: true` — nenhum gap `blocker`, working tree limpa, preflight sem erro,
cobertura acima do piso. O plano pode ser escrito; G-001 deve ser resolvido
antes de qualquer medição contra o banco.
