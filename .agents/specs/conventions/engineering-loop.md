---
name: engineering-loop
version: 1.0
updated: 2026-09-30
maintainer: agent-architect
description: "Convenção unificadora do Engineering Loop (UNDERSTAND → IMPLEMENT → TEST → REVIEW → OBSERVE → LEARN). Define path convention, integra com retrospective-capture, archive-demand e state-aware-planning, e fecha o loop 'feedback → próxima spec'. Endereça os gaps G3, G4 e G5 identificados em docs/articles/vibe-coding-sdd-engineering-loop-mapping.md."
related:
  - ./evals.md
  - ./state-aware-planning.md
  - ./retrospective-capture.md
  - ./demand-archiving.md
  - ../templates/engineering-loop/01-understand.md
  - ../templates/engineering-loop/02-implement.md
  - ../templates/engineering-loop/03-test.md
  - ../templates/engineering-loop/04-review.md
  - ../templates/engineering-loop/05-observe.md
  - ../templates/engineering-loop/06-learn.md
  - ../templates/business-rules.md
  - ../../workflows/feedback-to-spec.md
  - ../../../docs/articles/vibe-coding-sdd-engineering-loop-mapping.md
source_article: Dennis Rojas (Tech na Prática, 2026-09-15) §"Engineering Loop"
---

# Convenção: `engineering-loop`

> pt-BR: define o ciclo canônico **UNDERSTAND → IMPLEMENT → TEST → REVIEW → OBSERVE → LEARN** aplicado a uma spec, e como ele se integra com as convenções existentes do projeto-base para fechar o loop **feedback → próxima spec**.

## §0. Origem da regra

O mapping file ([`docs/articles/vibe-coding-sdd-engineering-loop-mapping.md`](../../../docs/articles/vibe-coding-sdd-engineering-loop-mapping.md)) lista "Engineering Loop" como conceito coberto por `orchestrator` + `retrospective-mode` + `retrospective-capture`. Análise de gaps (v1.9.0) identificou que a cobertura é **parcial**:

| Gap | Descrição | Estado antes desta convenção |
|---|---|---|
| **G4** | Apenas a fase **Learn** tinha template (`retrospective-capture.md`); as outras 5 fases ficavam como boa prática implícita | ❌ sem artefatos versionados para Understand/Implement/Test/Review/Observe |
| **G5** | O loop terminava em "archive" — não havia workflow que pegasse um finding da retro e **abrisse spec nova** | ❌ loop não fechava de volta para `specs/<feature>/` |
| **G3** | Business Rules eram inline em `spec.md`; sem artefato separado para reuso cross-spec | ❌ sem `business-rules.md` por feature |

Esta convenção **unifica G3+G4+G5** em um framework único que REUSA tudo o que já existe (retrospective-capture, archive-demand, state-aware-planning, evals, tdd) e adiciona apenas o que falta.

## §1. Definição canônica do loop

```text
UNDERSTAND → IMPLEMENT → TEST → REVIEW → OBSERVE → LEARN
     ↑                                                    │
     └──────────── próxima spec ──────────────────────────┘
```

| Fase          | Pergunta que responde                              | Artefato versionado                                   | Owner típico               | Gate?         |
|---------------|----------------------------------------------------|-------------------------------------------------------|----------------------------|---------------|
| **Understand**| O que muda, por quê, e quais são os riscos?        | `specs/<feature>/engineering-loop/01-understand.md`   | `analista-requisitos`¹     | não (input)   |
| **Implement** | O código reflete a spec dentro do espaço decidido? | `specs/<feature>/engineering-loop/02-implement.md`   | `nestjs-specialist`²       | sim (review)  |
| **Test**      | Os Evals passam (Red→Green→Refactor)?              | `specs/<feature>/engineering-loop/03-test.md`         | `test-writer`              | **sim (CI)**  |
| **Review**    | A diff atende spec + não quebra fronteiras DDD?    | `specs/<feature>/engineering-loop/04-review.md`       | `code-reviewer` / `stack-code-reviewer` | sim (PR) |
| **Observe**   | Produção confirma o comportamento esperado?       | `specs/<feature>/engineering-loop/05-observe.md`      | `telemetry-specialist`     | não (post)    |
| **Learn**     | O que aprendemos e o que vira próxima spec?        | `specs/<feature>/engineering-loop/06-learn.md`        | `retrospective-capture`    | não (input)   |

¹ Não existe ainda — usar `orchestrator` enquanto não criado.
² Ou o specialist correspondente à stack (`nextjs-specialist`, `monorepo-specialist`, etc.).

## §2. Path convention canônica

```text
specs/<NNN>-<feature>/
├── spec.md                                # Spec + business rules + acceptance criteria
├── business-rules.md                      # (opcional — ver §3 critérios de extração)
├── engineering-loop/
│   ├── 01-understand.md                   # Fase 1
│   ├── 02-implement.md                    # Fase 2
│   ├── 03-test.md                         # Fase 3
│   ├── 04-review.md                       # Fase 4
│   ├── 05-observe.md                      # Fase 5
│   └── 06-learn.md                        # Fase 6
├── evals/                                 # 7 tipos canônicos (ver evals.md)
├── contracts/
└── ...
```

Templates versionados em [`../templates/engineering-loop/`](../templates/engineering-loop/). Cada template tem frontmatter canônico + placeholders comentados.

**Regra:** toda spec DEVE preencher **ao menos as fases 01-04** (até Review) antes do PR ser mergeado. Fases 05 e 06 são **pós-merge** e usam o workflow [`feedback-to-spec.md`](../../workflows/feedback-to-spec.md).

## §3. G3 — Business Rules como artefato opcional

