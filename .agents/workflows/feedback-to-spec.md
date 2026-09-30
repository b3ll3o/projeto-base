---
name: feedback-to-spec
version: 1.0
updated: 2026-09-30
description: "Fecha o Engineering Loop — pega proposals T1/T2/T3 com confidence ≥ 70 do retrospective-capture e estrutura a criação de specs filhas via state-aware-planning + specialist-router + template spec.md."
type: workflow
related:
  - ../specs/conventions/engineering-loop.md
  - ../specs/conventions/retrospective-capture.md
  - ../specs/conventions/state-aware-planning.md
  - ../specs/conventions/evolucao-agents.md
  - ../specs/templates/spec.md
  - ./retrospective-mode.md
  - ./archive-demand.md
trigger: "feedback to spec", "próxima spec de um finding", "loop fechado", "T1/T2/T3 → spec"
---

# Workflow: `feedback-to-spec`

> pt-BR: fecha o **Engineering Loop** pegando proposals de uma retro completa e estruturando a criação de **specs filhas** (próximas specs alimentadas por aprendizados).

## Inputs

```yaml
parent_spec: <NNN>-<feature-name>           # spec que gerou os learnings
retro_result_path: <path>                   # ex: .claude/projects/.../memory/b<N+1>-result.md
proposals:                                  # filtradas (confidence ≥ 70) — vêm do retro
  - id: P-001
    artifact: convention | skill | memory | adr | backlog | spec
    target: <path ou slug>
    confidence: 0..100
    content: <yaml>
```

## Quando usar

- ✅ Retro completa (`b<N+1>-result.md`) com ≥ 1 proposal `artifact: spec`
- ✅ Proposals com `confidence ≥ 70` (regra `retrospective-capture.md`)
- ❌ Proposals apenas de memory/ADR (não viram spec, mas viram updates atômicos)
- ❌ Proposals com confidence < 70 (voltam para o backlog como itens TASK)

## Composição

Sequential 5 estágios:

```text
RETRO RESULT ──► TRIAGE ──► STATE-AWARE ──► SPECIALIST-ROUTER ──► SPEC CREATION ──► LOOP CLOSE
   (input)       (filter)    (camada 0)      (camada 1)            (template)         (archive)
```

## Handoffs

### Estágio 1 — TRIAGE (filtrar proposals)

```yaml
input: retro_result_path
output: filtered_proposals[]
filter_rule: "proposals onde artifact == 'spec' AND confidence >= 70"
agent: task-manager
success_criteria: "≥ 1 proposal qualificada OU justificativa explícita 'loop não gera próxima spec'"
```

### Estágio 2 — STATE-AWARE (camada 0)

```yaml
input: filtered_proposals[] + parent_spec
output: state-snapshot-<ts>.md
agent: orchestrator
skill: state-aware-planning
success_criteria: |
  state-snapshot gerado, working_tree clean, schema_drift = none,
  preflight = all_passed. Se gap_blocker, ABORTAR workflow.
```

### Estágio 3 — SPECIALIST-ROUTER (camada 1)

```yaml
input: state-snapshot + filtered_proposals
output: .agents/runs/<ts>-specialist-<n>.yaml
agent: specialist-router
success_criteria: |
  specialists despachados em paralelo (não sequencial).
  Se gap_detected: true → dispatch agent-architect, ABORTAR e re-rodar.
```

### Estágio 4 — SPEC CREATION (template)

```yaml
input: state-snapshot + specialist-routing output
output: specs/<NNN+1>-<feature>/spec.md
template: ../specs/templates/spec.md
agent: nestjs-specialist | nextjs-specialist | monorepo-specialist (conforme router)
success_criteria: |
  spec.md preenchido via template, com BR-XXX, AC-XXX, Eval-XXX já mapeados.
  parent_spec referenciada em §11 Cross-refs.
  business-rules.md extraído se atende critério (engineering-loop.md §3).
```

### Estágio 5 — LOOP CLOSE

```yaml
input: nova spec criada + PR aberto
output: PR <#NNN+1> aberto + parent_spec marcada como "loop fechado"
actions:
  - "Abrir PR com spec nova + state-snapshot + specialist-routing YAML"
  - "Marcar parent_spec 06-learn.md §4 com link para spec filha"
  - "Atualizar task-manager backlog com TASK-NNN da nova spec"
  - "Após merge da spec filha: disparar retro (T1) → loop reinicia"
agent: task-manager + doc-writer
success_criteria: |
  PR aberto com cross-refs para parent_spec e retro_result.
  Parent_spec 06-learn.md §4 atualizada.
  Backlog contém item da spec filha.
```

## Quando NÃO usar

- Retro não tem proposals do tipo `spec` (apenas memory/convention/ADR)
- Proposals com confidence < 70 (voltam para backlog)
- Working tree dirty (state-snapshot aborta)
- gap_detected pelo specialist-router (criar specialist via agent-architect primeiro)

## Critérios de Done

- [ ] Stage 1: ≥ 1 proposal filtrada OU justificativa explícita
- [ ] Stage 2: state-snapshot-<ts>.md gerado, preflight verde
- [ ] Stage 3: specialist-routing YAML gerado, gap_detected = false
- [ ] Stage 4: spec.md filha criada via template, BR/AC/Eval mapeados
- [ ] Stage 5: PR aberto + parent_spec 06-learn.md §4 atualizada + backlog atualizado
- [ ] `pnpm ci:preflight` verde

## Cross-references

- Convenção unificadora: [`../specs/conventions/engineering-loop.md`](../specs/conventions/engineering-loop.md) §4
- Retro: [`../specs/conventions/retrospective-capture.md`](../specs/conventions/retrospective-capture.md)
- State-aware: [`../specs/conventions/state-aware-planning.md`](../specs/conventions/state-aware-planning.md)
- Specialist-router: [`../agents/specialist-router.md`](../agents/specialist-router.md)
- Spec template: [`../specs/templates/spec.md`](../specs/templates/spec.md)
- Workflows relacionados: [`./retrospective-mode.md`](./retrospective-mode.md), [`./archive-demand.md`](./archive-demand.md)
