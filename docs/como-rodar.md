# Como rodar o projeto — índice, ambiente local e troubleshooting

Mapa completo por ambiente (dev, Docker, observabilidade, e2e, CI). O índice e o
**Ambiente 1** (dev local com pnpm nativo) ficam aqui; os outros cinco são irmãos.

> **Revisto em 2026-10-29** (commit `194d305`). Cada afirmação medida carrega a
> data em que foi medida — as de 2026-10-16 são da primeira redação deste runbook
> e **não** foram re-medidas nesta revisão. Legenda: **✅ medido** = executado, com
> saída observada · **📖 lido do código** = derivado do YAML/Dockerfile/script.

---

## §0. Índice

| # | Ambiente | Onde | Para quê |
|---|---|---|---|
| 1 | Dev local, pnpm nativo | §1 (neste arquivo) | iterar no dia a dia: apps na máquina, só o banco em container |
| 2 | Dev local, Docker com hot reload | [`docs/runbooks/docker.md`](./runbooks/docker.md) | recarregar ao salvar, sem reinstalar nada |
| 3 | Stack completa em Docker (imagens prod) | [`docs/runbooks/docker.md`](./runbooks/docker.md) | rodar exatamente como em produção |
| 4 | Observabilidade (Grafana + Tempo + Prometheus) | [`docs/runbooks/observabilidade.md`](./runbooks/observabilidade.md) | ver traces e métricas |
| 5 | E2E local (Playwright) | [`docs/runbooks/e2e-e-ci.md`](./runbooks/e2e-e-ci.md) | rodar a suíte de navegador |
| 6 | CI (GitHub Actions) | [`docs/runbooks/e2e-e-ci.md`](./runbooks/e2e-e-ci.md) | o que o CI roda, job por job |

O **runbook canônico do repo** é este arquivo: a tabela de variáveis (§2) e o
catálogo de scripts `pnpm` (§3) mora aqui, e são o que o gate
[`check-runbook-drift`](../.tooling/scripts/ci/check-runbook-drift.ts) mede. Os
arquivos irmãos **não** são lidos por esse gate.

### §0.1 Pré-requisitos

Node >= 22.6.0 · pnpm 9.12.0 (`packageManager`) · Docker com `compose` v2
(ambientes 2–4) · Chromium para o e2e (instalado pelo `pretest:e2e`).

```bash
pnpm install --frozen-lockfile
```

### §0.2 Quando este documento precisa mudar

O gate `check-runbook-drift` (preflight, Camada 1) acusa sozinho **duas** formas
de drift: um `pnpm <script>` citado aqui que não existe mais em nenhum
`package.json` do workspace, e uma chave da tabela "Variáveis de ambiente" que
sumiu dos `.env.example`.

O que o gate **não** mede — e precisa do olho de quem mudou a coisa: script
novo/renomeado → §3; `.env.example` alterado → §2 + o passo que copia o arquivo;
porta trocada → §1.5, [runbook Docker](./runbooks/docker.md), §4; ambiente novo →
uma linha em §0 e um arquivo em [`docs/runbooks/`](./runbooks/); defeito de boot →
a seção dele, trocando 📖 por ✅ e a data. Regra prática: **quem mudou o comando
escreve a linha nova no mesmo commit** — o gate pega o que ficou para trás.

---

## §1. Ambiente 1 — Dev local, pnpm nativo

O caminho mais rápido para iterar: apps na máquina, só o banco em container.

### §1.1 Banco de dados ⚠️ não use `docker compose up -d postgres`

Desde o PR #91 (2026-10-16) o serviço `postgres` do compose usa apenas
`expose: 5432`, **sem `ports:`** — ele é alcançável de dentro da rede Docker, não
do host, então subir só ele não serve para o app na máquina. (O `README.md` Opção B
mandava esse comando — corrigido junto.) Rode um Postgres próprio com porta
publicada:

```bash
docker run -d --name projeto-base-pg-local -p 5432:5432 \
  -e POSTGRES_USER=projeto -e POSTGRES_PASSWORD=projeto -e POSTGRES_DB=projeto_base \
  postgres:16-alpine
```

