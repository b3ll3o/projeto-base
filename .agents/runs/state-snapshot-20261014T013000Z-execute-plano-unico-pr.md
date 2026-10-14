---
generated_at: 2026-10-14T01:30:00Z
agent: hermes-orchestrator
demand_slug: "execute-plano-unico-pr-2026-10-13"
branch_at_snapshot: main
main_sha: ae5015a
template_version_tag: v1.10.0
working_tree: clean
working_tree_files: []
last_commit:
  sha: ae5015a
  author: b3ll3o
  message: "docs(plan): plano + state-snapshot de fix das 9 issues abertas (#79)"
  conventional: true

campaign:
  source: "user pediu 'execute tudo em um unico pr' (consolidação do plano de 5 PRs em 1)"
  parent_plan: docs/superpowers/plans/2026-10-13-fix-issues-abertas.md
  parent_state_snapshot: .agents/runs/state-snapshot-20261013T202500Z-fix-issues-abertas.md
  triggers: T1 (plano multi-task ≥ 3) + T2 (bugfix não-trivial — 4 P0)
  total_issues: 9
  by_severity: { p0: 4, p1: 5 }
  by_type: { bug: 4, gap: 4, drift: 1 }
  by_specialist:
    security-auditor: 2
    docker-prod-specialist: 2
    release-versioning-specialist: 2
    prisma-db-specialist: 1
    nestjs-specialist: 1
    nextjs-specialist: 1

