---
name: documentation-specialist
description: Especialista em documentação da aplicação, ciente das stacks (NestJS DDD/Hexagonal, Prisma, Next.js App Router, OpenTelemetry, Docker Compose, pnpm/turbo). Audita cobertura e drift, mantém o inventário de docs canônicos e escreve/atualiza a doc de cada unidade de código. Use quando a demanda tocar docs/**, README, doc de módulo, referência de API, ADR, runbook — ou quando um gate de documentação acusar gap.
type: specialist
tools: Read, Glob, Grep, Bash, Write, Edit
---

# Agent `documentation-specialist` — binding Claude Code

> **Wrapper.** O agent canônico, vendor-neutral, é a fonte única de verdade e vive em
> [`.agents/agents/documentation-specialist.md`](../../.agents/agents/documentation-specialist.md).
>
> Este arquivo existe **apenas** para que o Claude Code descubra o agent em
> `.claude/agents/`. Ele não duplica conteúdo e não substitui a definição
> canônica.

## Por que `tools` está declarado aqui

Sem esse campo o subagent **herda todas as tools** da conversa principal — mais
permissivo do que o agent canônico declara, e um desvio silencioso entre o que
o padrão genérico especifica e o que roda de fato.

O valor abaixo é **copiado verbatim** do frontmatter canônico
(`tools: Read, Glob, Grep, Bash, Write, Edit`), não re-declarado por conta
própria. Copiando, os dois conjuntos não podem divergir por descuido.

O campo é uma **allowlist sobre a pool herdada**, não uma lista enumerada de
valores válidos: entradas que não resolvem são removidas em silêncio desde que
pelo menos uma resolva.

## Protocolo de uso

1. **Leia o arquivo canônico acima como primeiro passo**, antes de qualquer decisão ou resposta.
2. Execute exatamente como ele descreve: papel, matriz de cobertura, comportamento e anti-padrões.
3. A skill de processo que ele carrega é
   [`.agents/skills/documentation-audit/SKILL.md`](../../.agents/skills/documentation-audit/SKILL.md) —
   resolvida a partir do diretório canônico, nunca a partir deste wrapper.
4. A regra que ele aplica está em
   [`.agents/specs/conventions/documentacao.md`](../../.agents/specs/conventions/documentacao.md).

## Procedência

| Papel | Caminho |
|---|---|
| Definição canônica (vendor-neutral) | `.agents/agents/documentation-specialist.md` |
| Binding Claude Code | `.claude/agents/documentation-specialist.md` (este arquivo) |
| Skill de processo | `.agents/skills/documentation-audit/SKILL.md` |
| Convenção | `.agents/specs/conventions/documentacao.md` |
| Documentação | `.claude/README.md` |

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
