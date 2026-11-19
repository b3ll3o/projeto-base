# PRD — índice

> **PRD** (Product Requirements Document) é o **one-pager de produto**: ele
> responde *qual problema estamos resolvendo*, *para quem*, e *como saberemos
> que deu certo*. Ele não descreve a solução — a solução é do
> [HLD](../system-design/README.md), da decisão é do
> [TDR](../tdr/README.md) e do [ADR](../adr/).
>
> O formato faz parte do **kit de documentação moderna**, item 6 do
> [Pilar 3 — Planejamento e Decisões](../../.agents/specs/conventions/kit-documentacao.md).

## Onde nasce

```text
docs/prd/NNNN-<slug>.md
```

- `NNNN` — número de **4 dígitos**, com zero à esquerda: `0001`, `0002`, …
- `<slug>` — nome curto em **kebab-case**, sem acento: `projeto-base`,
  `historico-usuario-admin`.
- O número é **sequencial e nunca reaproveitado**: um PRD descontinuado mantém
  o número, e o próximo começa depois dele.

## O formato

Todo PRD tem, no mínimo, estas seções — e **nessa ordem**:

| Seção | O que responde |
|---|---|
| `## Problema` | o que está quebrado hoje, para quem, e por que agora |
| `## Objetivo de negócio` | o resultado que a empresa busca, em uma frase |
| `## Escopo` | o que **entra** e o que **não entra** — a fronteira mais dura do doc |
| `## Métricas de sucesso` | como se sabe que deu certo |
| `## Como se mede` | **o instrumento** de cada métrica: o comando, a fonte, o período |

Duas regras que não são do formato mas valem para ele:

- **Métrica sem instrumento não entra.** Um número sem o comando que o
  reproduz é uma mentira esperando o dia em que alguém verificar
  ([`tamanho-e-revisao.md`](../../.agents/specs/conventions/tamanho-e-revisao.md)).
  Quando ainda não há como medir, escreva **"a medir"** e diga **qual
  instrumento vai medir** — nunca um número inventado.
- **Um PRD não é um plano.** Ele não lista tarefas, ordem de execução nem
  arquivos. Isso é o
  [plano](../superpowers/plans/) — que é registro datado e **envelhece** de
  propósito.

## As instâncias

| # | PRD | O que é |
|---|---|---|
| 0001 | [`0001-projeto-base.md`](./0001-projeto-base.md) | O PRD **do próprio template**: o problema que o `projeto-base` resolve para quem deriva um app dele. |

> **Um item do kit sem doc canônico é lacuna nomeada.** Se o próximo PRD
> existir, ele nasce em `docs/prd/NNNN-<slug>.md` **e** entra na tabela
> acima no mesmo PR — um índice que não lista o que existe é índice de
> ficção.

## Ver Também

- [`docs/tdr/README.md`](../tdr/README.md) — a decisão, com alternativas e rollout.
- [`docs/adr/`](../adr/) — as decisões arquiteturais já fechadas (o índice canônico é [`docs/agents/domain.md`](../agents/domain.md)).
- [`docs/system-design/README.md`](../system-design/README.md) — o desenho do sistema.
- [`docs/post-mortems/README.md`](../post-mortems/README.md) — o que se escreve quando algo dá errado.

---

**Mantido por:** projeto-base contributors
**Versão do documento:** 1.30.0
