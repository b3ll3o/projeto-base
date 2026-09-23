---
name: state-aware-planning
version: 1.0
updated: 2026-09-23
maintainer: telemetry-specialist
description: "Convenção canônica de planejamento state-aware — institui a obrigatoriedade de verificar o estado atual da aplicação (working tree, última main alinhada, dependências, locks, schemas, env vars, métricas de saúde) ANTES de criar um plano, emitir um `state-snapshot` explícito, e alimentar o specialist-router com o gap analysis AS-IS→TO-BE. Camada 0 do pre-planner (antes do specialist-router camada 1)."
---

# Convenção: `state-aware-planning` (planejamento state-aware)

> pt-BR: define a obrigatoriedade de **verificar o estado atual da
> aplicação** antes de criar qualquer plano. Aplica-se a todos os
> gatekeepers, planners e orquestradores do catálogo de agents.

## §0. Origem da regra

O fluxo atual (`specialist-routing` skill Passo 1) tem pre-dispatch checks
**parciais**: working tree limpo, matriz existe, agent existe, convenção
`evolucao-agents` existe. Falta verificar **o estado da aplicação em si**
— o que está rodando, o que mudou, quais locks existem, qual a versão
do schema Prisma aplicado, qual a tag atual, qual a cobertura de testes
agregada, qual a versão do template `.agents/`.

Esta convenção preenche esse gap. É **camada 0 do pre-planner**: o
`state-snapshot` emitido aqui alimenta o `specialist-router` (camada 1)
que já existe. **Não substitui** nem duplica o specialist-router — o
insumo de um vira contexto do outro.

## §1. Definição de "estado atual"

Para esta convenção, "estado atual" significa **um snapshot verificável**
composto por:

| Categoria | O que verificar | Ferramenta canônica |
|-----------|-----------------|---------------------|
| **Working tree** | `git status` limpo, sem commits pendentes | `git status --short` |
| **Branch base** | última main alinhada com `origin/main` | `git rev-parse origin/main` |
| **Último commit** | SHA + autor + conventional commit message | `git log -1 --pretty=fuller` |
| **Versão do template** | tag atual em `.agents/agents/_template.md` ou `estrutura-e-versionamento.md` §Histórico | `git tag --list 'v*' --sort=-v:refname \| head -1` |
| **Versão do Next.js/NestJS/Prisma** | declarada em `package.json` | `cat apps/*/package.json \| jq .dependencies` |
| **.env example vs .env local** | divergências de schema | `diff .env.example apps/api/.env` (cuidado com secrets) |
| **Migrations Prisma aplicadas** | drift entre schema.prisma e migrations | `pnpm exec prisma migrate status` |
| **Cobertura de testes agregada** | vitest threshold ≥ 80% | `pnpm test -- --coverage` |
| **Lint preflight** | todas as 7 checks estruturais | `pnpm ci:preflight` |
| **Health endpoints** | `/api/v1/health` retornando 200 OK | `curl http://localhost:3000/api/v1/health` |
| **Env vars OTel declaradas** | presença de `OTEL_*` em código/compose | `grep -rn OTEL_ apps/ docker-compose*.yml` |
| **OTel Collector rodando** | opcional em dev | `docker compose --profile observability ps otel-collector` |
| **Matriz router atualizada** | diff entre matriz declarada e agents existentes | `pnpm lint-specialist-routing` |

> ⚠️ **Não inventar estado.** Todo item da tabela §1 DEVE vir de comando
> shell reproduzível documentado inline (regra `tamanho-e-revisao.md §
> Verificabilidade de Claims Numéricos`).

## §2. Quem é obrigado a aplicar

Lista **exata** (atualizar em `AGENTS.md §3` se catálogo mudar):

- **Gatekeepers/orquestradores:**
  - `specialist-router` (pré-planner camada 1)
  - `review-router` (pós-task revisão)
  - `orchestrator` (decomposição de plano)
  - `agent-architect` (criação/evolução de agent)
  - `task-manager` (decisão de bump/backlog)
- **Planners diretos:**
  - `orchestrator` (decomposição de plano)
  - `monorepo-specialist` (mudança de monorepo)
- **Implementers quando toggle ON:**
  - Qualquer agent pode opcionalmente aplicar antes de chamar
    `test-writer` ou `code-reviewer` (decisão por escopo).

> **Quem NÃO aplica:** implementers diretos seguindo um plano
> recebido (ex: `nestjs-specialist` em modo "executar task 3 do plano X"
> não precisa rodar §3 inteiro — apenas confirmar que o state-snapshot
> do plano bate com a realidade, via git diff rápido).

## §3. Os 3 Passos Obrigatórios

### Passo 1 — Snapshot inicial (≤ 90 segundos)

Executar os comandos abaixo em sequência. Salvar output como
`state-snapshot-<timestamp>.md` em `.agents/runs/` (independente da
pasta `archive/`):

