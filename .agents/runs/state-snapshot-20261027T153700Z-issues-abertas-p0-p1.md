---
generated_at: 2026-10-27T15:37:00Z
agent: state-aware-planning
demand_slug: issues-abertas-p0-p1
branch_at_snapshot: feat/issues-abertas-p0-p1
main_sha: 404a2458760b542b25e19329085969d3872b5c8a
template_version_tag: v1.11.0
working_tree: unknown
working_tree_files: []
last_commit:
  sha: 404a245
  author: CEO Agent <ceo@paperclip.ai>
  message: "feat(tenancy): toda conta pertence a uma empresa, e a empresa nasce com três perfis (#116)"
  conventional: true
schema_drift_prisma: unknown
coverage_aggregate_lines: null
coverage_aggregate_branches: null
coverage_aggregate_funcs: null
coverage_threshold_met: false
preflight_checks: unknown
health_endpoint:
  api: not_running
  web: not_running
otel_env_vars_declared: []
otel_collector_running: false
matrix_specialist_routing_lint: unknown
written_at: 2026-10-27T15:37:00Z
preflight_skipped: []
matrix_specialist_routing_warnings: 0
matrix_specialist_routing_warnings_detail: ""
proceed: true
proceed_rationale: "A demanda é uma correção de 10 issues (#117–#126) com plano revisado de forma adversarial ANTES da execução; o P0 (#118) foi medido contra Postgres 16 real na integração, e o resto é conserto pontual com gate."
gaps_detectados: []
---

# State snapshot — issues abertas P0+P1 (2026-10-27)

> ⚠️ Os campos `unknown` são os que este snapshot **NÃO mediu**. A skill
> `state-aware-planning` diz «não inventar campos» — e um valor inventado
> aqui seria uma claim que ninguém mediu, num arquivo que existe para ser a
> MEDIDA. O corpo abaixo é o que este snapshot sabe.

- **Branch:** `feat/issues-abertas-p0-p1`
- **Base:** `main` @ `404a2458760b542b25e19329085969d3872b5c8a`
- **Plano:** `docs/superpowers/plans/2026-10-27-issues-abertas-p0-p1.md`
- **Origem:** as 10 issues abertas (#117–#126) do scan de 2026-10-26
  (`.agents/runs/findings-2026-10-26T050019Z/`).

## O que este PR fecha

| # | Sev | Correção | Onde |
|---|---|---|---|
| 117 | P0 | `execFileSync` com argv em array (e `--` antes do path) + gate AST | `tooling/scripts/lint-review-routing.ts`, `tooling/scripts/pr-refresh-gate.ts`, `.tooling/scripts/ci/check-shell-injection.ts` |
| 118 | P0 | o bucket de sistema passa a ser concedido pela CREDENCIAL; a senha sai do repo; guard de boot | migration `20261027000001_papel_de_sistema`, `papel-de-runtime.ts`, `escopo.ts`, `credenciais-do-banco.ts` |
| 119 | P1 | os dois recortes viram disjuntos (o `semDireito` era descartado) | `users.controller.ts` |
| 120 | P1 | placeholder e entropia recusados no boot | `shared/auth/segredo-de-servico.ts` |
| 121 | P1 | o passo 5 do seed exige a decisão do passo 4 | `prisma/seed.ts`, `shared/auth/decisao-do-admin-local.ts` |
| 122 | P1 | o Swagger só em `development` (ou com `SWAGGER_ENABLED`) | `main.ts`, `shared/infrastructure/http/swagger-habilitado.ts` |
| 123 | P1 | `loadedVersion()` no agregado `User` (a âncora do optimistic lock) | `users/domain/user.aggregate.ts`, `profiles.use-cases.ts` |
| 124 | P1 | schema Zod na query de `/users` + o clamp no port | `users.schemas.ts`, `users.controller.ts`, `user-repository.port.ts` |
| 125 | P1 | a spec OpenAPI versionada + `@ApiTags`/`@ApiOperation` + gate | `apps/api/openapi.json`, 8 controllers, `.tooling/scripts/ci/check-openapi-contract.ts` |
| 126 | P1 | os 4 footers alinhados + a PROCEDENCIA do bump corrigida + gate | `docs/STACK.md`, `docs/TEMPLATE_USAGE.md`, `.agents/workflows/release-mode.md`, `tooling/scripts/bump-version.ts` |

## Gates novos (3)

- `check-shell-injection` — comando de shell montado por concatenação (#117)
- `check-version-footers` — os 4 footers de versão divergirem (#126)
- `check-openapi-contract` — a spec versionada divergir da gerada (#125)

## O que NÃO está aqui

- O escopo de tenant continuar forgeável (o `alvo::text = escopo_atual()` da
  policy): exige ligar o escopo à membership do ator em todas as tabelas.
- Os 16 achados P2 do relatório de 2026-10-26 (não viraram issue).
- A revogação da senha exposta: é rotação de credencial em ambiente real, e
  este PR deixa de recriar a condição.
