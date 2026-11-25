---
generated_at: 2026-11-24T18:26:59Z
agent: orchestrator
demand_slug: issues-abertas-178-187
branch_at_snapshot: main
main_sha: 2a48d8b22582408d74c5335851f70b5c727f6fc8
template_version_tag: v1.32.0
working_tree: clean
working_tree_files: []
last_commit:
  sha: 2a48d8b2
  author: Leonardo Andreazzi
  message: "chore(deps): a família NestJS, o react-hook-form e a família OpenTelemetry sobem juntas (#188)"
  conventional: true
schema_drift_prisma: none
coverage_aggregate_lines: nao_medido_nesta_demanda
coverage_aggregate_branches: nao_medido_nesta_demanda
coverage_aggregate_funcs: nao_medido_nesta_demanda
coverage_threshold_met: nao_medido_nesta_demanda
preflight_checks: all_passed
health_endpoint:
  api: not_running
  web: not_running
otel_env_vars_declared: []
otel_collector_running: false
matrix_specialist_routing_lint: passed
written_at: 2026-11-24T18:32:00Z
preflight_skipped:
  - "archive integrity — .agents/runs/archive vazio (0 arquivo .md)"
  - "drift agent↔memória — nenhum agent alterado em origin/main...HEAD"
matrix_specialist_routing_warnings: 0
matrix_specialist_routing_warnings_detail: ""
proceed: true
proceed_rationale: "Working tree limpo, main alinhada com origin/main (2a48d8b2), preflight com 0 erro e 2 checks skipped por ausência de corpus (não por defeito), `prisma migrate status` verde (25 migrations, schema up to date), tag mais recente v1.32.0. O gap_blocker false: os 10 issues abertos (P0/P1) são o OBJETO do plano, não defeito do estado que impede planejar."

