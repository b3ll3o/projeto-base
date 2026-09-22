# Convenção: Retrospective Capture — Captura Estruturada de Aprendizados

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).
> pt-BR prose, English technical identifiers.

## Objetivo

Hoje aprendizados pós-atividade são capturados **de forma ad-hoc**:
- `b<N>-result.md` ao final de cada plano multi-task
- Memory files de agents via "decisões Tomadas"
- Nenhum gatilho automático, nenhum formato único

Este padrão institui um **processo explícito** com trigger conditions,
metodologia, e outputs reproduzíveis — sem overhead desproporcional
para tarefas triviais.

## Os 3 Triggers

| # | Tipo | Critério | Auto-detect |
|---|------|----------|-------------|
| **T1** | **Implementação grande** | Plano multi-task (≥ 3 tasks) ou feature com skill/agent novo | `git diff` × N files / N commits |
| **T2** | **Bugfix não-trivial** | Demorou > 30min OU exigiu > 2 rounds de review | review rounds counter |
| **T3** | **Adoção de novo padrão** | Primeiro uso de skill nova + memory marker | explicit flag em `<agent>-memory` |

**Exclusão:** typo fix, dep bump, merge conflict → não disparam.

## Composição (3 estágios)

```text
EXPLORER               →  RETROSPECTIVE-CAPTURE (skill)  →  DOC-WRITER
(coleta evidência)        (triangula + pontua)              (escreve result file)
                                                       +
                                            TASK-MANAGER (paralelo: backlog)
```

## As 3 Perguntas Obrigatórias (da skill)

1. **O que funcionou e DEVE virar regra?** → patterns discovered
2. **O que atrapalhou e DEVE virar anti-pattern?** → friction sources
3. **O que ficou ambíguo e DEVE virar ADR/memory?** → implicit knowledge

## Formato de Saída: `decision-list`

```yaml
- id: R-001
  artifact: "skill|convention|memory|adr|backlog"
  target: ".agents/path/file.md"   # path alvo
  content: |
    Conteúdo proposto (yaml/markdown/skills/ADR body).
  confidence: 0..100                # >= 70 vira proposal
  justification: |
    Por que isso é valioso (referência ao evento que motivou).
  action: "create|update|comment"
```

## Threshold de Confidence

| Faixa | Ação |
|-------|------|
| **≥ 70** | Proposal → vira memory update OR skill/convention new OR ADR OR backlog item |
| **50–69** | Comentário no result file (registrar; re-avaliar em próximas sessões) |
| **< 50**  | Descartar (ruído) |

Heurística de scoring:
- **Repetição** (pattern apareceu 1× ou N×?) — peso alto
- **Impacto** (quantas próximas tasks seriam afetadas?) — peso alto
- **Clareza** (sabemos exatamente onde aplicar?) — peso médio

## Onde fica cada output

| Output | Localização | Tipo |
|--------|-------------|------|
| Result file | `<memory-dir>/b<N>+1-result.md` | narrativa + linked memories |
| Memory updates | `.agents/memory/<agent>.md` | diff em "Decisões Tomadas" |
| Skill/convention new | `.agents/skills/`, `.agents/specs/conventions/` | PR `feat(retrospective)` |
| ADR | `.docs/adr/NNNN-*.md` | PR com reviewer de arquitetura |
| Backlog item | `TASK-NNN` em quadro do `task-manager` | item priorizado RICE |

## Comandos / Triggers

```bash
# Manual dispatch
"capture learnings from this work"
"retrospective on <task-id>"
"post-mortem from b<N>"

# Auto (futuro)
# - husky post-commit com diff size > N
# - workflow `review-and-fix-after-each-task` quando review foi ≥ 2 rounds
```

## Quando NÃO aplicar

- Typo fix / dep bump / merge conflict
- Doc-only patches sem decisão arquitetural
- Quando o plano ainda está em curso (executar retrospectiva quando
  review+fix já foi aprovado)
- Como substituto para `task-mode` (gestão de backlog sem retrospectiva)

## Cross-references

- Skill: [`.agents/skills/retrospective-capture/SKILL.md`](../../skills/retrospective-capture/SKILL.md)
- Workflow: [`.agents/workflows/retrospective-mode.md`](../../workflows/retrospective-mode.md)
- Memória da skill: [`.agents/skills/retrospective-capture/MEMORY.md`](../../skills/retrospective-capture/MEMORY.md)
- Convenção relacionada: [`.agents/specs/conventions/agent-evolution-and-memory.md`](./agent-evolution-and-memory.md) (como memories são mantidas)
- Regra de tamanho: [`.agents/specs/conventions/tamanho-e-revisao.md`](./tamanho-e-revisao.md)
- AGENTS.md §6 (índice de convenções)
