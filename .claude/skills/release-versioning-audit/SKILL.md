---
name: release-versioning-audit
description: "Processo determinístico de auditoria de versionamento semântico — extrai versões dos 3 docs canônicos, detecta drift, classifica commits (Conventional Commits), valida workflow release-template, verifica CHANGELOG. Carregado por `release-versioning-specialist` quando a task é de auditoria (não bump)."
---

# Skill `release-versioning-audit` — binding Claude Code

> **Wrapper.** A skill canônica, vendor-neutral, é a fonte única de verdade e vive em
> [`.agents/skills/release-versioning-audit/SKILL.md`](../../../.agents/skills/release-versioning-audit/SKILL.md).
>
> Este arquivo existe **apenas** para que o Claude Code descubra a skill em `.claude/skills/`.
> Ele não duplica conteúdo e não substitui a definição canônica.

## Protocolo de uso

1. **Leia o arquivo canônico acima como primeiro passo**, antes de qualquer decisão ou resposta.
2. Execute exatamente como ele descreve. Não resuma, não improvise, não aplique memória do Claude Code no lugar dele.
3. Os arquivos auxiliares referenciados pela skill canônica (`protocolos/`, `exemplos/`, tabelas de índice) são resolvidos **a partir do diretório canônico** (`.agents/skills/release-versioning-audit/`), nunca a partir deste wrapper.

## Procedência

| Papel | Caminho |
|---|---|
| Definição canônica (vendor-neutral) | `.agents/skills/release-versioning-audit/SKILL.md` |
| Binding Claude Code | `.claude/skills/release-versioning-audit/SKILL.md` (este arquivo) |
| Documentação | `docs/integrations/claude-code.md` |

---

**Mantido por:** projeto-base contributors
