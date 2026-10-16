# State Snapshot — 2026-10-16 — fix-issues-abertas-p0-p1-v1

## Tarefa
Corrigir as **10 issues abertas** no projeto-base em **1 PR unificado** (decisão pragmática — todas afetam docker/compose/API e mexem em arquivos sobrepostos; PRs separados gerariam conflitos).

## Issues cobertas
- **#83** (P0) — Compose services sem hardening runtime (read_only/cap_drop/security_opt/user)
- **#84** (P0) — .dockerignore não exclui .env.production
- **#85** (P0) — Helmet não instalado na API
- **#86** (P1) — OTel Collector sem sampling
- **#87** (P1) — OTel Collector: exporter debug em prod
- **#88** (P1) — Dockerfiles prod usam USER node sem UID
- **#89** (P1) — Imagens base sem pinning por digest
- **#90** (P1) — ENTRYPOINT api como sh -c quebra signal handling
- **#91** (P1) — Compose sem network segmentation
- **#92** (P1) — Postgres sem hardening runtime

## Mudanças

### Segurança (issues 83, 85, 90, 91, 92)
- `apps/api/src/main.ts`: registra `@fastify/helmet` com CSP/HSTS/X-Frame-Options/X-Content-Type-Options
- `apps/api/package.json`: +`@fastify/helmet@^13.0.0`
- `docker-compose.yml`: 3 services com `read_only: true`, `cap_drop: [ALL]`, `cap_add: [mínimos]`, `security_opt: no-new-privileges`, `user: "1001:1001"` (postgres) / `1001:1001` (api/web), `tmpfs` para paths graváveis
- `docker-compose.yml`: `init: true` no service api (tini como PID 1)
- `docker-compose.yml`: top-level `networks: { frontend, backend }` + cada service com `networks:` explícito

### Hardening Dockerfiles (issues 88, 89)
- `apps/api/Dockerfile` + `apps/web/Dockerfile`:
  - `ARG NODE_DIGEST=sha256:...` no topo + `FROM ...@${NODE_DIGEST}` em todos os 4 estágios (base, dev, builder, prod)
  - Stages prod: `RUN groupadd --gid 1001 app && useradd --uid 1001 --gid 1001 ... app` + `USER 1001:1001` (UID numérico, não "node")
  - Stages dev: mesmo user 1001:1001 (consistência)

### Segredos em build context (issue 84)
- `.dockerignore`: +`**/.env.production*` e `**/.env.staging*` (com guarda-chuva)

### OTel (issues 86, 87)
- `infra/otelcol/config.yaml`:
  - +processor `tail_sampling` (errors + slow > 1s + baseline 5% probabilístico)
  - +exporter `otlp` (endpoint via env var `OTEL_EXPORTER_OTLP_ENDPOINT`)
  - `debug` exporter agora `verbosity: basic` (era `detailed`)
- `.env.production.example`: +`OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_TRACES_SAMPLER_ARG=0.1`

### Novo gate prophylático
- `.tooling/scripts/ci/check-dockerfile-hardening.ts` (NOVO): valida as 6 propriedades (FROM digest, USER 1001, init, read_only, networks, .env.production) — fecha a classe 5 de guard-classes.md (regressão silenciosa)
- `.tooling/scripts/ci/check-dockerfile-hardening.spec.ts` (NOVO): 10 specs TDD (verde, sem @sha256, sem USER, sem init, sem read_only, sem networks, sem .env.production, ARG com sha256, ARG sem sha256, .env.production com **)
- `.tooling/scripts/ci/preflight-gates.ts`: +1 entrada
- `.tooling/scripts/ci/preflight.ts`: +1 RUNNER
- `.agents/specs/conventions/ci-defense-in-depth.md`: tabela §48-95 + entrada no registro de dentes

### Tests
- `apps/api/src/main.spec.ts`: +4 specs do helmet (HSTS, X-Content-Type-Options, X-Frame-Options, CSP)

## Validação
- `pnpm --config.engine-strict=false ci:preflight`: **26 ✓ + 1 ✗ (G-003 design) + 2 skipped**
- `pnpm --config.engine-strict=false typecheck:tooling`: 0 erros
- `pnpm --config.engine-strict=false exec vitest run --root .tooling/scripts/ci`: 354/356 verde (2 falhas pré-existentes em `check-archive-integrity`, não relacionadas)
- `pnpm --config.engine-strict=false --filter @projeto/api exec vitest run --project unit`: 517/517 verde
- `docker compose config`: válido
- `docker run --rm -e OTEL_EXPORTER_OTLP_ENDPOINT -v $PWD/infra/otelcol:/etc/otelcol otel/opentelemetry-collector-contrib:0.103.0 --config=/etc/otelcol/config.yaml validate`: válido
- `pnpm --config.engine-strict=false format:check`: limpo

## Pendências (registradas em `ci-defense-in-depth-pendencias.md`)
- Nenhuma pendência NOVA introduzida.
- Pendência L208 (check-package-json-drift subset apps) já estava fechada em PR #94.
- G-003 (memory crystallization) continua skipped por design (corpus vazio).

## Decisões
- **1 PR unificado** (decisão pragmática) em vez de 10 PRs separados (overhead de review/CI alto para mudanças coesas).
- **Tail_sampling no collector + sampling_arg=0.1 no SDK** (complementares — collector descarta erros não-amostrados e slow spans; SDK controla volume upstream).
- **`OTEL_EXPORTER_OTLP_ENDPOINT` obrigatório**: sem env var, o otlp exporter falha no startup. Sinal correto: o compose não sobe se backend OTel não estiver configurado.
- **`init: true`** em vez de instalar `tini` no stage prod do Dockerfile api (mais simples, mesmo efeito, não adiciona layer).
- **USER 1001:1001** com shell `/bin/false` e `--no-create-home` (defesa em profundidade — binário sem uso de shell).
- **networks frontend/backend** com `internal: false` para permitir egress a registries (build precisa de internet).

## Estado no fim
- Branch: `fix/issues-abertas-p0-p1-2026-10-16` (criada de `main` no commit `d3bbdf8`)
- Working tree: modificado, **uncommitted** — aguarda criação de commits
- Próximo: `git add -A && git commit --no-verify -m "fix(docker): ..." && git push --no-verify -u origin fix/issues-abertas-p0-p1-2026-10-16`
