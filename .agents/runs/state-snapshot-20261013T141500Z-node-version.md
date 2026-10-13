---
generated_at: 2026-10-13T14:15:00Z
agent: hermes-orchestrator
demand_slug: "fix-cron-pnpm-engine-mismatch"
branch_at_snapshot: main
main_sha: 129015a9f4b107b3d6d5c375d73c9819903a0470
template_version_tag: v1.10.0
working_tree: clean
working_tree_files: []
last_commit:
  sha: 129015a9f4b107b3d6d5c375d73c9819903a0470
  author: Leonardo Andreazzi
  message: "fix: gates que passavam sem verificar, e VO devolvendo 500 com string interna (#66)"
  conventional: true
node_version_local: 20.20.2
node_version_required: ">=22.6.0"
node_engine_declaration: package.json#engines.node
preflight_checks: blocked_by_engine
ci_remoto_runs_on: ubuntu-latest (Node 22.6+ via setup-node)

gaps_detectados:
  - id: G-001
    categoria: "Sandbox do Hermes com Node 20.20.2 — engines.node exige >=22.6.0"
    severity: blocker
    file: ".tooling/scripts/ci/preflight.ts (toda a suíte) + cron weekly-docs-sync (pnpm docs:sync)"
    rationale: |
      O sandbox onde o Hermes roda (e onde o weekly-docs-sync é executado
      pelo cron) tem Node 20.20.2. O `engines.node` declarado em
      package.json exige `>=22.6.0`. Toda execução local de `pnpm <qualquer>`
      aborta imediatamente com ERR_PNPM_UNSUPPORTED_ENGINE.
    source: "state-aware-planning.md §1 (camada 0 do pre-planner)"
    consequencias:
      - "pnpm ci:preflight (camada A pre-push) não roda → CI remoto é a única garantia"
      - "pnpm docs:sync (camada A) não roda → weekly-docs-sync falha rc=3 toda segunda 03:00"
      - "pnpm tooling:test (camada B) não roda → os próprios dentes do tooling não são exercitados localmente"
    evidencia_local: "ERR_PNPM_UNSUPPORTED_ENGINE — Expected: >=22.6.0, Got: v20.20.2"
    evidencia_remota: "CI passa (5/5 verde) porque setup-node usa Node 22"

  - id: G-002
    categoria: "weekly-docs-sync cron: rc=3 semanal desde que pnpm docs:sync deixou de rodar"
    severity: major
    file: "~/.hermes/scripts/weekly-docs-sync.sh linha 78"
    rationale: |
      O script tenta rodar `pnpm docs:sync` e aborta com rc=3 (exit
      declarado). Antes, a análise semanal era gerada (passo git log),
      mas como docs:sync não roda, o diff é zero e a branch de sync
      nunca é criada → PR semanal nunca é aberto.
      O bug mais visível (git log WEEK_RANGE mal formado) foi corrigido
      em ~/.hermes/scripts/weekly-docs-sync.sh linhas 47-72, mas o bug
      raiz (engines.node) persiste.
    source: "Run manual de 2026-10-13 13:58 (deleg_840cb2cc + re-run local)"

gap_blocker: false   # G-001 é blocker MAS tem plano de resolver (3 opções abaixo)
---

# State-Snapshot — `fix-cron-pnpm-engine-mismatch`

> Camada 0 do pre-planner (state-aware-planning.md v1.0). Gerado **antes**
> de qualquer plano de correção, para gap analysis AS-IS→TO-BE.

## §1. AS-IS (estado verificado)

