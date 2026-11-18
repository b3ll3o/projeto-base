# TDR — índice

> **TDR** (Technical Decision Record) é o registro de uma decisão
> **técnica com plano**: o que se propõe, o que se arrisca, o que se protege,
> como se entrega e como se revisa.
>
> O formato faz parte do **kit de documentação moderna**, item 7 do
> [Pilar 3 — Planejamento e Decisões](../../.agents/specs/conventions/kit-documentacao.md).

## TDR, ADR e plano — a diferença

São três registros de coisas diferentes, e confundi-los é o que faz um time
re-litigar o que já foi decidido.

| | **ADR** ([`../adr/`](../adr/)) | **TDR** (aqui) | **Plano** ([`../superpowers/plans/`](../superpowers/plans/)) |
|---|---|---|---|
| **Responde a** | *por que* esta decisão foi tomada | *o que* se propõe e *como* se entrega | *quais* tarefas, em que ordem |
| **Escopo** | uma decisão, fechada | uma decisão **com rollout** e revisão | uma demanda inteira |
| **Tempo** | registra o que foi decidido **naquela data** | registra o percurso da decisão | é o **registro datado** da execução |
| **Envelhece?** | não — é datado | não — é datado | sim, de propósito: é o diário da execução |
| **Instrumento** | `check-doc-kit` (item 8 do kit) | `check-doc-kit` (item 7 do kit) | nenhum — é histórico |

A regra prática:

- **O ADR é o dono da decisão.** O TDR **aponta** para ele e registra o
  *raciocínio* — alternativas avaliadas, riscos aceitos, rollout, revisão.
- **O plano é a implementação.** Ele não é a fonte de nenhuma verdade: uma
  verdade que só existe no plano envelheceu.

## Onde nasce

```text
docs/tdr/NNNN-<slug>.md
```

- `NNNN` — número de **4 dígitos**, com zero à esquerda.
- `<slug>` — nome curto em **kebab-case**, sem acento.
- O número é **sequencial e nunca reaproveitado**.

## O formato

Todo TDR tem estas seções — e **nessa ordem**:

| Seção | O que responde |
|---|---|
| `## Proposta` | o que se propõe, o que já está decidido (e onde), e as **alternativas** avaliadas |
| `## Riscos` | o que pode dar errado, e como cada risco foi tratado |
| `## Segurança` | o que a mudança toca (e o que **não** toca) em superfície atacável |
| `## Rollout` | a **cronologia** real: o que aconteceu, em que data, com o resultado |
| `## Revisão` | **quem revisou** e **o que a revisão mudou** |

Duas regras:

- **Nada de duplicar o dono.** Se o texto está no ADR, o TDR **aponta**. O
  fato tem um dono só
  ([`dry.md`](../../.agents/specs/conventions/dry.md)).
- **Rollout é o que aconteceu, não o que se planeja.** A data e o artefato são
  reais; a previsão não entra.

## As instâncias

| # | TDR | O que é |
|---|---|---|
| 0001 | [`0001-system-design-canonico.md`](./0001-system-design-canonico.md) | O TDR do **system design canônico**: a mudança que deu ao repositório um desenho de sistema próprio, com contrato de extensão. |

> **Um item do kit sem doc canônico é lacuna nomeada.** O próximo TDR nasce em
> `docs/tdr/NNNN-<slug>.md` **e** entra na tabela acima no mesmo PR.

## Ver Também

- [`../prd/README.md`](../prd/README.md) — o problema de produto que a decisão serve.
- [`../adr/`](../adr/) — as decisões arquiteturais (o índice canônico é [`docs/agents/domain.md`](../agents/domain.md)).
- [`../system-design/README.md`](../system-design/README.md) — o desenho que este TDR entregou.
- [`../post-mortems/README.md`](../post-mortems/README.md) — o registro do que deu errado.

---

**Mantido por:** projeto-base contributors
**Versão do documento:** 1.30.0
