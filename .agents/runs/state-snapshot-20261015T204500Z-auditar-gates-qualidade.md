---
generated_at: 2026-10-15T20:45:00Z
agent: orchestrator (camada 0 — state-aware-planning)
demand_slug: "auditar-gates-qualidade-e-atualizar"
branch_at_snapshot: main
main_sha: e59640a917e572559a769f52d0d00fe02be43c4e
template_version_tag: v1.11.0
working_tree: dirty
working_tree_files:
  - ".agents/runs/snap-*.txt (artefatos de snapshot)"
last_commit:
  sha: e59640a
  author: b3ll3o
  message: "feat(login): senha obrigatória, sessão JWT e a tela que faz login de verdade (#81)"
  conventional: true
schema_drift_prisma: not_measured
coverage_aggregate_lines: not_measured
coverage_aggregate_branches: not_measured
coverage_aggregate_funcs: not_measured
coverage_threshold_met: not_measured
preflight_checks: 3_failed_2_skipped
health_endpoint:
  api: not_running
  web: not_running
otel_env_vars_declared: not_measured
otel_collector_running: false
matrix_specialist_routing_lint: not_measured

gaps_detectados:
  - id: G-001
    categoria: "turbo-redirect-differential falha"
    severity: blocker
    file: ".tooling/scripts/ci/turbo-redirect-differential.*"
    rationale: "Parser do harness diverge do turbo real em 18/18 formas. Gate sai em FAIL sem estado remediável local (precisa match com Node 22.6+). CI remoto valida. Pré-existente."
    source: "pré-flight local; pnpm ci:preflight"
  - id: G-002
    categoria: "review:lint falha por engine mismatch"
    severity: blocker (sandbox-only)
    file: ".tooling/scripts/lint-review-routing.ts (via preflight)"
    rationale: "Sandbox Node 20.20.2; package.json exige >=22.6.0. review:lint é sub-script pnpm. CI remoto (Node 22) valida. Pré-existente."
    source: "pré-flight local; pnpm ci:preflight"
  - id: G-003
    categoria: "Cristalização memória → repo reporta verde com 0 memórias medidas"
    severity: major
    file: ".tooling/scripts/ci/check-memory-crystallization.*"
    rationale: "Gate roda e sai 'vermede vazio' quando corpus isento. Mesma classe do `preflight` 'skipped sem aviso' — reportar verde sem medir é uma 'guard class' específica (classe 4 do guard-classes.md: 'sentinel de ausência que se confunde com sucesso'). O gate 'tem o que verificar' mas a mensagem atual é 'corpus isento por completo' — a categoria `nenhuma medição possível` é distinta de `vermede real`."
    source: "pré-flight local; pnpm ci:preflight"
  - id: G-004
    categoria: "Comportamento 'skipped' no preflight: 2 checks skipped silenciosamente"
    severity: minor
    file: ".tooling/scripts/ci/preflight.ts (relatarUmCheck)"
    rationale: "Painel reporta 'X checks skipped' mas não diz QUAIS. Issue #49 fechou um caso similar para 'NÃO VERIFICADO' mas skipped ainda é ambíguo. Hoje os 2 skipped (drift agent↔memória + 1 outro) não identificam nome."
    source: "pré-flight local; pnpm ci:preflight"
  - id: G-005
    categoria: "Nenhum tooling lê .github/workflows/ci.yml"
    severity: minor
    file: "tooling/scripts/*.ts + .tooling/scripts/ci/*.ts"
    rationale: "Pendência já registrada em ci-defense-in-depth-pendencias.md. Não é regressão nova; é cobertura declarada."
    source: "pendência conhecida"
  - id: G-006
    categoria: "Cobertura de testes agregada não medida em preflight"
    severity: minor
    file: ".tooling/scripts/ci/preflight.ts"
    rationale: "preflight roda 16 checks estruturais mas não mede cobertura agregada (≥80% regra de cobertura-testes.md). Pré-existente: cobertura medida só em `pnpm ci:local`."
    source: "convenção cobertura-testes.md"
  - id: G-007
    categoria: "MEMORY.md do agent-architect grande"
    severity: info
    file: ".agents/memory/agent-architect.md"
    rationale: "A verificar durante a auditoria — saber se convenção tamanho-e-revisao (≤300 linhas) é respeitada em todos os memories."
    source: "tamanho-e-revisao.md"

