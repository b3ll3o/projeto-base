---
generated_at: 2026-10-09T02:07:57Z
agent: specialist-router
demand_slug: login-usuario-senha
branch_at_snapshot: feat/login-usuario-senha
main_sha: 129015a9f4b107b3d6d5c375d73c9819903a0470
template_version_tag: v1.10.0
working_tree: dirty
working_tree_files:
  - apps/api/package.json
  - pnpm-lock.yaml
last_commit:
  sha: 129015a9f4b107b3d6d5c375d73c9819903a0470
  author: Leonardo Andreazzi
  message: "fix: gates que passavam sem verificar, e VO devolvendo 500 com string interna (#66)"
  conventional: true
schema_drift_prisma: not_applicable
coverage_aggregate_lines: 99.7
coverage_aggregate_branches: 93.54
coverage_threshold_met: true
preflight_checks: all_passed
preflight_skipped:
  - "archive integrity — .agents/runs/archive/ sem .md"
  - "drift agent↔memória — nenhum agent alterado em origin/main...HEAD"
health_endpoint:
  api: not_running
  web: not_running
otel_env_vars_declared: [OTEL_SDK_DISABLED, OTEL_SERVICE_NAME, OTEL_EXPORTER_OTLP_ENDPOINT]
matrix_specialist_routing_lint: passed
database_reachable: false

gaps_detectados:
  - id: G-001
    categoria: "User sem hash de senha"
    severity: blocker
    file: "apps/api/prisma/schema.prisma"
    rationale: "model User não tem passwordHash; POST /users aceita {nome,email} e devolve 201"
    source: "Exploração apps/api"
  - id: G-002
    categoria: "Nenhum módulo de auth no backend"
    severity: blocker
    file: "apps/api/src/modules/"
    rationale: "grep -rn 'auth' devolve 3 arquivos, todos Comments/decorators. Zero guard, zero strategy, zero endpoint de login. Swagger já declara addBearerAuth() e o controller já tem @ApiBearerAuth() — só documenta, não protege"
    source: "Exploração apps/api"
  - id: G-003
    categoria: "Rotas /users 100% públicas"
    severity: blocker
    file: "apps/api/src/modules/users/infrastructure/http/users.controller.ts"
    rationale: "GET/POST/PATCH/DELETE de /users sem qualquer guard. buildContext() deixa actorId: null hardcoded com o comentário 'Fase 8 decodificará o header Authorization (JWT)'"
    source: "Exploração apps/api"
  - id: G-004
    categoria: "Sem tela de login no frontend"
    severity: blocker
    file: "apps/web/app/"
    rationale: "grep -rniE 'login|logout|sessao|jwt' em app/components/lib/src/e2e → 0 ocorrências. Sem middleware.ts, sem cookies(), sem contexto de sessão. ApiClient.getToken? existe e nunca é usado"
    source: "Exploração apps/web"
  - id: G-005
    categoria: "Formulário de cadastro sem senha"
    severity: blocker
    file: "apps/web/components/cadastro-usuario-form.tsx"
    rationale: "campos nome+email; schema Zod em lib/cadastro-usuario-schema.ts espelha CreateUserSchema da API via parity.spec.ts"
    source: "Exploração apps/web"
  - id: G-006
    categoria: "Sem política de senha"
    severity: major
    file: "apps/api/src/modules/users/domain/value-objects/"
    rationale: "não existe VO de senha; o padrão do repo é limites exportados pelo VO e nunca reescritos no schema"
    source: "Convenção de paridade users.schemas.spec.ts"

riscos_ambientais:
  - id: R-001
    descricao: "argon2 é binário nativo"
    medido: "hash $argon2id$v=19$m=65536,p=4 em 48ms; prebuilds/linux-x64 presente no pacote"
    mitigacao: "prod é node:22-bookworm-slim (glibc) e argon2 embute prebuild — sem compiler no build. Verificar no job docker-build-prod"
  - id: R-002
    descricao: "hash nunca pode entrar em users_history.snapshot nem em users_archive.snapshot"
    medido: "emitAuditForEvents e archive passam snapshot: toUserOutput(user); UserCreatedEvent carrega só aggregateId+version"
    mitigacao: "PasswordHash com toString() redigido E ausente de toUserOutput — duas barreiras"

gap_blocker: false
proceed: true
proceed_justificativa: >-
  Os 5 gaps são exatamente o objeto da demanda (não são blockers de
  infraestrutura que impedem planejar). Nenhum comando do §3 falhou:
  preflight all_passed e working_tree sem conflito. A convenção pede
  proceed:false só quando o estado está quebrado — aqui o estado está
  íntegro e o que falta é a feature.
---

# State snapshot — demanda `login-usuario-senha`

## Comando por comando

| Item | Comando | Resultado |
|---|---|---|
| working tree | `git status --short` | vazio no início da demanda |
| branch | `git branch --show-current` | `feat/login-usuario-senha` |
| main sha | `git rev-parse origin/main` | `129015a` |
| último commit | `git log -1 --pretty=fuller` | `#66` — conventional: true |
| tag | `git tag --list 'v*' --sort=-v:refname \| head -1` | `v1.10.0` |
| prisma migrate | `pnpm exec prisma migrate status` | `P1001` — Postgres local não está no ar |
| health api | `curl localhost:3000/api/v1/health` | conexão recusada |
| preflight | `pnpm ci:preflight` | `0 erro(s); 2 check(s) não rodaram (skipped)` |
| deps api | `grep -E 'argon2\|jwt' apps/api/package.json` | ambos instalados nesta demanda |
| argon2 | `node prova-argon2.mjs` dentro de `apps/api` | hash + verify OK, 48 ms |

## Decisões registradas pelo solicitante

| # | Decisão | Valor |
|---|---|---|
| D-1 | Mecanismo de sessão | JWT Bearer stateless (`POST /auth/login` → `{accessToken, refreshToken}`) |
| D-2 | Escopo | cadastro + login + **proteger `/users`** + `/auth/me` |
| D-3 | Hash | **argon2** (substituiu bcrypt a pedido explícito do solicitante) |