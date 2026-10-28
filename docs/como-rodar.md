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
para derrubar, `docker rm -f projeto-base-pg-local`; para **reiniciar** o que já existe
(o caminho do `pre-push` quando a etapa `ci:boot` falha), `docker start projeto-base-pg-local`.

### 1.2 Segredo JWT

A API **recusa o boot sem `JWT_SECRET`**, em qualquer `NODE_ENV` (ADR-0002 — não existe default,
por decisão de projeto).

```bash
cp apps/api/.env.example apps/api/.env
openssl rand -base64 48   # preencher a linha JWT_SECRET= de apps/api/.env
```

✅ medido: `apps/api/.env` já existia neste checkout com `NODE_ENV`, `PORT`, `DATABASE_URL`,
`LOG_LEVEL` e `JWT_SECRET` — nada a fazer.

### 1.2.1 Senhas dos papéis do banco ⚠️ desde a #118

O `apps/api/.env.example` traz **placeholder** nas senhas dos papéis (`change_me_gere_a_sua`), e
a API **recusa o boot com placeholder** — em qualquer `NODE_ENV`, inclusive em dev. Motivo: a
senha que a migration publicava (`app_runtime_dev`) está no histórico do Git, e um guard que
só barra em produção deixa o padrão público valendo em todo o resto.

São **duas** senhas, de **dois** papéis, e elas não são a mesma:

| papel | credencial | o que abre |
|---|---|---|
| `app_runtime` | `DATABASE_URL` | o escopo de **empresa** (o app) |
| `app_system` | `SYSTEM_DATABASE_URL` | o **bucket de sistema** (o perfil global, a administração cross-empresa) |
| dono | `DIRECT_DATABASE_URL` | `migrate`/`seed` — `CREATE ROLE`, `ALTER TABLE … ENABLE RLS`, `GRANT` |

A separação não é cosmeticidade: desde a #118 o bucket de sistema é concedido pelo
`current_user`, e o `current_user` vem da **credencial** — não de um GUC que a sessão escolhe.
Um `SET app.tenant_id = '*'` na sessão de runtime não abre mais nada.

Para subir:

```bash
openssl rand -hex 32      # senha do papel de RUNTIME  -> DATABASE_URL
openssl rand -hex 32      # senha do papel de SISTEMA  -> SYSTEM_DATABASE_URL
# … ponha cada uma na URI correspondente de apps/api/.env …

cd apps/api && pnpm exec prisma migrate deploy && cd ../..   # cria os papéis (sem senha)
cd apps/api && sh scripts/prepara-papeis.sh && cd ../..       # APLICA a senha de cada papel
```

⚠️ **A senha vai DENTRO da URI, e a URI não aceita qualquer caractere.** O `base64` do
`openssl rand -base64 48` traz `/` e `+`, e o `/` ENCERRA a parte de credencial da URI — a
aplicação subiria com "Invalid URL". Por isso o comando acima é `openssl rand -hex 32`: só
`[0-9a-f]`, que não precisa de percent-encoding nenhum.

`prepara-papeis.sh` lê a senha de cada URI e aplica no papel com a credencial de **DONO** — nenhuma
senha de papel fica versionada, em nenhum ambiente. ✅ medido 2026-10-27: com as senhas geradas e
aplicadas, `pnpm ci:boot` sobe a API (`health: ok, banco: ok`) e o web (`health: ok`).
✅ medido 2026-10-28: o script lê o `apps/api/.env` (o README, este runbook e o `.env.example`
mandam pôr as URIs LÁ, e o script só olhava o ambiente — então a instrução não podia ser seguida);
e ele RECUSA aplicar um placeholder (`CHANGE_ME_…`) ou uma senha curta, porque é neste passo que
a senha se torna VIVA no papel.

⚠️ **`prisma migrate reset` deixa os papeis sem senha.** A migration `20261027000001` põe o
`app_runtime` em `NOLOGIN` (é o que tira a senha publicada do histórico do Git), e o passo que
restaura o LOGIN é o `prepara-papeis.sh`. Depois de um `reset`, rode o script de novo — senão o
sintoma é "role app_runtime is not permitted to log in", com o banco aparentemente saudável.

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

