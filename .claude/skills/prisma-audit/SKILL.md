---
name: prisma-audit
description: "Processo determinístico de auditoria Prisma — mapeia schema/migrations/queries, valida lens DDD/H1-H6, detecta N+1, audita audit fields. Carregado por `prisma-db-specialist` quando a task é de auditoria (não criação). Use para scan periódico via `finding-orchestrator` ou revisão sob demanda."
---

# Skill `prisma-audit` — binding Claude Code

> **Wrapper.** A skill canônica, vendor-neutral, é a fonte única de verdade e vive em
> [`.agents/skills/prisma-audit/SKILL.md`](../../../.agents/skills/prisma-audit/SKILL.md).
>
> Este arquivo existe **apenas** para que o Claude Code descubra a skill em `.claude/skills/`.
> Ele não duplica conteúdo e não substitui a definição canônica.

## Protocolo de uso

1. **Leia o arquivo canônico acima como primeiro passo**, antes de qualquer decisão ou resposta.
2. Execute exatamente como ele descreve. Não resuma, não improvise, não aplique memória do Claude Code no lugar dele.
3. Os arquivos auxiliares referenciados pela skill canônica (`protocolos/`, `exemplos/`, tabelas de índice) são resolvidos **a partir do diretório canônico** (`.agents/skills/prisma-audit/`), nunca a partir deste wrapper.

## Procedência

| Papel | Caminho |
|---|---|
| Definição canônica (vendor-neutral) | `.agents/skills/prisma-audit/SKILL.md` |
| Binding Claude Code | `.claude/skills/prisma-audit/SKILL.md` (este arquivo) |
| Documentação | `docs/integrations/claude-code.md` |

---

**Mantido por:** projeto-base contributors
