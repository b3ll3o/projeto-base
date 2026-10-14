---
title: Plano de correção — 9 issues abertas (4 P0 + 5 P1)
slug: fix-issues-abertas-2026-10-13
generated_at: 2026-10-13T20:25:00Z
author: hermes-orchestrator
status: ready
scope: bugfix + drift + gap
state_snapshot: .agents/runs/state-snapshot-20261013T202500Z-fix-issues-abertas.md
estimated_prs: 5
estimated_total_diff: ~200 linhas
issues_resolved: 9
  - 67, 68, 69, 70 (P0)
  - 71, 72, 73, 74, 75 (P1)
---

# Plano de Correção — Issues Abertas 2026-10-13

> Plano multi-PR para fechar as **9 issues abertas** identificadas pelo
> `finding-orchestrator` no escaneamento weekly de 2026-10-13_135620.
> State-snapshot em
> [`.agents/runs/state-snapshot-20261013T202500Z-fix-issues-abertas.md`](../../.agents/runs/state-snapshot-20261013T202500Z-fix-issues-abertas.md).

## §0. Resumo executivo

| | |
|---|---|
| Issues P0 | 4 (#67, #68, #69, #70) |
| Issues P1 | 5 (#71, #72, #73, #74, #75) |
| PRs planejados | 5 (PR-1 a PR-5) |
| Estratégia | agrupar por **arquivo/bounded context**, não por issue |
| Ordem de merge | PR-3 → PR-1 → PR-2 → PR-4 → PR-5 |
| Versão final | v1.11.0 (3 feat + 3 fix + 1 docs + 1 chore pós-v1.10.0) |

## §1. Diagnóstico por issue

> Detalhe em cada issue GitHub; aqui só o suficiente para planejar.

### P0 — bloqueiam produção

- **#67** — Drift de versão: `STACK.md:139` em 1.9.1, `MONOREPO.md:266` em 1.10.0, `estrutura-e-versionamento.md:101` em 1.10.0, `TEMPLATE_USAGE.md:167` em 1.9.1. → resolvido por **PR-5**
- **#68** — `docker-compose.yml:4-9` com `POSTGRES_PASSWORD: projeto` em plaintext + `DATABASE_URL` linha 28 com placeholder literal `'postgresql://projeto:***@...'` (falha em prod). → resolvido por **PR-1**
- **#69** — `apps/api/prisma/migrations/20260922003354_init_audit_user/migration.sql:21-33` cria `users_history` sem `DEFAULT gen_random_uuid()` apesar do schema declarar `@default(uuid())`. → resolvido por **PR-3**
- **#70** — `apps/web/lib/api-client.ts:40-44` faz `fetch` sem `signal`/timeout — DoS interno sob outage. → resolvido por **PR-4**

### P1 — devem ser corrigidas no mesmo ciclo

- **#71** — 8 commits (#59–#66) sem tag — bump v1.11.0 pendente. → resolvido por **PR-5**
- **#72** — Sem `rate-limit` global na API (`apps/api/src/main.ts`). → resolvido por **PR-2**
- **#73** — CORS permissivo em dev/staging (`apps/api/src/main.ts:31-33` com `origin: true, credentials: true`). → resolvido por **PR-2**
- **#74** — Imagens sem digest: `postgres:16-alpine`, `node:22-bookworm-slim`, `otel/opentelemetry-collector-contrib:0.103.0`. → resolvido por **PR-1**
- **#75** — OTel Collector sem `memory_limiter` processor. → resolvido por **PR-1** (parte do compose hardening) + nota em release

## §2. Estratégia de PRs (5 PRs, não 1 nem 9)

> Por que 5? Detalhe no state-snapshot §4. Resumo: agrupar por arquivo
> reduz overhead (5× CI vs 9×) sem perder coesão (1 arquivo por PR).

| PR | Issues | Arquivo principal | Specialist autor | Specialist reviewer | Estimativa diff |
|---|---|---|---|---|---|
| **PR-3** | #69 | `apps/api/prisma/migrations/20260922003354_init_audit_user/migration.sql` | prisma-db-specialist | code-reviewer | ~4 linhas |
| **PR-1** | #68, #74, #75 (parcial) | `docker-compose.yml` | docker-prod-specialist | security-auditor | ~80 linhas |
| **PR-2** | #72, #73 | `apps/api/src/main.ts`, `apps/api/src/app.module.ts` | nestjs-specialist | security-auditor | ~50 linhas |
| **PR-4** | #70 | `apps/web/lib/api-client.ts` | nextjs-specialist | code-reviewer | ~30 linhas |
| **PR-5** | #67, #71 | `docs/STACK.md`, `docs/TEMPLATE_USAGE.md`, `.github/workflows/release-template.yml` | release-versioning-specialist | doc-writer | ~30 linhas + tag |

## §3. Detalhamento por PR (resumo)

> **Diff completo + snippets inline** de cada PR estão em
> [`2026-10-13-fix-issues-abertas-apendice.md`](./2026-10-13-fix-issues-abertas-apendice.md) §C.
> Aqui só o suficiente pra entender o que cada PR faz e qual specialist é autor.

### PR-3 — prisma migration fix (#69)

- **Branch:** `fix/prisma-default-uuid-history`
- **Arquivo:** `apps/api/prisma/migrations/20260922003354_init_audit_user/migration.sql`
- **Diff:** 2 linhas (`ALTER TABLE ... ALTER COLUMN id SET DEFAULT gen_random_uuid()`)
- **Specialist autor:** `prisma-db-specialist`
- **Reviewer:** `code-reviewer`
- **Validação:** `prisma migrate status` + `prisma migrate diff` sem drift

### PR-1 — docker hardening (#68, #74, #75)

- **Branch:** `fix/docker-hardening-compose`
- **Arquivos:** `docker-compose.yml`, `infra/otelcol/config.yaml` (memory_limiter), `.env.production.example`
- **Diff:** ~85 linhas (3 imagens com `@sha256`, 4 `mem_limit`, `env_file`, `memory_limiter` processor)
- **Specialist autor:** `docker-prod-specialist`
- **Reviewer:** `security-auditor`
- **Decisão chave:** incluir o `memory_limiter` do OTel Collector já em PR-1
  (custo +2 linhas) para fechar #75 inteira, em vez de espalhar em 2 PRs

### PR-2 — api hardening (#72, #73)

- **Branch:** `fix/api-hardening-cors-ratelimit`
- **Arquivos:** `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/package.json`
- **Diff:** ~50 linhas (ThrottlerGuard 100/min + CORS whitelist via `ALLOWED_ORIGINS` env)
- **Specialist autor:** `nestjs-specialist`
- **Reviewer:** `security-auditor`
- **Dependência nova:** `@nestjs/throttler` (a adicionar no `package.json` da API)

### PR-4 — web fetch timeout (#70)

- **Branch:** `fix/web-api-client-timeout`
- **Arquivo:** `apps/web/lib/api-client.ts`
- **Diff:** ~30 linhas (AbortController com timeout 10s + `ApiTimeoutError`)
- **Specialist autor:** `nextjs-specialist`
- **Reviewer:** `code-reviewer`
- **Validação:** spec unit com mock que nunca resolve + spec e2e da rota `/users`

### PR-5 — doc versioning + release v1.11.0 (#67, #71)

- **Branch:** `release/v1.11.0`
- **Arquivos:** 4 footers de versão + workflow `release-template.yml` + tag `v1.11.0`
- **Diff:** ~30 linhas (bump de versão em 4 docs + entrada no histórico STACK +
  automação `release-template.yml` para sincronizar 4 footers atomicamente)
- **Specialist autor:** `release-versioning-specialist`
- **Reviewer:** `doc-writer`
- **Nota:** PR-5 só mergeia depois de PR-3 + PR-1 + PR-2 + PR-4; o `quality`
  gate do `main` + ordem de merge (regra §4 abaixo) garante isso

---

## §4. Ordem de execução e dependências

```text
PR-3 (prisma) ──┐
                ├── mergeáveis em qualquer ordem entre si
PR-1 (docker) ──┤
                │
PR-2 (api) ─────┤
                │
PR-4 (web) ─────┘
                │
                ▼
              PR-5 (release) — fecha com v1.11.0
```

**Justificativa da ordem:**

1. **PR-3 primeiro** — diff mínimo (4 linhas), mais simples, caminho livre pra qualquer um
2. **PR-1 segundo** — maior diff (80 linhas), mas isolado em `docker-compose.yml`
3. **PR-2 terceiro** — adiciona dependência (`@nestjs/throttler`); vai exigir `pnpm install` + lockfile diff
4. **PR-4 quarto** — pequeno, frontend isolado
5. **PR-5 último** — bump + tag; faz sentido fechar o ciclo com release depois de todos os fixes merged

**Dependências de review:**
- Cada PR dispara `stack-code-review` + `docs-sync` automaticamente (workflows já wired)
- `finding-orchestrator` faz dedup contra estas 9 issues ao receber novos findings

## §5. Critérios de aceite globais

- [ ] Todas as 9 issues fechadas com referência ao PR que as resolve
- [ ] Cada PR com 5/5 CI verde (preflight, sync, review, docker-build-prod, quality)
- [ ] Cada PR com `stack-code-review` sem blockers
- [ ] `pnpm ci:preflight` local ok (limitado pelo sandbox Node 20 — autorrelado)
- [ ] Tag `v1.11.0` criada e anotada
- [ ] Footers de STACK/MONOREPO/estrutura/TEMPLATE_USAGE em sincronia
- [ ] Retrospective-capture disparado após PR-5 (campanha T1 — plano multi-task)

## §6. Riscos e mitigações

> Detalhamento (5 riscos A.1–A.5 + cenários e mitigação estendida) em
> [`2026-10-13-fix-issues-abertas-apendice.md`](./2026-10-13-fix-issues-abertas-apendice.md) §A.

| Risco | Prob. | Imp. | Mitigação curta |
|---|---|---|---|
| `ALTER TABLE ... SET DEFAULT` em prod tem lock implícito | média | médio | PR-3 só após `prisma migrate resolve --applied`; `ADD DEFAULT` é instantâneo em PG ≥ 11 |
| `digest` errado de imagem trava build | baixa | alto | PR-1 extrai SHA256 via `docker inspect` antes de pinar |
| `@nestjs/throttler` quebra spec e2e | média | médio | Throttler 100/min é folgado; health com `@SkipThrottle()` |
| PR-5 com bump errado dispara release cedo | baixa | alto | PR-5 só mergeia depois dos 4 anteriores; `main` exige `quality` |
| Token de release sem permissão de tag | baixa | médio | Workflow já tem `contents: write`; tag manual como fallback |

## §7. Métricas esperadas (pós-PR-5)

> Tabela completa (antes/depois com 12 linhas) em
> [`2026-10-13-fix-issues-abertas-apendice.md`](./2026-10-13-fix-issues-abertas-apendice.md) §B.

**Antes:** 9 issues abertas, 0 containers com mem_limit, 0 imagens com digest, CORS `origin: true`, fetch sem timeout, migration sem DEFAULT, tag em 1.10.0.

**Depois:** 0 issues abertas, 4 containers com mem_limit, 3 imagens com digest, CORS whitelist via env, fetch 10s, 2 migrations com DEFAULT, tag em 1.11.0.

## §8. Próximos passos (handoff)

1. **Validar este plano** — revisão do user antes de iniciar
2. **Criar as 5 branches** — `fix/prisma-default-uuid-history`, `fix/docker-hardening-compose`, `fix/api-hardening-cors-ratelimit`, `fix/web-api-client-timeout`, `release/v1.11.0`
3. **Implementar PR-3 primeiro** (mais simples)
4. **Após cada merge** — disparar `finding-orchestrator` (caminho `feedback-to-spec`) pra confirmar que a issue fechou e não regrediu
5. **Após PR-5 mergeado** — `retrospective-capture` (campanha T1 ≥ 3 tasks)

## §9. Cross-refs

- State-snapshot: [`.agents/runs/state-snapshot-20261013T202500Z-fix-issues-abertas.md`](../../.agents/runs/state-snapshot-20261013T202500Z-fix-issues-abertas.md)
- Issues: #67, #68, #69, #70, #71, #72, #73, #74, #75
- Planos relacionados:
  - [2026-10-03-guard-classes.md](./2026-10-03-guard-classes.md) — task 4.1 amarra turbo-redirect + Node 22.6
  - [2026-10-02-melhorias-fluxo-desenvolvimento.md](./2026-10-02-melhorias-fluxo-desenvolvimento.md) — define o próprio conceito de "fluxo de desenvolvimento"
- Convenções aplicadas:
  - [state-aware-planning.md](../.agents/specs/conventions/state-aware-planning.md) — camada 0 do pre-planner
  - [retrospective-capture.md](../.agents/specs/conventions/retrospective-capture.md) — captura pós-campanha
  - [git-workflow.md](../.agents/specs/conventions/git-workflow.md) — branch antes de commit
  - [tamanho-e-revisao.md](../.agents/specs/conventions/tamanho-e-revisao.md) — limite 300 linhas
