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
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
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
COPY --from=builder /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml ./
COPY --from=builder /repo/node_modules node_modules
RUN pnpm prune --prod
# pt-BR: defesa em profundidade — `node --check` valida syntax do entrypoint
# sem precisar runtime deps. Pega erros de parsing, missing modules em require/import
# e typos em filenames antes do container subir. Custo: ~100ms por build.
RUN node --check apps/api/dist/main.js
USER node
EXPOSE 3000
# pt-BR: Task 1.5 — auto-carrega tracing OTel antes de qualquer código de usuário.
# `--import` é ESM-aware (Node 20.6+); `--require` é CJS-only e quebraria em
# runtime `type: module`. O caminho é relativo ao WORKDIR (/repo), espelhando
# a convenção do entrypoint (`apps/api/dist/main.js`). Side-effect: o módulo
# é registrado como import antes do bootstrap do NestFactory.
ENV NODE_OPTIONS="--import ./apps/api/dist/shared/infrastructure/telemetry/tracing.js"
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/v1/health || exit 1
ENTRYPOINT ["sh","-c","pnpm exec prisma migrate deploy --schema=apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]