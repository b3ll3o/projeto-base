# Integração: Cline / Roo Code (VS Code)

> Parte de [`TEMPLATE_USAGE.md`](../TEMPLATE_USAGE.md). Configuração específica do Cline/Roo Code.

## Como o Cline Carrega

- `.clinerules` (legacy) ou `AGENTS.md` na raiz
- Custom instructions via UI

## Configuração Recomendada

```bash
# Cline lê .clinerules automaticamente
echo "Veja AGENTS.md" > .clinerules
```

## Vantagens

- Interface visual integrada ao VS Code
- Suporta diff inline
- Modo plan vs act (separação entre raciocínio e execução)

---

**Mantido por:** projeto-base contributors
