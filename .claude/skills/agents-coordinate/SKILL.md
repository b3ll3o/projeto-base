---
name: agents-coordinate
description: Protocolo de coordenação multi-agent. SEMPRE usar antes de despachar, receber handoff ou compor múltiplos agents. Define o formato canônico de task/context/expected_output/success_criteria que torna todos os agents interoperáveis.
---

# Skill `agents-coordinate` — binding Claude Code

> **Wrapper.** A skill canônica, vendor-neutral, é a fonte única de verdade e vive em
> [`.agents/skills/agents-coordinate/SKILL.md`](../../../.agents/skills/agents-coordinate/SKILL.md).
>
> Este arquivo existe **apenas** para que o Claude Code descubra a skill em `.claude/skills/`.
> Ele não duplica conteúdo e não substitui a definição canônica.

## Protocolo de uso

1. **Leia o arquivo canônico acima como primeiro passo**, antes de qualquer decisão ou resposta.
2. Execute exatamente como ele descreve. Não resuma, não improvise, não aplique memória do Claude Code no lugar dele.
3. Os arquivos auxiliares referenciados pela skill canônica (`protocolos/`, `exemplos/`, tabelas de índice) são resolvidos **a partir do diretório canônico** (`.agents/skills/agents-coordinate/`), nunca a partir deste wrapper.

## Procedência

| Papel | Caminho |
|---|---|
| Definição canônica (vendor-neutral) | `.agents/skills/agents-coordinate/SKILL.md` |
| Binding Claude Code | `.claude/skills/agents-coordinate/SKILL.md` (este arquivo) |
| Documentação | `docs/integrations/claude-code.md` |

---

**Mantido por:** projeto-base contributors