```bash
TS=$(date -u +%Y%m%dT%H%M%SZ)

# 1.1 Working tree
git status --short > .agents/runs/${TS}-wt.txt

# 1.2 Branch e remoto
git branch --show-current | tee .agents/runs/${TS}-branch.txt
git rev-parse origin/main > .agents/runs/${TS}-main-sha.txt

# 1.3 Último commit
git log -1 --pretty=fuller > .agents/runs/${TS}-last-commit.txt

# 1.4 Versão template
git tag --list 'v*' --sort=-v:refname 2>/dev/null | head -1 > .agents/runs/${TS}-template-tag.txt

# 1.5 Deps principais
jq -r '.dependencies | to_entries[] | "\(.key)@\(.value)"' \
  apps/api/package.json apps/web/package.json tooling/scripts/package.json \
  2>/dev/null > .agents/runs/${TS}-deps.txt

# 1.6 Schema drift Prisma (se aplicável)
(cd apps/api && pnpm exec prisma migrate status 2>&1) > .agents/runs/${TS}-prisma-migrate.txt

# 1.7 Cobertura agregada (se aplicável)
pnpm -r test --coverage 2>&1 | tail -50 > .agents/runs/${TS}-coverage.txt

# 1.8 Preflight estrutural
pnpm ci:preflight 2>&1 > .agents/runs/${TS}-preflight.txt

# 1.9 Health endpoint (se houver dev server)
curl -fsS http://localhost:3000/api/v1/health > .agents/runs/${TS}-health.json 2>&1 || echo "NÃO RODANDO"
```

> **Atenção:** cada comando deve **passar sem erros** antes de avançar
> ao Passo 2. Se algum falhar, **abortar** e devolver
> `gap_blocker: true` (não criar plano sobre estado quebrado).

### Passo 2 — Compor `state-snapshot` (formato canônico)

Consolidar outputs num arquivo `state-snapshot-<timestamp>.md`:

```yaml
---
generated_at: 2026-09-23T20:00:00Z
agent: specialist-router            # quem gerou
demand_slug: "<kebab-case da demanda>"
branch_at_snapshot: feat/telemetria
main_sha: <sha completo ou short>
template_version_tag: v1.6.0
working_tree: clean | dirty | conflicting
working_tree_files: []              # lista vazia se clean
last_commit:
  sha: <sha>
  author: <name>
  message: "feat(telemetria): bootstrap tracing.ts (RED)"
  conventional: true
schema_drift_prisma: none | applied | pending
coverage_aggregate_lines: 87        # em %
coverage_aggregate_branches: 81
coverage_aggregate_funcs: 89
coverage_threshold_met: true        # ≥ 80%
preflight_checks: all_passed | <list of failed>
health_endpoint:
  api: ok | degraded | down | not_running
  web: ok | degraded | down | not_running
otel_env_vars_declared: []         # OTEL_* keys
otel_collector_running: false       # opt-in via perfil
matrix_specialist_routing_lint: passed | failed

gaps_detectados:
  - id: G-001
    categoria: "OTel SDK ausente"
    severity: blocker
    file: "apps/api/src/main.ts"
    rationale: "Zero dependências OTel; usuários sem tracing"
    source: "Stream B do research desta demanda"
  - id: G-002
    categoria: "Frontend sem RUM"
    severity: major
    file: "apps/web/app/layout.tsx"
    rationale: "Zero instrumentation.ts; web-vitals ausentes"
    source: "Stream C do research desta demanda"
  - id: G-003
    categoria: "Compose sem collector"
    severity: major
    file: "docker-compose.yml"
    rationale: "Sem perfil [observability] declarado"
    source: "Stream C do research desta demanda"

gap_blocker: false   # true se algum gap = blocker
---
```

> **Atenção:** o frontmatter acima é **canônico e consumido** pela
> skill `state-aware-planning/SKILL.md`. Mudanças no schema exigem
> bump major desta convenção.

### Passo 3 — Decidir `proceed` ou `block`

| Condição | Ação |
|----------|------|
| Nenhum gap com severity `blocker` | `proceed: true` — prosseguir para Passo 4 (specialist-router, se aplicável) |
| ≥ 1 gap com severity `blocker` | `proceed: false` — `gap_blocker: true` no snapshot; despachar `agent-architect` para validar |
| `working_tree` = `conflicting` | `proceed: false` independente de gaps (resolver merge antes) |
| `preflight_checks` ≠ `all_passed` | `proceed: false` (regra `ci-defense-in-depth.md`) |

> **Atenção:** quando `proceed: false`, **NÃO** criar plano nem iniciar
> trabalho. Devolver state-snapshot + gap_list ao humano/solicitante.

## §4. Cross-refs (quem consome o state-snapshot)

