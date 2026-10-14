---
generated_at: 2026-10-13T20:25:00Z
agent: hermes-orchestrator
demand_slug: "fix-issues-abertas-2026-10-13"
branch_at_snapshot: main
main_sha: e8ed335
template_version_tag: v1.10.0
working_tree: clean
working_tree_files: []
last_commit:
  sha: e8ed335
  author: Leonardo Andreazzi
  message: "feat(agents): 5 skills de UI e os defeitos que a revisão mediu (#78)"
  conventional: true

campaign:
  source: "9 issues abertas no GitHub (escaneamento weekly de 2026-10-13)"
  triggers: T1 (plano multi-task ≥ 3) + T2 (bugfix não-trivial — 4 P0)
  total: 9
  by_severity: { p0: 4, p1: 5 }
  by_type: { bug: 4, gap: 4, drift: 1 }
  by_specialist:
    security-auditor: 2
    docker-prod-specialist: 2
    release-versioning-specialist: 2
    prisma-db-specialist: 1
    code-reviewer: 1
    otelcol-infra-specialist: 1
  by_file:
    - "docker-compose.yml (4 issues tocam: #68, #74, #75 indireto, #72 indireto)"
    - "apps/api/src/main.ts (#72, #73)"
    - "apps/api/prisma/migrations/.../migration.sql (#69)"
    - "apps/web/lib/api-client.ts (#70)"
    - "docs/STACK.md + docs/TEMPLATE_USAGE.md (#67)"
    - "infra/otelcol/config.yaml (#75)"

