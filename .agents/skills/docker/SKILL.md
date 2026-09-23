---
name: docker
description: Convenções e processos docker específicos do monorepo projeto-base. Cobre ordem de build (db:generate → tsc), next.config.mjs output: 'standalone', entrypoint com prisma migrate deploy, .dockerignore mínimo, Compose profiles dev/prod, networks bridge, volumes nomeados, healthchecks via curl, non-root user, BuildKit cache mounts para pnpm. Use sempre que criar/editar Dockerfile, compose, ou .dockerignore no projeto.
---

# Skill: docker

> Quando invocar: ao criar/editar `Dockerfile`, `compose.yaml`, `.dockerignore` ou entrypoint script em qualquer app do monorepo (`apps/api`, `apps/web`).

## Inputs necessários (do controller)

```yaml
task:
  description: "<demanda: dockerizar api | dockerizar web | ajustar Dockerfile | ajustar compose | adicionar healthcheck | outro>"

stack: 'api-nestjs' | 'web-nextjs' | 'ambos'
paths:
  - 'apps/api/Dockerfile'
  - 'apps/web/Dockerfile'
  - 'compose.yaml'
  - '.dockerignore'
target: 'dev' | 'prod' | 'ambos'

context:
  lockfile_version: '<versão do pnpm-lock.yaml>'
  prisma_migrations_present: true | false
  base_image_strategy: 'multi-stage' | 'single-stage'
  standalone_web: true | false
```

## Passo 1: Detectar stack

Inspecionar `package.json` e arquivos de configuração:

- `apps/api/package.json` → NestJS (`@nestjs/core`, `@nestjs/platform-fastify`)
- `apps/web/package.json` → Next.js (`next`)
- `apps/api/prisma/schema.prisma` → confirma Prisma 6 + binary targets
- `node:20-bookworm-slim` na base image (Prisma 6 binary `debian-openssl-3.0.x`)

Nunca usar `alpine` (Prisma binary incompatível com musl libc).

## Passo 2: Escolher base image

```dockerfile
FROM node:20-bookworm-slim AS base
```

- `bookworm-slim` (Debian 12) = Prisma binary compat + tamanho razoável
- Evitar `latest` (não-reprodutível)
- Evitar `alpine` (Prisma engine binary espera glibc, não musl)
- Multi-stage obrigatório para `target: prod`

## Passo 3: Multi-stage targets

```dockerfile
FROM base AS deps       # pnpm install --frozen-lockfile
FROM deps AS dev        # devDependencies + hot reload
FROM deps AS builder    # build (db:generate + tsc / next build)
FROM base AS prod       # runtime, deps de produção + dist
```

Para monorepo: `corepack enable && corepack prepare pnpm@<versão> --activate` antes de qualquer `pnpm install`.

## Passo 4: Api NestJS — ordem de build crítica

```dockerfile
RUN pnpm --filter @app/api run db:generate   # CRÍTICO: Prisma client antes de tsc
RUN pnpm --filter @app/api run build         # tsc compila com @prisma/client gerado
```

Sem `db:generate` antes do `tsc` → `Cannot find module '@prisma/client'` no build (Prisma 6 não dá fallback silencioso).

## Passo 5: Web Next.js — standalone output

`apps/web/next.config.mjs` deve conter:

```javascript
export default {
  output: 'standalone',
  // ... resto da config
};
```

Sem `output: 'standalone'` → imagem final tem centenas de MB (`node_modules` inteiro copiado). Com `standalone` → copia `server.js` + arquivos mínimos (~50 MB).

## Passo 6: Entrypoint

**Api:**

```dockerfile
ENTRYPOINT ["sh", "-c", "node ./scripts/prisma-migrate-deploy.js && node dist/main.js"]
```

OU criar `apps/api/scripts/prisma-migrate-deploy.js` que executa `prisma migrate deploy` antes de subir o NestJS (idempotente; aguarda DB healthy).

**Web:**

```dockerfile
ENTRYPOINT ["node", "server.js"]
```

