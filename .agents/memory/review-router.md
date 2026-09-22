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

## Cross-refs

- [`.agents/agents/review-router.md`](../agents/review-router.md) — definition
- [`.agents/skills/review-routing/SKILL.md`](../skills/review-routing/SKILL.md) — workflow
- [`.agents/specs/conventions/review-routing.md`](../specs/conventions/review-routing.md) — matriz
