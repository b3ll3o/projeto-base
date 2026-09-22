---
name: review-router
type: agent_memory
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

_(vazio — primeira versão)_

## Gaps Conhecidos

- `performance-auditor` referenciado em Open Question §12 — não existe ainda
- Cache de resultados de reviewer: TTL não definido (Open Question §12.2)
- Notificação entre router e reviewers: dispatch direto (Open Question §12.4)

## Cross-refs

- [`.agents/agents/review-router.md`](../agents/review-router.md) — definition
- [`.agents/skills/review-routing/SKILL.md`](../skills/review-routing/SKILL.md) — workflow
- [`.agents/specs/conventions/review-routing.md`](../specs/conventions/review-routing.md) — matriz