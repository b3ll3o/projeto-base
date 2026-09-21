# Integração: Aider

> Parte de [`TEMPLATE_USAGE.md`](../TEMPLATE_USAGE.md). Configuração específica do Aider.

## Como o Aider Carrega

- **Não** lê `AGENTS.md` automaticamente
- Use `--read` flag para incluir arquivos de contexto
- Convenção: `--read AGENTS.md`

## Configuração Recomendada

```bash
# Alias para incluir o template
alias aider='aider --read AGENTS.md --read .agents/WORKFLOWS.md'

# Ou em .aider.conf.yml
read:
  - AGENTS.md
  - .agents/WORKFLOWS.md
```

## Vantagens

- CLI-friendly — fácil de integrar em scripts e CI
- Suporta `--read` múltiplos arquivos
- Configuração via YAML versionada

## Limitações

- Não tem dispatch automático de subagents
- Coordenação multi-agent é manual (via prompt)

---

**Mantido por:** projeto-base contributors
