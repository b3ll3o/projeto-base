---
generated_at: 2026-10-29T14:39:40Z
agent: documentation-specialist
demand_slug: melhoria-documentacao-aplicacao
branch_at_snapshot: docs/melhoria-documentacao-aplicacao
main_sha: 194d305
template_version_tag: v1.11.0
working_tree: dirty
working_tree_files:
  - ".tooling/scripts/ci/preflight-gates.ts"
  - ".tooling/scripts/ci/preflight.ts"
  - ".agents/agents/documentation-specialist.md"
  - ".agents/skills/documentation-audit/"
  - ".agents/specs/conventions/documentacao.md"
  - ".tooling/scripts/ci/check-doc-coverage.ts"
  - ".tooling/scripts/ci/check-doc-coverage.spec.ts"
last_commit:
  sha: 194d305
  author: "b3ll3o"
  message: "feat(admin): o administrador do sistema vê as empresas e os usuários, nos dois sentidos (#127)"
  conventional: true
schema_drift_prisma: not_applicable
coverage_aggregate_lines: not_measured
coverage_aggregate_branches: not_measured
coverage_aggregate_funcs: not_measured
coverage_threshold_met: not_measured
preflight_checks: not_run_on_this_snapshot
health_endpoint:
  api: not_running
  web: not_running
otel_env_vars_declared: []
otel_collector_running: false
matrix_specialist_routing_lint: passed
written_at: 2026-10-29T14:45:00Z
preflight_skipped:
  - "cobertura agregada — a demanda não muda código de produção; medir no job quality"
  - "health endpoint — nenhum servidor local no momento do snapshot"
  - "prisma migrate status — a demanda não toca schema"
matrix_specialist_routing_warnings: 0
matrix_specialist_routing_warnings_detail: ""
proceed: true
proceed_rationale: >
  A demanda é de documentação e de tooling de verificação: não há gap blocker.
  O working tree está dirty porque a branch JÁ carrega o agent, a skill, a
  convenção e o gate novos desta mesma demanda — não por conflito.
  O preflight roda no fim, depois do registro do gate novo.

gaps_detectados:
  - id: G-001
    categoria: "Documentação ausente por unidade de código"
    severity: major
    file: "docs/api/"
    rationale: >
      6 bounded contexts em apps/api/src/modules/ e 2 docs em docs/api/.
      feature-flags, health, profiles e tenancy não têm NENHUMA referência.
      MEDIDO 2026-10-29: ls apps/api/src/modules/ → 6; ls docs/api/ → 2.
    source: "Auditoria de documentação de 2026-10-29 (achado I-01)"
    status: open
  - id: G-002
    categoria: "Fato errado em doc canônico"
    severity: blocker
    file: "README.md, docs/como-rodar.md, docs/fluxo-desenvolvimento.md, docs/STACK.md, docs/MONOREPO.md"
    rationale: >
      10 afirmações que o código contradiz (Node >= 20 vs >= 22.6.0; base64 vs
      hex 32; openapi.json gitignored vs versionado; Dockerfile já corrigido vs
      "em aberto"; doc-sync "nunca aborta" vs aborta; 21/29 gates vs 37;
      packages/ui inexistente; tdd-enforcer em hook que não existe; infra/
      com postgres/ que não existe; "três modos" vs dois).
    source: "Auditoria de documentação de 2026-10-29 (achados B-01..B-10)"
    status: open
  - id: G-003
    categoria: "Regra sem instrumento"
    severity: major
    file: ".tooling/scripts/ci/"
    rationale: >
      Nenhum gate exigia documentação para módulo, rota ou package novo. O
      doc-sync mapeia 5 caminhos hardcoded — um módulo novo não gerava ação,
      nem alerta, nem vermelho.
    source: "Auditoria de tooling de 2026-10-29 (lacuna L1)"
    status: open
  - id: G-004
    categoria: "Decisão vigente sem ADR"
    severity: major
    file: "docs/adr/"
    rationale: >
      tenancy, RBAC por perfil e feature flags mudaram schema e fronteira de
      domínio e não têm ADR, embora docs/agents/domain.md os trate como
      decisões vigentes.
    source: "Auditoria de documentação de 2026-10-29 (achado I-02)"
    status: open

gap_blocker: false
---
