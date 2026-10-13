---
name: ci-defense-in-depth
description: Skill para auditoria, manutenção e extensão do padrão defense-in-depth do CI (pre-push local + preflight CI + quality CI gated). Cobre criação de novos checks preflight, debug de drift estrutural e validação do pipeline em camadas. Use quando adicionar/alterar um check preflight, auditar a estratégia de CI ou debugar falhas estruturais detectadas em CI.
---

# Skill `ci-defense-in-depth` — binding Claude Code

> **Wrapper.** A skill canônica, vendor-neutral, é a fonte única de verdade e vive em
> [`.agents/skills/ci-defense-in-depth/SKILL.md`](../../../.agents/skills/ci-defense-in-depth/SKILL.md).
>
> Este arquivo existe **apenas** para que o Claude Code descubra a skill em `.claude/skills/`.
> Ele não duplica conteúdo e não substitui a definição canônica.

## Protocolo de uso

1. **Leia o arquivo canônico acima como primeiro passo**, antes de qualquer decisão ou resposta.
2. Execute exatamente como ele descreve. Não resuma, não improvise, não aplique memória do Claude Code no lugar dele.
3. Os arquivos auxiliares referenciados pela skill canônica (`protocolos/`, `exemplos/`, tabelas de índice) são resolvidos **a partir do diretório canônico** (`.agents/skills/ci-defense-in-depth/`), nunca a partir deste wrapper.

## Procedência

| Papel | Caminho |
|---|---|
| Definição canônica (vendor-neutral) | `.agents/skills/ci-defense-in-depth/SKILL.md` |
| Binding Claude Code | `.claude/skills/ci-defense-in-depth/SKILL.md` (este arquivo) |
| Documentação | `docs/integrations/claude-code.md` |

---

**Mantido por:** projeto-base contributors
