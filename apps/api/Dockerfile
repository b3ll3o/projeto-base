# syntax=docker/dockerfile:1.7
# pt-BR (#89, 2026-10-16): ARG no topo reescreve o digest em todos os `FROM` de uma vez
# (4 estágios) — uma linha, 4 FROMs, e o `@sha256:` duplicado sai do fonte.
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
# pt-BR (#139): sem `curl` — ele existia SÓ para o `HEALTHCHECK`, e um probe que
# depende de um pacote instalado não sobrevive à troca de stage. Ver o runbook.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
ENV NODE_ENV=production PORT=3000
COPY --from=builder /repo/apps/api/dist apps/api/dist
# #118: `scripts/` traz o setup que aplica a SENHA dos papeis a partir do ambiente.
# ⚠️ (#139, MEDIDO 2026-11-09) DOIS `COPY`, um por pasta: `COPY <a> <b> <dest>/`
# copia o CONTEÚDO de cada uma direto para o destino, e as duas pastas ficavam
# achatadas em `/repo/apps/api/` — onde o ENTRYPOINT não achava nem
# `prisma/schema.prisma` nem `./scripts/prepara-papeis.sh`. A imagem não subia.
COPY --from=builder /repo/apps/api/prisma apps/api/prisma
COPY --from=builder /repo/apps/api/scripts apps/api/scripts
COPY --from=builder /repo/package.json ./
COPY --from=builder /repo/apps/api/package.json apps/api/
COPY --from=builder /repo/packages packages
COPY --from=builder /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml ./
# ⚠️ (issue #104) AS DEPS DA API VIVEM EM `apps/api/node_modules`, não na raiz
# (topologia do pnpm em workspace) — e é o `COPY` abaixo que as traz.
COPY --from=builder /repo/apps/api/node_modules apps/api/node_modules
COPY --from=builder /repo/node_modules node_modules
# pt-BR: Task 1.5 — auto-carrega tracing OTel antes de qualquer código de usuário.
# `--import` é ESM-aware (Node 20.6+); `--require` é CJS-only. Este `ENV` vem ANTES
# do `node --check` (que mediava sintaxe sem resolver a cadeia de imports) e o
# caminho é ABSOLUTO (o `--import` resolve contra o CWD de cada `node`).
ENV NODE_OPTIONS="--import /repo/apps/api/dist/shared/infrastructure/telemetry/init.js"
# ⚠️ (issue #104) O `pnpm prune --prod` foi REMOVIDO e NÃO trocado por
# `pnpm install --prod`: MEDIDO como no-op. O que traz as `dependencies` é o
# `COPY` de `node_modules` acima — sem ele o build quebra com `ERR_MODULE_NOT_FOUND`.
RUN node --check apps/api/dist/main.js
# pt-BR (#88, 2026-10-16): user dedicado UID 1001 (políticas OPA/K8s autenticam
# por UID). `--create-home` porque o `pnpm` (shim do COREPACK) grava em
# `$HOME/.cache` — sem ele, QUALQUER `pnpm …` morre com EACCES no boot.
RUN groupadd --gid 1001 app && useradd --uid 1001 --gid 1001 --create-home --shell /bin/false app
USER 1001:1001
EXPOSE 3000
# pt-BR (#139): o probe usa o `node` da imagem, e NÃO um pacote instalado — as DUAS
# imagens (a `base` do stage `dev` e a `prod`) têm `node`. Um probe que depende
# de binário é uma armadilha de stage: o compose de dev troca o `build.target` e
# herda o healthcheck, e o binário não vem junto.
#
# ⚠️ O `NODE_OPTIONS=` (vazio) no COMEÇO impede o probe de carregar o SDK de
# telemetria: o `--import` vale para TODA invocação de `node` do container, e um
# probe que o carregasse iniciaria um SDK de OpenTelemetry A CADA 10 s.
# MEDIDO 2026-11-08: o custo de carregar o bundle é ~360 ms.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD NODE_OPTIONS= node -e "require('http').get('http://localhost:3000/api/v1/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
# ⚠️ (issue #105) Guarda de `DATABASE_URL` vazia: o compose declarava a chave em
# `environment:` (que tem precedência sobre o `env_file`) e a sobrescrevia com
# string vazia. O fail-fast é AQUI porque o migrate roda ANTES do node. O `cd`
# NÃO é cosmético: `pnpm exec` procura em `./node_modules/.bin`, e o binário do
# prisma vive em `apps/api/node_modules/.bin`. E o `$` é UM, não `$$`: no JSON
# com `sh -c` quem expande é o shell do container.
# pt-BR (#137): o `exec` ANTES do `node` é o que faz o SIGTERM chegar nele. Sem
# `exec`, o `&&` faz o `sh` forkar o `node` e CONTINUAR VIVO como pai — a árvore
# real é `tini → sh → node`, e o sinal morria no shell (o tini repassa o sinal
# apenas ao filho direto). Com `exec`, o node é o FILHO DIRETO do tini — MEDIDO
# 2026-11-09: `pid=7 ppid=1 node dist/main.js` (sem o `exec`, `pid=334 ppid=7`).
ENTRYPOINT ["sh","-c","if [ -z \"$DATABASE_URL\" ]; then echo 'ERRO: DATABASE_URL vazia ou ausente no container da api (issue #105). A linha precisa existir no .env.production apontando para o papel app_runtime (ver .env.production.example); a de DONO e a DIRECT_DATABASE_URL, que e outra chave.' >&2; exit 1; fi; cd /repo/apps/api && pnpm exec prisma migrate deploy --schema=prisma/schema.prisma && sh ./scripts/prepara-papeis.sh && exec node dist/main.js"]
