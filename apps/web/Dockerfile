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
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
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
