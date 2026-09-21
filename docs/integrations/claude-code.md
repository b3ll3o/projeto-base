# Integração: Claude Code

> Parte de [`TEMPLATE_USAGE.md`](../TEMPLATE_USAGE.md). Configuração específica do Claude Code.

## Como o Claude Code Carrega

- `AGENTS.md` na raiz → carregado automaticamente como contexto do agent principal
- `CLAUDE.md` na raiz → também carregado (alias para Claude Code)
- Subdiretórios `AGENTS.md` ou `CLAUDE.md` → carregados sob demanda quando relevantes

## Configuração Recomendada

```bash
# 1. Estrutura final do projeto
meu-projeto/
├── AGENTS.md                    # Spec genérica (este template)
├── CLAUDE.md                    # Opcional: regras específicas do Claude Code
├── .agents/
│   ├── agents/*.md              # Agents customizados
│   ├── skills/                  # Skills compartilhadas
│   └── WORKFLOWS.md
└── CLAUDE.local.md              # Regras locais (gitignored)

# 2. CLAUDE.md pode referenciar AGENTS.md
echo "Veja regras canônicas em AGENTS.md" > CLAUDE.md
```

## Dispatch de Subagents

Claude Code tem a ferramenta `Agent` que aceita `subagent_type`. Para usar os agents deste template, registre-os em `.claude/agents/` (Claude Code-specific) com um frontmatter que aponte para `.agents/agents/<nome>.md`:

```markdown
<!-- .claude/agents/code-reviewer.md -->
---
name: code-reviewer
description: Generic code reviewer (from .agents/agents/code-reviewer.md)
---

Veja definição completa em: ../agents/code-reviewer.md
```

## Skills

Claude Code carrega skills de `.claude/skills/` ou plugins. Para usar a skill `agents:coordinate` deste template, criar wrapper em `.claude/skills/agents-coordinate/SKILL.md` que aponta para a definição genérica em `.agents/skills/agents-coordinate/SKILL.md`.

---

**Mantido por:** projeto-base contributors
