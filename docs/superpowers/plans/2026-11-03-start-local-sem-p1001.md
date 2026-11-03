---
state_snapshot: .agents/runs/state-snapshot-20261103T144253Z-start-local-sem-p1001.md
demand_slug: start-local-sem-p1001
date: 2026-11-03
branch: feat/start-local-sem-p1001
base_main_sha: 027095b
---

# Plano — o start local não pode quebrar com erro cru

> Base: `main` @ `027095b` · Branch: `feat/start-local-sem-p1001`
> Origem: erro medido ao vivo em 2026-11-03 (P1001 do Prisma no `pnpm dev`).
> **Camada 1 reconciliada**: o `specialist-router` (7 specialists em paralelo)
> entregou 19 steps em `.agents/runs/20261103T144253Z-specialist-01.yaml`; os
> deltas contra este plano estão na §6.

## 0. O que está em jogo

O `pnpm dev` é o **jeito que quem desenvolve roda a aplicação** — e não tem
nenhum preflight. O primeiro contato é o erro cru do Prisma: 20 linhas de
stack dizendo `Can't reach database server at localhost:5432`, **sem dizer por
quê nem o que fazer**.

| # | Achado | Gravidade |
|---|---|---|
| G-001 | `pnpm dev` não verifica o banco antes de subir a API — o P1001 cru é a primeira e única pista | IMPORTANTE |
| G-002 | README manda `docker run --name projeto-base-pg-local` — falha com "name already in use" quando o container já existe | MENOR |
| G-003 | **Com o banco no ar, o próximo erro é `EADDRINUSE` na 3000** — o container da API ocupa a porta do host | MENOR |
| G-004 | Só o `ci:boot` (pre-push) mede que a aplicação sobe — o caminho do desenvolvedor não tem garantia | INFO |

> **A assimetria que explica tudo.** O conhecimento do remédio existe **só em
> prosa** (README Opção B e `docs/como-rodar.md` §1.1) e **nenhum instrumento o
> executa**. O pre-push até imprime o remédio no erro — mas pre-push é o
> **push**, não o **start**.

### As medições que sustentam o plano

Todas em `.agents/runs/20261103T144253Z-*.txt`:

| Medida | Comando | Resultado |
|---|---|---|
| Causa do P1001 | `docker inspect projeto-base-postgres` | `ports={"5432/tcp":null}` — o `postgres` do Compose **não publica porta** desde o #91 |
| Nada escutando | `ss -ltnp \| grep 5432` | vazio |
| O container certo estava parado | `docker ps -a` | `projeto-base-pg-local  Exited (0) 13 hours ago` (tem `-p 5432:5432`) |
| Recuperação | `docker start projeto-base-pg-local` | `0.0.0.0:5432->5432/tcp` + `app_runtime conecta OK` |
| **O segundo erro** | `cd apps/api && timeout 30 pnpm exec tsx src/main.ts` | `Prisma conectado` → `Nest application successfully started` → `listen EADDRINUSE 0.0.0.0:3000` |
| O dono da 3000 | `docker ps --filter publish=3000 --format '{{.Names}}'` | `projeto-base-api` |

> ⚠️ O erro do `tsx watch` é **P1001 no primeiro boot** e **EADDRINUSE no
> segundo**. Quem corrigir só o banco troca um erro cru por outro.

## 1. Gap analysis AS-IS → TO-BE

### O que JÁ EXISTE (não reconstruir)

- **`credenciais-do-banco.ts`** — o padrão exato do que falta: **decisão em
  função pura + spec**, chamada do `onModuleInit` **antes** do `$connect()`,
  com erro legível. O `PrismaService` já tem o gancho e o formato.
- **`lerEnvDotEnv`** (`boot-local.ts:79`) — **já exportado**. O script novo
  **importa**; um terceiro parser de `.env` no repo é dívida que nenhum gate
  vê.
- **`apps/api/scripts/prepara-papeis.sh`** — o precedente de ler o
  `apps/api/.env` como reserva do ambiente (`AMBIENTE > .env`).
- **`boot-local.ts`** — já sabe que **o banco é pré-requisito**, já **não** sobe
  o banco (decisão documentada) e já **falha com o ponteiro para o §1.1**.
- **`node:net` e `node:child_process`** — `pg` **não** é dependência de nenhum
  package.json e `psql` **não** existe no host (medido). Sem dependência nova.
