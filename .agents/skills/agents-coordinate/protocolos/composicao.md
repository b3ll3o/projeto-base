# §3. Modos de Composição

> Parte da skill [`agents:coordinate`](../SKILL.md). Define os 3 modos suportados: sequential, parallel, hierarchical.

## 3.1 Sequential (`A → B → C`)

```yaml
composition: sequential

pipeline:
  - agent: A
    dispatch: { ... }

  - agent: B
    dispatch:
      context:
        prior_outputs: ["$A.result"]    # Referência ao output anterior
      ...

  - agent: C
    dispatch:
      context:
        prior_outputs: ["$A.result", "$B.result"]
      ...
```

**Quando usar:** quando cada estágio depende do anterior.

**Exemplo:** `explorer → test-writer → code-reviewer`

## 3.2 Parallel (`A, B, C → merge`)

```yaml
composition: parallel

agents:
  - { agent: A, dispatch: { ... } }
  - { agent: B, dispatch: { ... } }
  - { agent: C, dispatch: { ... } }

merge_strategy:
  type: "collect_all" | "vote" | "first_success" | "merge_by_field"
  config:
    field: "findings"               # Para merge_by_field
    vote_threshold: 2               # Para vote
```

**Quando usar:** quando vários agents podem trabalhar independentemente.

**Exemplo:** `security-auditor || performance-auditor || code-reviewer` (auditoria paralela)

## 3.3 Hierarchical (`orchestrator → specialists`)

```yaml
composition: hierarchical

orchestrator: <agent>

specialists:
  - <agent-a>
  - <agent-b>
  - <agent-c>

routing:
  - if: <condição>
    dispatch_to: <agent-a>
  - if: <condição>
    dispatch_to: <agent-b>
  - default: <agent-c>
```

**Quando usar:** quando a tarefa tem sub-decisões que dependem do tipo de input.

**Exemplo:** `orchestrator` que decide entre `refactorer` vs `bugfix-mode` baseado no input.

## Comparação Rápida

| Modo | Dependência | Latência | Uso típico |
|------|-------------|----------|------------|
| Sequential | Cada stage depende do anterior | Soma dos stages | feature-mode, bugfix-mode |
| Parallel | Stages independentes | Stage mais lento | Auditoria multi-lens |
| Hierarchical | Orchestrator decide | 1 stage + sub-workflow | Tarefas com sub-decisões |

---

**Ver também:** [Índice da skill `agents:coordinate`](../SKILL.md)
