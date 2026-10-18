# Como rodar o projeto em todos os ambientes

Passo a passo por ambiente. O README traz o resumo das duas opções de loop local; aqui está
o mapa completo (dev, Docker, observabilidade, e2e, CI) com o que foi **medido** nesta sessão
e o que foi **lido do código**.

Data da medição: **2026-10-16**, branch `main` (commit `fcc0e17`).

Legenda: **✅ medido** = executado nesta sessão, com saída observada.
**📖 lido do código** = passos derivados do YAML/Dockerfile/script, não executados aqui.

---

## 0. Pré-requisitos

Node >= 22.6.0 · pnpm 9.12.0 (`packageManager`) · Docker com `compose` v2 (ambientes 2–4) ·
Chromium para o e2e (instalado pelo `pretest:e2e`).

```bash
pnpm install --frozen-lockfile
```

---

## Quando este documento precisa mudar

O gate `check-runbook-drift` (preflight, Camada 1) acusa sozinho **duas** formas de
drift: um `pnpm <script>` citado aqui que não existe mais em nenhum `package.json` do
workspace, e uma chave da tabela "Variáveis de ambiente" que sumiu dos `.env.example`.

O que o gate **não** mede — e precisa do olho de quem mudou a coisa:

- **script novo/renomeado** → o bloco de comandos do ambiente correspondente;
- **`.env.example` alterado** (chave removida/renomeada) → tabela de variáveis + o passo que copia o arquivo;
- **porta trocada** no compose ou no `dev` → §1.5, ambiente 3, troubleshooting;
- **serviço/ambiente novo** → um `## Ambiente N` na frente do atual;
- **defeito de boot em qualquer ambiente** → a seção dele, trocando 📖 por ✅ e a data.

Regra prática: **quem mudou o comando escreve a linha nova no mesmo commit.** O gate
pega o que ficou para trás; ele não sabe o que você aprovou.

---

## Ambiente 1 — Dev local, pnpm nativo ✅ medido

O caminho mais rápido para iterar: apps na máquina, só o banco em container.

### 1.1 Banco de dados ⚠️ não use `docker compose up -d postgres`

Desde o PR #91 (2026-10-16) o serviço `postgres` do compose usa apenas `expose: 5432`, **sem
`ports:`** — ele é alcançável de dentro da rede Docker, não do host, então subir só ele não
serve para o app na máquina. (O `README.md` Opção B mandava esse comando — corrigido junto.)

Rode um Postgres próprio com porta publicada:

```bash
docker run -d --name projeto-base-pg-local -p 5432:5432 \
  -e POSTGRES_USER=projeto -e POSTGRES_PASSWORD=projeto -e POSTGRES_DB=projeto_base \
  postgres:16-alpine
```

A URL tem que bater com `apps/api/.env` (✅ medido: `projeto:***@localhost:5432/projeto_base`);
para derrubar, `docker rm -f projeto-base-pg-local`.

### 1.2 Segredo JWT

A API **recusa o boot sem `JWT_SECRET`**, em qualquer `NODE_ENV` (ADR-0002 — não existe default,
por decisão de projeto).

```bash
cp apps/api/.env.example apps/api/.env
openssl rand -base64 48   # preencher a linha JWT_SECRET= de apps/api/.env
```

✅ medido: `apps/api/.env` já existia neste checkout com `NODE_ENV`, `PORT`, `DATABASE_URL`,
`LOG_LEVEL` e `JWT_SECRET` — nada a fazer.

### 1.3 Prisma Client + migrations

```bash
pnpm turbo run db:generate                                    # ~1,5s medido
cd apps/api && pnpm exec prisma migrate deploy && cd ../..  # 2 migrations aplicadas (medido)
```

> Sem o `cd apps/api`, o Prisma não lê `apps/api/.env`. E **não existe** script
> `prisma:migrate:deploy` em nenhum `package.json` — o pnpm responde "None of the selected
> packages has a ... script" e **sai 0**, verde para quem só olha o exit code.

### 1.4 Subir os apps

```bash
pnpm dev     # turbo run dev em paralelo — api :3000, web :3001
```

### 1.5 Verificar

✅ **medido** nesta sessão:

