---
name: state-aware-planning
description: Como gerar o state-snapshot canônico antes de planejar. Coleta working tree + main SHA + último commit + versão do template + Prisma schema drift + coverage + preflight + health endpoint + OTEL env vars + lint da matriz. Emite state-snapshot-<ts>.md no formato da convenção. Prossegue ou bloqueia conforme gap_blocker. Camada 0 do pre-planner (antes do specialist-router).
---

# Skill `state-aware-planning` — binding Claude Code

> **Wrapper.** A skill canônica, vendor-neutral, é a fonte única de verdade e vive em
> [`.agents/skills/state-aware-planning/SKILL.md`](../../../.agents/skills/state-aware-planning/SKILL.md).
>
> Este arquivo existe **apenas** para que o Claude Code descubra a skill em `.claude/skills/`.
> Ele não duplica conteúdo e não substitui a definição canônica.

## Protocolo de uso

1. **Leia o arquivo canônico acima como primeiro passo**, antes de qualquer decisão ou resposta.
2. Execute exatamente como ele descreve. Não resuma, não improvise, não aplique memória do Claude Code no lugar dele.
3. Os arquivos auxiliares referenciados pela skill canônica (`protocolos/`, `exemplos/`, tabelas de índice) são resolvidos **a partir do diretório canônico** (`.agents/skills/state-aware-planning/`), nunca a partir deste wrapper.

## Procedência

| Papel | Caminho |
|---|---|
| Definição canônica (vendor-neutral) | `.agents/skills/state-aware-planning/SKILL.md` |
| Binding Claude Code | `.claude/skills/state-aware-planning/SKILL.md` (este arquivo) |
| Documentação | `docs/integrations/claude-code.md` |

---

**Mantido por:** projeto-base contributors
