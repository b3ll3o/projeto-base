---
name: graphify
description: "Grafo de conhecimento do código — transforma uma pasta em um grafo consultável (HTML, JSON para GraphRAG e GRAPH_REPORT.md) e responde perguntas sobre arquitetura, dependências e comunidades. Adaptado de safishamsi/graphify (MIT). Use quando a pergunta for sobre a ESTRUTURA do código e o `graphify-out/` já existir, ou quando o mapa precisar ser construído antes de responder."
---

# Skill `graphify` — binding Claude Code

> **Wrapper.** A skill canônica, vendor-neutral, é a fonte única de verdade e vive em
> [`.agents/skills/graphify/SKILL.md`](../../../.agents/skills/graphify/SKILL.md).
>
> Este arquivo existe **apenas** para que o Claude Code descubra a skill em `.claude/skills/`.
> Ele não duplica conteúdo e não substitui a definição canônica.

## Protocolo de uso

1. **Leia o arquivo canônico acima como primeiro passo**, antes de qualquer decisão ou resposta.
2. Execute exatamente como ele descreve. Não resuma, não improvise, não aplique memória do Claude Code no lugar dele.
3. Os arquivos auxiliares referenciados pela skill canônica são resolvidos **a partir do diretório canônico** (`.agents/skills/graphify/`), nunca a partir deste wrapper.

## Procedência

| Papel | Caminho |
|---|---|
| Definição canônica (vendor-neutral) | `.agents/skills/graphify/SKILL.md` |
| Binding Claude Code | `.claude/skills/graphify/SKILL.md` (este arquivo) |
| Documentação | `docs/integrations/claude-code.md` |

---

**Mantido por:** projeto-base contributors
