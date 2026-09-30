---
name: engineering-loop-05-observe
version: 1.0
updated: 2026-09-30
description: "Fase 5 do Engineering Loop — Observe. Captura métricas de produção, SLIs/SLOs impactados e decisões de tuning. Pós-merge."
phase: 05-observe
gate: false
owner: telemetry-specialist
related:
  - ../../../conventions/engineering-loop.md
  - ../../../conventions/evals.md (Observability Eval)
  - ./04-review.md
usage: |
  Copie para specs/<NNN>-<feature>/engineering-loop/05-observe.md
  Preencha nas primeiras 1-4 semanas pós-merge (produção).
---

# Fase 05 — Observe

> **Propósito:** capturar o comportamento real em produção da spec implantada, validando se os Evals de Observability preditos em `03-test.md` se confirmam. Alimenta a fase 06 (Learn) com evidência empírica.

## 1. Spec origem

- [`../spec.md`](../spec.md)
- [`./04-review.md`](./04-review.md)
- **PR mergeado em:** `<YYYY-MM-DD>`
- **Primeira observação:** `<YYYY-MM-DD>`

## 2. Métricas de produção

<!-- Métricas OTel emitidas pelo código desta spec. Use nomes canônicos do telemetry-specialist. -->

| Métrica                            | Tipo      | Esperado (SLO) | Observado (janela 7d) |
|------------------------------------|-----------|----------------|------------------------|
| `<ex: pix_transfer_duration_seconds>` | Histogram | p95 ≤ 800ms   | `<ex: p95=620ms>`      |
| `<ex: pix_transfer_total>`         | Counter   | rate crescente | `<ex: +12%/semana>`    |
| `<ex: pix_transfer_failed_total>`  | Counter   | rate ≤ 0.1%   | `<ex: 0.04%>`          |
| `<ex: outbox_pending_events>`      | Gauge     | ≤ 50 (alert)  | `<ex: 12>`             |
| `<ex: fraud_analysis_duration_seconds>` | Histogram | p95 ≤ 200ms | `<ex: p95=180ms>`     |

## 3. SLIs/SLOs impactados

| SLI                                       | SLO                  | Atingido? | Ação                       |
|-------------------------------------------|----------------------|-----------|----------------------------|
| `<ex: disponibilidade da feature Pix>`    | `≥ 99.9% / mês`      | ✅ / ⚠️   | (nenhuma / ver §6 retro)   |
| `<ex: latência end-to-end Pix>`           | `p95 ≤ 1s`           | ✅ / ⚠️   |                            |
| `<ex: taxa de erro Pix>`                  | `≤ 0.5% / dia`       | ✅ / ⚠️   |                            |

## 4. Traces e logs amostrados

<!-- Referência a dashboards, alert rules e exemplos de traces representativos. -->

- **Dashboard:** `<url do Grafana>`
- **Alert rules:** `<lista das rules disparadas ou ajustadas>`
- **Trace exemplo (1):** `<url do Jaeger/Tempo>`
- **Log estruturado exemplo:** `<trecho JSON com traceId, spanId>`

## 5. Comparação com Eval de Observability predito

<!-- Cruzar com 03-test.md §2 linha "Observability". -->

| Eval ID      | Esperado           | Observado (janela) | Discrepância? |
|--------------|--------------------|--------------------|---------------|
| EVAL-O-001   | `<métrica X existe>`| `<sim, Y>`        | `<não / sim>` |
| EVAL-O-002   | `<span Y emitido>`  | `<sim>`           | `<não>`       |

## 6. Tuning e ajustes pós-merge

<!-- Ajustes feitos em produção após observação. -->

- `<ex: aumento de pool de conexões Prisma de 10 → 20 — 2026-10-15>`
- `<ex: ajuste de cache TTL em 60s → 300s — 2026-10-22>`

## 7. Saída esperada (handoff para fase 06)

- [ ] Tabela §2 com valores observados reais
- [ ] Tabela §3 com SLI/SLO marcado ✅ ou ⚠️ com justificativa
- [ ] §5 sem discrepâncias não-explicadas (toda discrepância vira item de retro)
- [ ] Decisão registrada: "comportamento de produção confirma a spec" ou "comportamento diverge → ver fase 06"

---

**Próxima fase:** [`06-learn.md`](./06-learn.md)