gap_blocker: false

proceed: true

state_aware_layer: 0
specialist_routing_layer: 1_planned
---

# State Snapshot — Auditoria de Gates de Qualidade (camada 0)

## §0. Contexto da demanda

User pediu: "faça o checkout e pull da branch main, analise os gates de qualidade, revise/atualize os gates de qualidade seguindo o fluxo de desenvolvimento".

Esta é uma demanda de **auditoria + revisão + atualização** dos gates de qualidade do template. O catálogo de gates tem 16 checks estruturais (`pnpm ci:preflight`) + 2 hooks husky (pre-commit, pre-push) + 4 jobs no CI remoto (preflight, sync, review, docker-build-prod, quality). Mapeado abaixo.

## §1. Estado atual (medido em 2026-10-15T20:45:00Z)

### 1.1 Working tree
- **Status:** `dirty` (apenas artefatos `.agents/runs/snap-*.txt` deste snapshot)
- **Branch atual:** `main`
- **origin/main SHA:** `e59640a917e572559a769f52d0d00fe02be43c4e`
- **Último commit:** `e59640a feat(login): senha obrigatória, sessão JWT e a tela que faz login de verdade (#81)` por b3ll3o, conventional ✓
- **Tag atual:** `v1.11.0`

### 1.2 Resultado do `pnpm ci:preflight` (rodado agora)

**3 falhas:**
1. **review-routing matrix lint (YAML + LOC + reviewer refs)** — `ERR_PNPM_UNSUPPORTED_ENGINE`. Falha por Node 20 vs 22.6+ exigido. **Sandbox-only**; CI remoto (Node 22) valida. Pré-existente.
2. **Cristalização memória → repo (camada 1 local)** — "corpus de memórias isento por completo (0 arquivos medidos) — o gate não tem o que verificar". **Comportamento questionável**: reporta verde mesmo sem medir. Vide G-003.
3. **turbo: differential parser × turbo real** — 18/18 formas divergem. Pré-existente, documentado em `turbo-redirect-differential.spec.ts:120` queixa conhecida. **Sandbox-only** (precisa `pnpm install` com Node 22.6+).

**2 skipped:**
- `drift agent↔memória (comportamento novo com memória intocada)` — skipped porque "nenhum agent alterado em origin/main...HEAD" (esperado quando auditando sem mudar agents).
- (1 outro skipped, sem nome explícito no output)

**13 verde.**

### 1.3 Inventário de gates (mapa 3 camadas)

| Camada | Onde | Gates |
|---|---|---|
| **0 — Local (sandbox)** | n/a | nenhum gate (criado: deveria existir? vide §4) |
| **1 — Pre-commit** | `.husky/pre-commit` | prettier-check (implícito via lint-staged?), `stack:review` (parcial), `ci:preflight` (se ref stacking...) |
| **1 — Pre-push** | `.husky/pre-push` | `pnpm ci:preflight` (bloqueante por engine-mismatch) |
| **1 — Local (manual)** | `pnpm ci:preflight` | 16 checks estruturais (vide §1.4) |
| **1 — Local (manual)** | `pnpm ci:local` | preflight + lint + typecheck + test:unit + test:coverage + test:integration + test:e2e (filtros) |
| **2 — CI remoto (PR)** | `.github/workflows/ci.yml` | format check, preflight, tooling test, pr-refresh gate, turbo run db:generate, turbo run lint typecheck, turbo run test:coverage test:unit, turbo run test:integration test:e2e (api), playwright install, turbo run test:e2e (web), docker build (api/web prod) |
| **2 — CI remoto (PR)** | `.github/workflows/review-stack.yml` | stack code review |
| **2 — CI remoto (PR)** | `.github/workflows/sync-docs.yml` | doc sync check |
| **2 — CI remoto (PR)** | `.github/workflows/release-template.yml` | tag auto em push main |
| **3 — Cron semanal** | `weekly-findings-scan` (sextas 02:00 UTC) | finding-orchestrator (8 specialists) → issues via gh |
| **3 — Cron semanal** | `weekly-docs-sync` (seg 03:00 UTC) | pnpm docs:sync + turbo tasks |

