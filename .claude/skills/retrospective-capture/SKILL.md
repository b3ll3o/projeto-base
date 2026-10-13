---
name: retrospective-capture
description: Metodologia para capturar aprendizados ao final de uma grande atividade (implementação multi-task, bugfix não-trivial ou adoção de novo padrão). Transforma diff e conversation-log em memory file entries + b<N>-result + proposals de harness.
---

# Skill `retrospective-capture` — binding Claude Code

> **Wrapper.** A skill canônica, vendor-neutral, é a fonte única de verdade e vive em
> [`.agents/skills/retrospective-capture/SKILL.md`](../../../.agents/skills/retrospective-capture/SKILL.md).
>
> Este arquivo existe **apenas** para que o Claude Code descubra a skill em `.claude/skills/`.
> Ele não duplica conteúdo e não substitui a definição canônica.

## Protocolo de uso

1. **Leia o arquivo canônico acima como primeiro passo**, antes de qualquer decisão ou resposta.
2. Execute exatamente como ele descreve. Não resuma, não improvise, não aplique memória do Claude Code no lugar dele.
3. Os arquivos auxiliares referenciados pela skill canônica (`protocolos/`, `exemplos/`, tabelas de índice) são resolvidos **a partir do diretório canônico** (`.agents/skills/retrospective-capture/`), nunca a partir deste wrapper.

## Procedência

| Papel | Caminho |
|---|---|
| Definição canônica (vendor-neutral) | `.agents/skills/retrospective-capture/SKILL.md` |
| Binding Claude Code | `.claude/skills/retrospective-capture/SKILL.md` (este arquivo) |
| Documentação | `docs/integrations/claude-code.md` |

---

**Mantido por:** projeto-base contributors
