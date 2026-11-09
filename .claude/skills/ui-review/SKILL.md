---
name: ui-review
description: "Processo determinístico de revisão de UI em apps/web — mapeia os arquivos de superfície, decide quais das 4 skills de UI carregar (ui-modes, ui-craft, ui-break, motion), roda a revisão na ordem certa, agrega os achados com severidade e emite relatório em .agents/runs/. Carregada por ux-design-specialist e pelo controller de review. Habilitada pela matriz review-routing v1.7 (path_globs apps/web/**)."
---

# Skill `ui-review` — binding Claude Code

> **Wrapper.** A skill canônica, vendor-neutral, é a fonte única de verdade e vive em
> [`.agents/skills/ui-review/SKILL.md`](../../../.agents/skills/ui-review/SKILL.md).
>
> Este arquivo existe **apenas** para que o Claude Code descubra a skill em `.claude/skills/`.
> Ele não duplica conteúdo e não substitui a definição canônica.

## Protocolo de uso

1. **Leia o arquivo canônico acima como primeiro passo**, antes de qualquer decisão ou resposta.
2. Execute exatamente como ele descreve. Não resuma, não improvise, não aplique memória do Claude Code no lugar dele.
3. Os arquivos auxiliares referenciados pela skill canônica são resolvidos **a partir do diretório canônico** (`.agents/skills/ui-review/`), nunca a partir deste wrapper.

## Procedência

| Papel | Caminho |
|---|---|
| Definição canônica (vendor-neutral) | `.agents/skills/ui-review/SKILL.md` |
| Binding Claude Code | `.claude/skills/ui-review/SKILL.md` (este arquivo) |
| Documentação | `docs/integrations/claude-code.md` |

---

**Mantido por:** projeto-base contributors
