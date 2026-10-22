---
generated_at: 2026-10-22T05:15:00Z
agent: orchestrator
demand_slug: "termos-de-dominio"
branch_at_snapshot: feat/onboarding-empresa
main_sha: f2041e2cb26b0d545c10671587a209040e19fc78
template_version_tag: v1.12.0
working_tree: clean
working_tree_files: []
last_commit:
  sha: 242bbf29abfbdd6ef56496222a6cade67080e164
  author: "CEO Agent"
  message: "feat(tenancy): o catálogo da empresa é gerente, coordenador e funcionário"
  conventional: true
schema_drift_prisma: none
coverage_aggregate_lines: 87
coverage_aggregate_branches: 92
coverage_aggregate_funcs: 89
coverage_threshold_met: true
preflight_checks: all_passed
health_endpoint:
  api: ok
  web: ok
otel_env_vars_declared:
  - OTEL_EXPORTER_OTLP_ENDPOINT
  - OTEL_EXPORTER_OTLP_PROTOCOL
  - OTEL_METRICS_EXPORTER
  - OTEL_SERVICE_NAME
  - OTEL_TRACES_EXPORTER
otel_collector_running: true
matrix_specialist_routing_lint: passed
written_at: 2026-10-22T05:22:00Z
preflight_skipped:
  - "coverage agregada — medida pelo gate `pnpm ci:local` (API 87,87% / web 99,52% nas linhas), e não no snapshot; o valor acima é o do gate."
  - "prisma migrate status — o Postgres local tem as 13 migrations aplicadas; medido por `prisma migrate status` (2026-10-22, `Database schema is up to date!`)."
matrix_specialist_routing_warnings: 0
matrix_specialist_routing_warnings_detail: ""
proceed: true
proceed_rationale: "Working tree limpo, preflight verde, cobertura acima do piso, API e web no ar. Nenhum gap blocker de ESTADO — os gaps abaixo são de ESCOPO, e a demanda é justamente eliminá-los."

gaps_detectados:
  - id: G-001
    categoria: "Termo de domínio sem dono: o papel do convidado (`member`)"
    severity: major
    file: "apps/api/src/modules/tenancy/application/tenancy.use-cases.ts"
    rationale: "`member` aparece em 17 arquivos (59 ocorrências) e é o valor que o convite grava. Não há constante exportada: o valor está hardcoded no caso de uso, nos specs, no port e no schema do banco."
    source: "MEDIDO por `npx tsx tooling/scripts/analisa-repeticao.ts --min=4` (2026-10-22)"
    status: open
  - id: G-002
    categoria: "Termo de domínio sem dono: o código do problema (`VALIDATION_ERROR`)"
    severity: major
    file: "apps/api/src/shared/infrastructure/http/global-exception.filter.ts"
    rationale: "`VALIDATION_ERROR` aparece em 19 arquivos (47 ocorrências) e é o código que o `GlobalExceptionFilter` escreve no problem-details e que o web lê para decidir a mensagem."
    source: "MEDIDO por `npx tsx tooling/scripts/analisa-repeticao.ts --min=4` (2026-10-22)"
    status: open
  - id: G-003
    categoria: "Termo de domínio sem dono: o discriminante do `destino` (`convite`)"
    severity: major
    file: "packages/shared-types/src/user.ts"
    rationale: "`convite` aparece em 23 arquivos (44 ocorrências) — como `destino.tipo` no cadastro, como chave de rota e como nome de pasta. O TIPO está no shared-types; o LITERAL está espalhado."
    source: "MEDIDO por `npx tsx tooling/scripts/analisa-repeticao.ts --min=4` (2026-10-22)"
    status: open
  - id: G-004
    categoria: "Dono que existe, mas não exporta a constante nomeada (permissões)"
    severity: major
    file: "apps/api/src/shared/auth/permissions-catalog.ts"
    rationale: "`users.read` e as outras permissões aparecem em 29 arquivos (155 ocorrências). O DONO existe (`PERMISSIONS`), mas exporta um ARRAY: quem precisa de um item escreve o literal, porque `PERMISSIONS[3]` é um índice que muda quando o catálogo cresce."
    source: "MEDIDO por `npx tsx tooling/scripts/analisa-repeticao.ts --min=4` (2026-10-22)"
    status: open
  - id: G-005
    categoria: "Dono que existe, mas não exporta a constante nomeada (feature flags)"
    severity: major
    file: "apps/api/src/shared/auth/feature-flag-catalog.ts"
    rationale: "`tenancy.invites` aparece em 15 arquivos (79 ocorrências). Mesmo caso do G-004: o dono existe (`FEATURE_FLAGS`) e exporta o array."
    source: "MEDIDO por `npx tsx tooling/scripts/analisa-repeticao.ts --min=4` (2026-10-22)"
    status: open
  - id: G-006
    categoria: "Fixture de teste repetido sem constante compartilhada"
    severity: minor
    file: "apps/web/e2e/support/dados.ts"
    rationale: "`acme` (19 arquivos, 149×), `João` (14, 97×) e `joao@example.com` (14, 104×) são o mesmo fixture repetido. Não é termo de domínio — é o valor do teste — mas o dono compartilhado (uma constante em `support/`) não existe."
    source: "MEDIDO por `npx tsx tooling/scripts/analisa-repeticao.ts --min=4` (2026-10-22)"
    status: open
  - id: G-007
    categoria: "A regra existe, mas não há gate que a meça"
    severity: major
    file: ".tooling/scripts/ci/"
    rationale: "A convenção `dry.md` (criada em 2026-10-22) é prosa. `analisa-repeticao` é um ANALISADOR; o gate que transformaria a regra em verificação (com lista de exceções declarada) não existe — e é a fase 3 do plano."
    source: "MEDIDO: `tooling/scripts/analisa-repeticao.ts` existe e sai 0; não há `check-repeticao` no `PREFLIGHT_GATES` (`.tooling/scripts/ci/preflight-gates.ts`)"
    status: open