- **`tooling/scripts/`** — o pacote de tooling, com `vitest` e `pnpm tooling:test`
  já dentro do `ci:local`.

### O que FALTA

| Lacuna | Hoje | Depois |
|---|---|---|
| Verificação antes do boot | nenhuma | `pnpm banco:check` roda **antes** do `turbo run dev` |
| Recuperação do caso comum | a pessoa precisa saber o `docker start` | o check **sobe o container que já existe** e segue |
| Mensagem do P1001 | stack crua do Prisma | causa + remédio + ponteiro (§1.1) |
| Erro da 3000 | `EADDRINUSE` cru | dono da porta + dois remedies |
| README Opção B | `docker run` que falha se o container existe | ponte ao §1.1 no **mesmo passo** |
| Contagem de scripts | "29" em 6 lugares de 2 docs | "30" (claim medida) |
| Tabela de gates | `banco:check` não existe | linha nova em `docs/fluxo-desenvolvimento.md` §4 |

## 2. As fases

### Fase 1 — O check (o instrumento)

| # | Entrega | Arquivo |
|---|---|---|
| 1.1 | **Decisões puras**, uma por asserção do ambiente, sem `docker`/rede/`fs` — testáveis sem máquina: `decideSobreEnv` (DATABASE_URL + JWT_SECRET), `decideSobrePrismaClient`, `decideSobreBanco` (`ok` \| `subir-container` \| `sem-banco` \| `banco-remoto` \| `container-sem-porta` \| `banco-mudo`), `decideSobrePorta` | `.tooling/scripts/ci/ambiente-local.ts` |
| 1.2 | **Efeitos**: probe TCP (`node:net`), `docker inspect --format '{{.State.Status}}'` / `'{{json .HostConfig.PortBindings}}'` / `'{{.Config.Image}}'`, leitura da URI (`AMBIENTE > apps/api/.env`, **importando `lerEnvDotEnv`**), resolução do Prisma Client (`@prisma/client` → `.prisma/client/default.js`). ⚠️ `docker` sempre em **argv array**, nunca interpolado (o gate `check-shell-injection` recusa) | idem |
| 1.3 | ⚠️ **SEM shebang** — o `check-harness-owner` classifica como harness órfão todo arquivo de `.tooling/scripts/ci/` com shebang cujo nome não começa com `check-` e não está na lista fechada `INFRASTRUCTURE` (`preflight.ts`, `check-types.ts`). Invocado por `tsx <path>` a partir do script da raiz | idem |
| 1.4 | **Spec com dente** (28 testes): (a) banco inalcançável + container **parado** → `subir-container`; (b) container **inexistente** → `sem-banco` (NUNCA `criar`); (c) banco alcançável → `ok`; (d) `publicaPortaNasBindings` decide pelo **`HostPort`** (a chave do JSON é a porta do *container*); (e) **a spec do SCRIPT**: `DATABASE_URL` para um host sem rota → `exit 1` + mensagem e **sem** `docker start`; banco no ar + porta livre → as asserções de banco e porta passam; sem `JWT_SECRET` → `exit 1` | `.tooling/scripts/ci/ambiente-local.spec.ts` |
| 1.5 | Script na raiz: `"ambiente:check": "tsx .tooling/scripts/ci/ambiente-local.ts"` | `package.json` |

> ⚠️ **O check NÃO pode ser gate do `ci:preflight`/`ci:local`/pre-push.** Ele
> depende do Docker e do Postgres **da máquina** — no CI não há Postgres
> (`ci.yml`: "Não usar service postgres aqui — é dead code"), então ele seria
> **verde por inércia** no CI: a classe 1 de `guard-classes.md`. Ele é
> **helper de start**, não gate. O `ci:boot` continua sendo o gate e continua
> **sem** subir o banco (decisão do repo, mantida).

### Fase 2 — O gancho (o start para de quebrar)

