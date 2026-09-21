# Integração: Cody (Sourcegraph)

> Parte de [`TEMPLATE_USAGE.md`](../TEMPLATE_USAGE.md). Configuração específica do Cody.

## Como o Cody Carrega

- `AGENTS.md` → reconhecido
- Custom commands via `.vscode/cody.json`

## Configuração Recomendada

```json
// .vscode/cody.json
{
  "cody.agentRecipes": {
    "code-review": {
      "prompt": "Veja .agents/agents/code-reviewer.md",
      "context": { "includeFiles": ["**/*.ts"] }
    }
  }
}
```

## Vantagens

- Code graph do Sourcegraph (entendimento profundo de código)
- Custom recipes via `.vscode/cody.json`
- Context retrieval automático

---

**Mantido por:** projeto-base contributors
