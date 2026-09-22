# Convenção: CI Defense in Depth — Estratégia de Defesa em Camadas

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).
> pt-BR prose, English technical identifiers.

## Objetivo

Drift estrutural (cross-refs quebradas em docs, tsconfigs divergentes,
regras ESLint legadas, extensões faltando em `tsconfig`) **não é capturado
por testes unitários nem por cobertura**: código compila e passa, mas o
monorepo fica progressivamente inconsistente até quebrar um build
aleatório. A estratégia defense-in-depth ataca o problema em **camadas
progressivas** — quanto mais cedo o drift é detectado, menor o custo do
feedback loop (5s local vs 4min no CI) e menor a chance de merge de uma
regressão estrutural.

A estratégia tem **3 camadas**: pre-push local (dev), preflight CI job
(primeiro gate), quality CI jobs (lint/typecheck/test/coverage, gated).

## As 3 Camadas

### Camada 1 — Pre-push local

`pnpm ci:local` roda **todas as validações que o CI roda** em ~30–60s.
Devs executam **antes** de `git push`. Detecta drift estrutural em ~5s
(o que o CI detectaria em ~4min). Falha localmente antes de gastar um
round-trip com o CI remoto. Script definido em
`package.json` raiz; detalhes em [git-workflow.md §Pre-Push Quality
Gate](./git-workflow.md).

### Camada 2 — Preflight CI job

Workflow `.github/workflows/ci.yml`, job `preflight`. **Primeiro job do
pipeline** — demais jobs (lint, typecheck, test, coverage) declaram
`needs: preflight` e não rodam se preflight falhar. Falha rápido em
~10s com 3 checks estruturais: `check-doc-refs`,
`check-tsconfig-drift`, `check-eslint-drift` (todos sob
`.tooling/scripts/ci/`). Veja a [Tabela de Checks](#tabela-de-checks).

### Camada 3 — Quality CI

Lint, typecheck, test, coverage. Roda **apenas se preflight passou**.
~4min. Aplica as regras funcionais (negócio, tipos, cobertura 80% por
[cobertura-testes.md §CI Defense in Depth](./cobertura-testes.md)).

## Tabela de Checks

| Check | Tipo | Detecta | Custo | Arquivo |
|---|---|---|---|---|
| `check-doc-refs` | cross-refs | paths relativos quebrados em `docs/*.md` | ~5s | `.tooling/scripts/ci/check-doc-refs.ts` |
| `check-tsconfig-drift` | tsconfig | extensões/extends divergentes entre tsconfigs | ~3s | `.tooling/scripts/ci/check-tsconfig-drift.ts` |
| `check-eslint-drift` | eslint config | regras duplicadas/legadas em configs ESLint | ~3s | `.tooling/scripts/ci/check-eslint-drift.ts` |
| `check-types` | typecheck | tipos inconsistentes em scripts CI | ~1s | `.tooling/scripts/ci/check-types.ts` |

Todos os checks seguem o template `CheckResult` compartilhado
extraído em commit `59eb083` (refactor que consolidou fixtures herméticas).

## Comando de Verificação

```bash
# Local (camada 1 — tudo que o CI roda)
pnpm ci:local

# Apenas preflight (camada 1 reduzida, ~10s)
pnpm ci:preflight
```

`pnpm ci:local` é referenciado em `AGENTS.md` §6 como pré-requisito de
push. `pnpm ci:preflight` é o atalho para devs iterando em docs/tsconfig.

## Histórico de drift detectado

| PR / commit | Check | Drift | Correção |
|---|---|---|---|
| `3f614dd` | `check-doc-refs` | primeiro check de cross-refs introduzido (TDD) | feature inicial |
| `df70f5d` | `check-doc-refs` | falsos positivos em code blocks | preflight pula code blocks |
| `2b158f8` | `check-tsconfig-drift` | primeiro check de drift de tsconfig (TDD) | feature inicial |
| `59eb083` | `check-tsconfig-drift` | fixtures compartilhadas + `CheckResult` unificado | refactor (fixtures herméticas) |
| `f4a5434` | `check-eslint-drift` | primeiro check de drift de ESLint (TDD) | feature inicial |
| `0008319` | preflight job | gate `needs: preflight` adicionado | feature inicial |

Cada novo check é introduzido por TDD (Red→Green→Refactor — ver
[tdd.md](./tdd.md)); o spec do check fica em `*.spec.ts` ao lado do
script.

## Pendências conhecidas

- **Pre-push não automatizado via Husky.** Hoje depende de disciplina
  do dev rodar `pnpm ci:local` antes de `git push`. Sugestão: Husky
  hook em `.husky/pre-push` rodando `pnpm ci:preflight` (gap conhecido
  do plano de robustez; tarefa para v1.4.0).
- **Cobertura de drift para `turbo.json` e `package.json` raiz.** Hoje
  apenas docs/tsconfig/eslint têm checks. Sugestão: novos checks para
  detectar pipelines turbo divergentes e scripts pnpm fantasma.
- **Skill `ci-defense-in-depth`:** publicada em
  [`.agents/skills/ci-defense-in-depth/SKILL.md`](../../skills/ci-defense-in-depth/SKILL.md)
  (adicionada em v1.4.0). Cobre o template `CheckResult`, fixtures herméticas
  via `fs.mkdtemp` e code-block-aware parsing para novos checks preflight.

## Cross-references

- [git-workflow.md §Pre-Push Quality Gate](./git-workflow.md)
- [cobertura-testes.md §CI Defense in Depth](./cobertura-testes.md)
- [post-merge-release.md](./post-merge-release.md)
- [../../skills/ci-defense-in-depth/SKILL.md](../../skills/ci-defense-in-depth/SKILL.md)
