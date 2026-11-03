---
name: handoff
description: "Compacta a conversa em um documento de passagem para o próximo agent — segue o formato canônico de task/context/expected_output/success_criteria da skill agents-coordinate, aponta (em vez de copiar) os artefatos que já existem e redige credencial. Adaptado de mattpocock/skills (MIT). Use quando a sessão for encerrar e outro agent (ou outra sessão) for continuar o trabalho."
---

# Skill `handoff` — binding Claude Code

> **Wrapper.** A skill canônica, vendor-neutral, é a fonte única de verdade e vive em
> [`.agents/skills/handoff/SKILL.md`](../../../.agents/skills/handoff/SKILL.md).
>
> Este arquivo existe **apenas** para que o Claude Code descubra a skill em
> `.claude/skills/`. Ele não duplica conteúdo e não substitui a definição
> canônica.

## Procedência

| Papel | Caminho |
|---|---|
| Definição canônica (vendor-neutral) | `.agents/skills/handoff/SKILL.md` |
| Binding Claude Code | `.claude/skills/handoff/SKILL.md` (este arquivo) |
| Agent que a carrega | `.agents/agents/orchestrator.md` |

---

**Mantido por:** projeto-base contributors
