---
generated_at: 2026-10-16T02:42:06Z
agent: hermes-orchestrator
demand_slug: auditar-gates-harness-v1-12
branch_at_snapshot: ci/expand-gates-cobertura-v1-12
main_sha_before: 30b9480de53c1aa881dfdc81d5b955fd311dfa8e
template_version_tag: v1.11.0
working_tree: dirty-T4-pr
preflight_checks: 24_passed_1_failed_2_skipped
gates_added: [check-harness-location, check-teeth-count, check-engines-consistency, check-agent-routing-coverage]
gates_extended: [check-package-json-drift]
matrix_updated: specialist-routing v1.5 (13 path_globs novos cobrem 11 agents órfãos)
convention_size: 300/300 (limite atingido — histórico migrado para specialist-routing-historico.md)
specs_passed: 344/346 (2 falhas pré-existentes em check-archive-integrity, sem relação a T4)
failures_intentional: [G-003 corpus de memórias vazio (design — único arquivo é -result.md isento)]
cancelled_in_t4: [G-H-11 testignore, G-H-02 otelcol-compose-parity, G-H-08 workflow-yaml]
---

# State-snapshot final — T4 v1.12

## Resumo

Auditoria completa do harness do projeto-base produziu **4 gates novos** e
**1 extensão** em 1 PR unificado, fechando **3 pendências** do ledger
(`check-package-json-drift` estendido = L208; matriz de roteamento sem
órfãos; registro de dentes atualizado).

## Decisões pragmáticas

- **Escopo final = 5 itens** (de 14 inicialmente planejados), após subagente
  saturar contexto em 697s tentando 3 gates pesados.
- **Subagente PARADO**: G-H-11 (testignore), G-H-02 (otelcol), G-H-08
  (workflow-yaml) ficam fora deste PR; registrados em
  `ci-defense-in-depth-pendencias.md §Pendências herdadas (T4)`.

## Validação

- `pnpm --config.engine-strict=false ci:preflight`: **24 ✓ + 1 ✗ (G-003 design) + 2 skipped**
- `pnpm --config.engine-strict=false exec vitest run --root .tooling/scripts/ci`:
  **344/346 (2 falhas pré-existentes em check-archive-integrity)**
- `pnpm --config.engine-strict=false typecheck:tooling`: OK

## Gates novos (4)

| ID | Gate | LOC | Spec | Status |
|---|---|---|---|---|
| G-H-04 | check-teeth-count | 91 | 4 testes | ✓ |
| G-H-10 | check-harness-location | 112 | 3 testes | ✓ |
| G-H-01 | check-engines-consistency | 136 | 15 testes | ✓ |
| G-H-03 | check-agent-routing-coverage | 86 | 14 testes | ✓ |

## Matriz

`specialist-routing.md` agora cobre 26 specialists. 13 path-globs novos
adicionados para agentes órfãos; tabela de histórico migrada para
`specialist-routing-historico.md` para preservar limite de 300 linhas.

## Pendências fechadas

- L208 (check-package-json-drift estendido com extraPackageJsonPaths)
- 11 agents órfãos cobertos pela matriz
- check-package-json-drift em apps (apps/{web,api}/package.json)
- 4 entradas no Registro de dentes (ci-defense-in-depth.md §117)
- 4 entradas na Tabela de Checks (ci-defense-in-depth.md §48)

## Pendências herdadas (T4)

- G-H-11 (testignore) — subagente cancelado
- G-H-02 (otelcol-compose-parity) — subagente cancelado
- G-H-08 (workflow-yaml) — subagente cancelado
- L38, L139, L247 — permanecem abertas (ver
  `ci-defense-in-depth-pendencias.md`)

## Próxima ação

- Criar branch `ci/expand-gates-cobertura-v1-12`
- Commits separados por gate
- Push + PR com 5 CI checks
