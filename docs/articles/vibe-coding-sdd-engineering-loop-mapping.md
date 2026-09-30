---
title: "Mapeamento para o projeto-base — Vibe Coding, SDD, Engineering Loop, Evals e Context Engineering"
source_article: ./vibe-coding-sdd-engineering-loop.md
source_author: Dennis Rojas
source_newsletter: Tech na Prática
source_published_at: 2026-09-15
fetched_at: 2026-09-30
language: pt-BR
tags: [sdd, context-engineering, evals, engineering-loop, ddd, mapping]
related:
  - ./vibe-coding-sdd-engineering-loop.md
  - ../../AGENTS.md
  - ../../.agents/WORKFLOWS.md
status: analysis
---

# Mapeamento para o projeto-base

> **Companion do artigo:** [`./vibe-coding-sdd-engineering-loop.md`](./vibe-coding-sdd-engineering-loop.md) (transcrição fiel). Este arquivo contém **somente a análise** de como cada conceito do artigo já vive no padrão genérico de agents deste projeto.

## §1. Correspondência conceito-a-conceito

O artigo descreve — de forma independente e aplicada a uma fintech — exatamente o **padrão genérico de agents de IA** que este projeto implementa. A correspondência não é coincidência: ambos partem do mesmo problema ("o gargalo deixou de ser geração e passou a ser contexto") e convergem nas mesmas soluções.

| Conceito do artigo                                  | Onde vive no projeto-base                                                                                                |
|-----------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------|
| **Context Engineering** (artefatos versionados)     | `.agents/` (agents, skills, workflows, conventions, memory, runs) — ver [AGENTS.md §1](../../AGENTS.md)                   |
| **SDD** (spec → research → plan → tasks → code)     | [`.agents/WORKFLOWS.md`](../../.agents/WORKFLOWS.md) `feature-mode` / `backend-feature` / `frontend-feature`            |
| **DDD + fronteiras semânticas** (Bounded Contexts)  | [`.agents/specs/conventions/estrutura-e-versionamento.md`](../../.agents/specs/conventions/estrutura-e-versionamento.md) (lens DDD/Hexagonal do `nestjs-specialist`) |
| **Context Map** (quem fala com quem)                | [`.agents/specs/conventions/specialist-routing.md`](../../.agents/specs/conventions/specialist-routing.md) (matriz canônica keywords→paths→scopes) |
| **Evals verificáveis** (Domain, Architecture, etc.) | [`.agents/specs/conventions/tdd.md`](../../.agents/specs/conventions/tdd.md) + `stack-code-reviewer` (lens D11) + CI defense ([`ci-defense-in-depth.md`](../../.agents/specs/conventions/ci-defense-in-depth.md)) |
| **Reviewer Agent** (eval por outro agente)          | [`code-reviewer`](../../.agents/agents/code-reviewer.md) + [`review-router`](../../.agents/agents/review-router.md) (auto-classifica diff e despacha reviewers em paralelo) |
| **Engineering Loop** (Understand→Learn)             | [`orchestrator`](../../.agents/agents/orchestrator.md) + [`retrospective-mode`](../../.agents/workflows/retrospective-mode.md) + [`retrospective-capture`](../../.agents/specs/conventions/retrospective-capture.md) |
| **State-snapshot antes de planejar**                | [`.agents/specs/conventions/state-aware-planning.md`](../../.agents/specs/conventions/state-aware-planning.md) (camada 0 do pre-planner, v1.8.0+) |
| **Pre-dispatch checks (matriz existe, etc.)**       | [`specialist-router`](../../.agents/agents/specialist-router.md) (camada 1 do pre-planner)                                |
| **Spec/ADR/Eval como contrato do agent**            | [`.agents/specs/conventions/evolucao-agents.md`](../../.agents/specs/conventions/evolucao-agents.md) (regra `gap_detected`) |
| **Feedback → próxima spec** (loop fecha)            | [`archive-demand`](../../.agents/workflows/archive-demand.md) → `.agents/runs/archive/<ts>-<slug>/`                        |

## §2. Como implementar a fintech do artigo neste projeto

**Conclusão do mapeamento:** o artigo descreve **o "quê"** (quais artefatos produzir); o projeto-base descreve **o "como"** (quais agents produzem, em que ordem, com quais handoffs). Para implementar uma fintech como a do artigo dentro deste projeto, o caminho natural é:

1. **`specialist-routing`** (state-snapshot + classificador) identifica `nestjs-specialist` + `monorepo-specialist` + `docker-specialist` + `telemetry-specialist`.
2. **`orchestrator`** decompõe em sub-tasks (`spec → research → data-model → contracts → plan → tasks → code`).
3. **`nestjs-specialist`** aplica a lens DDD/Hexagonal em cada Bounded Context (Accounts, Pix, Ledger, Fraud, ...).
4. **`test-writer`** (TDD Red→Green→Refactor) + **`stack-code-reviewer`** (lens D11 — Architecture Evals via ArchUnit) executam a esteira de Evals.
5. **`review-router`** auto-classifica o diff e despacha reviewers em paralelo.
6. **`retrospective-mode`** fecha o loop com `engineering/feedback/<spec>.md` e alimenta a próxima spec.

## §3. Checklist de Revisão (`tamanho-e-revisao.md`)

- [x] Arquivo ≤ 300 linhas (~50 linhas)
- [x] pt-BR no corpo
- [x] Identificadores técnicos em inglês (kebab-case, paths, comandos)
- [x] Frontmatter canônico com `source_article`, `source_author`, `related`
- [x] Cross-refs verificadas (paths relativos a partir de `docs/articles/`)
- [x] Tabela de mapeamento com 11 entradas (1:1 com os conceitos centrais do artigo)
- [x] Companion explícito do arquivo de transcrição
- [x] Análise original do autor do projeto-base (não estava no artigo)

**Mantido por:** projeto-base contributors · **Licença:** MIT.