scope:
  goal: |
    Implementar TODAS as 9 issues (#67–#75) em 1 PR único, mantendo o
    plano canônico e o apêndice como referência, e fechando com tag
    v1.11.0.
  in_scope:
    - 5 unidades de código do plano (PR-3 + PR-1 + PR-2 + PR-4 + PR-5)
    - 1 commit por unidade (5 commits + docs) — facilita cherry-pick/range-diff
    - state-snapshot versionado em .agents/runs/ (este arquivo)
    - tag v1.11.0 ao final
  out_of_scope:
    - "criar issues (já existem)"
    - "refatorar convenção de state-snapshot"
    - "alterar engines.node (permanece >=22.6.0)"

constraint_analysis:
  size_single_pr: "~330 linhas de código (5 unidades); isoladas por arquivo"
  conventional_commits: "1 commit por unidade + 1 commit de docs (revisão)"
  ci_validation: "5/5 checks esperados (preflight, sync, review, docker-build-prod, quality)"
  tag: "v1.11.0 anotada após merge do PR"
  rollback_plan: "reverter o merge commit (ae5015a+9 commits) — git revert -m 1 <merge_sha>"

preflight:
  gh_auth: "OK (verificado no PR #79 anterior — main_sha ae5015a foi mergeado daqui)"
  ci_health: "5/5 verde no último PR; ambiente estável"
  sandbox_node: "20.20.2 (engines >=22.6) — pnpm ci:preflight local falha por engine mismatch; CI remoto valida"
  known_local_gates_failing: ["turbo-differential (Node 20)", "review-routing lint (Node 20)"]
  local_strategy: "rodar pnpm exec tsx .tooling/scripts/ci/preflight.ts direto (bypass engines.node); CI valida autoritativo"

gap_analysis:
  AS_IS:
    issues_open: 9
    tag_git: v1.10.0 (af6af0a)
    drift_doc_version: 2
    containers_with_mem_limit: 0
    images_with_digest: 0
    rate_limit_middleware: absent
    cors_whitelist: "origin: true (any)"
    migration_default_uuid: 0
    web_fetch_timeout: unlimited
  TO_BE:
    issues_open: 0
    tag_git: v1.11.0 (post-merge)
    drift_doc_version: 0
    containers_with_mem_limit: 4
    images_with_digest: 3
    rate_limit_middleware: "ThrottlerGuard 100/min"
    cors_whitelist: "ALLOWED_ORIGINS env-driven"
    migration_default_uuid: 2
    web_fetch_timeout: "10s configurable"

dependency_map:
  prisma_migration: { blocks: [] }            # standalone
  docker_hardening: { blocks: [] }             # standalone (env vars: add .env.production.example)
  api_hardening: { blocks: [] }                # standalone (new dep: @nestjs/throttler)
  web_fetch_timeout: { blocks: [] }            # standalone
  release_v1_11_0: { blocks: [prisma_migration, docker_hardening, api_hardening, web_fetch_timeout] }
  rationale: "As 4 unidades de código são independentes; release v1.11.0 é o commit final que fecha o ciclo."

execution_order:
  - "1. PR-3 — fix/prisma-default-uuid-history (4 linhas SQL)"
  - "2. PR-1 — fix/docker-hardening-compose (~85 linhas: compose + otel + .env.example)"
  - "3. PR-2 — fix/api-hardening-cors-ratelimit (~50 linhas: throttler + cors)"
  - "4. PR-4 — fix/web-api-client-timeout (~30 linhas: AbortController)"
  - "5. PR-5 — release/v1.11.0 (~30 linhas: 4 footers + workflow + tag)"

commit_strategy:
  rationale: |
    1 PR com 5 commits + 1 commit de retro. Cada commit é atômico por unidade
    e funciona isoladamente (pode ser cherry-pickado/separado se o PR for
    muito grande). Commits seguem conventional commits.
  commits:
    - hash: TBD
      subject: "fix(prisma): add default gen_random_uuid() to users_history and users_archive"
      refs: "#69"
      unit: PR-3
    - hash: TBD
      subject: "fix(docker): pin image digests, add mem_limit, remove plaintext password, add otel memory_limiter"
      refs: "#68, #74, #75"
      unit: PR-1
    - hash: TBD
      subject: "feat(api): add throttler (100/min) and CORS whitelist via ALLOWED_ORIGINS"
      refs: "#72, #73"
      unit: PR-2
    - hash: TBD
      subject: "fix(web): add 10s AbortController timeout to api-client fetch"
      refs: "#70"
      unit: PR-4
    - hash: TBD
      subject: "chore(release): bump to v1.11.0 + automation in release-template.yml"
      refs: "#67, #71"
      unit: PR-5
    - hash: TBD
      subject: "docs(agents): retrospective + skill proposal (campaign T1, 9 issues)"
      refs: retrospective

file_changes_estimate:
  modified:
    - "apps/api/prisma/migrations/20260922003354_init_audit_user/migration.sql (+2 linhas)"
    - "docker-compose.yml (~30 linhas)"
    - "infra/otelcol/config.yaml (~12 linhas)"
    - ".env.production.example (novo, ~10 linhas)"
    - "apps/api/src/main.ts (~20 linhas)"
    - "apps/api/src/app.module.ts (~5 linhas)"
    - "apps/api/package.json (+1 dep: @nestjs/throttler)"
    - "apps/web/lib/api-client.ts (~30 linhas)"
    - "docs/STACK.md (bump + histórico)"
    - "docs/TEMPLATE_USAGE.md (bump)"
    - ".agents/specs/conventions/estrutura-e-versionamento.md (bump)"
    - ".github/workflows/release-template.yml (~15 linhas de automação)"
  added:
    - "state-snapshot (este arquivo)"
    - "tag v1.11.0"
  total_estimate: "~330 linhas de código + 1 tag + 1 state-snapshot"

risks:
  - id: R-1
    description: "ALTER TABLE em prod tem lock implícito"
    prob: média
    imp: médio
    mitigation: "ADD DEFAULT em PG ≥ 11 é instantâneo; rodar fora do horário de pico"
  - id: R-2
    description: "Digest errado trava build"
    prob: baixa
    imp: alto
    mitigation: "Validar SHA256 via docker pull + docker inspect antes de pinar"
  - id: R-3
    description: "@nestjs/throttler quebra spec e2e"
    prob: média
    imp: médio
    mitigation: "100/min é folgado; health com @SkipThrottle()"
  - id: R-4
    description: "PR único muito grande para review"
    prob: média
    imp: médio
    mitigation: "5 commits atômicos por unidade, cada um revisável; range-diff disponível"
  - id: R-5
    description: "Token de release sem permissão de tag"
    prob: baixa
    imp: médio
    mitigation: "Workflow já tem contents: write; tag manual como fallback"

success_criteria:
  - "9 issues fechadas com referência ao PR"
  - "PR mergeado com 5/5 CI verde"
  - "5 commits atômicos (1 por unidade) + 1 commit docs"
  - "tag v1.11.0 anotada em main"
  - "Footers de STACK/MONOREPO/estrutura/TEMPLATE_USAGE em sincronia em v1.11.0"
  - "retrospective-capture disparado após merge"

done_signal:
  - "PR merged + tag v1.11.0 + retrospective-capture written"
  - "CWD limpo em main"

proceed: true
reason: |
  Plano está aprovado (PR #79 mergeado), user pediu explicitamente
  'execute tudo em um unico pr'. As 5 unidades são independentes
  e podem ser entregues em 5 commits atômicos dentro de 1 PR.
  Conventional commits + tag v1.11.0 + retrospective.
