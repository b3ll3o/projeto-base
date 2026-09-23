---
name: review-router
type: agent_memory
description: Memória acumulada do agent review-router — aprendizados sobre classificação de diff, despacho de reviewers e agregação de findings
---

# Memória: review-router

> Estado evolutivo do agent. Atualizado após cada run significativo.

## Estado Inicial (2026-09-22)

- Criado em: feat/review-router-agent (Fase 3 do plano)
- Spec: `docs/superpowers/specs/2026-09-22-review-router-design.md`
- Plan: `docs/superpowers/plans/2026-09-22-review-router-plan.md`
- Matriz v1: `.agents/specs/conventions/review-routing.md`
- Classificador: `tooling/scripts/review-router.ts` (TDD, 17 testes)
- Lint: `tooling/scripts/lint-review-routing.ts`

## Learnings (acumular conforme uso)

### Pilot Run #001 (2026-09-22)

- **Output canônico:** `.agents/runs/2026-09-22-pilot-001.yaml`
- **Retro file:** `.agents/runs/2026-09-22-pilot-001.md`
- **Fixture:** 1 commit `docs(agents):` em 1 arquivo `.md` (Seção 5 "Exemplos" adicionada à matriz)
- **Classifier output:** `reviewers: [doc-sync]` (path_glob + commit_type)
- **Router output:** 2 dispatched (spec-compliance-reviewer + doc-sync) + 1 skipped (code-quality-reviewer)
- **Latência:** 889 ms << 90 s budget (cold-start do tsx domina; lógica é sub-ms)
- **Findings:** 0 (fixture trivial sem decisões de design)

#### Observações sobre Matriz v1

- **Skip rules funcionam conforme projetado.** Fixture `docs(...)` em `.md` ativou corretamente AMBAS as skip rules de `code-quality-reviewer` (`.md` + scope=docs) e NENHUMA de `spec-compliance-reviewer`.
- **Aliases passam silenciosos no lint.** `spec-compliance-reviewer` e `code-quality-reviewer` (em `always_on` e `skip_rules`) NÃO são validados pelo lint (lint só checa `path_globs`, `commit_types`, `diff_patterns`). Aliases para `code-reviewer` são resolvidos em runtime pelo agent `review-router`.
- **Classifier não aplica skip rules.** `pnpm review:route` retorna apenas `reviewers[]` brutos (paths + commit types + diff patterns). Skip rules precisam de `task.scope` (input do controller) e são aplicadas pelo **agent** `review-router`, não pelo classificador. Isso é intencional mas significa que classifier output ≠ router output.
- **`domains[]` sempre vazio.** O classificador popula `reviewers[]` mas o campo `domains[]` permanece vazio. Consumidores devem usar `reviewers[]` (não `domains[]`). Não bloqueador, mas documentar.
- **Redundância aceitável em skip rules.** `code-quality-reviewer` tem 2 condições de skip (`.md` + scope=docs). Em docs commits típicos, ambas casam. Mas scope=docs com paths mistos (doc + code) ainda dispara, então a regra `scope == 'docs'` cobre casos onde `all_paths endsWith .md` não dispararia. Manter ambas.

#### Cobertura de Caminhos Lógicos

- [x] always_on dispatch (spec-compliance-reviewer dispatched)
- [x] always_on skip (code-quality-reviewer skipped)
- [x] domain dispatch via path_glob (doc-sync)
- [x] domain dispatch via commit_type (doc-sync via docs type)
- [ ] domain dispatch via diff_pattern (NÃO exercitado — pendente Fase 4 com fixture security/nestjs)
- [ ] blocking match (NÃO exercitado — pendente Fase 4 com bcrypt/jwt/secret)

#### Métricas

- Latência classifier: 889 ms (inclui cold-start tsx + I/O)
- Latência total pilot: 889 ms (sem live dispatch)
- Reviewers dispatched/skipped: 2/1 de 3 resolvidos
- Findings: 0
- Consensus: 0 (sem findings)

#### Gaps Identificados (não bloqueadores para pilot)

1. Lint deveria avisar (não erro) sobre aliases em `always_on`/`skip_rules` sem mapeamento em `.agents/agents/*.md`.
2. Pilot não cobriu `diff_pattern` match → Fase 4 deve criar fixture com security/decorators.
3. Skip rules avaliadas fora do classificador dificulta testabilidade headless → considerar v2 da matriz com `task.scope` explícito no CLI.
4. `domains[]` nunca populado → ou implementar inferência de domínio ou remover do schema.

### Recomendações para Próximas Pilot Runs

- **Fase 4 fixture #1:** `feat(api): adicionar endpoint com @Injectable + bcrypt hash` → exercitaria nestjs-specialist, security-auditor, blocking=true
- **Fase 4 fixture #2:** `chore(monorepo): bump pnpm-workspace.yaml globs` → exercitaria monorepo-specialist com blocking=true
- **Fase 4 fixture #3:** `feat(web): adicionar use client component com next/image` → exercitaria nextjs-specialist via diff_pattern
- Cada fixture deve ser descartável (não merge em main) e ter retro file próprio.

## Gaps Conhecidos

- `performance-auditor` referenciado em Open Question §12 — não existe ainda
- Cache de resultados de reviewer: TTL não definido (Open Question §12.2)
- Notificação entre router e reviewers: dispatch direto (Open Question §12.4)

