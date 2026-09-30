---
name: engineering-loop-06-learn
version: 1.0
updated: 2026-09-30
description: "Fase 6 do Engineering Loop — Learn. Captura findings pós-produção, proposals T1/T2/T3 com confidence ≥ 70 e fecha o loop para próxima spec via workflow feedback-to-spec."
phase: 06-learn
gate: false (input para workflow `feedback-to-spec`)
owner: retrospective-capture (skill) + doc-writer
related:
  - ../../../conventions/engineering-loop.md
  - ../../../conventions/retrospective-capture.md
  - ../../../workflows/feedback-to-spec.md
  - ../../../workflows/retrospective-mode.md
  - ./05-observe.md
usage: |
  Copie para specs/<NNN>-<feature>/engineering-loop/06-learn.md
  Preencha ao final do ciclo (tipicamente 2-4 semanas pós-merge).
---

# Fase 06 — Learn

> **Propósito:** consolidar aprendizados pós-produção da spec, gerar **proposals** (T1/T2/T3) com **confidence ≥ 70** (regra do `retrospective-capture.md`) e **fechar o loop** alimentando specs filhas via workflow [`feedback-to-spec.md`](../../../workflows/feedback-to-spec.md).

## 1. Spec origem

- [`../spec.md`](../spec.md)
- [`./05-observe.md`](./05-observe.md)
- **Período de observação:** `<YYYY-MM-DD> → YYYY-MM-DD>`
- **b<N>-result.md relacionado:** `<path>` (preenchido pela retro)

## 2. As 3 perguntas obrigatórias (`retrospective-capture.md`)

### 2.1 O que funcionou e DEVE virar regra?

<!-- Patterns discovered — viram skills, conventions ou ADRs. -->

- `<ex: ArchUnit rule para Bounded Context boundary evitou 3 cross-context imports>`
- `<ex: spec.md template acelerou planning em ~40% vs ad-hoc>`

### 2.2 O que atrapalhou e DEVE virar anti-pattern?

<!-- Friction sources — viram anti-patterns em convenções existentes ou novas. -->

- `<ex: reuso de business-rules.md falhou — BRs estavam duplicadas em 2 specs>`
- `<ex: pipeline CI quebrou em commit com .ts mas sem coverage — pre-push não cobriu>`

### 2.3 O que ficou ambíguo e DEVE virar ADR/memory?

<!-- Implicit knowledge — vira ADR ou memory update. -->

- `<ex: decisão de idempotência em Pix — ADR-0042>`
- `<ex: trade-off de outbox vs CDC — memory de telemetry-specialist>`

## 3. Proposals (decision-list do `retrospective-capture.md`)

```yaml
- id: P-001
  artifact: "convention"
  target: ".agents/specs/conventions/engineering-loop.md"
  content: "Adicionar nota: business-rules.md só quando ≥ 10 BRs"
  confidence: 85
  justification: "Reuso cross-spec falhou em spec-099 (3 BRs); template só agrega valor a partir de 10"
  action: "update"

- id: P-002
  artifact: "skill"
  target: ".agents/skills/feedback-to-spec/SKILL.md"
  content: "Criar skill que automatiza proposal T1 → nova spec"
  confidence: 75
  justification: "Workflow `feedback-to-spec` é novo; precisa de skill para operacionar"
  action: "create"

- id: P-003
  artifact: "backlog"
  target: "TASK-XXX"
  content: "Investigar discrepância EVAL-O-001 observado em produção"
  confidence: 70
  justification: "Discrepância não-explicada em 05-observe.md §5"
  action: "create"
```

## 4. Specs filhas abertas (loop fechado)

| Spec filha | Slug                | Origem (proposal) | Status      |
|------------|---------------------|-------------------|-------------|
| `<NNN+1>`  | `<slug-descrição>`  | P-001             | `<planejada / em-progress>` |

**Regra:** se NENHUMA spec filha foi aberta, justificar explicitamente:

> Justificativa: loop não gerou próxima spec porque `<motivo: feature estável / sem evoluções planejadas / etc.>`

## 5. Backlog atualizado (`task-manager`)

- TASK-XXX: `<título>` (RICE: Reach × Impact × Confidence / Effort)

## 6. Memory files atualizadas

- `<agent>.md`: `<resumo da decisão>`
- `<agent>.md`: `<resumo da decisão>`

## 7. Saída esperada (handoff para próxima spec)

- [ ] §2 com respostas para as 3 perguntas
- [ ] §3 com proposals filtradas (confidence ≥ 70)
- [ ] §4 com specs filhas OU justificativa explícita
- [ ] §5 com ≥ 1 item de backlog (se aplicável)
- [ ] §6 com memory updates commitados
- [ ] b<N+1>-result.md publicado (via `retrospective-mode.md`)
- [ ] Demanda arquivada (via `archive-demand.md`)

---

**Loop fechado.** Próxima spec: `[<NNN+1>-<slug>](../../<NNN+1>-<slug>/spec.md)` ou justificativa em §4.
