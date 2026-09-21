# §4. Outputs Estruturados

> Parte da skill [`agents:coordinate`](../SKILL.md). Define o formato canônico que todo agent DEVE retornar.

## Schema de Retorno

Todo agent DEVE retornar seu resultado neste formato:

```yaml
result:
  agent: <nome-do-agent>
  task_id: <id-do-dispatch>
  status: success | partial | failure

  output:
    <conteúdo no formato esperado>

  metadata:
    started_at: <ISO-8601>
    finished_at: <ISO-8601>
    files_touched: [...]
    files_read: [...]

  findings:                      # Se aplicável
    - severity: blocker | major | minor | info
      category: bug | smell | security | perf | testability | style
      description: "..."
      location: { file, line }
      recommendation: "..."

  next_steps:                    # Sugestões para o dispatch
    - "Recomendar dispatch para X com Y"
```

## Severidades (Findings)

| Severidade | Significado | Bloqueio |
|------------|-------------|----------|
| `blocker` | Impede merge ou release | Sim — gating absoluto |
| `major` | Requer atenção antes do próximo marco | Sim (recomendado) |
| `minor` | Melhoria recomendada | Não |
| `info` | Observação neutra | Não |

## Categorias (Findings)

- `bug` — comportamento incorreto, edge case não tratado
- `smell` — design ruim, complexidade, naming
- `security` — vulnerabilidade, validação faltando
- `perf` — complexidade algorítmica, memory leak, queries N+1
- `testability` — cobertura baixa, teste frágil
- `style` — convenção violada, formatação

---

**Ver também:** [Índice da skill `agents:coordinate`](../SKILL.md)
