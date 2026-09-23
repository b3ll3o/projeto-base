# Fase 3a — Dockerfiles + Compose (Tasks 11-16)

> TDD step-by-step. **Branch:** `feat/dockerize-apps`. Pré-requisito: Fases 1+2 completas.
> Tasks 17-21 (health/docs/CI/PR) estão em [`fase-03b-apps-health-docs-pr.md`](./2026-09-23-specialist-router-docker-fase-03b-apps-health-docs-pr.md).

---

### Task 11: .dockerignore (root)

**Files:** Create `.dockerignore` (≤ 30 linhas).

- [ ] **Step 1: Criar .dockerignore**
```
**/node_modules
**/dist
**/.next
**/.turbo
**/coverage
**/*.log
**/.DS_Store
**/.env
**/.env.local
**/.env.*.local
.git
.github
.husky
.tooling
tooling
.agents
.claude
docs
**/openapi.json
**/*-report.json
**/*.tsbuildinfo
!apps/api/prisma/migrations
```

- [ ] **Step 2: Commit**
```bash
git add .dockerignore
git commit -m "feat(docker): add root .dockerignore for monorepo build context"
```

---

### Task 12: apps/web/next.config.mjs (output: 'standalone')

**Files:** Create `apps/web/next.config.mjs` (≤ 10 linhas).

- [ ] **Step 1: Criar config**
```js
/** @type {import('next').NextConfig} */
const nextConfig = { output: 'standalone' };
export default nextConfig;
```

- [ ] **Step 2: Validar build local** (`pnpm --filter @projeto/web build` → exit 0, `.next/standalone/` criado).

- [ ] **Step 3: Commit**
```bash
git add apps/web/next.config.mjs
git commit -m "feat(web): enable Next.js standalone output for Docker"
```

---

### Task 13: apps/web/Dockerfile (multi-stage)

**Files:** Create `apps/web/Dockerfile` (≤ 60 linhas).

- [ ] **Step 1: Criar Dockerfile** — Stages `base` (node:20-bookworm-slim + corepack) → `dev` (pnpm install + tsx-free dev) → `builder` (next build) → `prod` (standalone + USER node + HEALTHCHECK).
```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

FROM base AS dev
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm fetch
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages packages
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @projeto/web...
COPY apps/web apps/web
USER node
EXPOSE 3001
CMD ["pnpm", "--filter", "@projeto/web", "dev"]

FROM base AS builder
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm fetch
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages packages
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @projeto/web...
COPY apps/web apps/web
RUN pnpm --filter @projeto/web build

FROM node:20-bookworm-slim AS prod
WORKDIR /repo
ENV NODE_ENV=production PORT=3001
COPY --from=builder /repo/apps/web/.next/standalone /repo
COPY --from=builder /repo/apps/web/.next/static /repo/apps/web/.next/static
COPY --from=builder /repo/apps/web/public /repo/apps/web/public
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
```

- [ ] **Step 2: Test build target prod**
```bash
docker build -f apps/web/Dockerfile --target prod -t projeto-base-web:test .
```
Esperado: exit 0, imagem <200MB.

- [ ] **Step 3: Commit**
```bash
git add apps/web/Dockerfile
git commit -m "feat(docker): add multi-stage Dockerfile for web (dev+prod)"
```

---

### Task 14: apps/api/Dockerfile (multi-stage + db:generate → tsc)

**Files:** Create `apps/api/Dockerfile` (≤ 70 linhas).

- [ ] **Step 1: Criar Dockerfile** — Mesma estrutura da Task 13 com 2 diferenças críticas: (a) instalar `openssl` no runtime para Prisma; (b) rodar `db:generate` antes de `tsc` no stage builder; (c) entrypoint com `prisma migrate deploy && node dist/main.js`.
```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS dev
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm fetch
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages packages
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @projeto/api...
COPY apps/api apps/api
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@projeto/api", "dev"]

FROM base AS builder
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm fetch
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages packages
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @projeto/api...
COPY apps/api apps/api
RUN pnpm --filter @projeto/api db:generate
RUN pnpm --filter @projeto/api build

FROM node:20-bookworm-slim AS prod
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
RUN apt-get update && apt-get install -y --no-install-recommends openssl curl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
ENV NODE_ENV=production PORT=3000
COPY --from=builder /repo/apps/api/dist apps/api/dist
COPY --from=builder /repo/apps/api/prisma apps/api/prisma
COPY --from=builder /repo/package.json ./
COPY --from=builder /repo/apps/api/package.json apps/api/
COPY --from=builder /repo/packages packages
COPY --from=builder /repo/pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=builder /repo/node_modules node_modules
RUN pnpm prune --prod
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/v1/health || exit 1
ENTRYPOINT ["sh","-c","node_modules/.bin/prisma migrate deploy --schema=apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]
```

