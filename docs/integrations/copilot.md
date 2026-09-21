# Integração: GitHub Copilot Workspace / Chat

> Parte de [`TEMPLATE_USAGE.md`](../TEMPLATE_USAGE.md). Configuração específica do GitHub Copilot.

## Como o Copilot Carrega

- `AGENTS.md` → reconhecido como instruções do repositório
- Path-specific instructions via `.github/copilot-instructions.md`

## Configuração Recomendada

```bash
# .github/copilot-instructions.md
# Aponta para o padrão genérico
echo "Siga AGENTS.md para coordenação de agents" > .github/copilot-instructions.md
```

## Vantagens

- Nativo em GitHub — funciona em PRs, issues, codespaces
- Path-specific instructions (regras por diretório)
- Suporta custom instructions por usuário

---

**Mantido por:** projeto-base contributors
