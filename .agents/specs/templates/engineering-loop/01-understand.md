---
name: engineering-loop-01-understand
version: 1.0
updated: 2026-09-30
description: "Fase 1 do Engineering Loop — Understand. Mapeia contexto da spec, módulos impactados, invariantes e riscos ANTES de qualquer implementação."
phase: 01-understand
gate: false
owner: orchestrator (até `analista-requisitos` ser criado)
related:
  - ../../../conventions/engineering-loop.md
  - ../../../conventions/state-aware-planning.md
  - ../../spec.md
usage: |
  Copie para specs/<NNN>-<feature>/engineering-loop/01-understand.md
  Preencha durante a fase de planning (antes de abrir PR).
---

# Fase 01 — Understand

> **Propósito:** garantir que o agent (ou humano) que vai implementar tenha lido **toda** a base de conhecimento relevante e identificado restrições/riscos **antes** de tocar em código. Reduz a chance de re-trabalho na fase 02.

## 1. Contexto da spec

<!-- Link para a spec-mãe + state-snapshot usado. -->

- **Spec:** [`../spec.md`](../spec.md)
- **State-snapshot:** `.agents/runs/state-snapshot-<TS>.md`
- **Bounded Context(s):** `<ex: Pix, Accounts>`

## 2. Documentos lidos (checklist)

<!-- Marque os documentos que foram lidos antes de iniciar a implementação. -->

- [ ] `spec.md` §1-§3 (Intent, BR, AC)
- [ ] `spec.md` §4-§5 (Data Model, Contracts)
- [ ] `specs/<feature>/evals/` (todos os 7 tipos aplicáveis)
- [ ] `docs/domain/bounded-contexts.md`
- [ ] `docs/domain/context-map.md`
- [ ] `docs/architecture/adr/` (ADRs relevantes)
- [ ] [`docs/articles/vibe-coding-sdd-engineering-loop-mapping.md`](../../../../docs/articles/vibe-coding-sdd-engineering-loop-mapping.md) (se aplicável)
- [ ] Módulos adjacentes no monorepo (`apps/api/src/<bc>/`)

## 3. Módulos e arquivos impactados

<!-- Liste paths absolutos ou `apps/<area>/<bc>/` que serão tocados. -->

| Camada        | Path                                | Tipo de mudança      |
|---------------|-------------------------------------|----------------------|
| Domain        | `apps/api/src/<bc>/domain/`         | create / modify      |
| Application   | `apps/api/src/<bc>/application/`    | create / modify      |
| Infrastructure| `apps/api/src/<bc>/infrastructure/` | create / modify      |
| Tests         | `apps/api/src/<bc>/**/*.spec.ts`    | create / modify      |
| Evals         | `specs/<feature>/evals/`            | create / modify      |
| Docs          | `docs/**`                           | modify               |

## 4. Invariantes identificados

<!-- Invariantes = propriedades que DEVEM se manter verdadeiras após a mudança. -->

- `<ex: saldo da conta NUNCA pode ser negativo>`
- `<ex: Pix key é única por conta>`
- `<ex: ledger.postings sempre balanced (sum debits == sum credits)>`

## 5. Riscos e mitigações

| Risco                                                   | Probabilidade | Impacto | Mitigação                              |
|---------------------------------------------------------|---------------|---------|----------------------------------------|
| `<ex: race condition em transferências concorrentes>`   | média         | alto    | `<usar lock otimista + idempotency-key>` |
| `<ex: drift de schema Prisma vs migrations>`            | baixa         | médio   | `<rodar prisma migrate status antes de PR>` |
| `<ex: fronteiras DDD quebradas por import indevido>`    | média         | alto    | `<ArchUnit rule em evals/architecture.evals.yaml>` |

## 6. Plano de leitura

<!-- Se houver documento longo demais para citar inline, resuma aqui o que importa. -->

- `docs/architecture/adr/0001-ddd-hexagonal.md` §3: boundary domain/application/infra
- `apps/api/src/<bc-adjacente>/` similar para evitar reinventar padrão

## 7. Saída esperada (handoff para fase 02)

- [ ] Todos os documentos da checklist §2 lidos
- [ ] Tabela §3 preenchida com paths reais
- [ ] ≥ 1 invariante por Bounded Context tocado
- [ ] ≥ 1 risco por mudança de fronteira DDD
- [ ] Decisão registrada: "GO" ou "NO-GO" para fase 02

---

**Próxima fase:** [`02-implement.md`](./02-implement.md)
