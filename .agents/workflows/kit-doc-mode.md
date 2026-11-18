---
name: kit-doc-mode
description: "Audita ou repara UM item do kit de documentação moderna (5 pilares, 14 itens) — o doc canônico do item, suas âncoras, o índice que o lista e os dois donos (specialist e auditor). Use quando um item do kit envelheceu, quando o gate `check-doc-kit` acusou algo, ou quando o doc de um item precisa ser reescrito."
type: workflow
---

# Workflow: `kit-doc-mode`

> pt-BR: o kit de documentação moderna é **obrigatório** — cada um dos 14
> itens tem doc canônico, specialist dono e auditor por pilar. Este workflow
> é o caminho de **um item**, do sintoma até a medição.

## Inputs

- `item` (string, obrigatório) — o nome do item como está na matriz da
  convenção: `README (A Vitrine)`, `CONTRIBUTING (Guia de Contribuição)`,
  `Glossário de Domínio`, `HLD / Overview`, `Diagramas C4`, `PRD / One-Pager`,
  `TDR / RFC`, `ADR`, `OpenAPI / Swagger`, `AsyncAPI`, `ERD / Data Dictionary`,
  `Runbooks / Playbooks`, `Post-Mortems`, `CHANGELOG`.
- `modo` (string, opcional) — `auditar` (padrão) ou `reparar`.

## Quando usar

- ✅ O gate `check-doc-kit` acusou um item (doc ausente, âncora faltando,
  índice que não cita, dono que não existe).
- ✅ Um doc do kit **envelheceu**: o comando, a versão ou o path que ele cita
  mudou.
- ✅ Um item **condicional** mudou de estado — no caso do AsyncAPI, um broker
  apareceu e a declaração de não-aplicabilidade deixou de valer.
- ❌ A demanda é sobre a doc de uma **unidade de código** (um BC, uma rota,
  um package) — isso é [`doc-audit-mode`](../skills/documentation-audit/SKILL.md)
  e a convenção [`documentacao.md`](../specs/conventions/documentacao.md).

## Passo a passo

1. **Ler a matriz do item** — a fonte única é a convenção
   [`kit-documentacao.md`](../specs/conventions/kit-documentacao.md) §2: o
   doc canônico, o tipo, as âncoras mínimas, o índice, o specialist e o
   auditor. O gate lê a MESMA tabela — item lido de outro lugar diverge do
   que o gate cobra.

2. **Rodar o gate e ler a mensagem** — o gate nomeia o item, o arquivo e o
   que faltou:
   ```bash
   pnpm exec tsx .tooling/scripts/ci/check-doc-kit.ts
   ```

3. **Despachar o SPECIALIST do item** (se `modo = reparar`) — o agent dono
   escreve o doc; o controller não escreve no lugar dele. O nome vem da
   coluna `Specialist` da matriz.

4. **Despachar o AUDITOR do pilar** (se `modo = auditar`) — o auditor roda a
   skill de auditoria do pilar (o **processo**) e devolve findings com
   severidade. Ele **não** escreve: auditor que repara deixa de ser auditor.

5. **Rodar a skill de auditoria do pilar** — o processo determinístico:
   ```bash
   # a skill do pilar é o procedimento; o agent é o papel
   pnpm exec tsx .tooling/scripts/ci/check-audit-skills.ts
   ```

6. **Fechar com o gate** — depois da escrita, o `check-doc-kit` tem que ficar
   verde. Gate vermelho depois da escrita significa que o doc está errado —
   não o gate.

## Outputs

- O doc do item corrigido (quando `modo = reparar`), com as âncoras da matriz
- Findings com severidade (quando `modo = auditar`), no formato do agent
- `check-doc-kit` verde

## Cross-refs

- Convenção: [`.agents/specs/conventions/kit-documentacao.md`](../specs/conventions/kit-documentacao.md)
- Gate: [`.tooling/scripts/ci/check-doc-kit.ts`](../../.tooling/scripts/ci/check-doc-kit.ts)
- Matriz de roteamento: [`.agents/specs/conventions/specialist-routing.md`](../specs/conventions/specialist-routing.md)
- Catálogo de agents: [`AGENTS.md`](../../AGENTS.md) §3.3
