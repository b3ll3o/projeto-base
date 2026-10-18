---
generated_at: 2026-10-18T05:38:46Z
agent: orchestrator
demand_slug: feature-flags
branch_at_snapshot: main
main_sha: 176c5f28cf5985f46f99cfb7f62320b9cbe354ff
template_version_tag: v1.11.0
working_tree: dirty
working_tree_files:
  - .agents/runs/20261018T053846Z-*.txt
  - .agents/runs/state-snapshot-20261018T053846Z.md
  - .agents/runs/memory-triage.md
last_commit:
  sha: 176c5f28
  author: Leonardo Andreazzi
  message: "feat(tenancy): uma conta, N empresas, um perfil diferente em cada uma (#101)"
  conventional: true
schema_drift_prisma: none
coverage_aggregate_lines: 92.6
coverage_aggregate_branches: 93.2
coverage_aggregate_funcs: 90.9
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
otel_collector_running: false
matrix_specialist_routing_lint: passed
written_at: 2026-10-18T05:44:10Z
preflight_skipped:
  - "archive integrity — archive vazio (0 arquivo .md)"
  - "drift agent↔memória — nenhum agent alterado em origin/main...HEAD"
matrix_specialist_routing_warnings: 2
matrix_specialist_routing_warnings_detail: "path_glob blocking:true sem rationale legível: pnpm-workspace.yaml, turbo.json"
proceed: true
proceed_rationale: "G-001 (blocker) foi resolvido antes do Passo 3: a memória healthy-tree-exercises-only-half-the-fix não tinha linha no ledger e derrubava o preflight. Corrigido e re-medido — exit 0. Nenhum blocker restante."

gaps_detectados:
  - id: G-001
    categoria: "Memória sem destinação no ledger — preflight vermelho no main"
    severity: blocker
    file: .agents/runs/memory-triage.md
    rationale: "checkMemoryCrystallization mediu ok=false: a memória healthy-tree-exercises-only-half-the-fix (escrita em 2026-10-18, antes desta demanda) não tinha linha no ledger. O gate lê nas duas direções — memória sem linha é erro. Bloqueava proceed por ser o único check vermelho, e nenhum trabalho deve nascer sobre preflight vermelho."
    source: "pnpm ci:preflight → 2 erro(s) (20261018T053846Z-preflight.txt)"
    status: resolved
    resolved_at: 2026-10-18T05:43:30Z
    resolved_by: "linha `| healthy-tree-exercises-only-half-the-fix | pendente | — | — |` inserida entre guard-that-fires-on-itself e infra-de-teste-contamina-o-gate-de-cobertura"
    resolucao: "Re-medido: `pnpm ci:preflight` → exit 0, '0 erro(s); 2 check(s) não rodaram'. Disposição `pendente` (não `citada`) porque a regra ainda não está escrita em nenhum arquivo versionado — dívida declarada, não citação inventada."
  - id: G-002
    categoria: "Cobertura do api em 86,75% — folga de 6,75 pontos sobre o gate"
    severity: minor
    file: apps/api/src
    rationale: "Agregado do api 86,75% lines / 92,94% branches / 87,04% funcs (web 98,47%). Acima do threshold de 80%, mas o módulo novo (feature flags) entra no denominador — um módulo sem teste próprio derruba o agregado."
    source: "20261018T053846Z-coverage.txt (turbo FULL TURBO, 2/2 cached — números do cache, não de execução nova)"
    status: open
  - id: G-003
    categoria: "OTel Collector não rodando em dev"
    severity: info
    file: docker-compose.yml
    rationale: "Perfil `observability` não está de pé (`docker compose --profile observability ps otel-collector` → só o cabeçalho). Irrelevante para a demanda: feature flags não toca telemetria."
    source: "20261018T053846Z-otel-collector.txt"
    status: open
  - id: G-004
    categoria: "Matriz specialist-routing com 2 warnings de rationale ausente"
    severity: info
    file: .agents/specs/conventions/specialist-routing.md
    rationale: "path_glob blocking:true sem rationale legível em pnpm-workspace.yaml e turbo.json. Pré-existente, não introduzido por esta demanda; o lint sai 0."
    source: "20261018T053846Z-matrix-lint.txt"
    status: open

gap_blocker: false
---

# State snapshot — feature-flags

O `main` está em `176c5f2` (PR #101, tenancy), alinhado com `origin/main`, schema Prisma sem
drift (12 migrations aplicadas), API e web de pé respondendo `ok` nos dois health endpoints, e
cobertura agregada acima do gate. **O único vermelho era o preflight** (G-001): uma memória de
2026-10-18 sem linha no ledger de cristalização, o que derrubava `check-memory-crystallization`.
Resolvido antes do Passo 3 e re-medido — `pnpm ci:preflight` sai 0. Nenhum blocker restante:
`proceed: true`.

## Comandos executados

- `.agents/runs/20261018T053846Z-working-tree.txt` — `git status --short`
- `.agents/runs/20261018T053846Z-branch-main-sha.txt` — branch + `origin/main` + HEAD
- `.agents/runs/20261018T053846Z-last-commit.txt` — `git log -1 --pretty=fuller`
- `.agents/runs/20261018T053846Z-template-version.txt` — `git tag --list 'v*' --sort=-v:refname | head -1` → `v1.11.0`
- `.agents/runs/20261018T053846Z-deps.txt` — deps de api/web/shared-types
- `.agents/runs/20261018T053846Z-prisma-migrate.txt` — `prisma migrate status` → "Database schema is up to date!"
- `.agents/runs/20261018T053846Z-coverage.txt` — `pnpm turbo run test:coverage` → api 86,75 / web 98,47
- `.agents/runs/20261018T053846Z-preflight.txt` — `pnpm ci:preflight` (1ª execução: 2 erro; 2ª: 0 erro)
- `.agents/runs/20261018T053846Z-health.txt` — curl nos dois health endpoints
- `.agents/runs/20261018T053846Z-otel-env-keys.txt` — `grep -rho OTEL_[A-Z_]* apps/api/src apps/web/app apps/web/lib infra/ docker-compose*.yml`
- `.agents/runs/20261018T053846Z-otel-collector.txt` — `docker compose --profile observability ps otel-collector`
- `.agents/runs/20261018T053846Z-matrix-lint.txt` — `pnpm specialist:lint`

## Gaps principais

1. **G-001 (blocker, resolvido)** — preflight vermelho por memória sem destinação no ledger.
2. **G-002 (minor, aberto)** — api em 86,75%: o módulo novo entra no denominador, então cobertura
   precisa ser planejada desde a primeira task, não no fim.
3. **G-003 (info, aberto)** — collector OTel fora; sem efeito nesta demanda.
4. **G-004 (info, aberto)** — 2 warnings de rationale na matriz de roteamento; pré-existentes.

## Decisão

`proceed: true` — G-001 resolvido e re-medido (exit 0); nenhum gap `severity: blocker` em aberto.
Próximo consumidor: `specialist-router` (camada 1).