gaps_detectados:
  - id: G-001
    categoria: "4 P0 abertas — qualquer uma bloqueia produção"
    severity: blocker
    files: ["apps/api/src/main.ts", "docker-compose.yml", "apps/api/prisma/migrations/.../migration.sql", "apps/web/lib/api-client.ts"]
    rationale: |
      4 issues P0 não podem ir pra produção:
      - #67: drift de versão nos docs canônicos (STACK em 1.9.1, MONOREPO em 1.10.0)
      - #68: POSTGRES_PASSWORD em plaintext + DATABASE_URL com placeholder literal no compose
      - #69: migration users_history sem DEFAULT uuid() — drift schema↔DDL
      - #70: fetch sem timeout no ApiClient — DoS interno sob outage
    source: "gh issue list --state open --limit 100"

  - id: G-002
    categoria: "5 P1 abertas — devem ser corrigidas no mesmo ciclo se possível"
    severity: major
    files: ["docker-compose.yml", "apps/api/src/main.ts", "infra/otelcol/config.yaml", "Dockerfile (api+web)"]
    rationale: |
      - #71: 8 commits feat/fix sem tag → release pendente v1.11.0
      - #72: sem rate-limiting global → brute-force e DoS
      - #73: CORS permissivo com credentials em dev/staging
      - #74: imagens sem digest → vulnerável a tag mutável
      - #75: OTel Collector sem memory_limiter → OOM sob alta carga
    source: "gh issue list --state open --limit 100"

  - id: G-003
    categoria: "Sobreposição de arquivos — várias issues tocam o mesmo arquivo"
    severity: major
    files: ["docker-compose.yml", "apps/api/src/main.ts"]
    rationale: |
      - docker-compose.yml: #68 (postgres plaintext), #74 (imagens sem digest), #75 indireto (sem mem_limit)
      - apps/api/src/main.ts: #72 (sem rate-limit), #73 (CORS)
      > PR único que toque esses 2 arquivos pode resolver 5 issues (#68, #72, #73, #74, #75).
    source: "cruzamento de `gh issue view N --json labels,body`"

gap_blocker: false   # G-001 é blocker MAS tem plano de resolver
---

# State-Snapshot — `fix-issues-abertas-2026-10-13`

> Camada 0 do pre-planner. Gerado ANTES de criar o plano multi-PR.
> Insumo para `specialist-router` (camada 1) decidir quem implementa cada PR.

## §1. AS-IS (estado verificado)

| Item | Valor |
|---|---|
| Working tree | clean |
| Branch | main |
| origin/main | e8ed335 |
| Tag template | v1.10.0 |
| Issues abertas | 9 (4 P0 + 5 P1) |
| Specialists envolvidos | 6 (security, docker-prod, release-versioning, prisma-db, code-reviewer, otelcol-infra) |
| Conventional commits | sim |
| Última tag git | v1.10.0 (af6af0a) — 8 commits atrás do HEAD |

## §2. Topologia das issues (relações)

```text
                            ┌── #68 plaintext password ─┐
                            │                            │
docker-compose.yml ─────────┼── #74 sem digest ─────────┼── [PR-1: docker hardening]
                            │                            │
                            └── #75 sem mem_limit (indireto) ┘

apps/api/src/main.ts ───────┼── #72 sem rate-limit ──────┼── [PR-2: api hardening]
                            │                            │
                            └── #73 CORS permissivo ────┘

apps/api/prisma/migrations/ ─── #69 DEFAULT uuid() ──────┼── [PR-3: prisma drift]

apps/web/lib/api-client.ts ─── #70 fetch timeout ────────┼── [PR-4: web fetch timeout]

docs/STACK.md + TEMPLATE ─── #67 drift versão ──────────┼── [PR-5: doc versioning]
                                                               (agrupa com #71)

8 commits feat/fix ─────── #71 bump pendente v1.11.0 ───┘
```

## §3. Plano de PRs proposto (4 PRs, 9 issues)

> Decisão abaixo. Justificativa em §4.

### PR-1: docker hardening (resolve #68, #74, #75 indireto)
- **Arquivos:** `docker-compose.yml` (postgres env → `.env.production.example`; image digests; mem_limit em todos os services; otel-collector com mem_limit)
- **Issues:** #68 + #74 + parte de #75
- **Specialist:** `docker-prod-specialist` (autor) + `security-auditor` (reviewer)
- **Estimativa:** ~80 linhas diff
- **Risco:** baixo (compose de dev local — quebra de env causa erro imediato)

### PR-2: api hardening (resolve #72, #73)
- **Arquivos:** `apps/api/src/main.ts`, `apps/api/src/app.module.ts` (+ possível helper para CORS whitelist)
- **Issues:** #72 + #73
- **Specialist:** `nestjs-specialist` (autor) + `security-auditor` (reviewer)
- **Estimativa:** ~50 linhas diff
- **Risco:** médio (rate-limit pode bloquear testes locais; precisa `@SkipThrottle()` no health)

### PR-3: prisma migration fix (resolve #69)
- **Arquivos:** `apps/api/prisma/migrations/20260922003354_init_audit_user/migration.sql`
- **Issues:** #69
- **Specialist:** `prisma-db-specialist`
- **Estimativa:** ~4 linhas diff (2 ALTER TABLE ADD DEFAULT)
- **Risco:** baixo (DDL idempotente: `ADD DEFAULT IF NOT EXISTS` não é padrão — preciso de `IF NOT EXISTS` na coluna)
- **Nota:** NÃO roda `prisma migrate dev` (criaria migration nova); edita a migration original e roda `prisma migrate resolve --applied` (ou `prisma db execute`)

### PR-4: web fetch timeout (resolve #70)
- **Arquivos:** `apps/web/lib/api-client.ts`
- **Issues:** #70
- **Specialist:** `nextjs-specialist` (autor) + `code-reviewer` (reviewer)
- **Estimativa:** ~30 linhas diff (AbortController + timeoutMs config)
- **Risco:** baixo (timeout padrão 10s; ajustável)

### PR-5: doc versioning + release v1.11.0 (resolve #67, #71)
- **Arquivos:** `docs/STACK.md`, `docs/TEMPLATE_USAGE.md`, `.github/workflows/release-template.yml` (bump atômico), `docs/MONOREPO.md` (histórico v1.11.0), `.agents/specs/conventions/estrutura-e-versionamento.md` (histórico v1.11.0)
- **Issues:** #67 + #71
- **Specialist:** `release-versioning-specialist` (autor) + `doc-writer` (reviewer)
- **Estimativa:** ~30 linhas diff + tag git
- **Risco:** baixo (mudança mecânica de footer + changelog)
- **Versão:** **1.11.0** (3 feat + 3 fix + 1 docs + 1 chore pós-v1.10.0 — bump minor)

## §4. Por que 5 PRs e não 1 (ou 9)?

**1 PR** (gigante) — ❌ impossível: 9 issues, ~200 linhas de diff, 5+ arquivos não relacionados, 3 specialists autores diferentes. Seria #70 do passado (PR #50 tinha essa forma e o review cansou).

**9 PRs** (1 por issue) — ❌ overhead de PR × 9 = 9× pre-push, 9× CI, 9× merge. Não agrega valor.

**5 PRs** (agrupando por arquivo) — ✅ sweet spot:
- Cada PR tem escopo coeso (1 ou 2 arquivos do mesmo bounded context)
- Total de 5× pre-push + 5× CI é gerenciável
- Cada PR é mergeável independentemente (PR-3 e PR-4 não bloqueiam os outros)
- PR-5 é o último (fecha com release v1.11.0)

**Ordem de merge recomendada:** PR-3 (mais simples) → PR-1 (compose) → PR-2 (api) → PR-4 (web) → PR-5 (release). Cada um valida o anterior.

## §5. Pré-condições

- [x] main atualizado (e8ed335)
- [x] gh autenticado (validado no state-snapshot anterior)
- [x] State-snapshot arquivado (este arquivo)
- [ ] Branch por PR criada ANTES do commit (regra da retro R-005)
- [ ] CI 5/5 verde antes de cada merge

## §6. Cross-refs

- [state-aware-planning.md §3](../specs/conventions/state-aware-planning.md) — formato seguido
- [fluxo-desenvolvimento.md §3](../../docs/fluxo-desenvolvimento.md) — fluxo de dev
- [guard-classes-decisoes.md §3](../../docs/superpowers/plans/2026-10-03-guard-classes-decisoes.md) — 7 classes (a #67 é classe 5 — drift cross-doc)
- 9 issues GitHub: #67, #68, #69, #70, #71, #72, #73, #74, #75