| # | Entrega | Arquivo |
|---|---|---|
| 2.1 | `"dev": "pnpm ambiente:check && turbo run dev"` — o check roda **uma vez**, antes de qualquer app; se falhar, o `turbo run dev` **nunca começa** → o `tsx watch` nunca nasce | `package.json` |
| 2.2 | ⚠️ **NÃO usar `predev`**: o pnpm 9 só roda `pre`/`post` com `enable-pre-post-scripts=true`, e o `.npmrc` do repo só declara `engine-strict` → um `predev` **nunca rodaria**, e a mudança pareceria funcionar sem fazer nada | idem |
| 2.3 | **Auto-recovery**: se o probe falhar E o host for local E o container estiver `exited` E a imagem **começar por `postgres:`** → `docker start projeto-base-pg-local` e esperar a porta (~15 s). ⚠️ **NUNCA recriar**: o volume guarda as migrations e as senhas dos papéis (`prepara-papeis.sh`) — recriar troca o volume e o app quebra com "role app_runtime is not permitted to log in" | `.tooling/scripts/ci/banco-local.ts` |
| 2.4 | Se o container existe mas **não publica a porta** → mensagem "existe mas não publica a porta no host" + ponteiro ao §1.1, `exit 1` | idem |
| 2.5 | **Porta da API**: sondar `PORT` do `apps/api/.env` (3000). Se ocupada, identificar o dono **sem `lsof`/`ss`** (não portáveis): `docker ps --filter publish=3000 --format '{{.Names}}'`. Se for container → nomeia + dá **dois** comandos (`docker compose stop api` e `docker stop <container>`, o 2º não depende do `.env.production`). Se não for container → `pkill -f "turbo run dev"`. Nunca deixa o `EADDRINUSE` cru; nunca afirma o dono quando não dá para saber | idem |
| 2.6 | **Medição ao vivo** (janela própria — o `docker stop` derruba o banco de quem estiver usando a máquina): container parado → `pnpm dev` **religa e segue**; container inexistente → `exit 1` com ponteiro; 3000 ocupada → mensagem com o dono | — |

> **Por que o gancho é na raiz e não no `apps/api`?** O `docker-compose.dev.yml`
> roda `pnpm --filter @projeto/api dev` **dentro do container**, onde o
> `DATABASE_URL` aponta para `postgres:5432` (rede do Compose) e o socket do
> Docker não existe. O `pnpm dev` da **raiz** é o start documentado e é o que
> roda na máquina. Registrar como `shortcut:` no script.

### Fase 3 — O erro legível (a rede de segurança)

| # | Entrega | Arquivo |
|---|---|---|
| 3.1 | **RED**: spec com 3 casos — P1001 + alvo local → a mensagem contém `P1001`, `localhost:5432`, `projeto-base-pg-local`, `docker start projeto-base-pg-local` e `docs/como-rodar.md`, e **NÃO** contém a senha do `DATABASE_URL` (guarda anti-vazamento: a URL tem credencial); erro sem `errorCode` → `undefined`; `P1000` → `undefined` (prova que só o P1001 é traduzido) | `apps/api/src/shared/infrastructure/prisma/traducao-de-falha-de-conexao.spec.ts` |
| 3.2 | **GREEN**: `traduzirFalhaDeConexao(erro: unknown, databaseUrl: string \| undefined): string \| undefined` — detecção por **duck-typing** em `errorCode` (sem `instanceof Prisma.*`: a spec não precisa do Client gerado). Alvo (host/porta) sai do `DATABASE_URL` via `new URL(...)` — o mesmo truque do `senhaDaUri`; **nunca** incluir user/senha. Alvo **não** local (ex.: `postgres:5432`): mensagem que **não** recomenda container que não existe no host | `apps/api/src/shared/infrastructure/prisma/traducao-de-falha-de-conexao.ts` |
| 3.3 | **Ligar**: `try { await this.$connect(); } catch (erro) { const t = traduzirFalhaDeConexao(erro, process.env['DATABASE_URL']); if (t === undefined) throw erro; throw new Error(t); }` — só o `$connect()` é protegido; o guard de credenciais **não se mexe**. Sem `process.exit` no hook: quem mata o processo é o `bootstrap().catch()` do `main.ts` | `apps/api/src/shared/infrastructure/prisma/prisma.service.ts` |
| 3.4 | **Spec do serviço**: mock de `$connect` que rejeita com `Error('boom')` → `rejects.toBe(erro)` (**a mesma instância**); com `{ errorCode: 'P1001' }` → `rejects.toThrow(/P1001/)`. ⚠️ `vi.stubEnv` com `NODE_ENV=development` e senha que **não** está em `SENHAS_EXPOSTAS` nem começa com `change_me`/`***` — senão o guard recusa **antes** do `$connect` mockado e o teste cai pelo motivo errado | `apps/api/src/shared/infrastructure/prisma/prisma.service.spec.ts` |
| 3.5 | **main.ts**: uma linha genérica depois do erro — "API encerrada (código de saída 1). Corrija a causa acima e rode de novo." Genérica de propósito: **nem toda** falha de boot é de banco (ex.: `ALLOWED_ORIGINS` em produção) — o ponteiro ao §1.1 fica **dentro** da mensagem do P1001 | `apps/api/src/main.ts` |