| Consumidor | Como consome |
|------------|--------------|
| `specialist-routing` (skill) | Lê `state-snapshot-<ts>.md` da pasta `.agents/runs/` se presente; injeta `context` adicional na matriz canônica. **Camada 1** (depois desta convenção = camada 0). |
| `agent-architect` | Recebe `state-snapshot` quando `gap_blocker: true` ou `gap_detected: true`. Avalia se lacuna exige novo agent (regra `evolucao-agents.md §Regra de Bloqueio por gap_detected`). |
| `orchestrator` (Skill Passo 1) | Consome state-snapshot como **primeiro input** antes de decompor feature/tarefa. |
| `monorepo-change.md` | Passo Pré-Planner atualiza para consumir state-snapshot antes do specialist-router (v1.8.0). |
| `backend-feature.md` | Idem. |
| `frontend-feature.md` | Idem. |
| `ci-defense-mode.md` | Idem. |
| `release-mode.md` | Idem. |
| `retrospective-mode.md` | Idem. |
| **Plan gerado** | Todo plano (em `docs/superpowers/plans/*.md`) **DEVE** referenciar o `state-snapshot-<ts>.md` da demanda no frontmatter. |

## §5. Relação com outras convenções

- [`evolucao-agents.md`](./evolucao-agents.md) — `gap_detected` é uma
  **instância canônica** de state-aware aplicada a catálogo de agents.
  Esta convenção generaliza para estado da aplicação.
- [`retrospective-capture.md`](./retrospective-capture.md) — captura
  **pós-atividade**; esta convenção é **pré-planning**. Retroalimentação:
  retro pode disparar update desta convenção (quando state-aware falhou).
- [`ci-defense-in-depth.md`](./ci-defense-in-depth.md) — preflight é uma
  **das categorias** do state-snapshot. Esta convenção adiciona
  categorias que o preflight não cobre (health endpoint, collector,
  OTel env vars).
- [`tamanho-e-revisao.md`](./tamanho-e-revisao.md) — limite de 300 linhas
  e regra de verificabilidade de claims numéricos aplicam-se a esta
  convenção.
- [`idioma.md`](./idioma.md) — pt-BR no body, inglês técnico permitido
  em identificadores (`name:` no frontmatter e `state-snapshot-*.md`).
- [`tdd.md`](./tdd.md) — agents que implementam mudanças após state-aware
  seguem Red→Green→Refactor.

## §6. Quando NÃO aplicar

- Typo fix / dep bump trivial / merge conflict resolution — não exigem
  state-snapshot formal (working tree limpo é o suficiente).
- Doc-only patches sem mudança de comportamento (a menos que a doc
  afirme claims verificáveis).
- Atividades triviais de housekeeping (mover arquivo, rename de symbol
  único).
- Planos **recebidos** pelo implementer (não confundir com plano
  **criado** pelo planner — só quem cria aplica esta convenção).

## §7. Exemplos de aplicação

### Exemplo 1: criação de demanda para implementar telemetria

```text
Demanda: "implementar telemetria OpenTelemetry"
Branch: feat/telemetria
Dia: 2026-09-23

→ Passo 1 executado: state-snapshot-20260923T200000Z.md gerado
→ gaps_detectados:
  - G-001 (blocker): OTel SDK ausente
  - G-002 (major): Frontend sem RUM
  - G-003 (major): Compose sem collector
→ gap_blocker: false (G-001 é blocker mas TEM plano de resolver)
→ proceed: true
→ Próximo passo: specialist-router (camada 1) recebe state-snapshot como contexto
  e despacha telemetry-specialist + nestjs-specialist + docker-specialist
  + nextjs-specialist para o plano multi-fase.
```

### Exemplo 2: demanda de bugfix trivial

```text
Demanda: "fix typo in apps/api/src/main.ts comment"
→ §6 dispensa state-snapshot formal (typo fix trivial).
→ Working tree limpo checado (1 comando shell, não arquivo formal).
→ patch aplicado + commit + push.
```

## §8. Cross-references

- Skill: [`.agents/skills/state-aware-planning/SKILL.md`](../skills/state-aware-planning/SKILL.md)
- Workflow: [`.agents/workflows/state-aware-planning.md`](../workflows/state-aware-planning.md)
- Memória: [`.agents/memory/state-aware-planning.md`](../memory/state-aware-planning.md)
- AGENTS.md §6 (índice de convenções)
- [`evolucao-agents.md`](./evolucao-agents.md) (regra `gap_detected`)
- [`retrospective-capture.md`](./retrospective-capture.md) (pós-atividade)
- [`ci-defense-in-depth.md`](./ci-defense-in-depth.md) (preflight = 1 categoria)
- [`tamanho-e-revisao.md`](./tamanho-e-revisao.md) (300 linhas + verificabilidade)

## §9. Histórico de Versões

| Versão | Data       | Mudança                                                                                                              |
|--------|------------|----------------------------------------------------------------------------------------------------------------------|
| 1.0    | 2026-09-23 | Lançamento inicial — convenção + skill + workflow + memory (camada 0 do pre-planner, gap analysis AS-IS→TO-BE canônico) |
