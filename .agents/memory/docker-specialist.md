---
name: docker-specialist
type: agent_memory
description: Memória acumulada do agent docker-specialist. Estado inicial v1.0 (2026-09-23); learnings atualizados após cada demanda real.
---

# Memória: `docker-specialist`

> Arquivo de memória do agent `docker-specialist`. Atualizado após cada execução significativa.

## Estado Inicial (v1.0 — 2026-09-23)

Agent criado durante rollout do specialist-router (Fase 2 Task 9). Demanda atual: dockerização de `apps/api` + `apps/web` do monorepo projeto-base (NestJS + Next.js + Postgres).

**Paths relevantes:**

- Spec: `docs/superpowers/specs/2026-09-23-specialist-router-docker-design.md`
- Plan: `docs/superpowers/plans/2026-09-23-specialist-router-docker-plan.md` (master) + Fase 2 (`2026-09-23-specialist-router-docker-fase-02-docker-specialist.md`)
- Skill: `.agents/skills/docker/SKILL.md` (a ser criada na Task 10)
- Demanda ativa: dockerização `apps/api` + `apps/web`

## Learnings

_(vazio — populado após primeira demanda real)_

## Padrões Descobertos

_(vazio)_

## Cross-refs

- `.agents/agents/docker-specialist.md` — agent definition
- `.agents/skills/docker/SKILL.md` — convenções docker do projeto (Task 10)
- `.agents/specs/conventions/specialist-routing.md` — matriz que classifica docker-specialist
- `.agents/memory/specialist-router.md` — memória do orquestrador