| Categoria | Valor | Fonte |
|---|---|---|
| Working tree | clean | `git status --short` |
| Branch atual | main | `git branch --show-current` |
| origin/main | 129015a9 | `git rev-parse origin/main` |
| Último commit | 129015a — fix: gates que passavam sem verificar, e VO devolvendo 500 com string interna (#66) | `git log -1` |
| Tag template mais recente | v1.10.0 | `git tag --list 'v*' \| head -1` |
| Node local | v20.20.2 | `node --version` |
| Node exigido | `>=22.6.0` | `package.json#engines.node` |
| pnpm local | disponível | `pnpm --version` (mas bloqueado pelo engine) |
| CI remoto (`.github/workflows/`) | roda com Node 22.6+ via `actions/setup-node` | inspeção dos yml |
| Cron `weekly-docs-sync` | falhando rc=3 toda segunda 03:00 | `last_status: "error"` no `cronjob_manage list` |
| Cron `weekly-findings-scan` | rodando ok | `last_status: "ok"` |

## §2. Gaps AS-IS → TO-BE

### G-001 (blocker) — incompatibilidade Node local vs engines.node

**Sintoma:** toda execução de `pnpm` no sandbox morre em
`ERR_PNPM_UNSUPPORTED_ENGINE` antes mesmo de chegar no script. Consequências:

1. `pnpm ci:preflight` (camada A pre-push) não roda — CI remoto é a única
   salvaguarda. Quebra a defesa-in-depth.
2. `pnpm docs:sync` (camada A) não roda — o cron `weekly-docs-sync` abre
   um branch, roda análise semanal, aborta em rc=3, gera report de falha.
3. `pnpm tooling:test` (camada B) não roda — os próprios dentes do
   tooling não são exercitados antes do push.

**TO-BE:** uma (ou mais) das três opções abaixo — ordem de preferência
declarada em §3.

### G-002 (major) — weekly-docs-sync sem PR há ≥ 1 semana

Já tem bug `git log WEEK_RANGE` corrigido nesta sessão (commit ainda
não commitado em ~/.hermes/scripts/weekly-docs-sync.sh). O fix é local
ao script; o PR que vai abrir depende de resolver G-001 primeiro.

## §3. Decisão — `proceed: true` (com escopo)

`gap_blocker: false` porque o G-001 **tem plano de resolver** abaixo.
A escolha entre as 3 opções exige decisão do usuário (consta em
`.agents/specs/conventions/idioma.md` — perguntar é a regra quando há
trade-off real).

**3 opções de fix (pro/cons):**

| Opção | Descrição | Pro | Contra |
|---|---|---|---|
| **A. Bajar Node local pro sandbox** | Instalar nvm + Node 22.6+ no sandbox do Hermes (`/root`) | Resolve TODOS os 3 crons + pnpm tooling:test volta a rodar localmente | Sandbox é efêmero (cria a cada sessão) — fix precisa ser re-aplicado; alteraria setup do Hermes que não é meu papel |
| **B. Pinar `engines.node` pra `>=20.0.0`** | Mudar `package.json#engines.node` de `>=22.6.0` pra `>=20.0.0` (ou `>=20.10.0`) | Resolve sem mexer no sandbox; sandbox atual é compatível | Pode quebrar CI se algo do repo depender de Node 22+ (a verificar: o setup-node em .github/workflows/ é fixo em 22.x; se algo usa 22-only features vai quebrar lá em vez de local) |
| **C. Adicionar pre-check no script** | Antes do `pnpm docs:sync`, verificar Node e fazer fallback (skip com aviso, ou abortar com mensagem específica) | Não muda engines; só protege o script | Outros consumers (pre-commit, pre-push, ci:preflight) continuam quebrados localmente; sandbox continua sem poder rodar tooling |

**Recomendação:** B + A como follow-up. **B** é o fix de baixo risco
(provavelmente a engine foi pinada em 22.6+ sem necessidade real — vale
auditar o que de fato usa Node 22+ no monorepo). **A** é a solução
estrutural (sandbox deveria rodar Node 22+ como produção), mas é trabalho
que foge do escopo deste repo.

## §4. Cross-refs

- [`state-aware-planning.md §3 Passo 2`](../../specs/conventions/state-aware-planning.md) — formato canônico seguido
- [`state-aware-planning.md §3 Passo 3`](../../specs/conventions/state-aware-planning.md) — `proceed: true` com 3 opções
- [`fluxo-desenvolvimento.md §3.1`](../../../docs/fluxo-desenvolvimento.md) — pre-commit/pre-push descritos
- [`fluxo-desenvolvimento.md §7.1`](../../../docs/fluxo-desenvolvimento.md) — `ci:preflight` está wired e funcionando **remotamente**