A URL tem que bater com `apps/api/.env` (✅ medido: `projeto:***@localhost:5432/projeto_base`
— a do **DONO**, que é a `DIRECT_DATABASE_URL`; o `app_runtime` e o `app_system` vêm do
§1.2.1); para derrubar, `docker rm -f projeto-base-pg-local`; para **reiniciar** o que já
existe (o caminho do `pre-push` quando a etapa `ci:boot` falha), `docker start projeto-base-pg-local`.

### §1.2 Segredo JWT

A API **recusa o boot sem `JWT_SECRET`**, em qualquer `NODE_ENV` (ADR-0002 — não
existe default, por decisão de projeto).

```bash
cp apps/api/.env.example apps/api/.env
openssl rand -base64 48   # preencher a linha JWT_SECRET= de apps/api/.env
```

### §1.2.1 Senhas dos papéis do banco ⚠️ desde a #118

O `apps/api/.env.example` traz **placeholder** nas senhas dos papéis
(`change_me_gere_a_sua`), e a API **recusa o boot com placeholder** — em qualquer
`NODE_ENV`, inclusive em dev. Motivo: a senha que a migration publicava
(`app_runtime_dev`) está no histórico do Git, e um guard que só barra em produção
deixa o padrão público valendo em todo o resto. São **três** credenciais, de
**três** poderes, e elas não são a mesma:

| papel | credencial | o que abre |
|---|---|---|
| `app_runtime` | `DATABASE_URL` | o escopo de **empresa** (o app) |
| `app_system` | `SYSTEM_DATABASE_URL` | o **bucket de sistema** (o perfil global, a administração cross-empresa) |
| dono | `DIRECT_DATABASE_URL` | `migrate`/`seed` — `CREATE ROLE`, `ALTER TABLE … ENABLE RLS`, `GRANT` |

A separação não é cosmeticidade: desde a #118 o bucket de sistema é concedido
pelo `current_user`, e o `current_user` vem da **credencial** — não de um GUC que a
sessão escolhe. Um `SET app.tenant_id = '*'` na sessão de runtime não abre mais
nada. Para subir:

```bash
openssl rand -hex 32      # senha do papel de RUNTIME  -> DATABASE_URL
openssl rand -hex 32      # senha do papel de SISTEMA  -> SYSTEM_DATABASE_URL
# … ponha cada uma na URI correspondente de apps/api/.env …

cd apps/api && pnpm exec prisma migrate deploy && cd ../..   # cria os papéis (sem senha)
cd apps/api && sh scripts/prepara-papeis.sh && cd ../..       # APLICA a senha de cada papel
```

⚠️ **A senha vai DENTRO da URI, e a URI não aceita qualquer caractere.** O `base64`
do `openssl rand -base64 48` traz `/` e `+`, e o `/` ENCERRA a parte de credencial
da URI — a aplicação subiria com "Invalid URL". Por isso o comando acima é
`openssl rand -hex 32`: só `[0-9a-f]`, sem percent-encoding.

`prepara-papeis.sh` lê a senha de cada URI e aplica no papel com a credencial de
**DONO** — nenhuma senha de papel fica versionada, em nenhum ambiente. ✅ medido
2026-10-27: com as senhas geradas e aplicadas, `pnpm ci:boot` sobe a API
(`health: ok, banco: ok`) e o web (`health: ok`). ✅ medido 2026-10-28: o script lê
o `apps/api/.env` (o README, este runbook e o `.env.example` mandam pôr as URIs LÁ)
e **recusa** aplicar um placeholder (`CHANGE_ME_…`) ou uma senha curta.

⚠️ **`prisma migrate reset` deixa os papeis sem senha.** A migration
`20261027000001` põe o `app_runtime` em `NOLOGIN` (é o que tira a senha publicada
do histórico do Git), e o passo que restaura o LOGIN é o `prepara-papeis.sh`. Depois
de um `reset`, rode o script de novo — senão o sintoma é "role app_runtime is not
permitted to log in", com o banco aparentemente saudável.