> **Por que não um check TCP antes do boot?** No NestJS 11.2.5 o `onModuleInit`
> roda **dentro** de `app.listen()` → `init()` → `callInitHook()`, e o log
> "Nest application successfully started" sai **depois** do hook (verificado no
> fonte instalado). Com P1001 a porta nunca é escutada e o log de sucesso nunca
> mente — um check pre-boot não compra nada e duplicaria a I/O de conexão.

### Fase 4 — A doc (a fonte da verdade)

| # | Entrega | Arquivo |
|---|---|---|
| 4.1 | §1.1 ganha: o `pnpm dev` roda um preflight de banco e **religa o container local parado** sozinho; sem container, a mensagem aponta ao §1.1 (que segue sendo a fonte única do `docker run`). §3 (comandos canônicos) ganha `pnpm banco:check` — o `check-runbook-drift` exige que todo `pnpm <script>` citado exista. §4 ganha a linha do sintoma P1001 | `docs/como-rodar.md` |
| 4.2 | ⚠️ **RESTRIÇÃO DURA**: `docs/como-rodar.md` está em **300/300 linhas** e o `check-doc-size` reprova em 301 — a adição vem **com corte compensatório no mesmo PR** (a linha 291 que reconta o §1.1 vira ponte; a linha 293 precisa ser **reescrita**, não somada) | idem |
| 4.3 | Opção B passo 2 vira **ponte ao §1.1** (mesmo passo, não nota de rodapé) — o `docker run` duplicado byte a byte no README sai; §1.1 é o dono da receita, o código é o dono de runtime | `README.md` |
| 4.4 | A **segunda** tabela de Troubleshooting do README (6 sintomas) sai: o dono é o §4 do runbook (10 sintomas). Dois se sobrepõem, e no do 503 a solução do README (`docker compose logs postgres`) está **errada** no ambiente 1 — o `postgres` do compose não publica porta, então olhar o log dele não resolve | idem |
| 4.5 | O índice de `docs/` do README diz que `docs/web/` e `docs/runbooks/` estão "em criação" — os arquivos **já existem** e o §0 do runbook os indexa por **ambiente** | idem |
| 4.6 | **Contagem de scripts**: `29` → `30` em **6 ocorrências** de 2 arquivos (`docs/MONOREPO-scriptarios.md:17,24,31` e `docs/MONOREPO.md:5,186,188`) — o catálogo canônico dos scripts da raiz; §2.3 ganha a linha do `pnpm banco:check` com o que faz e onde é disparado (**não é gate** — isso tem que estar escrito, porque o prefixo `ci:` da família sugere gate) | `docs/MONOREPO-scriptarios.md`, `docs/MONOREPO.md` |
| 4.7 | §4 (tabela de gates) ganha a linha do `banco:check` na camada A, declarando que bloqueia o **start** e não o push. ⚠️ `docs/fluxo-desenvolvimento.md` também está em **300/300** — corte compensatório no mesmo PR | `docs/fluxo-desenvolvimento.md` |
| 4.8 | A frase "só o `postgres` perde a porta publicada" descreve um delta base↔overlay que **não existe** desde o #91 (o base já não publica — removido em `9816aa62`, PR #95) | `docs/runbooks/docker.md` |

> ⚠️ `check-doc-size` mede só `.md` **versionado** (`git ls-files '*.md'`) — num
> arquivo novo ainda untracked o gate não vê: usar `git add -N` antes de medir.

### Fase 5 — Revisão, fecho, entrega

| # | Entrega |
|---|---|
| 5.1 | Revisão em 2 etapas por `review-router`: **spec** (o check faz o que promete?) e **qualidade** (a forma, o DRY, a doc) |
| 5.2 | `pnpm tooling:test` + `pnpm ci:preflight` verdes; `pnpm ci:local` verde |
| 5.3 | **Medição ao vivo dos 2 erros**, em janela própria, com o comando exato no corpo do PR (regra: claim sem comando não entra) |
| 5.4 | Commit, push e PR |

