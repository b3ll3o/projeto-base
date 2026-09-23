---
name: specialist-routing
description: Workflow completo para o controller invocar o specialist-router antes do planning. Cobre inputs, dispatch, interpretação do output, tratamento de gap_detected, integração com writing-plans. Use em qualquer demanda com escopo técnico definido.
---

# Skill: specialist-routing

> Quando invocar: ao receber demanda nova com escopo técnico definido, **antes** de planning.

## Inputs necessários (do controller)

```yaml
task:
  description: "<demanda do usuário em texto livre>"
  scope: "feat|fix|refactor|infra|security|docs|test|perf"   # opcional, inferido por heurística

context:
  paths: ["apps/api/**", "apps/web/**"]    # paths inferidos (opcional)
  branch: { base: "main", head: "feat/..." }  # opcional, para audit retroativo

expected_output:
  format: yaml
  schema:
    classification: { scope, domains_detected, matrix_version }
    specialists_dispatched: [...]
    plans_aggregated: { unified_plan: { steps: [...] } }
    gap_detected: bool
    suggested_specialist: "<string>"   # presente apenas se gap_detected=true
    next_steps: [...]

success_criteria:
  - "Router classificou de forma determinística (mesma demanda + mesma matriz → mesmo output)"
  - "Specialists despachados em paralelo (não sequencial)"
  - "Se gap_detected=true, controller NÃO prossegue para planning; despacha agent-architect"
  - "Output YAML em .agents/runs/<ts>-specialist-<n>.yaml"
```

## Passo 1: Pre-dispatch checks (controller)

```bash
# Working tree limpo?
git status --porcelain

# Matriz canônica existe?
test -f .agents/specs/conventions/specialist-routing.md

# Agent existe?
test -f .agents/agents/specialist-router.md

# Convenção de bloqueio por gap existe?
test -f .agents/specs/conventions/evolucao-agents.md
```

Se qualquer check falhar, abortar antes de chamar router.

## Passo 2: Escrever temp files + Despachar router

```bash
# Capturar demanda e paths inferidos
echo "<demand text>" > .agents/runs/<ts>-demand.txt
echo "<paths inferred>" > .agents/runs/<ts>-paths.txt
```

```typescript
Agent(
  agent="specialist-router",
  prompt={task + context + temp file paths}
)
```

## Passo 3: Interpretar output

Ler `.agents/runs/<ts>-specialist-<n>.yaml`. Validar schema:

- `classification.matrix_version` presente (rastreabilidade)
- `specialists_dispatched[]` não-vazio **OU** `gap_detected: true` (com `suggested_specialist`)
- `plans_aggregated.unified_plan.steps[]` presente quando specialists despachados
- `next_steps[]` sempre presente

## Passo 4: Triage (controller)

- Se `gap_detected: true` → **BLOQUEAR** planning; ir para Passo 5
- Se `specialists_dispatched` ≥ 1 e `gap_detected: false` → prosseguir para Passo 6
- Se router retornou erro (output ausente ou schema inválido) → re-despachar 1x; se persistir, escalar

## Passo 5: Tratar gap_detected

```yaml
gap_task:
  scope: large
  description: "Criar specialist <suggested_specialist> via agent-architect"
  rationale: "<classification.domains_detected + top keyword cluster>"
  trigger: "specialist-router gap_detected run <ts>-specialist-<n>"
```

Após agent-architect DONE, **re-despachar router** com a nova matriz.

## Passo 6: Integrar com writing-plans

```yaml
writing_plans_input:
  scope: medium|large
  description: "<demanda original>"
  plans_aggregated: "<lido de .agents/runs/<ts>-specialist-<n>.yaml>"
  specialists_dispatched: [...]   # para atribuir ownership por step
```

Prosseguir com o fluxo normal `subagent-driven-development` (writing-plans → orchestrator).

## Anti-padrões

- ❌ Pular router e planificar direto (perde orquestração multi-domínio)
- ❌ Prosseguir com `gap_detected: true` sem despachar agent-architect (viola `evolucao-agents.md`)
- ❌ Despachar implementer antes do router (gera trabalho sem owners atribuídos)
- ❌ Modificar matriz fora de PR (perde versionamento + auditoria)

## Cross-refs

- [`.agents/agents/specialist-router.md`](../../agents/specialist-router.md)
- [`.agents/specs/conventions/specialist-routing.md`](../../specs/conventions/specialist-routing.md) — matriz canônica (Task 3)
- [`.agents/memory/specialist-router.md`](../../memory/specialist-router.md)
- [`.agents/WORKFLOWS.md`](../../WORKFLOWS.md) §specialist-routing
- [`.agents/specs/conventions/evolucao-agents.md`](../../specs/conventions/evolucao-agents.md) — Regra de Bloqueio por gap_detected (Task 7)