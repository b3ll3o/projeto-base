---
generated_at: 2026-11-09T13:48:56Z
agent: controller
demand_slug: issue-149
branch_at_snapshot: feat/issues-149-instrumentos-da-camada-de-binding
main_sha: 108e82a269780e4b800aa5579a75f47997889ed3
template_version_tag: v1.22.0
working_tree: dirty
working_tree_files:
  - ".agents/runs/20261109T134856Z-*.txt (artefato do snapshot — não-conflitante)"
last_commit:
  sha: 108e82a
  author: Leonardo Andreazzi <andreazzi-leonardo@hotmail.com>
  date: 2026-11-09T10:40:53-03:00
  message: "fix(security): as 10 issues P1 do scan de 2026-11-02, em UM PR (#147)"
  conventional: true
schema_drift_prisma: not_measured
coverage_aggregate_lines: null
coverage_aggregate_branches: null
coverage_aggregate_funcs: null
coverage_threshold_met: null
preflight_checks: failed
health_endpoint:
  api: not_running
  web: not_running
otel_env_vars_declared: []
otel_collector_running: false
matrix_specialist_routing_lint: passed
matrix_review_routing_lint: passed
written_at: 2026-11-09T13:55:00Z
preflight_skipped:
  - "check-archive-integrity — archive vazio (0 arquivo .md em .agents/runs/archive)"
  - "check-agent-memory-drift — nenhum agent alterado em origin/main...HEAD"
preflight_errors:
  - "check-memory-crystallization — 2 memória(s) sem destinação no ledger"
proceed: true
proceed_rationale: >
  O preflight de `main` está VERMELHO por 1 gate só, e o vermelho é de um
  gate que reconcilia o corpus de memórias da MÁQUINA contra o ledger
  versionado — as 2 memórias sem linha são de sessões anteriores, e a
  correção delas é uma linha de ledger cada. Nenhum outro gate falha, e
  nenhum achado da issue #149 depende do corpus de memórias.
---

## O que este snapshot mediu

| Item | Comando | Resultado |
|---|---|---|
| Working tree | `git status --short` | 5 artefatos do próprio snapshot (untracked) |
| Branch base | `git rev-parse origin/main` | `108e82a269780e4b800aa5579a75f47997889ed3` |
| Branch de trabalho | `git branch --show-current` | `feat/issues-149-instrumentos-da-camada-de-binding` |
| Versão do template | `git tag --list 'v*' --sort=-v:refname \| head -1` | `v1.22.0` |
| Preflight | `pnpm ci:preflight` | **1 gate vermelho** (`check-memory-crystallization`), 2 checks `skipped` |
| Advisories de dependência | `pnpm audit --json \| jq '.metadata.vulnerabilities'` | 41 advisories — 1 crítica, 3 altas, 32 moderadas, 5 baixas |

## Os dois reds que o preflight acusou (e de quem são)

1. **`check-memory-crystallization` — 2 memória(s) sem destinação.** As duas
   (`as-duas-camadas-precisam-medir-o-mesmo-valor` e
   `papel-postgres-e-do-cluster-nao-do-banco`) estão no corpus da máquina e
   não têm linha no ledger `.agents/runs/memory-triage.md`. O gate que acusa
   é o **achado F4 da issue #149**: o corpus vive em `$HOME`, fora do repo, e
   por isso o veredito do gate muda de máquina para máquina.
2. **A própria camada do gate.** MEDIDO com
   `findMissingTargets()` + `findStaleAnchors()` sobre o ledger real: **109
   linhas, 0 malformadas, 0 alvo ausente, 0 âncora vencida**. A metade do
   gate que é **derivável do repo** está verde — e é essa metade que o CI não
   mede hoje, porque o gate sai por `skipped` antes de chegar nela.

## Estado do PR #148 (a base que a issue #149 cita)

`gh pr view 148` → **OPEN**, `feat/gate-cobertura-da-camada-de-skills` →
`main`, checks verdes (`preflight`, `quality`, `docker-build-prod`). O
`check-skill-coverage.ts` **NÃO está em `main`** — ele chega com o #148. A
medição da issue ("os 29 wrappers batem com o canônico") foi feita na branch
do #148; em `main` há **21 wrappers** e **1 divergência de conteúdo**
(`docker`, skill) que o #148 já não vê, porque nasceu depois do merge-base.

---

**Mantido por:** projeto-base contributors
