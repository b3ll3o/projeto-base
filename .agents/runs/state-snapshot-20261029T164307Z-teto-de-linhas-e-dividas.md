---
generated_at: 2026-10-29T16:43:07Z
agent: documentation-specialist
demand_slug: teto-de-linhas-e-dividas
branch_at_snapshot: docs/melhoria-documentacao-aplicacao
main_sha: 194d305
template_version_tag: v1.11.0
working_tree: dirty
working_tree_files:
  - "tsconfig.base.json"
  - "apps/web/package.json"
  - "pnpm-lock.yaml"
  - "docs/superpowers/plans/2026-10-29-teto-de-linhas-e-dividas-de-codigo.md"
last_commit:
  sha: c65c594
  author: "b3ll3o"
  message: "chore(version): o template vai para 1.14.0"
  conventional: true
schema_drift_prisma: not_applicable
coverage_aggregate_lines: not_measured
coverage_aggregate_branches: not_measured
coverage_aggregate_funcs: not_measured
coverage_threshold_met: not_measured
preflight_checks: all_passed
health_endpoint:
  api: ok
  web: ok
otel_env_vars_declared: []
otel_collector_running: false
matrix_specialist_routing_lint: passed
written_at: 2026-10-29T16:55:00Z
preflight_skipped:
  - "cobertura agregada — a demanda não muda código de produção; medir no job quality"
  - "prisma migrate status — a demanda não toca schema"
matrix_specialist_routing_warnings: 0
matrix_specialist_routing_warnings_detail: ""
proceed: true
proceed_rationale: >
  Nenhum gap blocker. A demanda é de instrumento (gate) + duas dividas de
  código, e o working tree está dirty só pelo trabalho desta mesma demanda
  (alias morto removido, specifier do Playwright com caret, lock regenerado
  pelo pnpm).

gaps_detectados:
  - id: G-001
    categoria: "Regra sem instrumento"
    severity: major
    file: ".agents/specs/conventions/tamanho-e-revisao.md"
    rationale: >
      O teto de 300 linhas é prosa. MEDIDO 2026-10-29: grep MAX_LOC em
      tooling/ e .tooling/ devolve UM arquivo (lint-review-routing.ts), e ele
      mede UMA matriz só. 14 .md versionados violam o teto — 13 são
      histórico/vendor, 1 é documentação viva (o ledger de pendências).
    source: "Dívida D-1 registrada no PR #129"
    status: open
  - id: G-002
    categoria: "Alias morto"
    severity: minor
    file: "tsconfig.base.json"
    rationale: >
      "@projeto/ui" aponta para ./packages/ui/src, que não existe. MEDIDO:
      grep "@projeto/ui" em apps/packages/tooling/.tooling/tsconfig.base.json
      devolve 1 ocorrência — a própria declaração. Nenhum import.
    source: "Dívida D-2a registrada no PR #129"
    status: resolved
    resolved_at: 2026-10-29T16:50:00Z
    resolved_by: "remoção da linha + typecheck/lint/build verdes"
    resolucao: >
      A linha saiu do tsconfig.base.json. MEDIDO: pnpm typecheck 4/4,
      pnpm lint 2/2 e pnpm build 2/2 (com o next build de produção) verdes
      DEPOIS da remoção.
  - id: G-003
    categoria: "Specifier fixado sem razão"
    severity: minor
    file: "apps/web/package.json"
    rationale: >
      "@playwright/test": "1.60.0" sem caret — a única violação da regra do
      MONOREPO §3.2, e o motivo do pin não está documentado em lugar nenhum.
    source: "Dívida D-2b registrada no PR #129"
    status: resolved
    resolved_at: 2026-10-29T16:52:00Z
    resolved_by: "caret + pnpm install --lockfile-only"
    resolucao: >
      MEDIDO: com "^1.60.0", o lock grava specifier ^1.60.0 e MANTÉM
      version 1.60.0 (o pnpm não re-resolve o que a faixa aceita); o registry
      tem 1.64.1 como última estável, ou seja, sem o lock a faixa poderia
      subir 4 minors e trocar o Chromium. pnpm install --frozen-lockfile — o
      que o CI roda em 8 lugares — passa.
  - id: G-004
    categoria: "Alias morto sem instrumento"
    severity: minor
    file: ".tooling/scripts/ci/"
    rationale: >
      Nenhum gate impede o próximo alias morto: check-tsconfig-drift compara
      só strict e noUncheckedIndexedAccess. A regra "todo alias aponta para
      diretório que existe" ficaria em prosa — o mesmo defeito que a demanda
      paga.
    source: "Derivado de G-002"
    status: open

gap_blocker: false
---