**Quando extrair `specs/<feature>/business-rules.md`** (separado do `spec.md`):

| Critério | Obrigatório extrair? |
|----------|----------------------|
| Spec referencia BRs que aparecem em **≥ 2 outras specs** futuras | ✅ sim |
| Spec tem **≥ 10 BRs** | ✅ sim |
| BRs vêm de **regulação externa** (BACEN, LGPD, PCI-DSS) | ✅ sim |
| Spec é curta (≤ 7 BRs) e self-contained | ❌ não (deixar inline em `spec.md` §2) |

Template: [`../templates/business-rules.md`](../templates/business-rules.md).

**Integração com Evals:** cada BR em `business-rules.md` referencia 1+ AC em `spec.md` que referencia 1+ Eval em `evals/`. A cadeia de rastreabilidade é **BR → AC → Eval** (mesma regra do `evals.md` §5).

## §4. G5 — Loop fechado: feedback → próxima spec

O loop **fecha** quando a fase **Learn** produz proposals que abrem **nova spec**. Workflow canônico: [`../../workflows/feedback-to-spec.md`](../../workflows/feedback-to-spec.md).

```text
06-learn.md (proposals confidence ≥ 70)
        ↓
retrospective-capture (skill) gera b<N+1>-result.md
        ↓
task-manager cria itens TASK-NNN no backlog (RICE)
        ↓
PR seguinte: nova spec usa templates desta convenção
        ↓
state-aware-planning (camada 0) gera state-snapshot-<ts>.md
        ↓
specialist-router (camada 1) classifica demanda
        ↓
spec-<NNN+1> criada via template ../templates/spec.md
        ↓
... loop reinicia ...
```

**Regra de fechamento:** o loop é considerado **completo** quando:

- [ ] Fases 01-04 preenchidas para a spec atual
- [ ] PR mergeado + CI 100% verde
- [ ] Retro completa (`b<N+1>-result.md`) com ≥ 1 proposal
- [ ] Demanda arquivada (`archive-demand.md`)
- [ ] Specs filhas abertas no backlog (se aplicável) OU justificativa explícita de "loop não gerou próxima spec" em `06-learn.md`

## §5. Integração com convenções existentes

| Convenção                     | Como esta convenção interage                                     |
|-------------------------------|------------------------------------------------------------------|
| [`evals.md`](./evals.md)      | Fases 02-03 produzem/consomem Evals. Regra 1:1 AC↔Eval preservada |
| [`tdd.md`](./tdd.md)          | Fase 03 (Test) **é** TDD Red→Green→Refactor                       |
| [`state-aware-planning.md`](./state-aware-planning.md) | Próxima spec começa com state-snapshot (camada 0)         |
| [`retrospective-capture.md`](./retrospective-capture.md) | Fase 06 (Learn) **é** a captura retro (T1/T2/T3)         |
| [`demand-archiving.md`](./demand-archiving.md) | Após fase 04 (Review) aprovada + retro: archive          |
| [`ci-defense-in-depth.md`](./ci-defense-in-depth.md) | Fase 03 (Test) roda no quality CI job gated            |
| [`cobertura-testes.md`](./cobertura-testes.md) | Gate universal ≥ 80% ao final da fase 03                |
| [`evolucao-agents.md`](./evolucao-agents.md) | Fase 06 (Learn) pode disparar gap_detected para novo specialist |

## §6. Composição com WORKFLOWS.md

| Workflow                     | Quando usar dentro do loop                                  |
|------------------------------|-------------------------------------------------------------|
| `feature-mode`               | Fases 01-04 de uma spec nova                                |
| `backend-feature` / `frontend-feature` | Fases 01-04 quando a spec é de stack específica   |
| `review-mode`                | Fase 04 (Review) — gate                                     |
| `retrospective-mode`         | Fase 06 (Learn) pós-merge                                   |
| `archive-demand`             | Após fase 06 — fecha a demanda                              |
| `feedback-to-spec`           | Fecha o loop: proposals retro → specs filhas                |

## §7. Critérios de aceite da própria convenção

A convenção `engineering-loop` está **ativa e obrigatória** quando:

- [x] `engineering-loop.md` publicada em `.agents/specs/conventions/`
- [x] 6 templates de fase publicadas em `.agents/specs/templates/engineering-loop/`
- [x] Template `business-rules.md` publicado
- [x] Workflow `feedback-to-spec.md` publicado
- [x] Cross-refs em `evals.md`, `AGENTS.md §6`, `WORKFLOWS.md` atualizadas
- [ ] Pelo menos 1 spec real do projeto preenche as 6 fases (gap atual — primeiro uso = template)

## §8. Cross-references

- Source article: [`docs/articles/vibe-coding-sdd-engineering-loop.md`](../../../docs/articles/vibe-coding-sdd-engineering-loop.md) §"Engineering Loop"
- Mapping analysis: [`docs/articles/vibe-coding-sdd-engineering-loop-mapping.md`](../../../docs/articles/vibe-coding-sdd-engineering-loop-mapping.md)
- WORKFLOWS: [`.agents/WORKFLOWS.md`](../../WORKFLOWS.md) → `feature-mode`, `retrospective-mode`, `archive-demand`, `feedback-to-spec`
- Spec template: [`../templates/spec.md`](../templates/spec.md)
- Evals convention: [`./evals.md`](./evals.md)

## §9. Histórico de Versões

| Versão | Data       | Mudança                                                                                                              |
|--------|------------|----------------------------------------------------------------------------------------------------------------------|
| 1.0    | 2026-09-30 | Lançamento inicial — unificação G3+G4+G5; 6 templates de fase + business-rules.md + feedback-to-spec workflow    |
