# Integração: Continue (VS Code / JetBrains)

> Parte de [`TEMPLATE_USAGE.md`](../TEMPLATE_USAGE.md). Configuração específica do Continue.

## Como o Continue Carrega

- `AGENTS.md` → reconhecido em algumas versões
- Custom providers em `.continue/`
- Slash commands customizados

## Configuração Recomendada

```json
// .continue/config.json
{
  "experimental": {
    "modelContextProtocolServers": []
  },
  "slashCommands": [
    {
      "name": "code-review",
      "description": "Generic code review",
      "prompt": "Veja .agents/agents/code-reviewer.md"
    }
  ]
}
```

## Vantagens

- Suporta MCP (Model Context Protocol)
- Funciona em VS Code e JetBrains
- Custom providers via config JSON

---

**Mantido por:** projeto-base contributors
