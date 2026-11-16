---
generated_at: 2026-11-16T18:37:13Z
agent: controller
demand_slug: "password-hash-invalido"
branch_at_snapshot: fix/password-hash-invalido
main_sha: 7c2644692847e3beacd389cacf8ef3a26067236c
template_version_tag: v1.29.0
working_tree: dirty
working_tree_files:
  - ".agents/runs/20261116T183713Z-*.txt (artefatos deste snapshot)"
last_commit:
  sha: 7c26446
  author: "CEO Agent"
  message: "fix(docs): o relatório semanal sem cópias — e o gerador no repo (#167)"
  conventional: true
schema_drift_prisma: none
coverage_aggregate_lines: null
coverage_aggregate_branches: null
coverage_aggregate_funcs: null
coverage_threshold_met: null
preflight_checks: all_passed
health_endpoint:
  api: ok
  web: ok
otel_env_vars_declared:
  - OTEL_SDK_DISABLED
  - OTEL_EXPORTER_OTLP_ENDPOINT
  - OTEL_SERVICE_NAME
  - OTEL_SERVICE_VERSION
  - OTEL_TRACES_SAMPLER
  - OTEL_TRACES_SAMPLER_ARG
otel_collector_running: true
matrix_specialist_routing_lint: not_run
written_at: 2026-11-16T18:41:00Z
preflight_skipped:
  - "cobertura agregada (`pnpm -r test --coverage`): a suíte completa com testcontainers não roda dentro do snapshot; a cobertura é medida pelo `pnpm ci:local`, que é o gate que bloqueia o PR"
  - "matrix_specialist_routing_lint: o lint de roteamento não foi alterado por esta demanda — a demanda é de um único especialista (banco + fixtures), sem roteamento novo"
proceed: true
proceed_rationale: "O preflight estrutural passou inteiro (exit 0), o schema Prisma está sem drift, a API e o web respondem 200, e o defeito está reproduzido e medido. O único gap é o dado corrompido em `users.password_hash` — que é o OBJETO do plano, não um bloqueador de planejamento."

gaps_detectados:
  - id: G-001
    categoria: "Dado persistido viola a invariante do value object"
    severity: blocker
    file: "apps/api/src/modules/users/infrastructure/persistence/user.prisma-mapper.ts"
    rationale: "9 linhas de `users` têm `password_hash = 'x'`. A listagem hidrata TODAS as linhas no VO `PasswordHash`; uma linha inválida derruba a página inteira com 500 — em `/users` e em `/admin/users` — e o login da própria conta corrompida responde 500 em vez de 401."
    source: "Reprodução ao vivo em 2026-11-16 (curl + browser)"
    status: open
  - id: G-002
    categoria: "Invariante sem dono no banco"
    severity: major
    file: "apps/api/prisma/schema.prisma"
    rationale: "`users.password_hash` é TEXT sem CHECK: o único guard da regra argon2id é o value object em TypeScript. Qualquer escrita fora da aplicação (SQL manual, script, bug futuro) grava um valor que a aplicação não consegue ler."
    source: "Leitura do schema e das 22 fixtures que gravam `passwordHash: 'x'`"
    status: open
gap_blocker: false
---

# State snapshot — 2026-11-16T18:37:13Z

Demanda: **os erros ao se logar com `admin@admin.com`**.

## Estado do repositório

| Item | Valor | Comando |
|---|---|---|
| Branch | `fix/password-hash-invalido` (criada a partir de `main` em `7c26446`) | `git branch --show-current` |
| `origin/main` | `7c2644692847e3beacd389cacf8ef3a26067236c` | `git rev-parse origin/main` |
| Tag do template | `v1.29.0` | `git tag --list 'v*' --sort=-v:refname \| head -1` |
| Working tree | suja só pelos artefatos deste snapshot | `git status --short` |
| Último commit | `fix(docs): o relatório semanal sem cópias — e o gerador no repo (#167)` | `git log -1 --pretty=fuller` |

## Schema e banco

| Item | Valor | Comando |
|---|---|---|
| Migrations | 19 encontradas, schema em dia | `cd apps/api && pnpm exec prisma migrate status` |
| Banco local | `projeto-base-pg-local` (container próprio, porta 5432 publicada) | `docker ps --filter name=projeto-base-pg-local` |
| Migrations aplicadas | 19 (a 20ª, deste plano, ainda não existe) | `docker exec projeto-base-pg-local psql -U projeto -d projeto_base -tAc "select count(*) from _prisma_migrations where finished_at is not null"` |

## Saúde

| Item | Valor | Comando |
|---|---|---|
| API | `{"status":"ok","checks":{"database":"ok"}}` | `curl -fsS http://localhost:3000/api/v1/health` |
| Web | `/api/health` → 200 | `curl -fsS http://localhost:3001/api/health` |
| Preflight estrutural | passou inteiro (exit 0) | `pnpm ci:preflight` |
| Collector OTel | de pé (porta 4317/4318) | `docker ps --filter name=otel-collector` |

## Defeito reproduzido (AS-IS)

| Sintoma | Medida | Comando |
|---|---|---|
| Login do admin | **201** — o login em si funciona | `curl -X POST http://localhost:3000/api/v1/auth/login -H 'content-type: application/json' -d '{"email":"admin@admin.com","senha":"Admin@123"}'` |
| `GET /api/v1/users` | **500 INTERNAL** (`UserPersistenceException`) | `curl -H "authorization: Bearer $TOKEN" http://localhost:3000/api/v1/users` |
| `/users` na UI | "Não foi possível carregar a lista. Tente de novo em instantes." | browser em `http://localhost:3001/users` |
| `/admin/users` na UI | **HTTP 500** (o RSC deixa a exceção escapar) | browser em `http://localhost:3001/admin/users` |
| Linhas corrompidas | **9** com `password_hash = 'x'` | `docker exec projeto-base-pg-local psql -U projeto -d projeto_base -tAc "select count(*) from users where password_hash !~ '^\$argon2id\$'"` |
| Login de conta corrompida | **500** em vez de 401 (oráculo de existência de conta) | `curl -X POST http://localhost:3000/api/v1/auth/login -H 'content-type: application/json' -d '{"email":"probe-52d2dca4@x.dev","senha":"SenhaForte123"}'` |

## Lacunas (AS-IS → TO-BE)

- **G-001 (blocker)** — 9 linhas com `password_hash` inválido derrubam a listagem inteira.
- **G-002 (major)** — a invariante argon2id não tem dono no banco: `users.password_hash` é TEXT sem CHECK.

`gap_blocker: false` — o plano existe para fechar G-001 e G-002, e o estado do ambiente não bloqueia a execução.
