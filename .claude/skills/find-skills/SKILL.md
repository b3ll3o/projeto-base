---
name: find-skills
description: "Descoberta e instalação de skills — quando a demanda não tem skill no repo, procura a mais adequada no registro, audita antes de instalar e adapta ao padrão do projeto. Adaptado de vercel-labs/skills (MIT). Use quando o pedido for 'como faço X' e X puder existir como skill, ou quando o usuário quiser estender as capacidades do agente."
---

# Skill `find-skills` — binding Claude Code

> **Wrapper.** A skill canônica, vendor-neutral, é a fonte única de verdade e vive em
> [`.agents/skills/find-skills/SKILL.md`](../../../.agents/skills/find-skills/SKILL.md).
>
> Este arquivo existe **apenas** para que o Claude Code descubra a skill em `.claude/skills/`.
> Ele não duplica conteúdo e não substitui a definição canônica.

## Protocolo de uso

1. **Leia o arquivo canônico acima como primeiro passo**, antes de qualquer decisão ou resposta.
2. Execute exatamente como ele descreve. Não resuma, não improvise, não aplique memória do Claude Code no lugar dele.
3. Os arquivos auxiliares referenciados pela skill canônica são resolvidos **a partir do diretório canônico** (`.agents/skills/find-skills/`), nunca a partir deste wrapper.

## Procedência

| Papel | Caminho |
|---|---|
| Definição canônica (vendor-neutral) | `.agents/skills/find-skills/SKILL.md` |
| Binding Claude Code | `.claude/skills/find-skills/SKILL.md` (este arquivo) |
| Documentação | `docs/integrations/claude-code.md` |

---

**Mantido por:** projeto-base contributors
