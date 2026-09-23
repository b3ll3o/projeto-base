# Workflow: `specialist-routing` — Orquestrador de Demanda Pré-Planning

> Classifica demanda (keywords + paths + scope) via matriz canônica e despacha specialists em paralelo.
> Detalhes em `.agents/specs/conventions/specialist-routing.md` e `.agents/specs/conventions/evolucao-agents.md`.

**Trigger:** Demanda com escopo técnico definido (qualquer task exceto housekeeping trivial ou documentação isolada).

**Composição:** sequential (1 estágio: router → controller decide planejar ou bloquear)

## Agentes Encadeados

```text
┌──────────────────────┐
│   SPECIALIST-ROUTER  │  Classifica demanda + despacha specialists
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  CONTROLLER (humano) │  Decide planejar ou bloquear (gap_detected)
└──────────────────────┘
```

## Inputs

```yaml
task:
  description: <texto da demanda>
  scope: <feat|fix|refactor|infra|security|docs|test|perf>
context:
  paths: <paths inferidos>
  branch: <branch atual>
expected_output:
  classification: { paths: [...], keywords: [...], scope: ... }
  specialists_dispatched: [<lista de specialists>]
  plans_aggregated: [...]
  gap_detected: <bool>
  suggested_specialist: <string|null>
success_criteria:
  - classification tem ≥1 signal (path/keyword/scope)
  - specialists_dispatched tem ≥1 specialist OU gap_detected: true
```

## Outputs

```yaml
classification: { ... }
specialists_dispatched: [monorepo-specialist, ...]
plans_aggregated: [...]   # quando ≥1 specialist gera plano
gap_detected: false
suggested_specialist: null
next_steps:
  - Se gap_detected: dispatch agent-architect para criar specialist
  - Senão: integrar plans_aggregated com writing-plans
```

## Comportamento

1. Pre-dispatch checks (matriz canônica, agent, convenção evolucao-agents)
2. Escrever temp files (`.agents/runs/<ts>-demand.txt` + `<ts>-paths.txt`)
3. Despachar `specialist-router` via Agent tool
4. Interpretar `.agents/runs/<ts>-specialist-<n>.yaml`
5. Triage: se gap_detected → dispatch agent-architect; senão prosseguir
6. Integrar plans_aggregated com writing-plans

## Quando usar

- Demanda com escopo técnico definido (feature nova, fix, refactor, infra, security, docs estruturais, test, perf)
- Demanda ambígua onde o controller precisa identificar quais specialists consultar
- Quando `orchestrator` reporta "no agent matches this task" (gap check explícito)
- Para validar que o catálogo de agents cobre a demanda antes de planejar
- Quando há múltiplos workflows aplicáveis e é preciso decidir qual
- Auditoria retroativa de demandas anteriores (passar `--demand` específico)

## Quando NÃO usar

- Demandas triviais sem escopo técnico (ex.: "como abro o terminal?") — responder diretamente
- Demandas já roteadas por outro agent (ex.: `review-router` pós-task) — evitar duplicação
- Demandas meta sobre o sistema de agents (ex.: "como funciona o router?") — responder diretamente
- Implementação técnica direta (use specialist técnico após roteamento)
- Housekeeping trivial (renomear arquivo, bump de dep sem impacto) — avançar direto
- Documentação isolada (1 parágrafo em README, 1 ADR curto) — sem necessidade de roteamento

## Critérios de Done

- `classification` retornou ≥1 signal (path/keyword/scope)
- `specialists_dispatched` tem ≥1 specialist **OU** `gap_detected: true` com `suggested_specialist` preenchido
- Se `gap_detected`: `agent-architect` foi despachado e retornou plano para criar o specialist
- Se plano: `plans_aggregated` foi integrado com a skill `writing-plans`
- Output YAML em `.agents/runs/<ts>-specialist-<n>.yaml` foi commitado no run-dir

## Cross-references

- Skill: [`.agents/skills/specialist-routing/SKILL.md`](../skills/specialist-routing/SKILL.md) — workflow completo do controller (passos Passo 1 a Passo 6)
- Agent: [`.agents/agents/specialist-router.md`](../agents/specialist-router.md) — definição do agent (papel, quando invocar, quando NÃO invocar)
- Spec (matriz canônica): [`.agents/specs/conventions/specialist-routing.md`](../specs/conventions/specialist-routing.md) — `PATH_GLOBS`, `DEMAND_KEYWORDS`, `DEMAND_SCOPES`, `SKIP_HEURISTICS`
- Memória: [`.agents/memory/specialist-router.md`](../memory/specialist-router.md) — aprendizados acumulados
- Convenção gap_detected: [`.agents/specs/conventions/evolucao-agents.md`](../specs/conventions/evolucao-agents.md) — regra de evolução de catálogo
- Catálogo: [`.agents/WORKFLOWS.md`](../WORKFLOWS.md) — entrada do workflow

---

**Mantido por:** projeto-base contributors
