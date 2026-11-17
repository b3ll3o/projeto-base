---
generated_at: 2026-11-17T17:30:26Z
agent: claude-code (camada 0, thread principal)
demand_slug: historico-usuario-admin
branch_at_snapshot: feat/historico-usuario-admin
main_sha: 7dae1eee9ca02f79d970ff856bf06590f2d0494c
template_version_tag: v1.29.0
working_tree: clean
working_tree_files: []
last_commit:
  sha: 251bb31c40c504eb3039494b2d5be0de8b60a467
  author: CEO Agent <ceo@paperclip.ai>
  message: "fix(deps): a advisory do picomatch entra no registro de exceções"
  conventional: true
schema_drift_prisma: none
coverage_aggregate_lines: 88.26
coverage_aggregate_branches: 91.71
coverage_aggregate_funcs: 89.72
coverage_threshold_met: true
preflight_checks: all_passed
health_endpoint:
  api: ok
  web: ok
otel_env_vars_declared:
  - OTEL_EXPORTER_OTLP_ENDPOINT
  - OTEL_SDK_DISABLED
  - OTEL_SERVICE_NAME
  - OTEL_SERVICE_VERSION
  - OTEL_TRACES_SAMPLER
otel_collector_running: true
matrix_specialist_routing_lint: passed
written_at: 2026-11-17T17:40:00Z
preflight_skipped: []
matrix_specialist_routing_warnings: 2
matrix_specialist_routing_warnings_detail: "path_glob com blocking:true sem rationale (pre-existentes): pnpm-workspace.yaml, turbo.json"
proceed: true
proceed_rationale: "Nenhum gap de severidade blocker. A branch está verde em preflight (exit 0), typecheck (exit 0), lint (exit 0) e as três suítes unitárias (api 1161, web 500, tooling 426). O plano a produzir é de CORREÇÃO e MELHORIA sobre o diff da branch, e não de recuperação de estado quebrado — o estado permite planejar e implementar."

gaps_detectados:
  - id: G-001
    categoria: "Cobertura — página RSC fora do denominador"
    severity: info
    file: "apps/web/app/users/[id]/page.tsx"
    rationale: "A página nova do detalhe da pessoa é um Server Component e fica fora do denominador de cobertura do Vitest (`app/**/*.tsx` excluído). O spec `page.spec.tsx` exercita a página via import direto, mas a cobertura do arquivo não é medida."
    source: "Tabela de cobertura da suíte web (MEDIDO 2026-11-17)"
    status: open
  - id: G-002
    categoria: "Cobertura — porta de escopo com 41,66%"
    severity: info
    file: "apps/api/src/shared/infrastructure/prisma/escopo.ts"
    rationale: "`comEscopoDeEmpresa`/`comEscopoDeSistema` estão em 41,66% de linhas. É onde mora a regra 'tenantId nulo = bucket de SISTEMA = credencial de sistema', e a rota nova depende dela para atravessar empresas."
    source: "Tabela de cobertura da suíte api (MEDIDO 2026-11-17)"
    status: resolved
    resolved_at: 2026-11-17T17:55:00Z
    resolved_by: "revisão parallel (specialist de segurança) + medição no Postgres local"
    resolucao: "A lacuna de COBERTURA é real, mas o COMPORTAMENTO já está medido em `prisma-audit.service.integration.spec.ts` ('listHistory da GLOBEX pela sessão da ACME volta vazio — e a da ACME, não' e 'a sessão de SISTEMA continua enxergando as duas') e agora também foi medido no Postgres local: sessão `app_runtime` com `app.tenant_id='*'` vê 0 linhas de `users_history`; sessão `app_system` vê todas. Cobertura baixa de plumbing ≠ lacuna de comportamento."
  - id: G-003
    categoria: "Artefato gerado × formatação"
    severity: minor
    file: "apps/api/openapi.json"
    rationale: "`pnpm --filter @projeto/api openapi:export` reescreve o arquivo no formato do `JSON.stringify` (arrays em uma linha só), e o resultado REPROVA em `pnpm format:check` (o glob do Prettier inclui `*.json`). O arquivo commitado está formatado — o gate passa — mas quem rodar o export sem formatar depois deixa o repositório vermelho. MEDIDO 2026-11-17: `pnpm exec prettier --check apps/api/openapi.json` → `[warn]` no arquivo gerado, `All matched files use Prettier code style!` no commitado."
    source: "MEDIDO 2026-11-17 (regenerado e comparado com `git checkout apps/api/openapi.json`; conteúdo semanticamente idêntico — `JSON.stringify` igual nos dois)"
    status: open

