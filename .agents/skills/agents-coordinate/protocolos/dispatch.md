# §1. Protocolo de Handoff

> Parte da skill [`agents:coordinate`](../SKILL.md). Define o schema canônico que todo agent DEVE seguir ao despachar.

## Schema Canônico

**Todo despacho entre agents DEVE usar este formato:**

```yaml
dispatch:
  from: <agent-origem>          # Quem está chamando
  to: <agent-destino>           # Quem está sendo chamado
  composition: sequential | parallel | hierarchical

  task:                         # O que fazer (uma frase imperativa)
    description: "..."

  context:                      # Compor o que é relevante
    files: [...]
    code_snippets: [...]
    prior_outputs: [...]         # Resultados de agents anteriores na cadeia
    constraints: [...]

  expected_output:              # Como o resultado deve vir
    format: "yaml" | "json" | "markdown" | "structured_text"
    schema: {...}               # Se houver schema, validar contra ele

  success_criteria:             # Como saber se foi bem-sucedido
    - "Critério objetivo 1"
    - "Critério objetivo 2"

  on_failure:                   # O que fazer se falhar
    fallback_agent: <nome> | null
    retry_policy: "none" | "once" | "until_success"
    max_retries: 0..3
```

## Exemplo Real

```yaml
dispatch:
  from: orchestrator
  to: explorer
  composition: sequential

  task:
    description: "Mapear módulo de autenticação e identificar padrões para feature de OAuth2"

  context:
    files:
      - src/auth/
      - src/middleware/auth.middleware.ts
    code_snippets: []
    prior_outputs: []
    constraints:
      - "Não modificar arquivos (read-only)"
      - "Limitar busca a src/auth/ e docs/"

  expected_output:
    format: "markdown"
    schema:
      sections: ["architecture", "entry_points", "patterns", "extension_points"]

  success_criteria:
    - "Lista de ≥ 3 entry points"
    - "Padrões arquiteturais identificados com exemplos de código"
    - "Pontos de extensão marcados como tal"

  on_failure:
    fallback_agent: null
    retry_policy: "once"
    max_retries: 1
```

## Campos Estáveis

Os campos abaixo são **estáveis** desde a v1.0.0 — mudanças incompatíveis exigem major bump:

- `dispatch.from`, `dispatch.to`, `dispatch.composition`
- `dispatch.task.description`
- `dispatch.context.{files,code_snippets,prior_outputs,constraints}`
- `dispatch.expected_output.{format,schema}`
- `dispatch.success_criteria[]`
- `dispatch.on_failure.{fallback_agent,retry_policy,max_retries}`

---

**Ver também:** [Índice da skill `agents:coordinate`](../SKILL.md)
