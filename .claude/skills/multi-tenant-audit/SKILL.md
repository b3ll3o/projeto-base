---
name: multi-tenant-audit
description: "Processo determinístico de auditoria multi-tenant — mapeia models sem tenant_id, queries sem filtro de tenant, chaves de cache que não incluem tenant, RLS/políticas e o gate de isolamento cross-tenant. Carregado por `multi-tenant-specialist` quando a task é de auditoria (não criação). NÃO é despachada pelo `finding-orchestrator` (a lista de audit specialists dele é fixa em 5, `finding-orchestrator.md:82-91`, e não inclui tenancy). Para scan periódico, despache o `multi-tenant-specialist` direto."
---

# Skill `multi-tenant-audit` — binding Claude Code

> **Wrapper.** A skill canônica, vendor-neutral, é a fonte única de verdade e vive em
> [`.agents/skills/multi-tenant-audit/SKILL.md`](../../../.agents/skills/multi-tenant-audit/SKILL.md).
>
> Este arquivo existe **apenas** para que o Claude Code descubra a skill em `.claude/skills/`.
> Ele não duplica conteúdo e não substitui a definição canônica.

## Protocolo de uso

1. **Leia o arquivo canônico acima como primeiro passo**, antes de qualquer decisão ou resposta.
2. Execute exatamente como ele descreve. Não resuma, não improvise, não aplique memória do Claude Code no lugar dele.
3. Os arquivos auxiliares referenciados pela skill canônica são resolvidos **a partir do diretório canônico** (`.agents/skills/multi-tenant-audit/`), nunca a partir deste wrapper.

## Procedência

| Papel | Caminho |
|---|---|
| Definição canônica (vendor-neutral) | `.agents/skills/multi-tenant-audit/SKILL.md` |
| Binding Claude Code | `.claude/skills/multi-tenant-audit/SKILL.md` (este arquivo) |
| Documentação | `docs/integrations/claude-code.md` |

---

**Mantido por:** projeto-base contributors
