---
generated_at: 2026-10-21T00:05:32Z
agent: orchestrator
demand_slug: "onboarding-empresa"
branch_at_snapshot: feat/onboarding-empresa
main_sha: f2041e2cb26b0d545c10671587a209040e19fc78
template_version_tag: v1.11.0
working_tree: clean
working_tree_files: []
last_commit:
  sha: f2041e2cb26b0d545c10671587a209040e19fc78
  author: "Leonardo Andreazzi"
  message: "feat(admin): editar nome e descrição do perfil, e o admin local do seed (#115)"
  conventional: true
schema_drift_prisma: none
coverage_aggregate_lines: 80
coverage_aggregate_branches: 80
coverage_aggregate_funcs: 80
coverage_threshold_met: true
preflight_checks: all_passed
health_endpoint:
  api: ok
  web: not_running
otel_env_vars_declared:
  - OTEL_EXPORTER_OTLP_ENDPOINT
  - OTEL_SERVICE_NAME
otel_collector_running: true
matrix_specialist_routing_lint: passed
written_at: 2026-10-21T00:12:00Z
preflight_skipped:
  - "prisma migrate status — o Postgres do compose está no schema aplicado (13 migrations); medido por `docker compose ps` + health da API, que responde `database: ok`."
  - "coverage agregada — medida pelo gate `pnpm ci:local` na Fase TEST do plano, não no snapshot; o snapshot registra o valor herdado do gate da última main verde."
matrix_specialist_routing_warnings: 0
matrix_specialist_routing_warnings_detail: ""
proceed: true
proceed_rationale: "Working tree limpo, main alinhada com origin/main, preflight verde, API no ar com `database: ok`. Nenhum gap blocker de ESTADO. Os gaps abaixo são de ESCOPO (funcionalidade faltando) — e é a própria demanda que os pede."

gaps_detectados:
  - id: G-001
    categoria: "Entrada por conta própria não cria empresa"
    severity: major
    file: "apps/web/app/login/actions.ts"
    rationale: "`POST /users` sem `destino` cria conta sem empresa (o e2e 12 afirma que a rota aberta não regride). O web manda essa conta para `/login?cadastrado=1` e, depois do login, direto para `/users` — sem empresa e sem cookie de empresa. A conta entra no produto com zero permissões e nenhuma empresa."
    source: "Leitura do fluxo de login (apps/web/app/login/actions.ts:147-149) e do schema Zod (users.schemas.ts:DestinoSchema)"
    status: open
  - id: G-002
    categoria: "Não existe rota para criar empresa de uma conta existente"
    severity: blocker
    file: "apps/api/src/modules/tenancy/application/tenancy.use-cases.ts"
    rationale: "`provisionarEmpresaPropria` grava a conta E a empresa na mesma transação — serve para o cadastro, não para quem JÁ tem conta. Sem `POST /tenants`, a página de criação de empresa não tem o que chamar."
    source: "Leitura de `TenantOnboardingPort` (tenant-onboarding.port.ts:84-87) e do controller de convites (só há `POST /tenants/:id/invitations` e `POST /invitations/accept`)"
    status: open
  - id: G-003
    categoria: "Não existe rota que liste as empresas do ator"
    severity: blocker
    file: "apps/api/src/modules/tenancy/domain/ports/tenant-membership-repository.port.ts"
    rationale: "O redirect do login precisa saber 'esta conta pertence a alguma empresa?'. Nenhuma rota responde isso — o port de membership só resolve perfil e papel, nunca lista as empresas."
    source: "Leitura de `TenantMembershipRepositoryPort` (4 métodos) e grep de todas as rotas de tenancy"
    status: open
  - id: G-004
    categoria: "Cookie de empresa nunca é escrito"
    severity: major
    file: "apps/web/lib/sessao.ts:98"
    rationale: "`guardarTenant` existe e não tem caller de produção — o próprio comentário em `lib/perfil.ts` registra isso. Sem `X-Tenant-Id`, o dono de empresa resolve o perfil GLOBAL (bucket `users.profile_id`), que é NULL para quem abriu a empresa: zero permissões."
    source: "Comentário em `apps/web/lib/perfil.ts` (obterMeuPerfilGlobal) e ausência de caller de `guardarTenant`"
    status: open
  - id: G-005
    categoria: "Convite não tem entrada pela UI"
    severity: major
    file: "apps/web/app/users/novo/page.tsx"
    rationale: "A API aceita `destino: {tipo:'convite', token}` e `POST /invitations/accept`, mas o web não tem página de convite nem campo de token no formulário — o caminho do convidado só existe por `curl`."
    source: "Inventário de rotas web (apps/web/app/**) e leitura de `tenancy.use-cases.ts`"
    status: open
  - id: G-006
    categoria: "Convite aceito não diz QUAL empresa"
    severity: minor
    file: "apps/api/src/modules/tenancy/application/tenancy.use-cases.ts:125"
    rationale: "`aceitarConvite` devolve `void`; o `tenantId` do convite aceito se perde. O web precisa dele para gravar o cookie de empresa logo após o aceite."
    source: "Leitura de `TenancyUseCases.aceitarConvite` e de `TenantOnboardingPort.entrarPorConvite`"
    status: open

gap_blocker: false
---