⚠️ O `/api/docs` só existe em `development` (#122). Fora dele o Swagger é
**desabilitado** — é o default-deny do `JWT_SECRET`: um documento OpenAPI
publica a superfície completa da API (rotas, schemas, requisitos de auth) a
quem descobrir a URL. Para ligar de propósito: `SWAGGER_ENABLED=true`.

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

### 1.7 Usuário admin local (seed) ✅ medido

O seed cria os perfis `admin`/`viewer` e, **fora de produção**, um usuário admin
pronto para login:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T \
  -w /repo/apps/api api pnpm exec tsx prisma/seed.ts
```

⚠️ Não existe `prisma.seed` no `package.json`: `pnpm exec prisma db seed` **sai 0 sem
fazer nada** (medido 2026-10-20). Use o comando acima.

| e-mail | senha | perfil |
|---|---|---|
| `admin@admin.com` | `Admin@123` | `admin` (todas as permissions, `is_admin=true`) |

Credencial de DEV, no mesmo espírito da senha `projeto:projeto` do
`docker-compose.dev.yml`: está em texto puro no repositório. O guard do seed tem
**duas** condições, e as duas precisam valer:

| condição | regra | por quê |
|---|---|---|
| modo | `NODE_ENV === 'development'` | **default-deny**: ausente, vazio, `staging` e `prod` (sem o "uction") não criam a conta |
| destino | host da `DIRECT_DATABASE_URL` em `localhost`, `127.0.0.1` ou `postgres` | modo e destino vêm de arquivos diferentes — o overlay dev **força** `NODE_ENV: development` (`docker-compose.dev.yml:5`), mas a `DIRECT_DATABASE_URL` chega pelo `env_file: .env.production` do compose base (`docker-compose.yml:101`). ⚠️ A checagem é sobre o **hostname que a URL resolve**, e é comparação de string: o guard **não resolve DNS**. `postgres` só vale porque é o nome do serviço do Compose — um Postgres remoto de dev que também se chame `postgres` passa, e um local que se chame `qualquer-coisa` é recusado |

O comando acima satisfaz as duas: dentro do container o host é `postgres`. Se o
destino não for local, o seed **recusa e sai 1**, nomeando o host — medido
2026-10-20 com `projeto-base-postgres`, que resolve para o mesmo Postgres e mesmo
assim é recusado. Para ambiente real, crie o admin pelo `POST /api/v1/users` e
promova o perfil pela UI.

### 1.8 A etapa `ci:boot` — subir a aplicação local e derrubá-la ✅ medido

`pnpm ci:boot` sobe a aplicação **do jeito que quem desenvolve roda** (`tsx src/main.ts`
na API, `next dev` no web), espera a saúde dos dois e **derruba tudo** no fim. É a etapa
que o `pnpm ci:local` e o `.husky/pre-push` rodam.

```bash
pnpm ci:boot
# [ci:boot] ✓ API no ar (health: ok, banco: ok)
# [ci:boot] ✓ web no ar (health: ok)
# [ci:boot] ✓ aplicação local no ar — API :46095 · web :39149
```

✅ medido 2026-10-21: exit 0, e no fim **não sobra processo nem porta ocupada** — nem
`apps/web/.next-boot/`, que é apagado junto.

| detalhe | por quê |
|---|---|
| portas **livres**, não 3000/3001 | o `pnpm dev` da pessoa pode estar no ar, e uma etapa que briga pela porta falha por um motivo que não é defeito |
| `distDir` = `.next-boot/` | `next dev` e `next build` não dividem o mesmo diretório — o Next apaga e reescreve o que o outro está servindo |
| o banco local é **pré-requisito** e a etapa **não o sobe** | o `postgres` do Compose não publica a porta no host (§1.1); um banco efêmero aqui mediria outra configuração, não a local |
| a etapa **falha alto** | sem banco (ou sem `JWT_SECRET` no `.env`) ela sai 1 com o ponteiro para §1.1/§1.2 — ela nunca "pula" |

O log de cada processo fica em `node_modules/.cache/ci-boot/` — é lá que o sintoma
aparece quando a etapa falha.

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
#   POSTGRES_PASSWORD               (openssl rand -hex 32 — a senha do dono vai
#                                    DENTRO da URI, e a URI não aceita o `/`
#                                    do base64)
#   JWT_SECRET                      (openssl rand -base64 48 — este NÃO vai
#                                    dentro de uma URI)
#   DIRECT_DATABASE_URL            (conexão de DONO — ver o aviso abaixo)
#   DATABASE_URL                   (papel app_runtime  — §1.2.1)
#   SYSTEM_DATABASE_URL            (papel app_system  — §1.2.1)

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
# ⚠️ As senhas dos DOIS papeis (`app_runtime` e `app_system`) saem do
# AMBIENTE, e não da migration: a migration `20261027000001` cria os papeis
# SEM senha (`NOLOGIN`), e o `prepara-papeis.sh` (no entrypoint) aplica a
# senha que está nestas URIs. O placeholder `CHANGE_ME_…` é recusado pelo
# guard de boot E pelo script — uma senha de exemplo aplicada aqui viraria a
# senha VIVA do papel. Ver §1.2.1.

docker compose up -d --build
docker compose ps
```

O entrypoint da imagem prod da api roda TRÊS passos, e a ordem importa
(`ENTRYPOINT ["sh","-c","… prisma migrate deploy --schema=prisma/schema.prisma && sh ./scripts/prepara-papeis.sh && node dist/main.js"]`):

1. `prisma migrate deploy` — cria os papeis (sem senha);
2. `prepara-papeis.sh` — aplica a senha dos dois papeis, com a credencial de
   DONO;
3. `node dist/main.js` — a API sobe.

Por isso a `DIRECT_DATABASE_URL` é **obrigatória** nesse ambiente: sem ela o
`migrate deploy` falha na subida — que é o comportamento correto, porque a
migration precisa de posse das tabelas para criar o papel e as policies. E a
`SYSTEM_DATABASE_URL` também é: sem ela o passo 2 aborta com
"ERRO: SYSTEM_DATABASE_URL vazia", e o container entra em crash-loop.

Portas publicadas: api `3000`, web `3001`, otel `4317`/`4318` (perfil observabilidade),
Grafana `3300` e Prometheus `9090` — estas duas últimas **só em `127.0.0.1`**.

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

## Ambiente 4 — Perfil de observabilidade (Grafana + Tempo + Prometheus) 📖 lido do código

```bash
docker compose --profile observability up -d
```

Sobe quatro serviços: o `otel-collector` (`infra/otelcol/config.yaml`) mais os três
backends — Tempo (`infra/tempo/tempo.yaml`), Prometheus (`infra/prometheus/prometheus.yml`)
e Grafana (datasources em `infra/grafana/provisioning/`). O perfil é opt-in: sem a flag,
`docker compose config` não lista nenhum dos quatro.

| Onde | O quê |
|---|---|
| <http://localhost:3300> | Grafana — a tela. Login `admin` / `GF_SECURITY_ADMIN_PASSWORD` |
| <http://localhost:9090> | Prometheus — UI de consulta PromQL |

O Tempo **não** é publicado: ele é consultado pelo Grafana, pela rede interna do perfil.

### Antes do primeiro `up`

`GF_SECURITY_ADMIN_PASSWORD` precisa existir no `.env.production` (já está documentado em
`.env.production.example`). Sem ela o Grafana **sobe saudável e não avisa** — gera uma senha
aleatória e só a imprime no log do container. O único sintoma é um `401` na tela de login
com a senha que você escolheu.

```bash
# uma vez só, para gerar a senha
echo "GF_SECURITY_ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-20)" >> .env.production
```

### Onde a telemetria vai

`OTEL_EXPORTER_OTLP_ENDPOINT` **não é obrigatória**: sem ela a api cai no default de
`tracing.ts` (`http://otel-collector:4318/v1/traces`), que é o certo para o Compose — e o
collector sobe normalmente, sem falhar. Em dev local (pnpm), para o web enviar traces do
browser: `NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces`.

No **Compose** a mesma telemetria de browser vem pelo `build.args` do serviço `web`, não
pelo `environment:`: `NEXT_PUBLIC_*` é inlined no build do Next.js, então a chave no
ambiente chegaria tarde demais. O `ARG` do `apps/web/Dockerfile` nasce vazio — build fora do
Compose (inclusive o job `docker-build-prod` do CI) segue sem telemetria de browser.

### O sampling é em DUAS camadas — e é por isso que a tela fica vazia

O `tail_sampling` segura cada trace por `decision_wait: 10s` antes de decidir se
guarda. Espere, não recarregue em laço. **Mas esses 10s não são a razão principal
de uma tela vazia: o motivo é que a maioria dos traces é descartada ANTES de chegar
ao collector.**

| Camada | Onde | O que descarta |
| --- | --- | --- |
| 1. SDK | `tracing.ts` **não passa `sampler`**, então o SDK Node lê `OTEL_TRACES_SAMPLER` do ambiente | `parentbased_traceidratio` + `ARG=0.1` (o que `.env.production.example:96-97` entrega) mata 90% dos traces raiz. Sem essas chaves o fallback é `AlwaysOn` e a camada não descarta nada |
| 2. Collector | `infra/otelcol/config.yaml` `tail_sampling` | dos que sobraram, passa qualquer um destes: `status_code` erro, mais lento que 1s, **ou** a baseline probabilística de 5%. As policies são combinadas com **OR** (basta uma casar) e a ordem delas no YAML é irrelevante — MEDIDO ao vivo: 30 traces enviados por OTLP/HTTP, busca `/api/search` do Tempo devolveu erro 10/10, lenta 10/10, rápida 0/10; registro no bloco "MEDIDO ao vivo" acima de `tail_sampling` em `infra/otelcol/config.yaml` |

**Para um request rápido e bem-sucedido, com o `.env.production` copiado do example:
10% × 5% ≈ 0,5% de chance de aparecer no Grafana.** Trace de erro e request lento
passam **pela camada 2**, mas isso não é garantia de chegada: a camada 1 é um
`TraceIdRatioBasedSampler`, que decide por XOR do trace-id e **não enxerga status
HTTP** — um request de erro tem exatamente a mesma chance de 10% que um rápido.
MEDIDO sobre 200 000 traceIds com o sampler real do SDK deste repo: 10,06% dos
requests e 10,06% dos requests de erro. Ou seja, **~10% dos traces de erro chegam
ao backend**, e não 100%.

⚠️ **Estas taxas são da `api`.** O serviço `web` não tem `env_file`
(MEDIDO), e `OTEL_TRACES_SAMPLER` não é `NEXT_PUBLIC_*`, então nem é inlined no
build: para span de browser a camada 1 não existe, o fallback é `AlwaysOn` e a
taxa real é **100%**. Span de web entra inteiro e só passa pela camada 2.

Se você quer *ver* traces comuns durante o desenvolvimento, ponha
`OTEL_TRACES_SAMPLER=always_on` no `.env.production` — ou deixe de copiar essas duas
linhas do example. Para ver o efeito na prática: 100 requests de sucesso ≈ 0,5 trace.

### Se a tela estiver vazia

Três perguntas, em ordem, respondidas pelo Prometheus:

```promql
sum(rate(otelcol_receiver_accepted_spans[5m]))    # a telemetria está chegando?
sum(rate(otelcol_exporter_send_failed_spans[5m]))  # o exportador está FALHANDO?
max(otelcol_exporter_queue_size)                  # fila > 0 = exportador atrasado
```

A segunda é `send_failed`, **não** `sent`: `exporter_sent_spans` conta o que passou
pelo `tail_sampling`, e com a taxa acima um `sent` baixo é o comportamento saudável
esperado — compará-lo com o `accepted` não isola nada e vira diagnóstico de
incidente onde a configuração está certa. O que acusa exportador quebrado é
`send_failed` subindo, ou `queue_size` empilhando.

Se `accepted_spans` não sobe, o problema está **antes** do collector: a aplicação não
está exportando (ou o sampling da camada 1 comeu tudo). Nesse caso
`docker compose logs api | grep -i telemetry`. Essas séries vêm do job
`otel-collector-pipeline` (porta 8888), separado do job `otel-collector` (8889) que
traz as métricas da aplicação.

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
| `SYSTEM_DATABASE_URL` | `apps/api/.env` (pnpm) · `.env.production` (Docker) — **deve ser `app_system`** | `clienteDeSistema()` — a credencial que abre o **bucket de sistema** (#118). **Obrigatória** em todo ambiente que não seja `development`: sem ela o primeiro login devolve 500 |
| `DIRECT_DATABASE_URL` | `apps/api/.env` (pnpm) · `.env.production` (Docker) — **o DONO** | CLI do Prisma (`migrate`, `db seed`) e o `prepara-papeis.sh` (`ALTER ROLE`) |
| `POSTGRES_PASSWORD` | `.env.production` | container do Postgres |
| `API_BASE_URL` | opcional no web — **há fallback** `http://localhost:3000/api/v1` | RSC de `/users`, `/login`, Server Action de `/users/novo` |
| `ALLOWED_ORIGINS` | `.env.production` / compose | CORS no `main.ts` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `.env.production` (opcional — há default em `tracing.ts`) | collector / exporter |
| `GF_SECURITY_ADMIN_PASSWORD` | `.env.production` | admin do Grafana (perfil `observability`) |

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
