---
generated_at: 2026-11-09T21:36:37Z
agent: controller
demand_slug: system-design-padrao
branch_at_snapshot: feat/system-design-padrao
main_sha: a26fb1da32fbb0c885c8343e9c37d1cd414867ac
template_version_tag: v1.25.0
working_tree: dirty
working_tree_files:
  - .agents/runs/20261109T213637Z-wt.txt
  - .agents/runs/20261109T213637Z-branch.txt
  - .agents/runs/20261109T213637Z-main-sha.txt
  - .agents/runs/20261109T213637Z-last-commit.txt
  - .agents/runs/20261109T213637Z-template-tag.txt
  - .agents/runs/20261109T213637Z-deps-api.txt
  - .agents/runs/20261109T213637Z-deps-web.txt
  - .agents/runs/20261109T213637Z-preflight.txt
  - .agents/runs/20261109T213637Z-health.json
last_commit:
  sha: a26fb1da32fbb0c885c8343e9c37d1cd414867ac
  author: Leonardo Andreazzi
  message: "feat(agents): uma pasta de tooling de IA (.agents/) e a skill agent-desktop (#157)"
  conventional: true
schema_drift_prisma: not_measured
coverage_aggregate_lines: not_measured
coverage_aggregate_branches: not_measured
coverage_aggregate_funcs: not_measured
coverage_threshold_met: not_measured
preflight_checks: all_passed
health_endpoint:
  api: ok
  web: not_measured
otel_env_vars_declared:
  - OTEL_DEPLOYMENT_ENVIRONMENT
  - OTEL_EXPORTER_OTLP_ENDPOINT
  - OTEL_RESOURCE_ATTRIBUTES
  - OTEL_SDK_DISABLED
  - OTEL_SERVICE_NAME
  - OTEL_SERVICE_VERSION
  - OTEL_TRACES_SAMPLER
  - OTEL_TRACES_SAMPLER_ARG
otel_collector_running: not_measured
matrix_specialist_routing_lint: not_measured
written_at: 2026-11-09T21:38:30Z
preflight_skipped:
  - check: schema_drift_prisma
    razao: "demanda é de documentação; nenhuma migration é tocada"
  - check: coverage_aggregate
    razao: "demanda é de documentação; nenhum arquivo de apps/ ou packages/ é tocado"
  - check: otel_collector_running
    razao: "o perfil observability não é necessário para medir doc"
  - check: matrix_specialist_routing_lint
    razao: "nenhum agent novo é criado; a matriz não muda"
matrix_specialist_routing_warnings: 0
matrix_specialist_routing_warnings_detail: ""
proceed: true
proceed_rationale: >-
  O preflight roda verde (0 erro, 2 checks skipped) e a API responde 200 em
  /api/v1/health. A demanda é exclusivamente de documentação: nenhum arquivo de
  apps/, packages/ ou infra/ muda, nenhuma migration é criada e nenhum agent
  novo entra no catálogo — logo nenhuma das medições puladas é gate desta
  demanda.
gaps_detectados: 4
gaps_impact:
  - gap: "docs/agents/domain.md lista 6 ADRs e o disco tem 9"
    impacto: "o índice de decisões arquiteturais já mente; o ADR-0010 entra nele e a lista precisa ser reconciliada"
    tratativa: "task 8 do plano — reconciliar a lista com o disco e adicionar o ADR novo"
  - gap: "check-doc-size mede por `git ls-files`"
    impacto: "doc novo untracked não é medido pelo gate; um doc com 400 linhas passaria"
    tratativa: "task 9 do plano — `git add -N` antes de rodar o gate"
  - gap: "não existe doc de system design"
    impacto: "a arquitetura só existe espalhada em ADRs, STACK.md e MONOREPO.md; um app derivado não tem um único lugar para estender"
    tratativa: "tasks 1-7 do plano — o conjunto docs/system-design/**"
  - gap: "o cache de autorização de 5s e o `EXISTS` de tenant_memberships são custos que só estão escritos em prosa de ADR"
    impacto: "a derivação de custo por empresa não está num lugar que o leitor de system design encontra"
    tratativa: "task 5 do plano — a seção de escala em docs/system-design/dados.md, com ponteiro para o ADR dono do fato"
---

# State snapshot — `system-design-padrao`

> Gerado pela convenção [`state-aware-planning.md`](../specs/conventions/state-aware-planning.md)
> (camada 0 do pre-planner). Os comandos que produziram cada item estão em
> `.agents/runs/20261109T213637Z-*.txt`.

| Item | Medido | Comando |
|---|---|---|
| Working tree | dirty (só os artefatos deste snapshot) | `git status --short` |
| Branch | `feat/system-design-padrao` | `git branch --show-current` |
| main | `a26fb1d` | `git rev-parse origin/main` |
| Último commit | `feat(agents): uma pasta de tooling de IA …` | `git log -1 --pretty=fuller` |
| Versão do template | `v1.25.0` | `git tag --list 'v*' --sort=-v:refname \| head -1` |
| Preflight | 0 erro, 2 skipped | `pnpm ci:preflight` |
| Health da API | `{"status":"ok","checks":{"database":"ok"}}` | `curl -fsS http://localhost:3000/api/v1/health` |
| Dependências | 26 deps da api, 19 do web | `node -p "Object.entries(require('./apps/api/package.json').dependencies)…"` |

**Conclusão:** `proceed: true`. A demanda é de documentação — os 4 gaps
detectados são de doc (índice de ADRs desatualizado, gate cego para arquivo
untracked, ausência do doc de system design, e custos de escala que só
existem em prosa de ADR). Nenhum exige mudança de runtime.