Onde `server.js` vem de `apps/web/.next/standalone/apps/web/server.js` (output do `standalone`).

## Passo 7: `.dockerignore` mínimo

```
node_modules
.turbo
dist
.next
coverage
*.log
.git
.env
.env.local
**/__tests__
**/*.test.ts
**/*.spec.ts
```

**MANTER:**

- `pnpm-lock.yaml` (build reproduzível)
- `apps/api/prisma/migrations/**` (entrypoint depende)
- `apps/api/prisma/schema.prisma` (db:generate)
- `.dockerignore` e `Dockerfile`

## Passo 8: Healthcheck

**Api:** endpoint `GET /api/v1/health` (já existe no projeto, valida DB Prisma + Redis ping).

```yaml
healthcheck:
  test: ["CMD", "curl", "-fsS", "http://localhost:3000/api/v1/health"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 30s
```

**Web:** endpoint `GET /api/health` (deve estar implementado — caso contrário, criar antes do Dockerfile).

## Passo 9: Non-root user

```dockerfile
FROM base
USER node
```

Validar ownership após `COPY` (`--chown=node:node` em todos os COPY que o user `node` precisa ler/escrever). Em dev, manter `USER root` (hot reload precisa escrever em `node_modules`).

## Passo 10: BuildKit cache mounts

Habilitar BuildKit: `DOCKER_BUILDKIT=1` (padrão em Docker 23+).

```dockerfile
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
```

Reduz tempo de rebuild em ~70% quando só arquivos `.ts` mudam.

## Outputs (entregáveis)

```yaml
outputs:
  dockerfile:
    path: 'apps/<api|web>/Dockerfile'
    multi_stage_targets: ['base', 'deps', 'dev', 'builder', 'prod']
  dockerignore:
    path: '.dockerignore'
    minimum_set: ['node_modules', '.turbo', 'dist', '.next', 'coverage', '*.log']
    keep: ['pnpm-lock.yaml', 'prisma/migrations/**', 'prisma/schema.prisma']
  entrypoint:
    api: 'sh -c "node ./scripts/prisma-migrate-deploy.js && node dist/main.js"'
    web: 'node server.js'
  healthcheck_cmd: 'curl -fsS http://localhost:<port>/api/(v1/)health'
  compose_fragment:
    profile: 'dev | prod'
    networks: 'bridge'
    volumes: 'named (postgres_data, redis_data)'
    user: 'node (prod) | root (dev)'
    cache_mounts: 'pnpm store via BuildKit'
```

## Anti-padrões

- ❌ Rodar como `root` no stage runtime (quebra princípio least-privilege; `USER node` obrigatório)
- ❌ Usar tag `latest` em base images (build não-reprodutível; pin para `node:20-bookworm-slim`)
- ❌ Omitir healthcheck (Compose não espera DB migração antes de subir dependentes)
- ❌ `build context = apps/api` em monorepo (infla contexto com `node_modules`, `coverage`, etc.; usar repo root)
- ❌ Secrets hardcoded em `environment:` do Compose (usar `env_file`, Docker secrets ou build args; jamais commitar `.env`)
- ❌ Esquecer `db:generate` antes de `tsc` no api (`Cannot find module '@prisma/client'` em build — Prisma 6 não dá fallback silencioso)

## Cross-refs

- [`.agents/agents/docker-specialist.md`](../../agents/docker-specialist.md) — capabilities + quando invocar
- [`.agents/specs/conventions/specialist-routing.md`](../../specs/conventions/specialist-routing.md) — path_globs + keywords que disparam este skill
- [`docs/superpowers/specs/2026-09-23-specialist-router-docker-design.md`](../../../docs/superpowers/specs/2026-09-23-specialist-router-docker-design.md) §5.7-§5.9 — design da skill no rollout
- [`docs/superpowers/plans/2026-09-23-specialist-router-docker-fase-03a-dockerfiles-compose.md`](../../../docs/superpowers/plans/2026-09-23-specialist-router-docker-fase-03a-dockerfiles-compose.md) — Tasks 13-14 (Dockerfiles api + web + compose)
