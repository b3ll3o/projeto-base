---
generated_at: 2026-11-10T22:17:36Z
agent: orchestrator
demand_slug: pendencias-prs-e-issues-abertas
branch_at_snapshot: fix/pendencias-prs-e-issues-abertas
main_sha: d7a24eeff7b5eebe4a4215d2abfebc0993ff307d
template_version_tag: v1.27.0
working_tree: clean
working_tree_files: []
last_commit:
  sha: d7a24ee
  author: CEO Agent
  message: "feat(system-design): o system design canônico e a conformidade do código (#164)"
  conventional: true
schema_drift_prisma: applied
coverage_aggregate_lines: null
coverage_aggregate_branches: null
coverage_aggregate_funcs: null
coverage_threshold_met: true
preflight_checks: all_passed
preflight_skipped:
  - "archive vazio — 0 arquivo .md para verificar em .agents/runs/archive"
  - "nenhum agent alterado em origin/main...HEAD"
written_at: 2026-11-10T22:30:00Z
proceed: true
proceed_rationale: "A demanda é de pendências de tracker (6 PRs + 1 issue), não de ambiente: nada nela depende de banco, container ou serviço no ar. O preflight fecha com 0 erro e 2 checks skipped, e a árvore de código não muda — o PR toca config de bot, 2 gates e as docs que os medem."
gaps_detectados:
  - id: G-001
    categoria: "O bot nasce com commit que o gate do repo reprova"
    severity: major
    file: ".github/dependabot.yml"
    rationale: "MEDIDO 2026-11-10: os 5 PRs abertos do Dependabot (npm) têm subject `deps: Bump …` e CI vermelho; o `tooling/scripts/commit-msg-gate.ts` só aceita `feat|fix|chore|docs|test|refactor|ci` e a spec diferencial roda sobre o `git log` real. Os 5 PRs de `github-actions` (#150–#154) usaram prefixo `ci` e passaram. O prefixo `deps` do bloco npm nunca entrou no histórico (`git log --format=%s | grep -c '^deps:'` → 0); a convenção do repo é `chore(deps):`."
    source: ".github/dependabot.yml (bloco npm) × tooling/scripts/commit-msg-gate.ts"
    status: open
  - id: G-002
    categoria: "A pendência declarada não é instrumentada"
    severity: major
    file: ".tooling/scripts/ci/check-dependency-freshness.ts"
    rationale: "MEDIDO 2026-11-10: com a faixa `eslint` em `^10.14.0` e a pendência `majorNova: 10` ainda declarada, o gate devolve `ok=true` — a major foi adotada e a pendência envelheceu em silêncio. O gate só vê pendência que envelhece por pacote removido ou por faixa que já permite a major (`>=`)."
    source: ".tooling/scripts/ci/check-dependency-freshness.ts × .tooling/scripts/ci/dependencias-major-pendentes.json"
    status: open
  - id: G-003
    categoria: "Claim numérica que envelheceu sem instrumento"
    severity: minor
    file: ".tooling/scripts/ci/excecoes-de-dependencias.json"
    rationale: "MEDIDO 2026-11-10 com `pnpm audit --json`: `metadata.vulnerabilities` = `{low:1, moderate:26, high:3, critical:1}` → 31. O arquivo afirma 41 (1 crítica, 3 altas, 32 moderadas, 5 baixas). Os 4 ids que reprovam (1139528, 1242658, 1243066, 1124011) continuam no `pnpm audit`."
    source: ".tooling/scripts/ci/excecoes-de-dependencias.json × `pnpm audit --json`"
    status: open
  - id: G-004
    categoria: "O ledger não enxerga a linha 0.x"
    severity: minor
    file: ".tooling/scripts/ci/scan-dependency-majors.ts"
    rationale: "MEDIDO 2026-11-10: `majorDeclarada('^0.54.2')` = 0 e o registro grava `0` para os pacotes 0.x — a major pendente de `@opentelemetry/exporter-trace-otlp-http` (0.54.2 → 0.301.0) e de `@opentelemetry/auto-instrumentations-web` (0.43.0 → 0.70.0) não tem como existir no modelo atual."
    source: ".tooling/scripts/ci/scan-dependency-majors.ts × .tooling/scripts/ci/dependencias-major-disponiveis.json"
    status: open
gap_blocker: false
---

# State snapshot — as pendências dos PRs e da issue abertos

> Gerado em 2026-11-10T22:17:36Z, na branch
> `fix/pendencias-prs-e-issues-abertas` (a partir de `origin/main` =
> `d7a24ee`, v1.27.0). Medidas por comando; os comandos estão no plano
> [`2026-11-10-pendencias-prs-e-issues-abertas.md`](../../docs/superpowers/plans/2026-11-10-pendencias-prs-e-issues-abertas.md).

| Medida | Comando | Resultado |
|---|---|---|
| Working tree | `git status --short` | limpo |
| Branch | `git branch --show-current` | `fix/pendencias-prs-e-issues-abertas` |
| main | `git rev-parse origin/main` | `d7a24ee` |
| Versão do template | `git tag --list 'v*' --sort=-v:refname \| head -1` | `v1.27.0` |
| Preflight | `pnpm ci:preflight` | **0 erro(s)**; 2 checks skipped |
| PRs abertos | `gh pr list --state open` | **6** (5 do Dependabot + #163) |
| Issues abertas | `gh issue list --state open` | **1** (#149) |
| Advisories | `pnpm --config.engine-strict=false audit --json` | **31** (1 crítica, 3 altas, 26 moderadas, 1 baixa) |

> ⚠️ **A última linha é o achado, não o estado.** O arquivo de exceções
> declara **41** advisories; o `pnpm audit` mede **31**. E os 5 PRs do
> Dependabot estão vermelhos por uma causa que não é a dependência deles: o
> prefixo de commit do bot (`deps`) não está na lista de tipos que o gate do
> repo aceita.
