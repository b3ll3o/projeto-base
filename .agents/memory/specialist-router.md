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

### 2026-09-23 — primeira demanda real (dockerização apps/api + apps/web)

> Retro inline do rollout Fases 1-3 do plano
> `2026-09-23-specialist-router-docker-plan.md`. Único artefato de execução
> real até o momento (sem pilot dedicada). Dados coletados a partir do git log
> da branch `feat/dockerize-apps` (28 commits, plano de 6 fases) + leitura
> dos commits de fix.

#### Métricas de despacho (Fase 3 dockerização)

- **Demandas classificadas:** 1 demanda real (dockerização completa de monorepo)
- **Domínio roteado:** `infra` → `docker-specialist`
- **Sub-domínios:** `docker` (multi-stage Dockerfile, compose, dev override), `infra` (postgres, healthchecks)
- **Path_globs que casaram:** `apps/*/Dockerfile`, `docker-compose*.yml`, `.dockerignore`, `apps/*/src/modules/health/*`
- **Skip_rule compound PT ativa:** `"docker wrote docker for"` (clássico do plano) — sem ela, classifier teria roteado para `monorepo-specialist` (FP por causa de "docker" como container de pacotes pnpm)
- **Reviewers cross-domínio despachados:** `nestjs-fastify-gotchas` (CORS dev, prisma binário), `monorepo-specialist` (prisma CLI em runtime, turbo pipeline), `nextjs-specialist` (`output: 'standalone'`)

#### Gaps detectados durante a execução

1. **Plan omiteu `tsconfig.base.json` no COPY multi-source.** Matrix v1.0 do router não sinaliza "validar lista de arquivos copiados pelo Dockerfile contra o que existe no repo". A correção foi trivial (1 char), mas o gap estava escondido — só apareceu quando `docker build --target prod` falhou em sandbox. **Recomendação v1.1:** adicionar heurística `diff_pattern: 'COPY.*--from=builder' + paths vs build context` (alto risco de FP, marcar como P3).
2. **`pnpm prune --prod` no ENTRYPOINT não documentado na matriz.** Plan tinha `prisma migrate deploy` mas esqueceu que `pnpm prune --prod` remove `@prisma/client` (devDep). Detectado durante validação Task 14. **Recomendação:** matriz `infra` deveria ter `prisma_*_binary` como tag derivada de `apps/api/prisma/schema.prisma` presença.
3. **docker-specialist não tinha skill no momento da classificação.** Skill criada na Task 10 (Fase 2 Task), agente despachado antes da skill existir — agent usou memória + spec apenas. **Funcionou**, mas a consistência futura exige skill-first (criar skill antes do agent ser despachável pela matriz).
4. **`healthcheck` no compose omitido no plan original.** Plan listou endpoints `/api/v1/health` (api) + `/api/health` (web) mas esqueceu de adicionar `healthcheck:` block no `docker-compose.yml`. Endpoints foram criados em Tasks 17/18 sob demanda do reviewer, não do plan. **Recomendação:** matriz v1.1 + skill docker devem explicitar checklist "compose service → healthcheck obrigatório se endpoint existe".

#### FP / FN observados

- **FP rate:** 0 (matriz v1.0 + skip_rule compound PT funcionaram como projetado)
- **FN rate:** 0 (nenhuma demanda escapou da classificação)
- **Latência classifier:** < 50 ms (sub-ms; não medido formalmente, mas interativo durante plan)

#### Lições para próximas demandas

- **Pilot dedicada vale a pena mesmo sem demanda real imediata.** A pilot #001 do review-router descobriu 4 gaps antes do rollout. Sem pilot para o specialist-router, gaps 1-4 acima só foram detectados em produção (sandbox, mas equivalente).
- **Skill antes de agent na matriz.** Inverter a ordem da Fase 2 (criar skill antes do agent ser roteável).
- **Cross-ref entre matrizes.** review-router e specialist-router compartilham padrão (classificador + lint + matriz). Considerar unified-router v2.

#### Cross-refs desta retro

- Plan: `docs/superpowers/plans/2026-09-23-specialist-router-docker-plan.md`
- PR: `https://github.com/b3ll3o/projeto-base/pull/<TBD>` (preencher após gh pr create)
- Branch: `feat/dockerize-apps` (28 commits ao final)

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