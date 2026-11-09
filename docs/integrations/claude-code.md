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

Claude Code tem a ferramenta `Agent` que aceita `subagent_type`. Para usar os agents deste template, registre-os em `.claude/agents/` (Claude Code-specific) com um frontmatter que aponte para `.agents/agents/<nome>.md`.

O `name`, a `description` e o `tools` são copiados do frontmatter canônico como a **LINHA INTEIRA** — nunca re-serializados:

```markdown
<!-- .claude/agents/code-reviewer.md -->
---
name: code-reviewer
description: <a description do canônico, copiada LITERALMENTE>
tools: Read, Glob, Grep, Bash
---

Veja definição completa em: ../../.agents/agents/code-reviewer.md
```

⚠️ **Não re-serialize o YAML.** Reescrever a `description` (aspas que somem,
vírgula que entra, texto truncado) produz o mesmo valor com bytes diferentes,
e o Claude Code passa a descobrir o agent com o gatilho errado — sem erro
visível. O gate
[`check-binding-canonico`](../../.tooling/scripts/ci/check-binding-canonico.ts)
compara as linhas byte a byte e reprova a divergência.

A decisão completa (o que o wrapper declara, e por que a cobertura de agents é
parcial) está no
[ADR-0008](../adr/0008-camada-de-binding-do-claude-code.md).

## Skills

Claude Code carrega skills de `.claude/skills/` ou plugins. Para usar a skill `agents:coordinate` deste template, criar wrapper em `.claude/skills/agents-coordinate/SKILL.md` que aponta para a definição genérica em `.agents/skills/agents-coordinate/SKILL.md` — com `name` e `description` copiados literalmente do frontmatter canônico, pelo mesmo motivo dos agents.

---

**Mantido por:** projeto-base contributors