## Pilot Summary Learnings (Fase 4-5)

> Sumário de aprendizados extraídos da pilot run #001 + 5 tasks reais
> e sprint validation da Fase 5. Atualizado em 2026-09-22.

### Sprint Validation (Fase 5)

- **Data:** 2026-09-22
- **Status:** matriz v1 production-ready (4 caminhos lógicos exercitados
  com fallback razoável; ressalvas documentadas).
- **Coverage matrix — router step nos 6 workflows:**

| # | Workflow | Router step | Evidência |
|---|---|---|---|
| 1 | monorepo-change.md | sim | commit `6759255` |
| 2 | backend-feature.md | sim | commit `1cf78c3` (Task 5.1) |
| 3 | frontend-feature.md | sim | commit `1cf78c3` (Task 5.2) |
| 4 | ci-defense-mode.md | sim | commit `1cf78c3` (Task 5.3) |
| 5 | release-mode.md | sim | commit `1cf78c3` (Task 5.4) |
| 6 | retrospective-mode.md | sim | commit `1cf78c3` (Task 5.5) |

**Cobertura: 6/6 (100%).** Verificado via
`grep -c "review-router\|review:route" .agents/workflows/*.md` → todos
retornam `2` matches (header da step + referência no fluxo).

### Production Metrics (pilot run #001 + 5 tasks)

- **Latência:** P50 = 889 ms / P95 = 911 ms / range 884–911 ms
  (variação 27 ms; budget 90 s; ~100× abaixo do teto).
- **Reviewers dispatched:** 18 total (avg 3.6/task; range 1–7).
- **Tasks validadas:** 5 (via `pnpm review:route` em commits reais).
- **Findings agregados:** 0 (pilot planeja dispatch, não executa reviewer).
- **Falsos positivos:** 1 blocking FP (Task 1 — test fixtures casam regex
  `bcrypt|argon2|hash\(|jwt\.sign|jwt\.verify`). Documentado como
  limitation known (Aprendizado #2 do pilot-summary).

### Cobertura de Caminhos Lógicos

| Caminho | Cobertura | Origem |
|---|---|---|
| `domain_dispatch` (path_glob casa reviewer) | **5/5 (100%)** | Tasks 1, 2, 3, 4, 5 |
| `diff_pattern_match` (regex casa → reviewer) | **1/5 (20%)** | Task 1 (FP via fixtures) |
| `blocking` em `path_globs` (turbo.json / pnpm-workspace.yaml) | **gap identificado** | Task 5 — classificador não propaga |

`always_on_dispatch` e `always_on_skip` ficam fora do classificador
(intentcional — skip rules vivem no agent `review-router`).

### FP Conhecido: bcrypt/argon2/jwt regex em test fixtures

- **Fixture:** `tooling/scripts/review-router.spec.ts` (255 linhas no
  commit `7ddb93e`).
- **Regex:** `bcrypt|argon2|hash\(|jwt\.sign|jwt\.verify` (matriz
  linha 132).
- **Match count:** **7** (verificado via
  `git show 7ddb93e:tooling/scripts/review-router.spec.ts |
  grep -cE "bcrypt|argon2|jwt\\.sign|jwt\\.verify"`).
- **Match lines:** **148, 150, 152, 167, 173, 174, 177**
  (verificado via mesmo comando com `-nE`).
- **Severidade:** FP de `blocking=true` — força exit 3 sem justificativa
  real (nenhum código de produção toca esses tokens).
- **Mitigação possível:** narrowing da regex para
  `bcrypt\\.hash\\(.*password|jwt\\.sign\\(.*secret` (P1 para v1.2).

### Gaps Forward-Tracked (matriz v1.2)

4 gaps priorizados no pilot-summary.md Aprendizados para Matriz v1.2:

1. **P1:** Flag `blocking: true` em `path_globs` (turbo.json,
   pnpm-workspace.yaml) não propagado pelo classifier
   (Aprendizado #1, linha 134 do pilot-summary).
2. **P1:** Narrowing de diff_patterns regex (FP em test fixtures)
   (Aprendizado #2, linha 135).
3. **P2:** Popular `domains[]` no classifier (Aprendizado #3, linha 136).
4. **P2:** Warning em lint para `path_globs` com `blocking: true` não
   honrado (Aprendizado #5, linha 137).

Recomendações explícitas do pilot-summary:

- v1.2 DEVE atacar os 2 P1 antes de qualquer expansão de path_globs ou
  diff_patterns.
- P2 podem ficar para v1.3 ou v1.4 conforme prioridade.

### Mudança Estrutural vs Métrica-Produzida (Fase 5)

A migração da Fase 5 (commit `1cf78c3`) adiciona passo `pnpm review:route`
em 5 workflows pré-existentes — **mudança estrutural**, não métrica-produzida.
Critério de validação (router presente em todos os 6 workflows) satisfeito
por inspeção. Métricas continuam sendo as do pilot run (5 tasks).

Próxima coleta de métricas será orgânica, conforme workflows adotados
forem executados em PRs reais.

## Cross-refs

- [`.agents/agents/review-router.md`](../agents/review-router.md) — definition
- [`.agents/skills/review-routing/SKILL.md`](../skills/review-routing/SKILL.md) — workflow
- [`.agents/specs/conventions/review-routing.md`](../specs/conventions/review-routing.md) — matriz
