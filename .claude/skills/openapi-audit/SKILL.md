---
name: openapi-audit
description: "Processo determinístico de auditoria OpenAPI — re-gera spec, detecta drift DTO↔Prisma, valida cobertura de decorators Swagger, identifica breaking changes. Carregado por `openapi-contract-specialist` quando a task é de auditoria (não criação de spec). Use para scan periódico ou revisão pré-merge de contrato HTTP."
---

# Skill `openapi-audit` — binding Claude Code

> **Wrapper.** A skill canônica, vendor-neutral, é a fonte única de verdade e vive em
> [`.agents/skills/openapi-audit/SKILL.md`](../../../.agents/skills/openapi-audit/SKILL.md).
>
> Este arquivo existe **apenas** para que o Claude Code descubra a skill em `.claude/skills/`.
> Ele não duplica conteúdo e não substitui a definição canônica.

## Protocolo de uso

1. **Leia o arquivo canônico acima como primeiro passo**, antes de qualquer decisão ou resposta.
2. Execute exatamente como ele descreve. Não resuma, não improvise, não aplique memória do Claude Code no lugar dele.
3. Os arquivos auxiliares referenciados pela skill canônica (`protocolos/`, `exemplos/`, tabelas de índice) são resolvidos **a partir do diretório canônico** (`.agents/skills/openapi-audit/`), nunca a partir deste wrapper.

## Procedência

| Papel | Caminho |
|---|---|
| Definição canônica (vendor-neutral) | `.agents/skills/openapi-audit/SKILL.md` |
| Binding Claude Code | `.claude/skills/openapi-audit/SKILL.md` (este arquivo) |
| Documentação | `docs/integrations/claude-code.md` |

---

**Mantido por:** projeto-base contributors