### §1.3 Prisma Client + migrations

```bash
pnpm turbo run db:generate                                    # ~1,5s medido
cd apps/api && pnpm exec prisma migrate deploy && cd ../..  # aplica as 15 migrations do diretório (ls apps/api/prisma/migrations | grep -vc migration_lock.toml)
```

> Sem o `cd apps/api`, o Prisma não lê `apps/api/.env`. E **não existe** script
> `prisma:migrate:deploy` em nenhum `package.json` — o pnpm responde "None of the
> selected packages has a ... script" e **sai 0**, verde para quem só olha o exit
> code.

### §1.4 Subir os apps

```bash
pnpm dev     # turbo run dev em paralelo — api :3000, web :3001
```

### §1.5 Verificar

✅ **medido em 2026-10-16**:

```bash
curl -s http://localhost:3000/api/v1/health
# {"status":"ok","checks":{"database":"ok"},"timestamp":"2026-10-16T15:23:36.298Z"}
curl -s http://localhost:3001/api/health
# {"status":"ok","timestamp":"2026-10-16T15:23:39.321Z"}
curl -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/docs   # 200 (Swagger UI)
```

⚠️ O `/api/docs` só existe em `development` (#122). Fora dele o Swagger é
**desabilitado** — é o default-deny do `JWT_SECRET`: um documento OpenAPI publica a
superfície completa da API (rotas, schemas, requisitos de auth) a quem descobrir a
URL. Para ligar de propósito: `SWAGGER_ENABLED=true`.

⚠️ No boot do web saem uns `Module not found` de
`@opentelemetry/winston-transport` e `@opentelemetry/exporter-jaeger`, peers opcionais
do `auto-instrumentations-node`: ✅ medido — **não impedem o boot**, o Next segue e
fica `✓ Ready in 5.9s`.

### §1.6 Fluxo completo (API e UI) ✅ medido 2026-10-16

O body de criação usa campos **em português**: `nome`, `email`, `senha`
(`CreateUserSchema`, `apps/api/src/modules/users/infrastructure/http/users.schemas.ts:169`).

```bash
EMAIL="voce.$(date +%s)@exemplo.dev"; J='content-type: application/json'
curl -X POST http://localhost:3000/api/v1/users -H "$J" \
  -d "{\"nome\":\"Leo Local\",\"email\":\"$EMAIL\",\"senha\":\"SenhaForte123\"}"   # 201
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login -H "$J" \
  -d "{\"email\":\"$EMAIL\",\"senha\":\"SenhaForte123\"}" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
curl -H "authorization: Bearer $TOKEN" http://localhost:3000/api/v1/auth/me      # 200
curl -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/v1/users         # 401 (sem token)
curl -H "authorization: Bearer $TOKEN" http://localhost:3000/api/v1/users        # 200
```

Pela UI: `http://localhost:3001/users` redireciona para `/login` (exige sessão);
preencher e-mail/senha com o usuário acima leva para `/users`, que lista o
recém-criado ("1 usuário cadastrado"). `Cadastrar usuário` abre `/users/novo`.

### §1.7 Usuário admin local (seed)

O seed cria os perfis `admin`/`viewer` e, **fora de produção**, um usuário admin
pronto para login. O comando roda **dentro do container** da stack de dev (o
overlay `docker-compose.dev.yml`), então o procedimento completo — inclusive as
**duas** condições que o guard do seed exige — está em
[runbook Docker §4](./runbooks/docker.md).

| e-mail | senha | perfil |
|---|---|---|
| `admin@admin.com` | `Admin@123` | `admin` (todas as permissions, `is_admin=true`) |

Credencial de DEV, no mesmo espírito da senha `projeto:projeto` do
`docker-compose.dev.yml`: está em texto puro no repositório. Para ambiente real,
crie o admin pelo `POST /api/v1/users` e promova o perfil pela UI.

### §1.8 A etapa `ci:boot` — subir a aplicação local e derrubá-la

`pnpm ci:boot` sobe a aplicação **do jeito que quem desenvolve roda**, espera a
saúde dos dois e **derruba tudo** no fim. É a etapa que o `pnpm ci:local` e o
`.husky/pre-push` rodam — e o procedimento completo, com as medições e as
razões de cada detalhe, está em [runbook de e2e/CI §3](./runbooks/e2e-e-ci.md).

---

## §2. Variáveis de ambiente

Cada linha traz **onde a chave mora** e **se o código do repo a lê**. A coluna "lida
pelo código?" distingue as que o `apps/api/src` (ou o `apps/web`) consome das que só
existem para o container ou para o SDK de terceiros.

| Variável | Onde mora | Lida pelo código? |
|---|---|---|
| `NODE_ENV` | `apps/api/.env` (pnpm) · `environment:` do compose | sim — `app.module.ts`, `main.ts` |
| `PORT` | `apps/api/.env` | sim — `main.ts` |
| `ALLOWED_ORIGINS` | `.env.production` · `environment:` do compose | sim — `main.ts` (CORS) |
| `DATABASE_URL` | `apps/api/.env` (host `localhost`) · `.env` da raiz (host `postgres`) | sim — Prisma; **deve ser `app_runtime`** |
| `DIRECT_DATABASE_URL` | `apps/api/.env` · `.env.production` | sim — CLI do Prisma (`migrate`, `seed`) e `prepara-papeis.sh`; **é o DONO** |
| `SYSTEM_DATABASE_URL` | `apps/api/.env` · `.env.production` | sim — `clienteDeSistema()`; **deve ser `app_system`**. Obrigatória fora de `development`: sem ela o primeiro login devolve 500 |
| `JWT_SECRET` | `apps/api/.env` · `.env.production` | sim — `JwtTokenService`, **sem default**; recusa placeholder |
| `JWT_ACCESS_TTL` | `apps/api/.env` · `.env.production` | sim — `jwt-token.service.ts` (default `15m`) |
| `JWT_REFRESH_TTL` | `apps/api/.env` · `.env.production` | sim — `jwt-token.service.ts` (default `7d`) |
| `SWAGGER_ENABLED` | `.env.production` | sim — `swagger-habilitado.ts`; default-deny fora de `development` |
| `POSTGRES_USER` | `.env.production` | não — lida pelo container do Postgres (default `projeto`) |
| `POSTGRES_PASSWORD` | `.env.production` | não — lida pelo container do Postgres |
| `POSTGRES_DB` | `.env.production` | não — lida pelo container do Postgres (default `projeto_base`) |
| `LOG_LEVEL` | `apps/api/.env.example` · `.env.production` · `environment:` do compose | **não** — nenhum `process.env.LOG_LEVEL` no `apps/api/src` (`grep -rn 'LOG_LEVEL' apps/api/src` → 0 hits). O compose ainda a interpola |
| `OTEL_SDK_DISABLED` | `.env.example` (raiz) | sim — `tracing.ts` (`'true'` desliga o SDK) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `.env.production` (opcional) | sim — `tracing.ts`; há default `http://otel-collector:4318/v1/traces` |
| `OTEL_SERVICE_NAME` | `.env.example` (raiz) · `apps/api/.env.example` | sim — `resource.ts` (default `projeto-base-api`) |
| `OTEL_SERVICE_VERSION` | `.env.example` (raiz) | sim — `resource.ts` (default `0.0.0`) |
| `OTEL_TRACES_SAMPLER` | `.env.example` (raiz) · `.env.production` | não pelo código do repo — `tracing.ts` **não** passa `sampler`, então o SDK do Node lê a chave do ambiente por conta própria |
| `OTEL_TRACES_SAMPLER_ARG` | `.env.example` (raiz) · `.env.production` | idem `OTEL_TRACES_SAMPLER` |
| `API_BASE_URL` | `apps/web/.env.example` — **há fallback** `http://localhost:3000/api/v1` | sim (web) — RSC de `/users`, `/login`, Server Action de `/users/novo` |
| `GF_SECURITY_ADMIN_PASSWORD` | `.env.production` | não — lida pelo container do Grafana; **sem ela o Grafana sobe saudável e não avisa** |

### §2.1 Chaves lidas pelo código que não estão em nenhum `.env.example`

Três chaves são lidas pelo código e **não** aparecem em nenhum dos quatro
`.env.example` do repo — verificado com `grep -hoE '^[A-Z][A-Z0-9_]*=' .env.example
.env.production.example apps/api/.env.example apps/web/.env.example | sort -u`
(linha comentada com `#` não conta). Por isso elas **não** estão na tabela acima: o
gate `check-runbook-drift` casa a 1ª coluna da tabela com as chaves dos `.env.example`,
e uma chave que só existe no código reprovaria o gate.

- `THROTTLE_TTL_MS` — `apps/api/src/app.module.ts:26-31`; default **60000 ms**. No
  `.env.production.example` está **comentada** (`# THROTTLE_TTL_MS=60000`).
- `THROTTLE_LIMIT` — mesma linha; default **100** req/min por IP. Comentada no example
  (`# THROTTLE_LIMIT=100`).
- `OPENAPI_OUTPUT_PATH` — `apps/api/scripts/export-openapi.ts:81`; caminho alternativo
  do `openapi:export`. Lida pelo **script**, não pela API em execução.

---

## §3. Comandos canônicos

Todos os scripts `pnpm` que este runbook manda rodar, e onde cada um é usado. O gate
`check-runbook-drift` casa esta lista com a união dos scripts de todos os `package.json`
do workspace.

```bash
pnpm install --frozen-lockfile   # §0.1 — deps do workspace
pnpm turbo run db:generate       # §1.3 — Prisma Client
pnpm dev                         # §1.4 — api :3000 + web :3001
pnpm ci:boot                     # §1.8 — sobe e derruba a aplicação local
pnpm ci:preflight                # os gates estruturais (pre-push e CI)
pnpm ci:local                    # preflight + lint + typecheck + testes + ci:boot
pnpm test:e2e                    # suíte de navegador (runbook de e2e/CI)
```

---

## §4. Troubleshooting

| Sintoma | Causa medida | Solução |
|---|---|---|
| `/api/v1/health` com `checks.database` ≠ `ok` | Postgres do compose não publica porta no host (#91) | §1.1 — container próprio com `-p 5432:5432` |
| `PrismaClientInitializationError` | `DATABASE_URL` ausente ou vazia — em `apps/api/.env` (Ambiente 1) ou em `.env.production` (Ambiente 3) | §1.2.1 · [runbook Docker §2.1](./runbooks/docker.md) |
| API morre no boot sem mensagem clara | `JWT_SECRET` ausente ou com placeholder | §1.2 — `openssl rand -base64 48` |
| `prisma migrate deploy` "não fez nada" e saiu 0 | rodou da raiz / script inexistente | §1.3, de dentro de `apps/api` |
| `role app_runtime is not permitted to log in` | `prisma migrate reset` deixou o papel sem senha | §1.2.1 — rode o `prepara-papeis.sh` de novo |
| `port already in use` em 3000/3001 | ambiente 1 e 3 não podem coexistir | derrube um (`pkill -f "turbo run dev"` ou `docker compose down`) |
| `invalid restart policy: unknown policy 'unless-stopped'` | typo no `docker-compose.yml` | ✅ corrigido em 2026-10-16 |
| `initdb: could not access directory` | uid do compose ≠ uid do `postgres` na imagem | ✅ corrigido em 2026-10-16 (`user: '70:70'`) |
| `Cannot find package '@opentelemetry/sdk-node'` na imagem prod | o stage `prod` não copiava `apps/api/node_modules` | ✅ **corrigido** (issue #104, commit `376da79`) — o `Dockerfile` copia `apps/api/node_modules` e o `pnpm prune --prod` foi REMOVIDO; ver [runbook Docker §2.2](./runbooks/docker.md) |