### Fase 6 — OPCIONAL: o guard que fecha a porta — **NÃO IMPLEMENTADO NESTE PR**

| # | Entrega | Arquivo |
|---|---|---|
| 6.1 | Propriedade 8 no `check-dockerfile-hardening`: o serviço `postgres` de `docker-compose.yml` **não pode** declarar `ports:` — o #91 removeu o binding. ⚠️ Sem isso, a "correção" tentadora (publicar 5432) passaria **verde** e desfaria o isolamento de rede do #91, expondo o banco de prod no host. Medido: o gate hoje mede `read_only`, `cap_drop`, `security_opt`, `networks:`, `init:`, `USER`, digest no FROM e `.env.production*` no `.dockerignore` — e **não** mede `ports:` | `.tooling/scripts/ci/check-dockerfile-hardening.ts` (+ spec) |
| 6.2 | Mutação: num worktree temporário, adicionar `ports: ['5432:5432']` ao bloco `postgres` → o gate **tem que** reprovar | idem |

> **Este é o primeiro a sair se o escopo apertar** — e saiu. É uma demanda
> **distinta** (hardening de *produção*, não ergonomia de *dev*): publicaria
> `5432` no compose de prod desfaz o isolamento do #91. Fica registrado aqui
> como pendência, com o instrumento pronto (a propriedade 8 do gate e a
> mutação que a prova). O `docker-compose.dev.yml` **não** é medido (o gate lê
> só `docker-compose.yml`).

## 3. O Definition of Done

- [ ] `pnpm dev` com o container do banco **parado** **sobe o container e
      continua** — medido ao vivo, com o comando no corpo do PR.
- [ ] `pnpm dev` com o container **inexistente** falha em **≤ 3 s** com
      mensagem que aponta o §1.1 — **sem** stack do Prisma — e
      `pgrep -af 'tsx watch src/main.ts'` **não devolve nada** (o watcher nunca
      nasceu).
- [ ] `pnpm dev` com a **3000 ocupada** falha com o **dono** da porta e os
      dois remedies — **sem** `EADDRINUSE` cru.
- [ ] A API, iniciada por **qualquer** caminho (IDE, `tsx` direto), morre com
      P1001 **legível** (causa + remédio, **sem a senha** na mensagem), e um
      erro que **não** é P1001 sai **intacto** (a mesma instância).
- [ ] A spec do check **cai** quando o check é neutralizado (mutação, não
      "controle negativo" de tmpdir), e a spec do script prova o `exit 1` com
      a porta fechada.
- [ ] `pnpm tooling:test` e `pnpm ci:preflight` verdes; `pnpm ci:local` verde.
- [ ] `docs/como-rodar.md` e `docs/fluxo-desenvolvimento.md` em **≤ 300 linhas**
      (corte compensatório no mesmo PR).
- [ ] Nenhum claim novo sem o comando que o reproduz; README e runbook
      concordam com o código (`check-doc-claims`, `check-runbook-drift`).
- [ ] O `docker run` da receita tem **um dono** (§1.1) — `grep -c "docker run
      -d --name projeto-base-pg-local" README.md docs/como-rodar.md` → `0` e
      `1`.

## 4. Fora de escopo (e por quê)

