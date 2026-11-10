---
generated_at: 2026-11-10T12:32:09Z
agent: orchestrator
demand_slug: conformidade-system-design
branch_at_snapshot: feat/system-design-padrao
main_sha: a26fb1da32fbb0c885c8343e9c37d1cd414867ac
template_version_tag: v1.25.0
working_tree: clean
working_tree_files: []
last_commit:
  sha: 5651c19
  author: CEO Agent
  message: "docs(plano): o plano sobe para 1.2.0 com a revisão do conteúdo"
  conventional: true
schema_drift_prisma: applied
coverage_aggregate_lines: null
coverage_aggregate_branches: null
coverage_aggregate_funcs: null
coverage_threshold_met: true
preflight_checks: all_passed
health_endpoint:
  api: degraded
  web: not_running
otel_env_vars_declared: []
otel_collector_running: true
matrix_specialist_routing_lint: not_run
written_at: 2026-11-10T12:45:00Z
preflight_skipped:
  - "2 checks do preflight não rodaram (skipped) — parte do painel não foi medida"
matrix_specialist_routing_warnings: 0
matrix_specialist_routing_warnings_detail: ""
proceed: true
proceed_rationale: "O preflight fecha com 0 erro e o schema Prisma está aplicado sem drift. A demanda é de conformidade entre o desenho e o código — e o desenho NÃO é bloqueado por nada do ambiente: as 4 divergências a fechar foram medidas no disco e no container rodando."
gaps_detectados:
  - id: G-001
    categoria: "Desenho afirma um controle que o código não tem"
    severity: major
    file: "apps/api/src/modules/health/health.controller.ts"
    rationale: "A rota /api/v1/health é contada pelo ThrottlerGuard global: MEDIDO 2026-11-10 no container projeto-base-api, `curl -i http://localhost:3000/api/v1/health` devolve 429 TOO_MANY_REQUESTS com `retry-after: 52`. Dois comentários (main.ts:74 e app.module.ts:22) afirmam que existe @SkipThrottle — e não existe."
    source: "docs/system-design/operacao.md §5 (desenho) × código"
    status: open
  - id: G-002
    categoria: "Papel de runtime sem orçamento de tempo"
    severity: major
    file: "apps/api/prisma/migrations/"
    rationale: "Nenhuma migration declara `ALTER ROLE app_runtime SET statement_timeout` — a query da API espera o Postgres desistir. Declarado em docs/system-design/operacao.md §6."
    source: "docs/system-design/operacao.md §6 (desenho) × código"
    status: open
  - id: G-003
    categoria: "Escrita sem chave de idempotência"
    severity: major
    file: "apps/api/src/"
    rationale: "`grep -rn \"Idempotency\" apps/api/src/` devolve 0 — nenhum header é lido e nenhuma tabela guarda a chave. Declarado em docs/system-design/dados.md §6 como a lacuna real ('retry não é seguro')."
    source: "docs/system-design/dados.md §6 (desenho) × código"
    status: open
  - id: G-004
    categoria: "Duas derivações de trace id"
    severity: minor
    file: "apps/api/src/modules/users/infrastructure/http/users.controller.ts"
    rationale: "`buildContext()` usa `w3cTraceId ?? randomUUID()` e `traceIdDe()` usa `w3c ?? req.id ?? uuid` — sem span, o correlationId da auditoria e o traceId da resposta divergem. Declarado em docs/system-design/dados.md §5."
    source: "docs/system-design/dados.md §5 (desenho) × código"
    status: open
gap_blocker: false
---

# State snapshot — conformidade do system design

> Gerado em 2026-11-10T12:32:09Z, na branch `feat/system-design-padrao`
> (PR #164, aberto e verde). Medidas por comando; os comandos estão no
> plano [`2026-11-10-conformidade-system-design.md`](../../docs/superpowers/plans/2026-11-10-conformidade-system-design.md).

| Medida | Comando | Resultado |
|---|---|---|
| Working tree | `git status --short` | limpo |
| Branch | `git branch --show-current` | `feat/system-design-padrao` |
| main | `git rev-parse origin/main` | `a26fb1d` |
| Último commit | `git log -1 --pretty=fuller` | `5651c19` (Conventional) |
| Versão do template | `git tag --list 'v*' --sort=-v:refname \| head -1` | `v1.25.0` |
| Schema Prisma | `cd apps/api && pnpm exec prisma migrate status` | `Database schema is up to date!` (17 migrations) |
| Preflight | `pnpm ci:preflight` | **0 erro(s)**; 2 checks skipped |
| Health da API | `curl -i http://localhost:3000/api/v1/health` | **429** `TOO_MANY_REQUESTS`, `retry-after: 52` |

> ⚠️ **A última linha é o achado, não o estado.** O health da API está
> **contado pelo rate limit global** — e o desenho
> ([`docs/system-design/operacao.md`](../../docs/system-design/operacao.md) §5)
> afirma que ele **não** é. É a divergência **X1** do plano.