```bash
curl -s http://localhost:3000/api/v1/health
# {"status":"ok","checks":{"database":"ok"},"timestamp":"2026-10-16T15:23:36.298Z"}

curl -s http://localhost:3001/api/health
# {"status":"ok","timestamp":"2026-10-16T15:23:39.321Z"}

curl -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/docs   # 200 (Swagger UI)
```

⚠️ No boot do web saem uns `Module not found` de `@opentelemetry/winston-transport` e
`@opentelemetry/exporter-jaeger`, peers opcionais do `auto-instrumentations-node`: ✅ medido —
**não impedem o boot**, o Next segue e fica `✓ Ready in 5.9s`.

### 1.6 Fluxo completo (API e UI) ✅ medido

O body de criação usa campos **em português**: `nome`, `email`, `senha` (`CreateUserSchema`, `apps/api/src/modules/users/infrastructure/http/users.schemas.ts:73`).

```bash
EMAIL="voce.$(date +%s)@exemplo.dev"
J='content-type: application/json'
curl -X POST http://localhost:3000/api/v1/users -H "$J" \
  -d "{\"nome\":\"Leo Local\",\"email\":\"$EMAIL\",\"senha\":\"SenhaForte123\"}"   # 201
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login -H "$J" \
  -d "{\"email\":\"$EMAIL\",\"senha\":\"SenhaForte123\"}" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
curl -H "authorization: Bearer $TOKEN" http://localhost:3000/api/v1/auth/me      # 200
curl -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/v1/users         # 401 (sem token)
curl -H "authorization: Bearer $TOKEN" http://localhost:3000/api/v1/users        # 200
```

