# syntax=docker/dockerfile:1.7
# pt-BR (#89, 2026-10-16): mesma estratégia do Dockerfile da API — ARG
# no topo do stage permite `--build-arg NODE_DIGEST=...` reescrever
# o digest em todos os FROM de uma vez.
ARG NODE_DIGEST=sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
FROM node:22-bookworm-slim@${NODE_DIGEST} AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

FROM base AS dev
# pt-BR (#138): o `HOSTNAME` do container é o short-ID dele, e ele resolve
# para o IP do container — não para 127.0.0.1.
#
# ⚠️ MEDIDO 2026-11-08: no stage `prod` (o `server.js` standalone) o
# `HOSTNAME` é o ENDEREÇO DE BIND — `const hostname = process.env.HOSTNAME ||
# '0.0.0.0'` — e sem esta linha o servidor escutava no IP do container e o
# probe em `localhost:3001` nunca conectava.
#
# ⚠️ No stage `dev` o `next dev` NÃO lê `process.env.HOSTNAME`: ele tira o
# endereço da flag `-H/--hostname`, cujo default é `0.0.0.0` (Next 15.5.28). O
# `ENV` aqui é DEFENSIVO — se o default mudar, o bind continua sendo o
# esperado. Ele não é o que faz o dev escutar em 0.0.0.0 hoje.
ENV HOSTNAME=0.0.0.0
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm fetch
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages packages
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @projeto/web...
COPY apps/web apps/web
# pt-BR (#88): cria user 1001 para o stage dev — mesmo rationale da API.
RUN groupadd --gid 1001 app && useradd --uid 1001 --gid 1001 --no-create-home --shell /bin/false app
USER 1001:1001
EXPOSE 3001
CMD ["pnpm", "--filter", "@projeto/web", "dev"]

FROM base AS builder
# pt-BR (#113): `NEXT_PUBLIC_*` é INLINED no bundle do cliente pelo Next.js —
# não lida em runtime. Sem esta chave no `build.args`, o serviço `web` do
# Compose nasce sem endpoint e `instrumentation-client.ts` cai no `if (endpoint)`
# e não registra provider: zero span de browser, sem erro e sem log (o sintoma
# que o próprio arquivo documenta em `instrumentation-client.ts:26-33`).
#
# `ARG` nasce VAZIO de propósito: qualquer build fora do Compose (`docker build`,
# o job `docker-build-prod` do CI) continua sem telemetria de browser, em vez de
# exportar span para um collector que não existe.
#
# shortcut: o serviço `web` não tem `profiles`, então o `build.args` do Compose
# vale para TODO build dele — inclusive produção sem collector, onde o browser
# passa a exportar para `localhost:4318` e ninguém recebe. Quando o `web`
# entrar no profile `observability`, mover o endpoint para um override.
ARG NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=
ENV NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=${NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT}
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm fetch
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages packages
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @projeto/web...
COPY apps/web apps/web
RUN pnpm --filter @projeto/web build

# pt-BR (#89): ARG re-declarado entre estágios (escopo é perdido).
ARG NODE_DIGEST=sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
FROM node:22-bookworm-slim@${NODE_DIGEST} AS prod
WORKDIR /repo
# pt-BR (#138): o `HOSTNAME` é o ENDEREÇO DE BIND do `server.js` gerado pelo
# Next.js standalone (`const hostname = process.env.HOSTNAME || '0.0.0.0'`).
# O daemon do Docker exporta `HOSTNAME` em TODO container, com o valor do
# hostname do próprio container (o short-ID) — que resolve para o IP do
# container, NÃO para 127.0.0.1. Resultado: o servidor escutava no IP do
# container e o probe em `http://localhost:3001/api/health` nunca conectava:
# o serviço ficava `unhealthy` permanente, com a app no ar.
#
# `0.0.0.0` escuta em todas as interfaces — e o probe em `localhost` volta a
# resolver. É a convenção que o Next.js documenta para `output: 'standalone'`.
ENV NODE_ENV=production PORT=3001 HOSTNAME=0.0.0.0
COPY --from=builder /repo/apps/web/.next/standalone /repo
COPY --from=builder /repo/apps/web/.next/static /repo/apps/web/.next/static
COPY --from=builder /repo/apps/web/public /repo/apps/web/public
# pt-BR (#88, 2026-10-16): mesmo rationale da API — UID numérico para
# OPA/K8s runAsUser e mounts NFS/CIFS. Web não escreve em /repo, só serve
# o build Next.js standalone.
RUN groupadd --gid 1001 app && useradd --uid 1001 --gid 1001 --no-create-home --shell /bin/false app
USER 1001:1001
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
