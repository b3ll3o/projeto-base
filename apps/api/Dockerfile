# syntax=docker/dockerfile:1.7
# pt-BR (#89): o ARG no topo reescreve o digest em todos os `FROM` de uma vez.
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
# pt-BR (#88): user dedicado UID 1001.
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
# ⚠️ (issue #187) As dependências DE PRODUÇÃO, empacotadas: o `prod` copiava o
# `node_modules` INTEIRO do builder (MEDIDO: 687 MB e 718 pacotes, com `eslint`,
# `typescript`, `vitest` e `supertest` na imagem). O `pnpm deploy --prod` empacota
# um `node_modules` AUTOCONTIDO em `/out` (só as `dependencies`); o
# `--config.inject-workspace-packages=true` permite a dependência de WORKSPACE.
FROM builder AS deps-prod
RUN pnpm --config.inject-workspace-packages=true deploy --prod --filter @projeto/api /out

# pt-BR (#89): ARG re-declarado — o ARG global só vale para o primeiro FROM.
ARG NODE_DIGEST=sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392
FROM node:22-bookworm-slim@${NODE_DIGEST} AS prod
# ⚠️ (issue #178) O `corepack prepare` SAIU: o cache do pnpm é ASSADO no build
# (o `COPY --from=builder` abaixo) — MEDIDO: antes, o corepack BAIXAVA o pnpm
# do registry a cada boot, e sem egress a stack não subia.
RUN corepack enable
# pt-BR (#139): sem `curl` — um probe que depende de um pacote instalado não
# sobrevive à troca de stage.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo
ENV NODE_ENV=production PORT=3000
COPY --from=builder /repo/apps/api/dist apps/api/dist
# #118: `scripts/` traz o setup que aplica a SENHA dos papeis. ⚠️ (#139) DOIS
# `COPY`, um por pasta: senão as pastas ficam achatadas (o ENTRYPOINT não acha
# nem o schema nem o script — a imagem não sobe).
COPY --from=builder /repo/apps/api/prisma apps/api/prisma
COPY --from=builder /repo/apps/api/scripts apps/api/scripts
COPY --from=builder /repo/package.json ./
COPY --from=builder /repo/apps/api/package.json apps/api/
COPY --from=builder /repo/packages packages
COPY --from=builder /repo/pnpm-lock.yaml /repo/pnpm-workspace.yaml ./
# ⚠️ (issue #187) As dependências de PRODUÇÃO vêm do stage `deps-prod`. O
# `prisma` (que é `dependency`) sobrevive: é ele que o ENTRYPOINT usa.
COPY --from=deps-prod /out/node_modules apps/api/node_modules
# ⚠️ (issue #187) O CLIENT do Prisma é gerado AQUI: o `deploy` empacota o
# `@prisma/client` (o pacote), mas o client GERADO (`node_modules/.prisma`) não vai
# junto — MEDIDO, sem esta linha o `migrate deploy` respondia `@prisma/client :
# Not found`. As URLs são placeholders: o `generate` não CONECTA.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    DIRECT_DATABASE_URL=postgresql://build:build@localhost:5432/build \
    pnpm --dir /repo/apps/api exec prisma generate --schema=prisma/schema.prisma
# pt-BR: Task 1.5 — auto-carrega tracing OTel antes do código de usuário.
ENV NODE_OPTIONS="--import /repo/apps/api/dist/shared/infrastructure/telemetry/init.js"
# ⚠️ (issue #104) O `pnpm prune --prod` foi REMOVIDO e NÃO trocado por
# `pnpm install --prod`: MEDIDO como no-op. O `COPY` acima é o que traz as
# `dependencies`.
RUN node --check apps/api/dist/main.js
# pt-BR (#88): user dedicado UID 1001 (políticas OPA/K8s autenticam por UID);
# `--create-home` porque o `pnpm` usa `$HOME` — sem ele, morre com EACCES.
RUN groupadd --gid 1001 app && useradd --uid 1001 --gid 1001 --create-home --shell /bin/false app
# ⚠️ (issue #178) O cache do corepack, ASSADO no build e legível pelo uid do runtime
# (é de LEITURA: a api sobe com `read_only: true`).
COPY --from=builder --chown=1001:1001 /root/.cache/node/corepack /repo/.corepack
ENV COREPACK_HOME=/repo/.corepack
USER 1001:1001
EXPOSE 3000
# pt-BR (#139): o probe usa o `node` da imagem, e NÃO um pacote instalado (o
# compose de dev troca o `build.target` e herda o probe); o `NODE_OPTIONS=` (vazio)
# impede o probe de carregar o SDK de telemetria (MEDIDO: ~360 ms).
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD NODE_OPTIONS= node -e "require('http').get('http://localhost:3000/api/v1/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
# ⚠️ (issue #105) Guarda de `DATABASE_URL` vazia: o fail-fast é AQUI porque o
# migrate roda ANTES do node. O `cd` NÃO é cosmético (`pnpm exec` procura em
# `./node_modules/.bin`), e o `$` é UM, não `$$`.
# ⚠️ (issue #180) O `unset DIRECT_DATABASE_URL` ANTES do `exec node`: a URI de DONO
# (superuser) é do CLI do Prisma e do `prepara-papeis.sh`, e não pode ficar no
# ambiente do processo que expõe a API — o guard de boot recusa.
# pt-BR (#137): o `exec` ANTES do `node` faz o SIGTERM chegar nele (sem ele, o
# `sh` forka o `node` e continua vivo como pai).
ENTRYPOINT ["sh","-c","if [ -z \"$DATABASE_URL\" ]; then echo 'ERRO: DATABASE_URL vazia ou ausente no container da api (issue #105). A linha precisa existir no .env.production apontando para o papel app_runtime (ver .env.production.example); a de DONO e a DIRECT_DATABASE_URL, que e outra chave.' >&2; exit 1; fi; cd /repo/apps/api && pnpm exec prisma migrate deploy --schema=prisma/schema.prisma && sh ./scripts/prepara-papeis.sh && unset DIRECT_DATABASE_URL && exec node dist/main.js"]
