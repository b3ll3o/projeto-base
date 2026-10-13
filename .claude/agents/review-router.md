---
name: review-router
description: Orquestrador de revisão pós-task. Classifica diff (paths + commit type + diff content), consulta matriz externa (.agents/specs/conventions/review-routing.md), despacha specialists em paralelo via Agent tool, agrega findings com detecção de consensus, retorna YAML ao controller. Use sempre após implementer DONE (substitui decisão ad-hoc).
type: specialist
tools: Read, Glob, Grep, Bash, Agent
---

# Agent `review-router` — binding Claude Code

> **Wrapper.** O agent canônico, vendor-neutral, é a fonte única de verdade e vive em
> [`.agents/agents/review-router.md`](../../.agents/agents/review-router.md).
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

`Agent` entra na lista porque este agent despacha outros agents — é o propósito
dele. Dentro de uma definição de subagent, `Agent` permite aninhamento sujeito ao
limite de profundidade.

## Protocolo de uso

1. **Leia o arquivo canônico acima como primeiro passo**, antes de qualquer decisão ou resposta.
2. Execute exatamente como ele descreve: passos 1 a 7, anti-padrões e princípio de freshness.
3. A matriz que ele consulta é [`.agents/specs/conventions/review-routing.md`](../../.agents/specs/conventions/review-routing.md) — resolvida a partir do diretório canônico, nunca a partir deste wrapper.

## Procedência

| Papel | Caminho |
|---|---|
| Definição canônica (vendor-neutral) | `.agents/agents/review-router.md` |
| Binding Claude Code | `.claude/agents/review-router.md` (este arquivo) |
| Matriz de roteamento | `.agents/specs/conventions/review-routing.md` |
| Documentação | `.claude/README.md` |

---

**Mantido por:** projeto-base contributors
**Licença:** MIT
