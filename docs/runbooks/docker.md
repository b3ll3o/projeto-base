# Runbook Docker — dev com hot reload e stack de produção

> Parte do [runbook canônico](../como-rodar.md). Índices:
> [Ambiente 1 (dev local pnpm nativo) →](../como-rodar.md#1-ambiente-1--dev-local-pnpm-nativo)
> · [Ambiente 4 (observabilidade) →](./observabilidade.md)
> · [Ambientes 5 e 6 (e2e e CI) →](./e2e-e-ci.md)

Ambientes **2** (dev com hot reload em Docker) e **3** (stack completa com as
imagens prod), mais o procedimento do seed.

Legenda: **✅ medido** = executado, com saída observada · **📖 lido do código** =
derivado do YAML/Dockerfile/script, não executado.

---

## §1. Ambiente 2 — Dev local, Docker com hot reload 📖 lido do código

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

O overlay troca o target para `dev` e monta `apps/api/src` e `apps/web/app` em bind
mount `:ro`; api em `:3000`, web em `:3001` — acesso pelo host idêntico ao ambiente 1.

Mudanças em `apps/api/src/` → `tsx watch` recarrega; `apps/web/app/` → Fast Refresh.

> As networks (`frontend` p/ web, `backend` p/ api+postgres) seguem valendo. O
> `postgres` **não é alcançável do host** — `expose: 5432` sem `ports:` desde o
> #91 — e isso não atrapalha aqui: a API fala com ele por DNS interno.

---

## §2. Ambiente 3 — Stack completa em Docker (imagens prod) 📖 lido do código

### §2.1 Preparar os arquivos de ambiente

O `.env` e o `.env.production` da raiz são **gitignored** — o conteúdo deles é local
de cada máquina, então este runbook **não** publica a contagem de chaves que cada
um tem. O que é verdade para todo mundo está no template versionado
(`.env.production.example`, **17** chaves — `grep -cE '^[A-Z][A-Z0-9_]*='
.env.production.example`), e é o que o compose e a API esperam.

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
#   DATABASE_URL                   (papel app_runtime  — §1.2.1 do runbook)
#   SYSTEM_DATABASE_URL            (papel app_system  — §1.2.1 do runbook)

# ⚠️ O `.env` da RAIZ NÃO precisa de `DATABASE_URL`: desde a issue #105 o
# serviço `api` NÃO declara `DATABASE_URL` no `environment:` (a chave vazia
# sobrescrevia o valor certo que o `env_file` entregava — docker-compose.yml:79-98).
# Quem entrega a URI do runtime é o `env_file: .env.production`, acima.
# O `.env` da raiz só alimenta a INTERPOLAÇÃO do Compose (`LOG_LEVEL`,
# `ALLOWED_ORIGINS`, `POSTGRES_USER`, `POSTGRES_DB`, `GF_SECURITY_ADMIN_USER`).

# EDITE no .env.production a linha DIRECT_DATABASE_URL= que o cp já criou.
# ⚠️ NÃO use `>>`: o example JÁ traz a chave (linha 22), então anexar cria
# duplicata — e qual das duas o `env_file` do Compose honra NÃO ESTÁ MEDIDO aqui.
# Editar não deixa a pergunta existir. ⚠️ E não ponha a chave no `.env` da raiz:
# a `DIRECT_DATABASE_URL` não está no `environment:` de nenhum serviço, então
# quem decide é o `env_file` — o `.env` da raiz não a alcança.
#
# ⚠️ As senhas dos DOIS papeis (`app_runtime` e `app_system`) saem do
# AMBIENTE, e não da migration: a migration `20261027000001` cria os papeis
# SEM senha (`NOLOGIN`), e o `prepara-papeis.sh` (no entrypoint) aplica a
# senha que está nestas URIs. O placeholder `CHANGE_ME_…` é recusado pelo
# guard de boot E pelo script — uma senha de exemplo aplicada aqui viraria a
# senha VIVA do papel. Ver §1.2.1 do runbook.

docker compose up -d --build
docker compose ps
```

O entrypoint da imagem prod da api roda TRÊS passos, e a ordem importa
(`ENTRYPOINT ["sh","-c","… prisma migrate deploy --schema=prisma/schema.prisma && sh ./scripts/prepara-papeis.sh && node dist/main.js"]`):

1. `prisma migrate deploy` — cria os papeis (sem senha);
2. `prepara-papeis.sh` — aplica a senha dos dois papeis, com a credencial de DONO;
3. `node dist/main.js` — a API sobe.

Por isso a `DIRECT_DATABASE_URL` é **obrigatória** nesse ambiente: sem ela o
`migrate deploy` falha na subida — que é o comportamento correto, porque a
migration precisa de posse das tabelas para criar o papel e as policies. E a
`SYSTEM_DATABASE_URL` também é: sem ela o passo 2 aborta com
"ERRO: SYSTEM_DATABASE_URL vazia", e o container entra em crash-loop.

Portas publicadas: api `3000`, web `3001`, otel `4317`/`4318` (perfil
observabilidade), Grafana `3300` e Prometheus `9090` — as três últimas **só em
`127.0.0.1`**.

### §2.2 O que já foi corrigido (e o que o CI não prova)

O job `docker-build-prod` do CI **constrói** as imagens prod e **não as sobe** — um
build verde não prova que o container entra em ar. Os três defeitos abaixo já
estão corrigidos no código:

| defeito | sintoma | correção (verificável no repo) |
|---|---|---|
| `restart: unless-stopped` (typo) | `invalid restart policy: unknown policy 'unless-stopped'` — o `docker compose up` recusava **antes** de subir qualquer container | `docker-compose.yml` — `restart: unless-stopped` em todos os serviços |
| `user: '999:999'` no Postgres | `initdb: error: could not access directory "/var/lib/postgresql/data": Permission denied` — o uid 70 é o dono do PGDATA (mode 700) na imagem `postgres:16-alpine` | `docker-compose.yml` — `user: '70:70'` |
| **imagem prod da API sem dependência** | `Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@opentelemetry/sdk-node'` | **issue #104, commit `376da79`** — o `Dockerfile` copia `/repo/apps/api/node_modules` (as `dependencies` da api vivem lá, e não na raiz do workspace pnpm) e o `pnpm prune --prod` foi **REMOVIDO**. O próprio Dockerfile documenta o porquê |

O `Dockerfile` prod também recebeu, no mesmo conserto: `--create-home` no user
`1001:1001` (o `pnpm` é shim do COREPACK e grava em `$HOME/.cache`; sem o home o
ENTRYPOINT morre com `EACCES`) e o `ENV NODE_OPTIONS` movido para **antes** do
`node --check`, para que a verificação de sintaxe resolva a cadeia de imports e
quebre o build quando falta dependência.

> ⚠️ **O que ainda NÃO é medido:** este runbook não afirma que a stack prod sobe
> hoje de ponta a ponta. O que o repo garante é o **código** do conserto. Meça
> você mesmo, com `docker compose up -d --build && docker compose ps`, antes de
> tratar a stack como verde.

---

## §3. Conflito de portas entre os ambientes

O ambiente 1 (pnpm nativo) e o ambiente 3 (imagens prod) **não coexistem**: os
dois publicam `3000` e `3001`. Derrube um antes de subir o outro
(`pkill -f "turbo run dev"` ou `docker compose down`).

O ambiente 2 também publica `3000`/`3001` — e ele se conecta ao `postgres` do
compose por DNS interno, então subir os dois ambientes Docker também não funciona.

---

## §4. Usuário admin local (seed) ✅ medido 2026-10-20

O seed cria os perfis `admin`/`viewer` e, **fora de produção**, um usuário admin
pronto para login. O comando roda **dentro do container** da stack de dev (o
overlay `docker-compose.dev.yml`):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T \
  -w /repo/apps/api api pnpm exec tsx prisma/seed.ts
```

⚠️ Não existe `prisma.seed` no `package.json`: `pnpm exec prisma db seed` **sai 0
sem fazer nada** (medido 2026-10-20). Use o comando acima.

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

## §4. Por que a imagem da api é assim 📖 lido do código

> A seção que explica as **decisões** da imagem — o `apps/api/Dockerfile` e o
> `apps/web/Dockerfile` guardam o `PORQUÊ` em uma linha cada (e o gate
> `check-docker-drift` impõe o teto de 100 linhas por Dockerfile), e o
> detalhe medido vive aqui.

### §4.1 O probe do healthcheck usa `node`, e não um pacote instalado

O `HEALTHCHECK` da api usava `curl -fsS`. O `curl` estava instalado **só no
stage `prod`** — e o `docker-compose.dev.yml` troca o `build.target` para `dev`,
que herda de `base` (onde só há `openssl`). O compose **herda** o healthcheck do
compose base, e o probe passava a falhar com `curl: not found`: a api nunca
ficava `healthy` e o `web` — que depende dela com
`condition: service_healthy` — não subia. O sintoma era "o web não sobe", e a
causa (um binário ausente) não estava no probe.

O probe agora usa o `node` que a imagem **já tem** — o mesmo padrão que o
serviço `web` usava. Um probe que depende de um pacote instalado é uma
armadilha de stage: o `build.target` muda, e o binário não vem junto.

O gate `check-docker-healthcheck-binary` cobra isso: ele resolve o **stage** do
healthcheck (e a herança entre stages) e exige que o binário exista na imagem
dele. O `curl` saiu do stage `prod` — depois da troca, ele não teria mais
usuário.

### §4.2 O `exec` antes do `node` é o que faz o SIGTERM chegar nele

O ENTRYPOINT é um `sh -c` que encadeia migrate, preparo de papeis e
`node dist/main.js`. Sem `exec`, o `&&` faz o `dash` **forkar** o `node` e
continuar vivo como pai dele — a árvore real é `tini → sh → node`. O
`docker stop` manda SIGTERM para o PID 1 (o tini); o tini repassa o sinal
**apenas ao filho direto** (o `sh`, porque o daemon não passa `-g`); e o `sh`
não repassa para o filho. O `node` nunca recebe o sinal, o
`enableShutdownHooks()` do NestJS nunca dispara, e o container só morre por
SIGKILL no fim do grace period.

Com `exec`, o `node` **assume o PID do `sh`** — e é o `node` que o tini
sinaliza.

> ⚠️ O `init: true` do Compose (que injeta o tini) **continua certo** — é o que
> faz o tini existir e recolher os zumbis. Mas ele, sozinho, não basta: ele
> resolve o sinal para o filho direto, e o filho direto era o `sh`.

### §4.3 O web define `HOSTNAME=0.0.0.0`

O `server.js` gerado pelo Next.js standalone resolve o endereço de bind por
`const hostname = process.env.HOSTNAME || '0.0.0.0'`. O daemon do Docker
exporta `HOSTNAME` em **todo** container, com o valor do hostname do próprio
container (o short-ID) — que resolve para o **IP do container**, não para
127.0.0.1. Resultado: o servidor escutava no IP do container e o probe em
`http://localhost:3001/api/health` nunca conectava — o serviço ficava
`unhealthy` permanente, com a aplicação no ar.

`ENV HOSTNAME=0.0.0.0` faz o bind ser em todas as interfaces, e o probe em
`localhost` volta a resolver. É a convenção que o Next.js documenta para
`output: 'standalone'`.

### §4.4 As dependências vêm de `apps/api/node_modules`

Topologia do pnpm em workspace: MEDIDO no stage `builder`,
`node_modules/@nestjs` da **raiz** está AUSENTE e o de `apps/api` está
PRESENTE. O `prod` copiava só a raiz — os 12 `devDependencies` dela, e
nenhuma das 26 `dependencies` da api. São os dois `COPY` de `node_modules` que
trazem as dependências certas.

### §4.5 O `NODE_OPTIONS` do tracing vem ANTES do `node --check`

O `--import` (ESM-aware; `--require` é CJS-only) auto-carrega o SDK de
telemetria antes de qualquer código de usuário. `tracing.js` é puro
(`tracing.spec.ts:28-35`), então importá-lo direto **não** dispararia o SDK —
daí o wrapper `init.js`. O `ENV` vem antes do `node --check` porque o check
mediava sintaxe **sem resolver a cadeia de imports**; e o caminho é ABSOLUTO
porque o `--import` resolve contra o CWD de cada `node` (MEDIDO: com
`./apps/api/…`, o `pnpm exec prisma` de `/repo/apps/api` procurava
`apps/api/apps/api/dist/…`, porque o `cd` do ENTRYPOINT muda o CWD).

### §4.6 O `pnpm prune --prod` foi REMOVIDO

MEDIDO como no-op (EACCES na raiz, exit 243, prompt de workspace) — e o 243
era absorvido pelo `&&` do RUN abaixo, ou seja: a linha inútil era a que
**mascarava um build quebrado**. O que traz as `dependencies` é o `COPY` de
`node_modules` (§4.4): sem ele o build quebra com `ERR_MODULE_NOT_FOUND`.
Preço aceito: a imagem traz os `devDependencies` da api também; `pnpm deploy`
é refactor próprio.
