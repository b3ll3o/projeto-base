---
name: documentation-audit
description: "Processo determinístico de auditoria de documentação — inventaria os docs versionados, mede a cobertura (unidade de código → doc canônico), detecta drift de claims (versões, comandos, paths) e freshness, e emite findings canônicos. Carregado por `documentation-specialist` quando a task é de auditoria (não escrita). Use para scan periódico, pré-release ou revisão sob demanda."
---

# Skill `documentation-audit` — binding Claude Code

> **Wrapper.** A skill canônica, vendor-neutral, é a fonte única de verdade e vive em
> [`.agents/skills/documentation-audit/SKILL.md`](../../../.agents/skills/documentation-audit/SKILL.md).
>
> Este arquivo existe **apenas** para que o Claude Code descubra a skill em
> `.claude/skills/`. Ele não duplica conteúdo e não substitui a definição
> canônica.

## Procedência

| Papel | Caminho |
|---|---|
| Definição canônica (vendor-neutral) | `.agents/skills/documentation-audit/SKILL.md` |
| Binding Claude Code | `.claude/skills/documentation-audit/SKILL.md` (este arquivo) |
| Agent que a carrega | `.agents/agents/documentation-specialist.md` |
| Convenção | `.agents/specs/conventions/documentacao.md` |

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