### 1.4 Os 16 checks de preflight (de `.tooling/scripts/ci/preflight.ts`)

1. `check-agent-memory-drift` — drift entre agents e memórias
2. `check-archive-integrity` — integridade de archive de demands
3. `check-branch-up-to-date` — branch está atualizada com main
4. `check-ci-local-scope` — escopo do `ci:local` cobre workspace
5. `check-doc-refs` — cross-refs em .md dentro de `docs/` e `.agents/specs/`
6. `check-docker-drift` — .dockerignore + Dockerfile size/base
7. `check-harness-owner` — owner do harness declarado
8. `check-memory-crystallization` — cristalização memória → repo
9. `check-memory-dir-concordance` — concordância `.agents/memory/` ↔ agents
10. `check-package-json-drift` — drift em `package.json` (raiz)
11. `check-self-firing-guard` — guards que disparam em si mesmos
12. `check-teeth-registry` — registro de dentes (gates ↔ preflight ↔ routing)
13. `check-tooling-typecheck` — typecheck de `.tooling/` e `tooling/scripts/`
14. `check-tsconfig-drift` — drift em `tsconfig*.json`
15. `check-turbo-drift` — drift em `turbo.json`
16. (1 outro a identificar — vide §3 deste snapshot)

### 1.5 Hooks husky

- **`.husky/pre-commit`** (1444 bytes): roda `stack:review` (parcial, só arquivos staged) + check-archive integrity + format check (?)
- **`.husky/pre-push`** (1834 bytes): roda `pnpm ci:preflight` (bloqueante). Falha em sandbox por Node 20 vs 22.6+.

## §2. Gaps detectados (resumo)

| ID | Categoria | Severity | Blocker? | Justificativa para `proceed: true` |
|---|---|---|---|---|
| G-001 | turbo-redirect-differential | blocker (sandbox) | ❌ não bloqueia | Pré-existente; documentado; CI remoto valida |
| G-002 | review:lint engine mismatch | blocker (sandbox) | ❌ não bloqueia | Pré-existente; documentado; CI remoto valida |
| G-003 | memória → repo verde com 0 mems | **major** | ❌ não bloqueia | **Comportamento novo a corrigir nesta campanha** |
| G-004 | skipped silenciosos | minor | ❌ não bloqueia | A melhorar; baixa prioridade |
| G-005 | workflows/ci.yml não lido | minor | ❌ não bloqueia | Pendência conhecida, defesa de escopo |
| G-006 | cobertura agregada fora do preflight | minor | ❌ não bloqueia | Já presente em ci:local; falta medir em preflight |
| G-007 | memories grandes? | info | ❌ não bloqueia | A verificar |

`gap_blocker: false` → `proceed: true`. Pode-se prosseguir para camada 1 (specialist-routing).

## §3. Próximos passos (camada 1 — specialist-routing)

Demanda = "auditar e atualizar gates de qualidade". Mapeamento por specialidade:

- **monorepo-specialist** — ownership de `package.json` raiz + `turbo.json` + `tsconfig*.json` + `pnpm-workspace.yaml`. Gates G-001, G-005, G-006 tocam monorepo.
- **ci-defense-in-depth** (skill/convenção) — `ci-defense-in-depth.md` é o DONO conceitual dos 16 gates + hooks + CI. Demand owner: "revisar e atualizar os gates de qualidade" cai DENTRO do escopo desta convenção. (Agent dedicado: não existe um `ci-defense-specialist` no catálogo — vide G-007-colaterais: talvez criar um, vide §5.)
- **stack-code-reviewer** — review final de qualquer mudança em `apps/` ou `tooling/`.

Plano (camada 2): para este snapshot, a rota é:

