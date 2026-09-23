---
name: specialist-router
type: agent_memory
description: Memória acumulada do specialist-router — aprendizados sobre classificação de demanda, despacho de specialists, detecção de gaps
---

# Memória: `specialist-router`

> Estado evolutivo do agent. Atualizado após cada run significativo.

## Estado Inicial (2026-09-23)

- Criado em: `feat/dockerize-apps` (Fase 1 do plano specialist-router + docker-specialist)
- Spec: `docs/superpowers/specs/2026-09-23-specialist-router-docker-design.md` §5.1
- Plan: `docs/superpowers/plans/2026-09-23-specialist-router-docker-plan.md`
- Plan Fase 1: `docs/superpowers/plans/2026-09-23-specialist-router-docker-fase-01-infra-router.md`
- Matriz v1.0: `.agents/specs/conventions/specialist-routing.md` (a ser criada em Task 3)
- Classificador: `tooling/scripts/specialist-router.ts` (a ser criado em Task 4, TDD 15+ testes)
- Lint: `tooling/scripts/lint-specialist-routing.ts` (a ser criado em Task 5, TDD 8+ testes)

## Learnings (acumular após pilot e runs reais)

<!-- Preenchido após execução de pilot run + demandas reais -->

## Gaps Conhecidos

- G1 (P2): Keywords regex ingênuo — pode dar FP em "docker" como adjetivo (mitigação: scope_filter `infra`; refinar após 5 demandas reais)
- G2 (P2): Matriz v1.0 não cobre meta-agents (`code-reviewer`, `tdd-enforcer`, `orchestrator`, `agent-architect`) — gates têm vida autônoma
- G3 (P3): Classificador precisa de `noUncheckedIndexedAccess` enforcement (mirror do review-router)
- G4 (P3): Skip rules textuais (não programáticas) — aceito em v1.0, alinhado com review-router
- G5 (P3): Pilot run não executado antes da demanda real — retro captura aprendizados para v1.1 pós-dockerização

## Cross-refs

- [`.agents/agents/specialist-router.md`](../agents/specialist-router.md) — definition
- [`.agents/specs/conventions/specialist-routing.md`](../specs/conventions/specialist-routing.md) — matriz (criada em Task 3)
- [`.agents/skills/specialist-routing/SKILL.md`](../skills/specialist-routing/SKILL.md) — workflow do controller (criada em Task 2)
- [`.agents/agents/review-router.md`](../agents/review-router.md) — precedente (orquestra revisão; mesmo padrão)
- [`.agents/memory/review-router.md`](./review-router.md) — learnings consolidados do precedente