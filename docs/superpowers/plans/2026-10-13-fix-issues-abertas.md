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

## §3. Detalhamento por PR

### PR-3 — prisma migration fix (#69)

**Branch:** `fix/prisma-default-uuid-history`

**Diff esperado** (`apps/api/prisma/migrations/20260922003354_init_audit_user/migration.sql`):

```sql
-- Add: para users_history.id e users_archive.id
ALTER TABLE "users_history" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "users_archive" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
```

**Validação:**
- `pnpm exec prisma migrate status` → ambos aplicados
- `pnpm exec prisma migrate diff` contra `schema.prisma` → sem drift
- `pnpm -F @projeto/api exec prisma db execute --file ...` (smoke test)

**TDD:** spec de migração existente em `apps/api/prisma/migrations/__tests__/` deve passar.

---

### PR-1 — docker hardening (#68, #74, #75 parcial)

**Branch:** `fix/docker-hardening-compose`

**Diff esperado:**

```yaml
# docker-compose.yml — mudanças

services:
  postgres:
    image: postgres:16-alpine@sha256:<digest>   # #74
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-projeto}    # #68
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?senha obrigatória}  # #68
      POSTGRES_DB: ${POSTGRES_DB:-projeto_base}
    env_file:                                     # novo
      - .env.production
    mem_limit: 512m                               # #75 indireto

  api:
    environment:
      DATABASE_URL: ${DATABASE_URL}               # #68 — era placeholder literal
    mem_limit: 1g

  web:
    mem_limit: 1g

  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.103.0@sha256:<digest>  # #74
    mem_limit: 512m                               # #75
```

**Arquivo novo:** `.env.production.example` com placeholders `CHANGE_ME_*`.

**Validação:**
- `docker compose config` → resolve sem erro
- `docker compose up -d postgres` → sobe com env do `.env.production`
- `docker inspect postgres | grep -i sha256` → confirma digest pinado
- `OTel Collector config` (PR-3 do plano otelcol) adiciona `memory_limiter` no pipeline (issue #75 só fica 100% fechada com isso — a issue do OTel Collector é complementada em PR-5 ou em um PR-1.5 se necessário)

**Nota sobre #75:** esta issue é em `infra/otelcol/config.yaml` (arquivo de config do collector). O compose é só parte. **PR-1 fecha a parte "compose" de #75** (mem_limit do container). A parte do processor fica para um follow-up dentro de PR-1 OU num patch rápido em PR-5.

**Decisão:** vou incluir o `memory_limiter` no `infra/otelcol/config.yaml` já no PR-1 (4 linhas), para fechar #75 inteira em 1 PR. Custo: +2 linhas.

---

### PR-2 — api hardening (#72, #73)

**Branch:** `fix/api-hardening-cors-ratelimit`

**Diff esperado:**

```ts
// apps/api/src/main.ts
import { ThrottlerGuard } from '@nestjs/throttler';
// ...

// #72 — rate limit
app.useGlobalGuards(new ThrottlerGuard({
  throttlers: [{ ttl: 60_000, limit: 100 }],  // 100 req/min por IP
}));

// #73 — CORS whitelist
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3001').split(',');
if (process.env.NODE_ENV !== 'production') {
  app.enableCors({
    origin: ALLOWED_ORIGINS,  // não mais `true`
    credentials: true,
  });
}
```

```ts
// apps/api/src/app.module.ts
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    // ...
  ],
})
export class AppModule {}
```

```ts
// apps/api/src/modules/health/health.controller.ts (ou similar)
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle()
@Controller('health')
export class HealthController { /* ... */ }
```

**Dependência nova:** `@nestjs/throttler` (a adicionar em `apps/api/package.json`).

**Validação:**
- spec e2e Playwright que autentica usuário deve continuar passando
- spec manual: `for i in {1..150}; do curl localhost:3000/api/v1/users; done` → 429 após 100
- `curl -H "Origin: http://evil.com" -v` → CORS bloqueia

---

### PR-4 — web fetch timeout (#70)

**Branch:** `fix/web-api-client-timeout`

**Diff esperado:**

```ts
// apps/web/lib/api-client.ts
const DEFAULT_TIMEOUT_MS = 10_000;

class ApiClient {
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const res = await fetch(`${this.config.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });
      // ...
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiTimeoutError(path, DEFAULT_TIMEOUT_MS);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
```

**Validação:**
- spec unit do `ApiClient` (existente) com mock que nunca resolve → assert throw
- spec e2e Playwright da rota `/users` → continua passando
- spec e2e simulando API hang → UI mostra estado de erro em ≤ 10s (não 60s)

---

### PR-5 — doc versioning + release v1.11.0 (#67, #71)

**Branch:** `release/v1.11.0`

**Diff esperado:**

1. **`docs/STACK.md:139`** — `**Versão da stack:** 1.9.1` → `**1.11.0**`
2. **`docs/STACK.md:154`** — adicionar entrada `## 1.11.0 (2026-10-13)` no histórico com bullets de #59, #64, #65 (feat) e #62, #63, #66 (fix)
3. **`docs/TEMPLATE_USAGE.md:167`** — bump idem
4. **`.github/workflows/release-template.yml`** — estender para bump atômico dos 4 footers (MONOREPO, STACK, estrutura-e-versionamento, TEMPLATE_USAGE) — atualmente só lê MONOREPO
5. **`.agents/specs/conventions/estrutura-e-versionamento.md:101`** — bump + entrada no histórico
6. **`.agents/specs/conventions/post-merge-release.md`** — nota sobre a nova automação
7. **Tag git:** `git tag -a v1.11.0 -m "feat+fix+docs+chore acumulados pós-v1.10.0"`

**Validação:**
- `grep '^**Vers' docs/STACK.md docs/MONOREPO.md .agents/specs/conventions/estrutura-e-versionamento.md docs/TEMPLATE_USAGE.md` → todos 1.11.0
- `git tag --list 'v*' | sort -V | tail` → v1.11.0
- Workflow release-template: simular com `act` ou inspeção manual

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
