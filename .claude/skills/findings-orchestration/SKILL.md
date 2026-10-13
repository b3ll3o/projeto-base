---
name: findings-orchestration
description: "Processo de orquestração de findings — pre-flight gh auth, coleta issues abertas para dedup, despacho paralelo de 8 specialists, agregação com severity, abertura de issues via `gh` com labels canônicos, persistência de relatório. Carregado por `finding-orchestrator` (agent). Use para escaneamento semanal automatizado ou on-demand."
---

# Skill `findings-orchestration` — binding Claude Code

> **Wrapper.** A skill canônica, vendor-neutral, é a fonte única de verdade e vive em
> [`.agents/skills/findings-orchestration/SKILL.md`](../../../.agents/skills/findings-orchestration/SKILL.md).
>
> Este arquivo existe **apenas** para que o Claude Code descubra a skill em `.claude/skills/`.
> Ele não duplica conteúdo e não substitui a definição canônica.

## Protocolo de uso

1. **Leia o arquivo canônico acima como primeiro passo**, antes de qualquer decisão ou resposta.
2. Execute exatamente como ele descreve. Não resuma, não improvise, não aplique memória do Claude Code no lugar dele.
3. Os arquivos auxiliares referenciados pela skill canônica (`protocolos/`, `exemplos/`, tabelas de índice) são resolvidos **a partir do diretório canônico** (`.agents/skills/findings-orchestration/`), nunca a partir deste wrapper.

## Procedência

| Papel | Caminho |
|---|---|
| Definição canônica (vendor-neutral) | `.agents/skills/findings-orchestration/SKILL.md` |
| Binding Claude Code | `.claude/skills/findings-orchestration/SKILL.md` (este arquivo) |
| Documentação | `docs/integrations/claude-code.md` |

---

**Mantido por:** projeto-base contributors