> **Note (2026-09-23):** `pnpm prune --prod` removes the prisma CLI unless it is in `dependencies`. The api package requires `"prisma": "^6.0.0"` in `dependencies` (not `devDependencies`) so that the ENTRYPOINT can invoke `node_modules/.bin/prisma migrate deploy` at runtime.

- [ ] **Step 2: Test build target prod**
```bash
docker build -f apps/api/Dockerfile --target prod -t projeto-base-api:test .
```
Esperado: exit 0, imagem <300MB.

- [ ] **Step 3: Commit**
```bash
git add apps/api/Dockerfile
git commit -m "feat(docker): add multi-stage Dockerfile for api (dev+prod, db:generate→tsc)"
```

---

### Task 15: docker-compose.yml (estender com api + web prod)

**Files:** Modify `docker-compose.yml`.

- [ ] **Step 1: Substituir conteúdo** — Manter `postgres` existente. Adicionar `api` (build prod, depends_on postgres healthy, env DATABASE_URL apontando para `postgres:5432`) e `web` (build prod, depends_on api, env API_BASE_URL `http://api:3000/api/v1`).
```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: projeto-base-postgres
    environment:
      POSTGRES_USER: projeto
      POSTGRES_PASSWORD: projeto
      POSTGRES_DB: projeto_base
    ports: ['5432:5432']
    volumes: ['postgres_data:/var/lib/postgresql/data']
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U projeto']
      interval: 5s
      timeout: 5s
      retries: 5
  api:
    build: { context: ., dockerfile: apps/api/Dockerfile, target: prod }
    container_name: projeto-base-api
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://projeto:projeto@postgres:5432/projeto_base?schema=public
      LOG_LEVEL: info
    ports: ['3000:3000']
    depends_on:
      postgres: { condition: service_healthy }
  web:
    build: { context: ., dockerfile: apps/web/Dockerfile, target: prod }
    container_name: projeto-base-web
    environment:
      NODE_ENV: production
      PORT: 3001
      API_BASE_URL: http://api:3000/api/v1
    ports: ['3001:3001']
    depends_on: ['api']
volumes:
  postgres_data:
```

- [ ] **Step 2: Smoke test** (`docker compose config` → YAML válido, exit 0).

- [ ] **Step 3: Commit**
```bash
git add docker-compose.yml
git commit -m "feat(docker): extend compose with api+web services (prod targets)"
```

---

### Task 16: docker-compose.dev.yml (override dev com hot reload)

**Files:** Create `docker-compose.dev.yml` (≤ 40 linhas).

- [ ] **Step 1: Criar override** — Reutiliza services do compose base mas sobrescreve `build.target=dev`, env de dev, bind mounts (código :ro + volumes anônimos para node_modules), e `command` para `dev` scripts.
```yaml
services:
  api:
    build: { target: dev }
    environment:
      NODE_ENV: development
      DATABASE_URL: postgresql://projeto:projeto@postgres:5432/projeto_base?schema=public
    volumes:
      - ./apps/api/src:/repo/apps/api/src:ro
      - ./apps/api/prisma:/repo/apps/api/prisma:ro
      - api_node_modules:/repo/node_modules
      - api_apps_modules:/repo/apps/api/node_modules
    command: ['pnpm', '--filter', '@projeto/api', 'dev']
  web:
    build: { target: dev }
    environment:
      NODE_ENV: development
      API_BASE_URL: http://api:3000/api/v1
    volumes:
      - ./apps/web/app:/repo/apps/web/app:ro
      - ./apps/web/lib:/repo/apps/web/lib:ro
      - ./apps/web/public:/repo/apps/web/public:ro
      - web_node_modules:/repo/node_modules
      - web_apps_modules:/repo/apps/web/node_modules
      - web_next:/repo/apps/web/.next
    command: ['pnpm', '--filter', '@projeto/web', 'dev']
volumes:
  api_node_modules:
  api_apps_modules:
  web_node_modules:
  web_apps_modules:
  web_next:
```

- [ ] **Step 2: Smoke test** (`docker compose -f docker-compose.yml -f docker-compose.dev.yml config` → exit 0).

- [ ] **Step 3: Commit**
```bash
git add docker-compose.dev.yml
git commit -m "feat(docker): add dev override (hot reload via bind mounts)"
```

---

**Mantido por:** projeto-base contributors