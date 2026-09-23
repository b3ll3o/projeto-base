# Workflow: `state-aware-planning` — Snapshot Pré-Planner

> Workflow reutilizável para gerar `state-snapshot-<ts>.md` antes de
> criar um plano. Detalhes completos em
> [`.agents/specs/conventions/state-aware-planning.md`](../specs/conventions/state-aware-planning.md)
> e skill [`.agents/skills/state-aware-planning/SKILL.md`](../skills/state-aware-planning/SKILL.md).

---

## Trigger

- "planejar", "criar plano", "state-aware", "snapshot antes de planejar"
- Antes de qualquer demanda com escopo técnico definido (regra
  `evolucao-agents.md`)
- Em auditoria periódica (1×/sprint pelo `agent-architect`)
- Antes de bump de versão do template (workflow `release-mode`)

## Quando usar

| Trigger type | Critério |
|--------------|----------|
| **Plano novo** | Demanda com escopo técnico definido (qualquer task exceto housekeeping trivial ou doc-only) |
| **Multi-stack** | Plano que toca `apps/api/**` + `apps/web/**` + `infra/**` (cobre collection cruzada) |
| **Migração / breaking change** | Qualquer mudança estrutural exige state-snapshot formal |
| **Auditoria** | Revisão trimestral do template ou antes de bump major |
| **Avaliação de risco** | Antes de aprovar demanda com escopo incerto |

**Não dispara** para: typo fix, dep bump trivial, merge conflict
resolution, doc-only patch sem claims verificáveis (regra §6 da
convenção).

## Composição

Sequential 3 estágios:

```text
STATE-AWARE-PLANNING (coleta state)  →  ANALYZE (compor snapshot)  →  DECIDE (proceed/block)
```

Em paralelo ao estágio final, [AGENT-ARCHITECT] preparado para ser
despachado se `gap_blocker: true`.

## Handoffs

```yaml
state-aware-planning → analyze (inline):
  task: "Consolidar outputs em state-snapshot-<ts>.md conforme frontmatter canônico"
  context:
    - "arquivos .agents/runs/<TS>-*.txt (working tree, branch, deps, preflight, health, etc.)"
    - "schema do frontmatter definido na convenção §3 Passo 2"
  expected_output:
    state_snapshot_path: ".agents/runs/state-snapshot-<TS>.md"
    frontmatter_valid: true
    body_lines_max: 30
  success_criteria: "0 secrets vazados; todos gaps com id único; gap_blocker consistente"

analyze → decide:
  task: "Aplicar tabela §3 Passo 3 da convenção"
  context: ["frontmatter do state-snapshot", "working_tree status"]
  expected_output:
    decision: proceed | block
    next_step_hint: ["specialist-router", "agent-architect"]
  success_criteria: "0 falsos positivos em proceed; 0 falsos negativos em block"

decide + agent-architect (parallel se gap_blocker:true):
  task: "Validar lacuna detectada como blocker"
  context: ["state-snapshot", "lista gaps_detectados"]
  expected_output:
    agent_architect_validation: "accepted | refuted | partial"
    proposed_actions: ["create new agent", "evolve existing", "close gap manually"]
  success_criteria: "agent-architect devolve proposta dentro de 90s"
```

### Passo Pré-Planner: Despachar state-aware-planning

**Este workflow DEVE rodar como Passo 0** (antes do Passo 1 do
`specialist-routing`) em qualquer demanda com escopo técnico:

1. Validar inputs (skill `state-aware-planning` Sub-passo 1)
2. Despachar a skill `state-aware-planning` via Agent tool (ou inlining)
3. Aguardar `.agents/runs/state-snapshot-<TS>.md`
4. Validar frontmatter canônico (skill Sub-passo 7)
5. **Se `proceed: true`** → prosseguir para Passo 1 do `specialist-routing`
6. **Se `block: <motivo>`** → devolver ao humano/solicitante
7. **Se `gap_blocker: true` (mas proceed solicitado por humano)** →
   despachar `agent-architect` em paralelo

### Passo Pós-Snapshot: Despachar specialist-router (camada 1)

Após state-snapshot gerado e `proceed: true`:

1. Validar snapshot existe e tem frontmatter válido
2. Despachar `specialist-router` (skill
   `.agents/skills/specialist-routing/SKILL.md`) com
   `state_snapshot_path` no contexto
3. Aguardar output em `.agents/runs/<ts>-specialist-<n>.yaml`
4. Triage conforme skill Passo 5 (gap_detected → agent-architect)
5. Prosseguir com planning (`writing-plans` skill)

## Quando NÃO usar

- Atividades triviais (typo, dep bump, merge conflict) — §6 da
  convenção dispensa
- Quando o plano já está em curso (state-snapshot fica desatualizado
  rápido durante execução)
- Em ciclo de hotfix urgente (`bugfix-mode` dispensa)
- Como substituto para `explore-mode` (state-snapshot é
  **mecânico/comandos shell**; explore é **análise semântica de
  código**)

## Critérios de Done

- [ ] State-snapshot escrito em `.agents/runs/state-snapshot-<TS>.md`
      com frontmatter canônico + body ≤ 30 linhas
- [ ] Todos os arquivos `.agents/runs/<TS>-*.txt` commitados (ou
      `.gitignore` documentado para os que contêm dados sensíveis)
- [ ] `gap_blocker` consistente com `severity` dos gaps_detectados
- [ ] Decisão retornada: `proceed | block` com motivo legível
- [ ] Próximo passo (camada 1) iniciado ou `agent-architect`
      despachado em paralelo
- [ ] `pnpm ci:preflight` passa (cross-refs em `.agents/`)
- [ ] Memory do `specialist-router` atualizado com referência ao
      state-snapshot consumido (lição aprendida opcional)

## Cross-references

- [`.agents/specs/conventions/state-aware-planning.md`](../specs/conventions/state-aware-planning.md) — spec canônica
- [`.agents/skills/state-aware-planning/SKILL.md`](../skills/state-aware-planning/SKILL.md) — skill metodologia
- [`.agents/memory/state-aware-planning.md`](../memory/state-aware-planning.md) — memória
- [`.agents/specs/conventions/evolucao-agents.md`](../specs/conventions/evolucao-agents.md) — `gap_detected` é instância de state-aware
- [`.agents/specs/conventions/ci-defense-in-depth.md`](../specs/conventions/ci-defense-in-depth.md) — preflight = 1 categoria
- [`.agents/skills/specialist-routing/SKILL.md`](../skills/specialist-routing/SKILL.md) — camada 1 (consumidora)
- [`.agents/WORKFLOWS.md`](../WORKFLOWS.md) (este workflow aparece na tabela de Genéricos)