gaps_detectados:
  - id: G-001
    categoria: "Issue aberta #178 — corepack baixa pnpm do registry a cada boot"
    severity: major
    file: "apps/api/Dockerfile"
    rationale: "RECONFERIDO 2026-11-25: AINDA VALE — `apps/api/Dockerfile:40` assa o corepack como ROOT; o runtime é `USER 1001:1001` (`:75`) e o tmpfs `/home/app/.cache` do compose (`:189`) nasce vazio a cada boot. PR 1 do plano."
    source: "gh issue list (finding-orchestrator, run 2026-11-23_050014)"
    status: open
  - id: G-002
    categoria: "Issue aberta #179 — healthcheck do postgres mede socket, não TCP"
    severity: major
    file: "docker-compose.yml"
    rationale: "RECONFERIDO 2026-11-25: AINDA VALE — `docker-compose.yml:57` mede o socket unix (`pg_isready` sem `-h`), que dá healthy durante o initdb enquanto o postgres real não escuta TCP. PR 1 do plano."
    source: "gh issue list (finding-orchestrator, run 2026-11-23_050014)"
    status: open
  - id: G-003
    categoria: "Issue aberta #180 — DIRECT_DATABASE_URL (superuser) no container da api"
    severity: major
    file: "apps/api/src/shared/infrastructure/prisma/assinatura-de-membership.ts"
    rationale: "RECONFERIDO 2026-11-25: AINDA VALE — `docker-compose.yml:101-102` entrega `DIRECT_DATABASE_URL` ao serviço api; `assinatura-de-membership.ts:84-90` lê a URI de dono a cada boot; o guard (`credenciais-do-banco.ts:54-59`) não a inspeciona. PR 6 do plano."
    source: "gh issue list (finding-orchestrator, run 2026-11-23_050014)"
    status: open
  - id: G-004
    categoria: "Issue aberta #182 — @Throttle da rota de login substitui o teto global por IP; chave (IP,e-mail) sem lockout por conta"
    severity: major
    file: "apps/api/src/modules/auth/infrastructure/http/auth.controller.ts"
    rationale: "RECONFERIDO 2026-11-25: AINDA VALE — `app.module.ts:89-94` declara 1 throttler (100/min) e `auth.controller.ts:126` usa `@Throttle({ default: ... })`, que SUBSTITUI o valor do módulo na rota; tracker `${ip}:${email}` (`:130-135`); sem lockout por conta. PR 4 do plano."
    source: "gh issue list (finding-orchestrator, run 2026-11-23_050014)"
    status: open
  - id: G-005
    categoria: "Issue aberta #183 — `prisma migrate dev` falha (P3006/P1014) e o schema diverge do banco (timestamp, DEFAULT de id)"
    severity: major
    file: "apps/api/prisma/schema.prisma"
    rationale: "RECONFERIDO 2026-11-25: AINDA VALE (3 achados) — `20261020000003_revoke_prisma_migrations/migration.sql:37` sem guarda; `schema.prisma:153-154,182-183,303-304` sem `@db.Timestamptz` (as 6 colunas drifted são profiles/authorizations/feature_flags — NÃO User); `schema.prisma:89,105,132,179` com `@default(uuid())` vs `gen_random_uuid()` no banco. PR 5 do plano."
    source: "gh issue list (finding-orchestrator, run 2026-11-23_050014)"
    status: open
  - id: G-006
    categoria: "Issue aberta #184 — auditoria da mutação não é atômica com a escrita que audita"
    severity: major
    file: "apps/api/src/modules/users/application/user-use-cases.ts"
    rationale: "RECONFERIDO 2026-11-25: AINDA VALE — `user-use-cases.ts:392-393` (e :423-424, :446-447, :486-487) faz save e auditoria em duas transações; nenhum port aceita `tx`; a spec `2026-09-21-...-03-fluxos-operacoes.md:7` ainda declara "ou tudo ou nada". PR 2 do plano."
    source: "gh issue list (finding-orchestrator, run 2026-11-23_050014)"
    status: open
  - id: G-007
    categoria: "Issue aberta #185 — 3 bugs de contrato HTTP (2× 500 em vez de 400, PATCH que apaga a descrição)"
    severity: major
    file: "apps/api/src/modules/profiles/infrastructure/http/admin-profiles.controller.ts"
    rationale: "RECONFERIDO 2026-11-25: PARCIAL — `code-N1-001` JÁ CORRIGIDA (commit `26b08fc5`); `code-N1-002` AINDA VALE (`admin-profiles.controller.ts:125` → `profiles.use-cases.ts:277` → `profile.aggregate.ts:293-296`); `code-N1-003` AINDA VALE (`admin-profiles.controller.ts:95` sem Zod, `main.ts:101` com pipe global noop). PR 3 do plano (2 achados) + PR 7 (encerramento do 1º)."
    source: "gh issue list (finding-orchestrator, run 2026-11-23_050014)"
    status: open
  - id: G-008
    categoria: "Issue aberta #187 — a imagem prod embarca as devDependencies"
    severity: major
    file: "apps/api/Dockerfile"
    rationale: "RECONFERIDO 2026-11-25: AINDA VALE — `apps/api/Dockerfile:60-61` copia o node_modules inteiro do builder; o comentário `:67-69` registra que o `pnpm prune --prod` foi removido e não foi trocado. PR 1 do plano."
    source: "gh issue list (finding-orchestrator, run 2026-11-23_050014)"
    status: open
  - id: G-009
    categoria: "Issue #181 — advisory do effect (CVE-2026-121707)"
    severity: major
    file: ".tooling/scripts/ci/excecoes-de-dependencias.json"
    rationale: "MEDIDO no main atual: o effect está em 3.22.1 (override no package.json:65+), o advisory sumiu do `pnpm audit` e o gate `as advisories de dependencia estao corrigidas ou declaradas` PASSOU no preflight de 2026-11-24. A issue descreve um estado que o main já superou."
    source: "gh issue list + preflight medido"
    status: resolved
    resolved_at: 2026-11-24T18:30:00Z
    resolved_by: "medição no main atual (lockfile com effect@3.22.1 + preflight verde)"
    resolucao: "Issue candidata a encerramento: o conserto (override para effect@3.22.1) já está no main e o gate reprovaria se a advisory voltasse."
  - id: G-010
    categoria: "Issue #186 — colisão de número de versão (1.26.0)"
    severity: minor
    file: ".agents/specs/conventions/estrutura-e-versionamento.md"
    rationale: "MEDIDO no main atual: a branch `feat/majors-compativeis` NÃO EXISTE mais (nem local nem remoto); a branch `chore/atualizacao-de-dependencias-2026-11-23` está em 1.32.0, igual à main; main já bumped de 1.26.0 até v1.32.0. A colisão descrita não existe mais."
    source: "git branch -a + leitura dos footers"
    status: resolved
    resolved_at: 2026-11-24T18:31:00Z
    resolved_by: "medição no main atual (branch ausente, footers coerentes)"
    resolucao: "Issue candidata a encerramento por obsolescência: o objeto da colisão (a branch e o bump não comitado) não existe mais."
gap_blocker: false
---

# State-snapshot — as 10 issues abertas (#178–#187)

## Medido

```
$ git rev-parse HEAD && git rev-parse origin/main
2a48d8b22582408d74c5335851f70b5c727f6fc8   (main == origin/main, working tree limpo)

$ git tag --list 'v*' --sort=-v:refname | head -1
v1.32.0

$ pnpm ci:preflight | tail -1
⚠ 0 erro(s); 2 check(s) não rodaram (skipped)   # archive vazio + nenhum agent alterado

$ cd apps/api && pnpm exec prisma migrate status
25 migrations found in prisma/migrations
Database schema is up to date!
```

## O que o snapshot já decide

- **#181 e #186 não são trabalho**: as duas descrevem estados que o `main` já superou
  (o `effect` já está em 3.22.1 com o gate verde; a branch que colidia com o 1.26.0 não
  existe mais). O plano as trata como encerramento, não como correção.
- **As outras 8 dependem de reconferência**: o scan é de 2026-11-23 e o `main` já
  recebeu 6 bumps de versão depois disso. Cada uma é reconferida contra o código atual
  antes de entrar no plano — nenhuma entra por cópia da issue.
