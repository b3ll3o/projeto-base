# Integração: Cursor

> Parte de [`TEMPLATE_USAGE.md`](../TEMPLATE_USAGE.md). Configuração específica do Cursor.

## Como o Cursor Carrega

- `AGENTS.md` na raiz → reconhecido como regras do projeto
- `.cursorrules` (legacy) → ainda suportado, mas `AGENTS.md` é preferido
- Suporta `.agents/agents/*.md` via custom slash commands

## Configuração Recomendada

```bash
# .cursorrules (opcional, legado)
# Aponta para o padrão genérico
echo "Veja AGENTS.md para regras de agents" > .cursorrules

# Custom commands em .cursor/commands/
mkdir -p .cursor/commands/
# Cada command referencia um agent via prompt
```

## Exemplo de Slash Command

```markdown
<!-- .cursor/commands/code-review.md -->
---
name: code-review
description: Generic code review
---

Você é o agent `code-reviewer` definido em `.agents/agents/code-reviewer.md`.
Revise o código atual e retorne findings conforme schema definido lá.
```

---

**Mantido por:** projeto-base contributors
