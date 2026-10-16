# syntax=docker/dockerfile:1.7
# pt-BR (#89, 2026-10-16): ARG no topo permite que `docker build --build-arg NODE_DIGEST=...`
# reescreva o digest em todos os `FROM` de uma vez. Resolve o problema de duplicar
# `@sha256:...` em 4 estágios (base/dev/builder/prod) — uma linha, 4 FROMs.
ARG NODE_DIGEST=sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
FROM node:22-bookworm-slim@${NODE_DIGEST} AS base
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
# pt-BR (#88, 2026-10-16): cria user 1001 para o stage dev (não usado em prod,
# mas mantém consistência — a regra é: todo stage que tem `USER` usa UID numérico).
RUN groupadd --gid 1001 app && useradd --uid 1001 --gid 1001 --no-create-home --shell /bin/false app
USER 1001:1001
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

# pt-BR (#89): ARG re-declarado porque ARG de escopo global só vale para o
# primeiro FROM; entre estágios é perdido. Mesma estratégia em todos os 4 estágios.
ARG NODE_DIGEST=sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
FROM node:22-bookworm-slim@${NODE_DIGEST} AS prod
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
# pt-BR (#88, 2026-10-16): user dedicado UID 1001 com shell /bin/false.
# Antes era `USER node` que dependia do UID 1000 implícito da imagem
# upstream — qualquer mudança de UID na tag node:22-bookworm-slim quebrava
# policies OPA/K8s `runAsUser` (que precisa de UID numérico) e mounts NFS/CIFS
# (que autenticam por UID). Hardcoded numérico garante interface estável.
RUN groupadd --gid 1001 app && useradd --uid 1001 --gid 1001 --no-create-home --shell /bin/false app
USER 1001:1001
EXPOSE 3000
# pt-BR: Task 1.5 — auto-carrega tracing OTel antes de qualquer código de usuário.
# `--import` é ESM-aware (Node 20.6+); `--require` é CJS-only e quebraria em
# runtime `type: module`. O caminho é relativo ao WORKDIR (/repo), espelhando
# a convenção do entrypoint (`apps/api/dist/main.js`). Aponta para `init.js`
# (wrapper side-effect que chama initTracing() no top-level); `tracing.js` é
# puro e NÃO tem side-effect (protegido por tracing.spec.ts:28-35), portanto
# importá-lo diretamente NÃO dispararia o SDK no container. Side-effect: o
# módulo init.js é registrado como import antes do bootstrap do NestFactory.
ENV NODE_OPTIONS="--import ./apps/api/dist/shared/infrastructure/telemetry/init.js"
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/v1/health || exit 1
ENTRYPOINT ["sh","-c","pnpm exec prisma migrate deploy --schema=apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]