Pela UI: `http://localhost:3001/users` redireciona para `/login` (exige sessão); preencher
e-mail/senha com o usuário acima leva para `/users`, que lista o recém-criado ("1 usuário
cadastrado"). `Cadastrar usuário` abre `/users/novo`.

---

## Ambiente 2 — Dev local, Docker com hot reload 📖 lido do código

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

O overlay troca o target para `dev` e monta `apps/api/src` e `apps/web/app` em bind
mount `:ro`; api em `:3000`, web em `:3001` — acesso pelo host idêntico ao ambiente 1.

Mudanças em `apps/api/src/` → `tsx watch` recarrega; `apps/web/app/` → Fast Refresh.

> As networks (`frontend` p/ web, `backend` p/ api+postgres) seguem valendo: só o `postgres`
> perde a porta publicada, o que não atrapalha — a API fala com ele por DNS interno.

---

## Ambiente 3 — Stack completa em Docker (imagens prod) ✅ medido — **com 1 bloqueio no `main`**

### 3.1 Preparar os arquivos de ambiente

**Estado medido em 2026-10-17** (só nomes de chave; valores não entram no doc):
`.env` da raiz **existe**, 1 chave (`DATABASE_URL`); `.env.production` **existe**,
7 chaves (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`,
`ALLOWED_ORIGINS`, `JWT_SECRET`, `LOG_LEVEL`); `DIRECT_DATABASE_URL` é a **única
ausente**.

⚠️ **A versão anterior desta seção afirmava que `.env` não existia e que
`.env.production` era um stub de 1 linha.** Ambas **medidas falsas** acima: os
dois arquivos existem e estão preenchidos. As frases datavam de 2026-10-16 e
envelheceram sem que o texto acompanhasse.

⚠️ **DUAS conexões desde a Fase 9 (RLS).** A da APLICAÇÃO tem de ser o papel
`app_runtime`, criado pela migration; a de DONO é a que o CLI do Prisma usa.
Inverter as duas não dá erro — a stack sobe e as policies ficam inertes.

```bash
# ⚠️ NÃO rode se o seu .env.production já tem segredo: o `cp` é DESTRUTIVO.
cp .env.production.example .env.production     # preencher os CHANGE_ME_*
#   POSTGRES_PASSWORD, JWT_SECRET  (openssl rand -base64 48)
#   DIRECT_DATABASE_URL            (conexão de DONO — ver o aviso abaixo)

# .env da RAIZ: só o DATABASE_URL, host = "postgres". O serviço `api` declara
# `DATABASE_URL: ${DATABASE_URL}`, que o compose interpola da raiz; sem ele a
# chave resolve para string vazia e o healthcheck reprova.
echo 'DATABASE_URL=postgresql://app_runtime:<senha-de-runtime>@postgres:5432/projeto_base?schema=public' > .env

# EDITE no .env.production a linha DIRECT_DATABASE_URL= que o cp já criou.
# ⚠️ NÃO use `>>`: o example JÁ traz a chave (4ª linha), então anexar cria
# duplicata — e qual das duas o `env_file` do Compose honra NÃO ESTÁ MEDIDO aqui.
# Editar não deixa a pergunta existir. ⚠️ E não ponha a chave no `.env` da raiz:
# `environment:` tem precedência sobre `env_file` e a sobrescreveria com vazio.
#
# ⚠️ A senha de `app_runtime` está em texto puro na migration (migration não lê
# env). Troque-a fora de banda antes de usar isto fora de dev.

docker compose up -d --build
docker compose ps
```

O entrypoint da imagem prod da api roda as migrations sozinho antes do boot
(`ENTRYPOINT ["sh","-c","pnpm exec prisma migrate deploy --schema=apps/api/prisma/schema.prisma && node apps/api/dist/main.js"]`).
Por isso a `DIRECT_DATABASE_URL` é **obrigatória** nesse ambiente: sem ela o
`migrate deploy` falha na subida — que é o comportamento correto, porque a
migration precisa de posse das tabelas para criar o papel e as policies.

Portas publicadas: api `3000`, web `3001`, otel `4317`/`4318` (perfil observabilidade).

### 3.2 O que a execução mediu em 2026-10-16

| Serviço | Estado medido |
|---|---|
| `postgres` | ✅ `Up (healthy)` depois das correções 3.2.1 e 3.2.2 |
| `api` | ❌ crash-loop: `Cannot find package '@opentelemetry/sdk-node'` (ver 3.2.3) — e o `web` nem sobe, porque `docker compose up` aborta na dependência da api |

#### 3.2.1 `restart: unless-stopged` (typo) — **corrigido neste trabalho**

`docker compose up` recusava antes de subir qualquer container, com
`Error response from daemon: invalid restart policy: unknown policy 'unless-stopped'`. Só o
`postgres` tinha o erro; `api`, `web` e `otel-collector` estavam certos.

#### 3.2.2 `user: '999:999'` no Postgres — **corrigido neste trabalho**

Com o typo corrigido, o Postgres reiniciava em loop:

```text
initdb: error: could not access directory "/var/lib/postgresql/data": Permission denied
```

Medido: no `postgres:16-alpine` o usuário `postgres` é **uid/gid 70**
(`docker run --rm postgres:16-alpine id postgres` → `uid=70`), e o PGDATA do volume é
`70:70` com modo `700`. O compose usava `999:999` com um comentário afirmando que esse
era "o user interno da imagem alpine" — não é. Um uid que não é dono do diretório nem
consegue statá-lo, o entrypoint cai no `initdb` e morre.

#### 3.2.3 A imagem prod da API não carrega dependência nenhuma — **em aberto no `main`**

Este é o bloqueio que resta, e **não** é um typo — é decisão de build:

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@opentelemetry/sdk-node'
  imported from /repo/apps/api/dist/shared/infrastructure/telemetry/tracing.js
```

Medido dentro da imagem construída (`docker run --rm --entrypoint sh base-api`):
`/repo/node_modules` tem **735** entradas de `.pnpm`, incluindo devDeps do root (`eslint`,
`@typescript-eslint`…); `/repo/apps/api/node_modules` tem **0**.

O stage `prod` do `apps/api/Dockerfile` copia só o `node_modules` da **raiz** (linha 51) e
roda `pnpm prune --prod` (linha 52). Num workspace pnpm as deps do app ficam em
`apps/api/node_modules` — que nunca é copiado. Resultado duplo: a API não resolve nenhuma
runtime dep, e a imagem carrega as devDeps do root que o `prune` deveria ter tirado. Como o
`@opentelemetry/sdk-node` é importado primeiro (via `NODE_OPTIONS --import
.../telemetry/init.js`), ele é o primeiro erro visível — não o único.

O job `docker-build-prod` do CI **constrói** a imagem e não a **sobe**, então esse defeito
passa verde lá. **Workaround medido:** ambiente 1, que sobe a API com todas as dependências.
Candidatos a conserto (exigem decisão sobre tamanho de imagem): `pnpm deploy --filter
@projeto/api --prod /out` no lugar do `COPY` + `prune`, ou copiar também
`apps/api/node_modules` do builder.

---

## Ambiente 4 — Perfil de observabilidade (OTel Collector) 📖 lido do código

```bash
docker compose --profile observability up -d
```

Sobe o `otel-collector` (config em `infra/otelcol/config.yaml`, montada read-only).
`OTEL_EXPORTER_OTLP_ENDPOINT` vem do `.env.production` e **sem valor o exporter falha no
startup** — é o sinal de "configura o backend de traces". Em dev local (pnpm), para o web
enviar traces do browser: `NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces`.

---

## Ambiente 5 — E2E local (Playwright) 📖 lido do código

```bash
pnpm turbo run test:e2e                              # api (vitest) + web (playwright)
pnpm --filter @projeto/web exec playwright install --with-deps chromium
```

O e2e do web **não** usa a stack do ambiente 1: `apps/web/e2e/global-setup.ts` sobe o próprio
Postgres em container, roda `next build` e sobe o servidor standalone em porta aleatória,
injetando `API_BASE_URL` no ambiente do build.

---

## Ambiente 6 — CI (GitHub Actions) 📖 lido do código

`.github/workflows/ci.yml`, disparado em push/PR, concurrency `ci-<pr|branch>`:

| Job | Passos |
|---|---|
| `preflight` | `pnpm install` → `format:check` → `ci:preflight` → `tooling:test` → `pr:marker` |
| `quality` | `install` → `db:generate` → `lint typecheck` → `test:coverage test:unit` → `test:integration test:e2e` (api) → `playwright install --with-deps chromium` → `test:e2e` (web) |
| `docker-build-prod` | valida que as imagens prod constroem |

Rodar o mesmo localmente, na ordem: `pnpm ci:local` (≈1 min medido no README).

> ⚠️ `pr:marker` lê o corpo do PR **do evento**: corrigir o corpo e re-run não revalida — só um
> push novo revalida (correção no `main` desde o #81). Outros workflows: `release-template.yml`
> (auto-tag pós-merge), `review-stack.yml`, `sync-docs.yml`.

---

## Variáveis de ambiente

| Variável | Onde mora | Consumida por |
|---|---|---|
| `JWT_SECRET` | `apps/api/.env` (pnpm) · `.env.production` (Docker) | `JwtTokenService` — **sem default** |
| `DATABASE_URL` | `apps/api/.env` (pnpm, host `localhost`) · `.env` da raiz (Docker, host `postgres`) — **deve ser `app_runtime`** | Prisma — a conexão da aplicação |
| `DIRECT_DATABASE_URL` | `apps/api/.env` (pnpm) · `.env.production` (Docker) — **o DONO** | CLI do Prisma (`migrate`, `db seed`) |
| `POSTGRES_PASSWORD` | `.env.production` | container do Postgres |
| `API_BASE_URL` | opcional no web — **há fallback** `http://localhost:3000/api/v1` | RSC de `/users`, `/login`, Server Action de `/users/novo` |
| `ALLOWED_ORIGINS` | `.env.production` / compose | CORS no `main.ts` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `.env.production` | collector / exporter |

---

## Troubleshooting

| Sintoma | Causa medida | Solução |
|---|---|---|
| `/api/v1/health` com `checks.database` ≠ `ok` | Postgres do compose não publica porta no host (#91) | ambiente 1.1 — container próprio com `-p 5432:5432` |
| `PrismaClientInitializationError` | `DATABASE_URL` do `.env` da raiz ausente/vazia | ambiente 3 |
| API morre no boot sem mensagem clara | `JWT_SECRET` ausente | `openssl rand -base64 48` |
| `prisma migrate deploy` "não fez nada" e saiu 0 | rodou da raiz / script inexistente | ambiente 1.3, de dentro de `apps/api` |
| `port already in use` em 3000/3001 | ambiente 1 e 3 não podem coexistir | derrube um (`pkill -f "turbo run dev"` ou `docker compose down`) |
| `invalid restart policy: unknown policy 'unless-stopped'` | typo no `docker-compose.yml` | ✅ corrigido neste trabalho |
| `initdb: could not access directory` | uid do compose ≠ uid do `postgres` na imagem | ✅ corrigido neste trabalho |
| `Cannot find package '@opentelemetry/sdk-node'` na imagem prod | stage `prod` não copia `apps/api/node_modules` | ambiente 3 §3.2.3 — **sem workaround no compose**; use o ambiente 1 |