gap_blocker: false
---

# State snapshot — historico-usuario-admin

A branch `feat/historico-usuario-admin` carrega o histórico de auditoria de uma
pessoa lido pelo ADMINISTRADOR DO SISTEMA: uma rota nova na API
(`GET /api/v1/admin/users/:id/history`), a seção "Histórico" na tela
`/users/[id]`, o cliente web correspondente, e dois commits de infra (a ordem
`db:generate` no `turbo.json` e o registro da advisory do `picomatch`). O
estado medido está **verde nas quatro camadas**: o preflight estrutural passou
com exit 0 e 2 checks pulados, o typecheck e o lint passaram com exit 0, e as
três suítes unitárias passaram (1161 testes na api, 500 na web, 426 no
tooling). A cobertura está acima do piso em ambos os apps (api 88,26% de
linhas; web 98,64%), o schema Prisma está sem drift (25 migrações aplicadas),
a API responde `ok` em `:3000/api/v1/health` e o web em `:3001/api/health`, e o
collector de OTel está de pé com a imagem fixada por digest.

## Comandos executados

- `.agents/runs/20261117T173026Z-wt.txt` — `git status --short`
- `.agents/runs/20261117T173026Z-branch.txt` — `git branch --show-current`
- `.agents/runs/20261117T173026Z-main-sha.txt` — `git rev-parse origin/main`
- `.agents/runs/20261117T173026Z-last-commit.txt` — `git log -1 --pretty=fuller`
- `.agents/runs/20261117T173026Z-template-tag.txt` — `git tag --list 'v*' --sort=-v:refname | head -1`
- `.agents/runs/20261117T173026Z-deps.txt` — deps de `apps/api` e `apps/web`
- `.agents/runs/20261117T173026Z-prisma-migrate.txt` — `prisma migrate status` em `apps/api`
- `.agents/runs/20261117T173026Z-preflight.txt` — `pnpm ci:preflight` (exit 0)
- `.agents/runs/20261117T173026Z-coverage.txt` — `pnpm test:coverage` (exit 0)
- `.agents/runs/20261117T173026Z-typecheck.txt` — `pnpm -r typecheck` (exit 0)
- `.agents/runs/20261117T173026Z-lint.txt` — `pnpm lint` (exit 0)
- `.agents/runs/20261117T173026Z-unit.txt` — `pnpm -r test` (exit 0)
- `.agents/runs/20261117T173026Z-otel-env-keys.txt` — chaves `OTEL_*` declaradas pelo app
- `.agents/runs/20261117T173026Z-matrix-lint.txt` — `pnpm specialist:lint` (exit 0, 2 warnings pre-existentes)

## Gaps principais

1. **G-001** — a página nova é RSC e fica fora do denominador de cobertura.
2. **G-002** — `escopo.ts` (41,66%) é onde mora a regra de bucket de SISTEMA de
   que a rota nova depende, e é justamente a parte com pouca cobertura.
3. **G-003** — `openapi:export` produz um arquivo que o `format:check` reprova.

Nenhum dos três é `blocker`: nenhum impede planejar nem implementar.

## Decisão

`proceed: true` — o plano a produzir é de **correção e melhoria** sobre o diff
da branch, não de recuperação de estado quebrado. O consumo deste snapshot é
a camada 1 do pre-planner (`specialist-router`) e a decomposição do
`orchestrator`.
