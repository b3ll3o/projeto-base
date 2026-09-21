# §7. Exemplo Completo: `feature-mode`

> Parte da skill [`agents:coordinate`](../SKILL.md). Workflow real end-to-end usando o protocolo.

```yaml
# Workflow: feature-mode
composition: sequential

pipeline:
  - agent: orchestrator
    dispatch:
      task:
        description: "Decomp feature 'pagamento via PIX' em sub-tasks"
      context:
        files: [".openspec/changes/pix-pagamento/proposal.md"]
      expected_output:
        format: "yaml"
        schema:
          subtasks: [{ id, agent, dispatch }]
      success_criteria:
        - "Cada sub-task mapeia para um agent do catálogo"
        - "Sub-tasks cobrem: exploração, testes, implementação, review"

  - agent: explorer
    dispatch:
      task:
        description: "Mapear módulo de pagamento existente"
      context:
        prior_outputs: ["$orchestrator.subtasks[explorer]"]
      expected_output:
        format: "markdown"
      success_criteria:
        - "≥ 3 padrões arquiteturais identificados"

  - agent: test-writer
    dispatch:
      task:
        description: "Escrever testes PIX (TDD red)"
      context:
        prior_outputs: ["$orchestrator.subtasks[test-writer]", "$explorer.output"]
      expected_output:
        format: "yaml"
        schema:
          test_files: [...]
          coverage_target: 80
      success_criteria:
        - "Testes falham antes da implementação"
        - "Coverage target documentado"

  - agent: code-reviewer
    dispatch:
      task:
        description: "Revisar implementação PIX + testes"
      context:
        prior_outputs: ["$explorer.output", "$test-writer.output"]
        files: [<diff completo>]
      expected_output:
        format: "yaml"
        schema:
          approved: bool
          findings: [...]
      success_criteria:
        - "Nenhum finding blocker"
        - "Coverage ≥ 80%"

  - merge_strategy:
      type: "all_success"
      description: "Workflow só é considerado completo se TODOS os estágios passaram"
```

## Fluxo Visual

```
┌──────────────┐
│ ORCHESTRATOR │ Decompõe feature
└──────┬───────┘
       ▼
┌──────────────┐
│   EXPLORER   │ Mapeia código existente
└──────┬───────┘
       ▼
┌──────────────┐
│ TEST-WRITER  │ Escreve testes (TDD red)
└──────┬───────┘
       ▼
┌──────────────┐
│ CODE-REVIEWER│ Aprova ou rejeita (gating)
└──────────────┘
```

## Variações

- **bugfix-mode**: mesma pipeline, mas o `test-writer` escreve teste de regressão
- **refactor-mode**: pula `orchestrator`, começa com `refactorer`
- **security-mode**: substitui `explorer` por `security-auditor`

---

**Ver também:** [Índice da skill `agents:coordinate`](../SKILL.md) · [Workflows genéricos](../../../../WORKFLOWS.md)
