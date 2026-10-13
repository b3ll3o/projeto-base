---
name: specialist-router
description: Orquestrador de demanda. Classifica demanda (keywords + paths + scope) via matriz .agents/specs/conventions/specialist-routing.md, despacha specialists em paralelo via Agent tool. Bloqueia planning se gap_detected: true e retorna instrução para criar specialist via agent-architect. Use antes de qualquer planning quando a demanda tem escopo técnico definido.
type: specialist
tools: Read, Glob, Grep, Bash, Agent
---

# Agent `specialist-router` — binding Claude Code

> **Wrapper.** O agent canônico, vendor-neutral, é a fonte única de verdade e vive em
> [`.agents/agents/specialist-router.md`](../../.agents/agents/specialist-router.md).
>
> Este arquivo existe **apenas** para que o Claude Code descubra o agent em
> `.claude/agents/`. Ele não duplica conteúdo e não substitui a definição
> canônica.

## Por que `tools` está declarado aqui

Sem esse campo o subagent **herda todas as tools** da conversa principal — mais
permissivo do que o agent canônico declara, e um desvio silencioso entre o que o
padrão genérico especifica e o que roda de fato.

O valor abaixo é **copiado verbatim** do frontmatter canônico
(`tools: Read, Glob, Grep, Bash, Agent`), não re-declarado por conta própria.
Copiando, os dois conjuntos não podem divergir por descuido.

O campo é uma **allowlist sobre a pool herdada**, não uma lista enumerada de
valores válidos: entradas que não resolvem são removidas em silêncio desde que
pelo menos uma resolva. Por isso as cinco entradas acima são as canônicas, e não
uma seleção.

`Agent` entra na lista porque este agent despacha outros agents — e também
precisa despachar `agent-architect` no caminho `gap_detected`, que é o resultado
que este agent existe para produzir.

## Protocolo de uso

1. **Leia o arquivo canônico acima como primeiro passo**, antes de qualquer decisão ou resposta.
2. Execute exatamente como ele descreve, incluindo o comportamento de bloqueio quando `gap_detected: true` — que é a razão de este agent rodar **antes** do planning.
3. A matriz que ele consulta é [`.agents/specs/conventions/specialist-routing.md`](../../.agents/specs/conventions/specialist-routing.md) — resolvida a partir do diretório canônico, nunca a partir deste wrapper.

## Procedência

| Papel | Caminho |
|---|---|
| Definição canônica (vendor-neutral) | `.agents/agents/specialist-router.md` |
| Binding Claude Code | `.claude/agents/specialist-router.md` (este arquivo) |
| Matriz de roteamento | `.agents/specs/conventions/specialist-routing.md` |
| Documentação | `.claude/README.md` |

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
