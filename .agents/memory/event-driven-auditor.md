---
agent: event-driven-auditor
scope: contrato do evento (nome canônico, versionamento, unicidade), emissão pelo aggregate, dependência entre módulos, handler que consome o evento, efeito colateral escrito pela application, segredo no payload e atomicidade mutação↔registro — arquitetura + auditoria
skill: .agents/skills/event-driven-audit/SKILL.md
---

# Memory: `event-driven-auditor`

Memória canônica do auditor da regra event-driven. O estado atual da
aplicação está na [convenção](../specs/conventions/event-driven.md) §5 e no
[plano](../../docs/superpowers/plans/2026-11-26-event-driven.md); aqui fica
o que **sobrevive** a uma execução: as decisões fechadas e o que foi medido.

## Skill carregada

Carrega `.agents/skills/event-driven-audit/SKILL.md` quando a task é de
**auditoria** (o processo determinístico, read-only e offline são os passos
shell). A skill encapsula os passos; este arquivo guarda o estado entre
execuções. O resto do tempo (desenhar o publicador, decidir o payload do
evento, escrever o handler) é papel do **agent**, não da skill.

## Estado atual (2026-11-26)

- Agent file: `.agents/agents/event-driven-auditor.md`
- Gate: `.tooling/scripts/ci/check-event-driven.ts` (registrado no preflight,
  camadas A e B)
- Registro: `.tooling/scripts/ci/excecoes-event-driven.json`
- Medido: **7 eventos** de domínio, em **2 módulos** (`users` com 4,
  `profiles` com 3); **0** com consumidor na camada `application`; **1** escrita de efeito
  colateral direto na camada `application`

## Decisões fechadas que o agente herda

| # | Decisão | Onde |
|---|---------|------|
| D1 | O prefixo do `eventName` vem do **caminho do arquivo** (módulo + agregado + ação), não do que o código declara | convenção §2 (ED1) |
| D2 | O nome é `<bc>.<agregado>.<ação>.vN` — o `vN` é o que permite evoluir o contrato | convenção §2 (ED1) |
| D3 | Quem emite é o **aggregate**; a aplicação e a HTTP só recebem | convenção §2 (ED3) |
| D4 | O handler mora na camada `application` e é **nomeado pelo evento** que consome | convenção §2 (ED5) |
| D5 | O efeito colateral é escrito pelo **handler**, nunca pela application | convenção §2 (ED6) |
| D6 | A conversão **preserva ED8**: handler síncrono dentro da transação, ou outbox na mesma transação | convenção §2 (ED8) |
| D7 | Consumo assíncrono (broker) é **Fase 4** e exige ADR — não é parte de "tornar a aplicação event-driven" | convenção §7 |
| D8 | A exceção no registro é dívida **medida**; corrigir a violação é **remover a entrada** no mesmo PR | convenção §5 |

> D6 é a decisão que impede a regressão: o PR #194 consertou a atomicidade da
> trilha de auditoria, e a conversão event-driven não pode desfazê-la.

## O que a auditoria NÃO mede (e não pode medir por texto)

- Se o **handler faz** o que promete — o gate prova que ele existe
- Se o **payload basta** ao consumidor — o evento hoje quase não carrega dado
- A **atomicidade** (ED8) — é do spec de integração, não do gate
