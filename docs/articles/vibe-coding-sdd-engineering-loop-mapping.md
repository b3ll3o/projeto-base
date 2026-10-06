---
name: vibe-coding-sdd-engineering-loop-mapping
description: >-
  Análise de como os conceitos do artigo "Vibe Coding, SDD e Engineering Loop"
  (Dennis Rojas, Tech na Prática, 2026-09-15) já vivem no padrão genérico de
  agents deste projeto. Tabela conceito-a-conceito + checklist de revisão.
source_url: https://www.linkedin.com/pulse/vibe-coding-sdd-engineering-loop-evals-e-context-criando-dennis-rojas-wh4jf
author: Dennis Rojas
newsletter: Tech na Prática
published: 2026-09-15
updated: 2026-10-06
maintainer: projeto-base contributors
language: pt-BR
tags: [sdd, context-engineering, evals, engineering-loop, ddd, mapping]
related:
  - ../../AGENTS.md
  - ../../.agents/WORKFLOWS.md
  - ../../.agents/specs/conventions/engineering-loop.md
  - ../../.agents/specs/conventions/evals.md
  - ./vetor-grafos-fine-tuning-resumo.md
status: analysis
---

# Mapeamento para o projeto-base — Vibe Coding, SDD, Engineering Loop, Evals e Context Engineering

> Fonte: Dennis Rojas, *Tech na Prática*, publicado em 2026-09-15.
> Este arquivo contém **somente a análise** de como cada conceito do artigo já
> vive no padrão genérico de agents deste projeto.
>
> A transcrição do artigo **não** está neste repositório. Ela sobrevive apenas na
> tag `backup/docs/articles-transcription-vibe-coding-sdd`; recupere com
> `git show <tag>:docs/articles/vibe-coding-sdd-engineering-loop.md`. Para o
> contexto, ver [`evals.md` §0](../../.agents/specs/conventions/evals.md).

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
| **Feedback → próxima spec** (loop fecha)            | [`archive-demand`](../../.agents/workflows/archive-demand.md) → arquivo `YYYY-MM-DD-<slug>.md` em `.agents/runs/archive/` ([`demand-archiving.md`](../../.agents/specs/conventions/demand-archiving.md)) |

## §2. Como implementar a fintech do artigo neste projeto

**Conclusão do mapeamento:** o artigo descreve **o "quê"** (quais artefatos produzir); o projeto-base descreve **o "como"** (quais agents produzem, em que ordem, com quais handoffs). Para implementar uma fintech como a do artigo dentro deste projeto, o caminho natural é:

1. **`specialist-routing`** (state-snapshot + classificador) identifica `nestjs-specialist` + `monorepo-specialist` + `docker-specialist` + `telemetry-specialist`.
2. **`orchestrator`** decompõe em sub-tasks (`spec → research → data-model → contracts → plan → tasks → code`).
3. **`nestjs-specialist`** aplica a lens DDD/Hexagonal em cada Bounded Context (Accounts, Pix, Ledger, Fraud, ...).
4. **`test-writer`** (TDD Red→Green→Refactor) + **`stack-code-reviewer`** (lens D11 — Architecture Evals via ArchUnit, ainda **previsto** e não implementado: `find . -iname '*archunit*'` → vazio) executam a esteira de Evals.
5. **`review-router`** auto-classifica o diff e despacha reviewers em paralelo.
6. **`retrospective-mode`** fecha o loop e alimenta a próxima spec. O destino canônico do result file é declarado **uma única vez** — em [`retrospective-capture.md` §Destino canônico](../../.agents/specs/conventions/retrospective-capture.md); repeti-lo aqui seria exatamente o defeito que aquela seção nomeia.

## §3. Checklist de Revisão (`tamanho-e-revisao.md`)

- [x] Dentro do teto de 300 linhas — `wc -l <este arquivo>`
- [x] pt-BR no corpo
- [x] Identificadores técnicos em inglês (kebab-case, paths, comandos)
- [x] Frontmatter no **formato do artigo irmão**
      [`vetor-grafos-fine-tuning-resumo.md`](./vetor-grafos-fine-tuning-resumo.md) —
      este é um **superconjunto** dele (acrescenta `language`, `tags`, `related`,
      `status`). **Não existe schema canônico de artigo no repo** contra o qual
      validar; quem precisar de um, que o crie antes de chamá-lo de canônico.
- [x] Todo `[texto](path)` do corpo resolve — validado por `pnpm ci:preflight`
      (`check-doc-refs`), não por contagem
- [x] §1 mapeia 1:1 os conceitos centrais do artigo
- [x] A transcrição está declarada fora do repositório, com o comando de
      recuperação a partir da tag
- [x] §1 e §2 são análise original do autor do projeto-base (não estavam no artigo)

> **O `related:` do frontmatter não é validado.** O `check-doc-refs` extrai
> links só pela forma `[texto](path)`, e YAML não tem essa forma — medido com
> `grep -oE '\]\([^)]+\)' <arquivo> | wc -l`: o corpo devolve contagem, o
> frontmatter devolve **0**. Os caminhos de `related:` resolvem hoje, mas um
> quebrado amanhã passaria verde. Ampliar o gate é trabalho à parte, com risco
> de falso positivo: quase trinta arquivos versionados declaram `related:`
> (`git grep -l '^related:' -- '*.md' | wc -l`).

**Mantido por:** projeto-base contributors · **Licença:** MIT.