| Item | Por quê |
|---|---|
| **O check virar gate de CI** | Depende do Docker/Postgres **da máquina** — no CI a condição nunca é verdadeira: classe 1 de `guard-classes.md`. O `ci:boot` é o gate, e ele **não** sobe o banco por decisão do repo. |
| **O check criar o container quando ele não existe** | `docker run` é receita de primeira vez e é do §1.1. Auto-criar container na máquina da pessoa é efeito colateral que ninguém pediu. O check **aponta**. |
| **A versão "profunda" do check** (3 sondas do CLI do Prisma: credencial de runtime, de sistema, `migrate status` — ~2 s) | Trata sintomas que **não** são a demanda (senha errada → P1000, banco inexistente → P1003, papel `NOLOGIN`, migration pendente) e que **já têm dono**: o guard `verificarCredenciaisDoBanco` (#118), o `prepara-papeis.sh` (§1.2.1) e o `prisma migrate status` (§1.3). Custo: ~1,3 s por spawn, em **todo** `pnpm dev`. **Gatilho para reabrir**: alguém bater em P1000/P1003 cru no boot. |
| **Traduzir P1000/P1003** | O caso medido é P1001. Traduzir o resto mascara erros que o Prisma nomeia melhor. **Gatilho**: alguém bater em P1000 cru no boot. |
| **Publicar a porta do `postgres` do Compose de produção** | Desfaz o isolamento de rede do #91 (remoção em `9816aa62`, PR #95), expõe o banco de prod no host e colide com o `projeto-base-pg-local`. A Fase 6 fecha a porta. |
| **Criar `docker-compose.local.yml`** | O `check-dockerfile-hardening` lê **só** `docker-compose.yml` → um compose novo ficaria **fora** do gate; e duplicaria a fonte da verdade do §1.1. |
| **`docker compose up -d postgres` no start** | Sobe o serviço de **prod** (sem porta publicada): um banco **diferente** do local — não tem os papéis, não satisfaz o `DATABASE_URL` do ambiente 1 e ocupa o `container_name` `projeto-base-postgres`. |
| **Mudar o `tsx watch` para não sobreviver ao crash** | É comportamento da ferramenta. O preflight evita que o watcher nem nasca. **Dívida declarada**, não esquecimento — e a §7 mede o comportamento real. |
| **Rodar `prisma migrate deploy` no preflight** | O §1.3 continua sendo o passo humano; as únicas migrations automáticas do repo são contra o Postgres efêmero do testcontainers. |
| **Tocar `schema.prisma` ou criar migration** | A demanda é ergonomia de start, não schema. |

## 5. O risco que este plano aceita

**O `pnpm dev` passa a falar com o Docker.** Numa máquina sem Docker (ou sem
permissão no socket), o start falha **antes** de subir a API, com mensagem que
aponta a alternativa (Postgres local via brew/apt, já no README). Aceito: falha
em **~0,2 s** com instrução, em vez de **após o boot** com stack crua.

**O check sobe um container Docker.** É idempotente e o container é **da
pessoa** (criado por ela antes); o check não **cria** nada. Aceito: o `pnpm dev`
passa a ter efeito colateral no Docker — visível e reversível (`docker stop`).

**O sinal do `ci:boot` muda.** Com a API morrendo no boot (em vez de servir
503 `degraded`), o `ci:boot` falha por **conexão recusada** em vez de 503. O
gate **continua falhando** — muda o sinal, não o veredito.

**O nome do container passa a existir em 2 lugares** (§1.1 e a mensagem do
código) sem gate que ligue os dois. Aceito: o requisito "comando exato no
erro" pede o literal.

**O `tsx watch` e uma hipótese, não um fato.** Medido: o processo do watcher
continuava vivo depois do crash. **Não medido:** se ele **relança** a API em
loop (H3) — e se relançar, o conserto é no `dev`, não no watcher. A §7 mede
antes de decidir.

## 6. Reconciliação com a camada 1 (o delta do router)

O `specialist-router` despachou 7 specialists em paralelo e agregou 19 steps
(`.agents/runs/20261103T144253Z-specialist-01.yaml`). Deltas incorporados:

| Delta | Decisão |
|---|---|
| **Local do script**: o router disse `.tooling/scripts/ci/banco-local.ts`; o plano em disco dizia `tooling/scripts/` | **Router vence**: o `lerEnvDotEnv` já exportado em `boot-local.ts:79` evita um terceiro parser de `.env`, e `pnpm tooling:test` roda os dois roots |
| **Profundidade**: o `prisma-db-specialist` propôs a versão profunda (~2 s) | **Versão curta** (c2 do router); a profunda fica fora de escopo **com** o gatilho para reabrir |
| **Dono da porta**: o router mediu `docker ps --filter publish=3000` — o plano em disco tinha abandonedado a identificação do dono | **Router vence**: é portátil e o dono é nomeado |
| **step-10** (linha genérica no `main.ts`) | **Incorporado** (3.5) |
| **step-12** (2ª tabela de Troubleshooting, com a solução errada do 503) e **step-13** ("em criação" que já existe) | **Incorporados** (4.4, 4.5) |
| **step-15** (contagem de scripts: 6 ocorrências em 2 arquivos) | **Incorporado** (4.6) |
| **step-17** (frase stale do #91 em `docs/runbooks/docker.md`) | **Incorporado** (4.8) |
| **step-18** (guard do `ports:` no compose de prod) | **Incorporado** como Fase 6 opcional (primeiro a sair) |
| **G-003** — o plano em disco dizia "a mensagem não afirma o dono" | **Superado**: o router achou o jeito portátil de saber |

**Fica de fora da reconciliação**: o `documentation-specialist` foi despachado
**duas vezes** e não devolveu (a lente de coerência README+runbook foi absorvida
pelo `doc-writer`, `docker-prod-specialist`, `monorepo-specialist`,
`prisma-db-specialist` e `nestjs-specialist`). A **revisão editorial** do dono
da matriz §3 não aconteceu — declarado, não escondido.

## 7. A hipótese que precisa ser medida antes do PR

O `tsx watch` sobrevive ao crash — **medido**: o processo do watcher estava
vivo minutos depois do erro. **Não medido**: se o watcher **relança** a API
(H3). Medir com `pgrep -af 'tsx watch'` e `pgrep -af 'src/main.ts'` **antes e
depois** do exit. Se for H3, o conserto é no script `dev` (o watcher não pode
ficar relançando contra um banco fora) e vira step próprio.

## 8. O que foi implementado (2026-11-03) e o que ficou de fora

**Desvio do plano, pedido na conversa:** o plano nasceu para o erro de **banco**;
a demanda foi ampliada no meio da execução para *"testes que rodam localmente
para evitar qualquer erro no ambiente local"*. O check virou então o **preflight
do ambiente** (5 asserções: `.env`/`JWT_SECRET`, Prisma Client, banco, porta da
API — e o `JWT_SECRET` ganhou a asserção porque é o outro erro de boot que a
API recusa), e o script ganhou o nome `ambiente-local.ts` / `pnpm ambiente:check`.

### Medido (comandos no corpo do PR)

| Medida | Resultado |
|---|---|
| `pnpm ambiente:check` com o ambiente inteiro | `✓ ambiente da API` · `✓ Prisma Client` · `✓ banco local: no ar (localhost:5432)` · `✗ porta da API (:3000): já está em uso por 'projeto-base-api'` → **exit 1**, com `docker compose stop api` e `docker stop projeto-base-api` |
| Auto-recuperação (container descartável criado só para a medição) | `inspecionarContainer` → `existe: true, rodando: false, publicaPorta: true` → `decideSobreBanco` → `subir-container` → `docker start` → **a porta abriu** (`esperarPorta: true`) |
| `publicaPortaNasBindings` | A chave do `HostConfig.PortBindings` é a porta do **container** (`"5432/tcp"`) e o `HostPort` é a do **host** — comparar a chave com a porta do host só funciona por coincidência quando as duas são 5432. **Bug encontrado pela medição**, não pelos specs |
| Specs | `ambiente-local.spec.ts` — **28 testes**; `traducao-de-falha-de-conexao.spec.ts` — 6; `prisma.service.spec.ts` — 4 (2 novos) |
| Gates | `pnpm ci:preflight` 0 erro · `pnpm tooling:test` 734 verdes (46 arquivos) · `pnpm turbo run test:unit --filter=@projeto/api` verde · `pnpm format:check` verde · `pnpm typecheck:tooling` verde |

### Ficou de fora (com o motivo)

- **A medição ao vivo do `docker stop projeto-base-pg-local`** — o `docker stop`
  no container **pré-existente** de quem desenvolve foi **bloqueado pelo auto
  mode** (interferência em workload). A auto-recuperação foi medida com um
  container **descartável criado para a medição** — o caminho do código é o
  mesmo, mas o container do usuário não foi derrubado.
- **A Fase 6** (o guard que proíbe `ports:` no postgres de prod) — demanda
  distinta (hardening de produção); o instrumento está descrito, não escrito.
- **O `tsx watch` relançando em loop** (hipótese H3 do router) — não medido;
  o preflight evita que o watcher nasca por esse caminho, mas a hipótese
  continua aberta (a §7).

### Bug do `tsx watch` que a §7 tinha deixado em aberto

O `tsx watch` **sobrevive** ao crash (medido: o processo do watcher continua
vivo depois do erro) — e o `pnpm dev` agora **não chega lá**, porque o check
falha **antes** do `turbo run dev`. A §7 permanece como medição pendente para
quem quiser o conserto do watcher.