1. **state-aware-planning** (este doc) — ✓
2. **specialist-routing** — identificar que a demanda é primariamente de `ci-defense-in-depth` (convenção/skills) + `monorepo-specialist` (G-001/G-006). Sem novo agent; sem novo plano multi-task.
3. **Plano enxuto** — uma sequência de até 5 tarefas que tocam:
   - T1: melhoria do gate `check-memory-crystallization` (G-003) — `verde com 0 mems` → vermelho com mensagem clara
   - T2: melhoria da visibilidade de skipped no preflight (G-004) — `X check(s) skipped` → listar nomes
   - T3: adicionar gate de cobertura agregada em preflight (G-006) — move a verificação do ci:local para preflight
   - T4 (opcional): melhorias de pre-push hook — separar Node check de preflight (G-001/G-002)
   - T5 (opcional): validar tamanho dos memories (G-007)
4. **fix em PR único** — consolidação das tarefas em 1 PR (padrão do user, vide PR #80).
5. **state-snapshot pós-fix** — versionar aprendizados em `.agents/runs/`.

## §4. Estado do `pre-flight` em 3 camadas (faltam medições)

| Camada | Comando | Estado |
|---|---|---|
| 0 — Local (sandbox) | nenhum | ❌ não existe |
| 1 — Pre-push | `pnpm ci:preflight` | ⚠️ bloqueado por engine |
| 1 — Manual | `pnpm ci:local` | não medido agora (Node mismatch em sub-suites) |
| 2 — CI remoto | `push → PR` | ✅ 5/5 verde histórico (PR #80, #81) |

**Gaps estruturais da Camada 0:**
- Não existe um gate **dentro do sandbox Hermes** para que eu possa validar antes de pedir push. Toda validação fica no CI remoto, o que é caro (ciclo de feedback 3-5min).
- O hook pre-push é **bloqueante para o developer humano** mas no meu caso (sandbox Node 20) é bloqueante indevidamente. Esse é um problema de UX do dev que não impacta produção (CI valida).

## §5. Proposta de agent (a decidir)

A demanda "auditar/atualizar gates de qualidade" não tem um `agent` owner dedicado no catálogo. A convenção `ci-defense-in-depth.md` é a "dona" do assunto, mas não tem um agent. Opções:

- **A) Criar `ci-defense-specialist`** (agent) + `ci-defense-audit` (skill) — consistente com o §3.2 do AGENTS.md (audit specialists v2.0+). Alinhado com o que foi feito para os 6 audit specialists no PR #64.
- **B) Despachar `monorepo-specialist`** + carregar a skill `ci-defense-in-depth` como contexto. Não exige criar agent novo.
- **C) Ad-hoc via orchestrator** — esta campanha é uma decisão; não é demanda recorrente.

Recomendação: **A** se houver recorrência esperada (audit-mode v2.0+ do WORKFLOWS.md vai querer esse agent). **B** se for pontual. **C** se for one-off.

Para esta campanha, escolho **B** (carregar skill `ci-defense-in-depth` + `monorepo-specialist` sob demanda). Decisão: a demanda "atualizar os gates" cabe no escopo de um sprint de qualidade, não exige agent permanente.

## §6. Artefatos

- `.agents/runs/snap-wt.txt` — `git status --short`
- `.agents/runs/snap-main.txt` — `git rev-parse origin/main` → `e59640a917e572559a769f52d0d00fe02be43c4e`
- `.agents/runs/snap-tag.txt` — `v1.11.0`
- `.agents/runs/snap-commit.txt` — `git log -1 --pretty=fuller`
- `.agents/runs/state-snapshot-20261015T204500Z-auditar-gates-qualidade.md` — este doc

## §7. Contrato com specialist-router (camada 1)

Inputs:
- `main_sha`: `e59640a`
- `template_version_tag`: `v1.11.0`
- `gaps_detectados`: 7 (3 major/minor, 2 pré-existentes sandbox-only, 2 info)
- `gap_blocker`: `false`
- `proceed`: `true`

Pedido ao router: "1 specialist (ci-defense-in-depth via monorepo-specialist) — escopo = gates de preflight + hooks husky + ci.yml + cobertura agregada".
