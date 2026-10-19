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
# ⚠️ (issue #104) AS DEPS DA API VIVEM EM `apps/api/node_modules`, não na raiz —
# topologia do pnpm em workspace. MEDIDO no `builder`: `node_modules/@nestjs` da
# raiz AUSENTE, o de `apps/api` PRESENTE. O `prod` copiava só a raiz — os 12
# devDeps dela — e nenhuma das 26 `dependencies` da api.
COPY --from=builder /repo/apps/api/node_modules apps/api/node_modules
COPY --from=builder /repo/node_modules node_modules
# pt-BR: Task 1.5 — auto-carrega tracing OTel antes de qualquer código de usuário.
# `--import` é ESM-aware (Node 20.6+); `--require` é CJS-only. `tracing.js` é puro
# (tracing.spec.ts:28-35), então importá-lo direto NÃO dispararia o SDK — daí o
# wrapper `init.js`.
# ⚠️ (issue #104) Este `ENV` vem ANTES do `node --check`: estava depois, e o
# `--check` mediava sintaxe sem resolver a cadeia de imports. O caminho é ABSOLUTO
# porque o `--import` resolve contra o CWD de cada `node` (MEDIDO: com `./apps/api/…`,
# o `pnpm exec prisma` de `/repo/apps/api` procurava `apps/api/apps/api/dist/…`,
# porque o `cd` do ENTRYPOINT muda o CWD).
ENV NODE_OPTIONS="--import /repo/apps/api/dist/shared/infrastructure/telemetry/init.js"
# ⚠️ (issue #104) O `pnpm prune --prod` foi REMOVIDO e NÃO trocado por
# `pnpm install --prod`: MEDIDO como no-op (EACCES na raiz, exit 243, prompt de
# workspace) e o 243 era absorvido pelo `&&` do RUN abaixo — a linha inútil era a
# que MASCARAVA um build quebrado. O que traz as 26 `dependencies` é o `COPY`
# acima: sem ele o build quebra com `ERR_MODULE_NOT_FOUND`. Preço aceito: a imagem
# traz os 8 `devDependencies` da api também; `pnpm deploy` é refactor próprio.
RUN node --check apps/api/dist/main.js
# pt-BR (#88, 2026-10-16): user dedicado UID 1001. Antes era `USER node`, que dependia
# do UID 1000 implícito da imagem upstream — e qualquer mudança de UID na tag quebrava
# policies OPA/K8s `runAsUser` e mounts NFS/CIFS (ambos autenticam por UID).
#
# ⚠️ (issue #104) `--create-home` NOVO, e a razão não é o diretório: o `pnpm` é shim
# do COREPACK, que grava em `$HOME/.cache`. Com `--no-create-home`, QUALQUER
# `pnpm …` morre com `EACCES … '/home/app/.cache/node/corepack/v1'`, quebrando o
# ENTRYPOINT antes do servidor. MEDIDO: no stage `base` o mesmo dá `9.12.0`.
RUN groupadd --gid 1001 app && useradd --uid 1001 --gid 1001 --create-home --shell /bin/false app
USER 1001:1001
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/v1/health || exit 1
# ⚠️ (issue #105) Guarda de `DATABASE_URL` vazia — o compose declarava a chave em
# `environment:`, que tem precedência sobre o `env_file` e a sobrescrevia com
# string vazia (a chave saiu do compose). Sem a guarda o único sintoma é
# `P1012 … nonempty URL` do `migrate deploy`, genérico e sem dizer de onde. O
# fail-fast é AQUI porque o migrate roda ANTES do node — o desenho do
# `JWT_SECRET` pelo motivo inverso. Não foi `${DATABASE_URL:?}` no compose pelo
# motivo que o compose (:95-102) registra: quebra `config`/`ps`/`down`.
# O `cd` NÃO é cosmético: `pnpm exec` procura em `./node_modules/.bin` e o binário
# do prisma vive em `apps/api/node_modules/.bin` (MEDIDO: de `/repo` devolvia
# `Command "prisma" not found`). E o `$` é UM, não `$$`: no JSON com `sh -c` quem
# expande é o shell do container, então `$$` virava `$` literal e o teste rodava
# sobre a STRING `"$DATABASE_URL"`, nunca vazia (MEDIDO: a guarda não disparava).
ENTRYPOINT ["sh","-c","if [ -z \"$DATABASE_URL\" ]; then echo 'ERRO: DATABASE_URL vazia ou ausente no container da api (issue #105). A linha precisa existir no .env.production apontando para o papel app_runtime (ver .env.production.example); a de DONO e a DIRECT_DATABASE_URL, que e outra chave.' >&2; exit 1; fi; cd /repo/apps/api && pnpm exec prisma migrate deploy --schema=prisma/schema.prisma && node dist/main.js"]
