---
state_snapshot: .agents/runs/state-snapshot-20261027T153700Z-issues-abertas-p0-p1.md
demand_slug: issues-abertas-p0-p1
date: 2026-10-27
branch: feat/issues-abertas-p0-p1
base_main_sha: 404a2458760b542b25e19329085969d3872b5c8a
---

# Plano — as 10 issues abertas (2 P0 + 8 P1) em um PR só

> Base: `main` @ `404a245` · Branch: `feat/issues-abertas-p0-p1`
> Origem: o escaneamento weekly de 2026-10-26 (`.agents/runs/findings-2026-10-26T050019Z/`),
> que abriu as 10 issues (#117–#126) e deixou 16 achados P2 só no relatório.

## 0. O que está em jogo

Dez issues. As duas P0 são de **segurança** e as duas têm PoC reproduzido:

| # | Sev | O que é | Onde |
|---|---|---|---|
| 117 | **P0** | command injection: nome de arquivo do PR executa comando no CI | `tooling/scripts/lint-review-routing.ts:100` |
| 118 | **P0** | senha do papel `app_runtime` versionada + escopo RLS escolhível pelo cliente | `migration.sql:32`, `papel-de-runtime.ts:26` |
| 119 | P1 | `GET /users` ignora `users.read` no escopo de tenant | `users.controller.ts:344` |
| 120 | P1 | `JWT_SECRET=CHANGE_ME…` aceito como segredo válido | `jwt-token.service.ts:201` |
| 121 | P1 | seed promove o primeiro usuário a admin global fora do guard | `seed.ts:178` |
| 122 | P1 | Swagger do OpenAPI exposto em produção | `main.ts:99` |
| 123 | P1 | reatribuição idempotente de perfil responde 412 | `profiles.use-cases.ts:745` |
| 124 | P1 | query params de `/users` sem validação: 500 em vez de 400 | `users.controller.ts:339` |
| 125 | P1 | OpenAPI sem versionar e sem gate; 7 controllers sem `@ApiTags` | `apps/api/openapi.json` |
| 126 | P1 | footers de versão dos 4 docs canônicos divergentes | `docs/STACK.md:146` |

**O que NÃO está em jogo:** os 16 achados P2 do relatório. Nenhum virou issue, e
vários são falsos positivos que o próprio relatório declara (o `.dockerignore`
usando `**/` em vez de literais; a propagação W3C que o SDK Node já faz por
padrão). Este plano os **não** corrige — e diz por quê em §5.

## 1. Gap analysis AS-IS → TO-BE

### O que JÁ EXISTE (não reconstruir)

- **`ZodValidationPipe`** com `@Body(new ZodValidationPipe(Schema))` — o padrão de
  validação de borda do repo. O #124 é aplicar o **mesmo** padrão ao `@Query`.
- **`loadedVersion()` no `Profile`** (`profile.aggregate.ts:271`) — o mecanismo
  exato que o #123 pede, já desenhado e testado no agregado vizinho.
- **`decisaoDoAdminLocal()`** (`apps/api/src/shared/auth/decisao-do-admin-local.ts`,
  do PR #115) — três estados (`criar`/`recusar`/`ignorar`) com 20 testes. O #121
  reaproveita essa função; não precisa de guarda nova.
- **`check-tenant-scope-source.ts`**, **`check-doc-refs.ts`** e o padrão de gate do
  preflight (`preflight-gates.ts` + entrada no registro de dentes) — o #126 e o
  #125 escrevem gates no mesmo formato.
- **`papel-de-runtime.spec.ts`** — compara a migration com as constantes do
  fonte. A #118 vai **mudar** esse contrato, e o spec tem de mudar junto.

### O que FALTA

| Issue | Falta | Tamanho |
|---|---|---|
| 117 | `execFileSync` com argv em array + `--` + teste de regressão | pequeno |
| 118 | senha fora do repo + guard de boot + escopo de sistema com credencial própria | **grande** |
| 119 | separar os dois recortes (`vínculo` e `permissão`) | pequeno |
| 120 | recusar placeholder + exigir entropia mínima + idem no Grafana | médio |
| 121 | o mesmo guard do passo 4 no passo 5 | pequeno |
| 122 | condicionar o Swagger + a variável de ambiente | pequeno |
| 123 | `loadedVersion()` no agregado `User` + o fake do repositório | médio |
| 124 | schema Zod de query + clamp documentado no port | médio |
| 125 | versionar a spec + gate + 7 `@ApiTags` + 16 `@ApiOperation` | **grande** |
| 126 | alinhar os footers + gate de coerência | médio |

## 2. Decisões de desenho

### D1 — A #118 é UM problema de credencial, e a correção é DUAS credenciais

O achado central, lido no código: o escopo de tenant é um **GUC**, e GUC
qualquer sessão pode `SET`. A policy `no_escopo_atual` aceita
`escopo_atual() = '*'` como **primeiro** disjunto (`migration.sql:108`), e `'*'`
significa "tudo". O `NOBYPASSRLS` impede o papel de *pular* a policy; não impede
o papel de *escolher* o valor do GUC.

A correção que a issue sugere ("o valor `'*'` precisa exigir uma credencial
diferente") é a única que fecha de verdade, e a razão é estrutural: **com uma
credencial só, qualquer coisa que a sessão possa escolher, o atacante escolhe.**
A sessão escolhe o GUC; a sessão escolhe o `current_user`? Não — `current_user`
vem da credencial.

Logo:

- o **bucket de sistema** deixa de ser concedido pelo GUC e passa a ser
  concedido pela **credencial**: o policy passa a ter, no lugar do disjunto
  `escopo_atual() = '*'`, o disjunto `current_user = 'app_system'`. Uma sessão
  `app_runtime` não chega lá, porque `current_user` vem da credencial;
- a app precisa dos dois escopos, então precisa de **duas credenciais**:
  `DATABASE_URL` (runtime, `app_runtime`) e `SYSTEM_DATABASE_URL` (sistema,
  `app_system`);
- `app_runtime` **não** é membro de `app_system` — se fosse, `SET ROLE` bastaria
  e o bypass voltaria pela porta dos fundos.

⭐ **A consequência que torna isto pequeno (achado na revisão, R1):** o app
**continua** fazendo `SET app.tenant_id = '*'` nos mesmos 8 pontos — o GUC não
muda de valor, ele muda de **significado**. Antes, `'*'` era um disjunto da
policy; depois, `'*'` é apenas um valor inerte, e quem concede o bucket de
sistema é a credencial. A mudança na aplicação é, portanto:

1. uma **policy** — trocar `escopo_atual() = '*'` por `current_user = 'app_system'`;
2. um **provider** — um segundo `PrismaClient` construído a partir de
   `SYSTEM_DATABASE_URL`;
3. **8 call sites** — `comEscopo(this.prisma, …)` → `comEscopo(this.prismaSistema, …)`
   em `prisma-tenant-onboarding.repository.ts` (4), `prisma-tenant-membership.repository.ts` (3)
   e `prisma-user.repository.ts` (1).

Sem o segundo cliente, a sessão `app_runtime` com o GUC em `'*'` passaria a ver
**zero** linhas — o que é exatamente o que a prova (T10.5a) exige, e exatamente
o que o teste de integração mede contra Postgres real.

⚠️ **Consequência honesta:** o bucket de sistema passa a ser alcançável por
quem tiver a `SYSTEM_DATABASE_URL`, e essa credencial é mais poderosa que a de
runtime. É o preço do desenho, e é o preço que a issue pede. O que muda é que
as duas credenciais **rotacionam separadamente** e a de runtime deixa de dar
acesso ao bucket de sistema.

**O que fica FORA do escopo do item 2, e por quê:** a policy de tenant
(`alvo::text = escopo_atual()`) continua forgeável — quem tiver a credencial de
runtime pode apontar o GUC para outra empresa. Fechar isso exige ligar o escopo
à **membership** do ator (`usuario_no_escopo`), o que é uma mudança de contrato
em todas as tabelas. O relatório de escaneamento mediu o vetor que importa
(`SET app.tenant_id='*'` devolvendo **todos** os usuários de **todas** as
empresas), e é esse que este PR fecha. O resto fica **declarado** — em §5 — com
o motivo, porque um plano que promete o que não entrega é pior que um que
declara o limite.

### D2 — A senha do papel sai do repo, e a migration para de poder criá-la

`SENHA_DE_RUNTIME_DEV` está em **dois** lugares versionados: a migration
(`PASSWORD 'app_runtime_dev'`) e o fonte (`papel-de-runtime.ts:26`). A migration
não lê env — e é por isso que a senha foi parar ali.

A correção: a migration cria o papel **sem senha** (`NOLOGIN`), e um passo de
setup (documentado, rodado pelo operador/CI, com a credencial de DONO) fixa a
senha a partir de `APP_RUNTIME_PASSWORD`. O fonte passa a ler a senha do
ambiente, e `uriComoPapelDeRuntime` recebe a senha como argumento.

O `papel-de-runtime.spec.ts` (que compara migration ↔ fonte) **muda de contrato**:
ele passa a afirmar que a migration **não** contém senha — o que é a forma
negativa do teste que hoje não existe.

### D3 — O guard de boot da #120 é o mesmo padrão da #121, e os dois são funções puras

A #120 e a #121 são a mesma classe de defeito: **um valor de ambiente que
deveria ser recusado e não é**. E o repo já tem o padrão, creado pela #115:
`decisaoDoAdminLocal()` — função pura, três estados, 20 testes, em
`src/shared/auth/`.

Então a #120 vira `segredoDeServico()` (mesmo formato, mesma pasta) e a #121
reaproveita `decisaoDoAdminLocal()` como está. Nenhuma das duas vira um `if`
solto dentro de um construtor.

### D4 — O gate do #125 compara a spec versionada, e a spec versionada passa a ser a baseline

A issue diz que sem versionar o gate "vira o mesmo que não ter gate" — e está
certo. O `openapi.json` sai do `.gitignore`, passa a ser gerado e commitado, e
o gate compara o gerado com o versionado.

**O detalhe que decide se o gate é útil:** o `openapi:export` precisa de
`JWT_SECRET` (o app assina token no boot) — e o `JWT_SECRET` pode ser o
placeholder. Se o gate rodar o export contra o exemplo, ele produz uma spec
diferente da do repositório e o gate fica vermelho por motivo errado. O gate
usa uma **chave de teste fixa** (não o placeholder) e o `openapi:export` do
desenvolvimento fica com a doc explaining.

### D5 — O gate do #126 compara os 4 footers entre si, e com a última tag

A issue oferece duas vias: comparar com a tag, ou comparar os 4 entre si. A
segunda é a que fecha a reincidência **sem** acoplar o preflight ao ciclo de
release — e é a que eu implemento. A comparação com a tag fica para o
`release-template`, que é onde ela pertence.

O gate **não** re-pinna a versão: ele exige que os 4 digam a **mesma** versão, e
que essa versão seja maior que a da última tag. Um PR que muda a versão dos 4
juntos passa; um PR que muda só um é barrado.

## 3. Tasks

### T1 — #117: `execFileSync` com argv, e o `--` que ninguém lembra · P0

`tooling/scripts/lint-review-routing.ts:100` monta
`execSync(\`git check-ignore ${JSON.stringify(filePath)}\`)`. O `JSON.stringify`
embrulha em aspas duplas — e dentro de aspas duplas o shell expande `$(...)`.

- `execFileSync('git', ['check-ignore', '--', filePath])` — argv em array, sem
  shell. O `--` é obrigatório: um `filePath` que comece com `-` seria lido como
  opção do `git`.
- **Auditoria dos outros `execSync` do diretório** (a issue pede): `git rev-parse`
  e `git ls-files` são de string fixa, sem interpolação — mas o padrão vira
  `execFileSync` em todos, para que a próxima interpolação não repita o defeito.
- **Teste de regressão**: um `filePath` com `$(touch <marcador>)` não cria o
  marcador e `isPathGitignored` devolve `false`.
- **Gate**: `grep -rn 'execSync(\`' tooling/scripts/` não devolve **nenhuma**
  ocorrência — entra no preflight, senão a reincidência é só uma questão de
  tempo.
  ⚠️ **A formulação da issue ("com interpolação de valor externo") não é
  verificável por `grep`** — o grep não distingue "string fixa" de "template
  literal com dado externo". A versão verificável é mais forte: **nenhum
  `execSync` com template literal** em `tooling/scripts/`. As duas chamadas
  restantes (`git rev-parse`, `git ls-files`) são de string fixa e podem ficar
  como `execSync` — ou virarem `execFileSync` também, que é o que o plano
  adota (uniformidade).

### T2 — #119: os dois recortes separados · P1

`users.controller.ts:344` compõe `(empresa === null || perfilNaoResolveuParaOEscopo)
&& semDireito`. O `semDireito` (permissão) só tem efeito quando o primeiro membro
é verdadeiro — e no caso que importa (membro do tenant com perfil resolvido) ele
é falso. O `semDireito` calculado 50 linhas acima é **descartado**.

A correção: os dois sinais viram **disjuntos**, e o `empresa === null` sai do
primeiro membro (quando `empresa === null`, o perfil global resolve, então
`perfilNaoResolveuParaOEscopo` é falso — e o `&&` com `semDireito` dava o mesmo
resultado).

⚠️ **A regressão do #102 que precisa ser preservada:** membro **com** `users.read`
continua vendo o diretório da empresa. O teste do caso negativo existe e é o
que prova que a troca não cortou demais.

### T3 — #120: placeholder e entropia, no mesmo lugar onde o vazio é recusado · P1

`lerChaveObrigatoria` (jwt-token.service.ts:201) recusa string vazia e só. O
`CHANGE_ME_…` do example passa.

- A recusa vira uma **função pura** `segredoDeServico()` (D3): recusa vazio,
  recusa placeholder conhecido, e exige **≥ 32 bytes**.
- ⚠️ **A lista de placeholders é estreita, e a razão é um falso positivo.**
  MEDIDO: o example usa `CHANGE_ME_gerar_com_openssl_rand_base64_48` e
  `CHANGE_ME_gerar_com_openssl_rand_base64_18` — e o `startsWith('secret')`
  que a issue sugere recusaria um segredo **legítimo** como
  `secreto-da-empresa-2026` (o `secret` de "segredo"). A lista fica:
  `CHANGE_ME` (prefixo), `changeme` (prefixo), `trocar-esta-senha` e
  `your-secret-here` — **exatos**, não prefixos. O resto é recusado pelo
  **tamanho**: um segredo real tem 32 bytes ou mais.
- A mensagem de recusa **nunca embute o valor** — ela vai para o log de boot.
- O **mesmo guard** para `GF_SECURITY_ADMIN_PASSWORD` (o Grafana aceita o
  placeholder sem reclamar, como o próprio example admite).
- **Rede mais barata**: um check no preflight que recusa `JWT_SECRET=CHANGE_ME`
  no `.env.production` — pega o erro antes do deploy.

### T4 — #121: o passo 5 do seed com o guard do passo 4 · P1

O passo 4 (admin local) tem guard `NODE_ENV=development` + host local. O passo 5
— que promove o **primeiro** usuário a admin global — não tem nenhum, e
`POST /users` é `@Public()`: a conta promovida pode ser de qualquer pessoa que
se cadastrou.

O passo 5 passa a exigir o mesmo `decisaoDoAdminLocal()` (D3), com a condição
mais forte: **recusa**, não ignora. Fora de dev, o caminho é o endpoint auditado
(`POST /api/v1/admin/users/:id/profile`).

### T5 — #122: o Swagger só em dev · P1

`main.ts:99` monta o Swagger sem condição — enquanto o CORS, 20 linhas acima,
**aborta o bootstrap** em produção. A assimetria é o achado.

`SWAGGER_ENABLED` (default ligado em dev, **desligado** no `.env.production.example`)
+ o guard no `main.ts`. A doc de `/api/docs` fica condicionada.

### T6 — #123: `loadedVersion()` no agregado `User` · P1

`await this.userRepo.save(user, user.version() - 1, ...)` pressupõe um `version++`
que **não** ocorre quando `atribuirPerfil` é idempotente → 412 numa
reatribuição que não mudou nada.

O `Profile` já tem o mecanismo (`profile.aggregate.ts:271`). O `User` recebe o
mesmo: `#loadedVersion` no construtor, `loadedVersion()` no acesso. E o **fake**
do repositório passa a respeitar `expectedVersion` — senão o próximo bug de lock
passa igual.

### T7 — #124: schema Zod no `@Query` de `/users` · P1

`limit` e `cursor` não são validados: `limit=abc` → 500 (não 400), `limit=0` e
`limit=-5` → 200 com lista vazia (falha silenciosa), e as **duas implementações**
do port discordam sobre o clamp.

- `ListUsersQuery` com `z.coerce.number().int().min(1).max(100).default(20)` e
  `cursor: z.string().uuid().optional()`, aplicado com `ZodValidationPipe` — o
  padrão que o repo já usa no `@Body`.
- O **clamp fica no port** (fonte única, as duas implementações concordam).
- A rota de histórico valida o `:id` no controller, como as outras 4 rotas.

### T8 — #125: a spec versionada e o gate que a guarda · P1

Três partes: (a) `openapi.json` sai do `.gitignore` e passa a ser versionado;
(b) `@ApiTags` nos 7 controllers que faltam e `@ApiOperation` nos 16 endpoints
que faltam — `auth` e `users` são o modelo; (c) `check-openapi-contract.ts` no
preflight, que regenera e compara.

⚠️ O gate **não** pode rodar o `openapi:export` com o `JWT_SECRET` do example
(D4) — o export assina token no boot, e o placeholder muda a spec.

### T9 — #126: os footers alinhados e o gate que impede a divergência · P1

`MONOREPO.md` e `estrutura-e-versionamento.md` dizem 1.12.0; `STACK.md` e
`TEMPLATE_USAGE.md` dizem 1.11.0. O `release-template` aborta em cima disso.

Alinhar os 4 em **1.12.0** — e a razão é a própria convenção: o histórico
dela diz *"Pendente: bump dos footers de `docs/MONOREPO.md` e `docs/STACK.md`
via `release-mode` workflow"*, e o `release-template.yml` lê o footer de
`docs/MONOREPO.md` como a **fonte da tag**. Declarar 1.11.0 nos dois divergentes
faria os 4 discordarem do release pendente.

⚠️ **E a raiz do #126 não é o footer — é a PROCEDURA.** MEDIDO em
`.agents/workflows/release-mode.md:30`:

```
task: "Atualizar docs/MONOREPO.md, docs/STACK.md,
       .agents/specs/conventions/estrutura-e-versionamento.md com nova versão + …"
```

**Três** arquivos. `docs/TEMPLATE_USAGE.md` não está na lista — e é por isso
que ele não é atualizado. O `release-template.yml` (linhas 98-104) **lê** os 4
footers e aborta se divergirem; quem **escreve** é um agente seguindo essa prosa,
e a prosa nomeia 3.

Então o T9 tem três partes, e a segunda é a que fecha a reincidência:

1. alinhar os 2 divergentes em 1.12.0;
2. **a lista do `release-mode.md` passa a nomear os 4** — a correção de uma
   linha que mata a causa — **e um script** (`tooling/scripts/bump-version.ts`)
   passa a escrever os 4 footers de uma vez, para que "esquecer um" não dependa
   de atenção;
3. `check-version-footers.ts` no preflight (D5), para que a divergência seja
   barrada **no PR** e o `release-template` nunca chegue a abortar.

## 4. Ordem e por quê

**Os P0 primeiro, e o #118 antes do #117** — não por severidade, mas porque o
#118 toca a migration e o `prisma-rls.integration.spec.ts`, e o #117 é o único
que mexe no `tooling/` (que roda em todo push). Se o #117 ficar por último, um
erro meu no `lint-review-routing.ts` atrasa todo o resto.

Ordem de execução: **T1 (#117)** → **T2 (#119)** → **T3 (#120)** → **T4 (#121)** →
**T5 (#122)** → **T6 (#123)** → **T7 (#124)** → **T9 (#126)** → **T8 (#125)** →
**T10 (#118)**.

⚠️ **#118 por último, e por um motivo concreto:** ele é o único que exige
**Postgres real** para ser medido (a prova do bypass é `SET app.tenant_id='*'`).
O repo tem testcontainers, e o `prisma-rls.integration.spec.ts` já mede o RLS
contra Postgres 16 de verdade. Se eu fizer o #118 no meio, o resto fica sem
verificação — e o #118 é o que mais precisa de verificação.

E o **#125 por último entre os médios**, porque os 23 decorators são mecânicos e
o gate novo é o que fecha a reincidência: sem o gate, os decorators viram
decoração.

### T10 — #118: a credencial do sistema, a senha fora do repo e o guard de boot · P0

- **T10.1** — a senha do `app_runtime` sai do fonte: `SENHA_DE_RUNTIME_DEV`
  deixa de ser constante, `uriComoPapelDeRuntime` recebe a senha por
  argumento, e o valor vem de `APP_RUNTIME_PASSWORD`.
- **T10.2** — a migration cria o papel **sem senha** (`NOLOGIN`); o passo de
  setup fixa a senha a partir do env; `papel-de-runtime.spec.ts` passa a
  afirmar que a migration **não** contém senha literal.
  ⚠️ **A ordem importa, e é a ordem que o container já usa.** MEDIDO no
  `apps/api/Dockerfile:99`, o entrypoint é
  `prisma migrate deploy && node dist/main.js`. Se a migration cria o papel
  `NOLOGIN`, o `ALTER ROLE … PASSWORD` tem de acontecer **antes** do
  `migrate deploy` — e ele exige a credencial de DONO, que o container já tem
  (`DIRECT_DATABASE_URL`). O entrypoint passa a ser
  `setup-do-papel (ALTER ROLE) && migrate deploy && node dist/main.js`.
- **T10.3** — o guard de boot recusa a senha conhecida de dev em produção (o
  mesmo padrão do `JWT_SECRET` — D3).
- **T10.4** — o papel `app_system` nasce, `NOBYPASSRLS` **não** — o que o
  garante é `current_user = 'app_system'` na policy, e a app usa a
  `SYSTEM_DATABASE_URL` para os **8 sítios de escopo de sistema**.
- **T10.5** — a prova, em `prisma-rls.integration.spec.ts`:
  (a) sessão `app_runtime` com `SET app.tenant_id = '*'` → **zero linhas**
      (o bypass do #118 fechado);
  (b) sessão `app_system` → enxerga o bucket de sistema;
  (c) sessão `app_runtime` com o GUC de outra empresa → zero linhas.

## 5. Fora do escopo (decidido, não por esquecimento)

- **O escopo de tenant continuar forgeável** (o `alvo::text = escopo_atual()` da
  policy). Fechar exige ligar o escopo à membership do ator em todas as tabelas —
  mudança de contrato, não correção. **Declarado** aqui e no PR, com o motivo.
  O vetor que o scan mediu (`'*'` devolvendo todas as empresas) é o que o PR
  fecha.
- **Os 16 achados P2** do relatório. Três são falsos positivos que o próprio
  relatório declara; os outros são dívida real de escopo próprio. **Cada um vira
  issue própria** — o cap de 10 foi o que impediu, e esse é o mecanismo certo.
- **A revogação do que já foi exposto** (`app_runtime_dev` está no histórico de
  um repositório público). Não é código: é rotação de credencial em ambiente
  real, e o código deste PR **deixa de recriar** a condição. Declarado no PR.
- **`tracesToMetrics`/`serviceMap` do Grafana**, `findMany` sem `take`,
  `atualizarEmail` sem rota: P2 do relatório, com escopo próprio.

## 6. Verificação (o que precisa estar verde antes do commit)

```bash
# do RAIZ — o `--root apps/api` NÃO acha nenhum spec (MEDIDO: "No test files
# found", exit 1): o `vitest.workspace.ts` está DENTRO de apps/api, e `--root`
# da raiz não o resolve.
pnpm --filter @projeto/api exec vitest run --project unit
pnpm --filter @projeto/api exec vitest run --project integration   # Postgres real
pnpm --filter @projeto/web exec vitest run --exclude '**/e2e/**'
pnpm tooling:test
pnpm ci:preflight
```

**E, por correção, uma MUTATION** — a regra do repo: uma correção sem mutation
provada é uma correção que ninguém sabe se tem dente.

| Correção | Mutation | Dente esperado |
|---|---|---|
| #117 | voltar a `execSync` com interpolação | o teste do marcador cai |
| #118 | `SET app.tenant_id='*'` de novo | o spec do RLS fica vermelho |
| #119 | voltar ao `&&` | o caso do membro sem `users.read` cai |
| #120 | aceitar o placeholder | o spec do guard cai |
| #121 | tirar o guard do passo 5 | o spec do seed cai |
| #122 | tirar a condição do Swagger | o spec do main cai |
| #123 | voltar a `version() - 1` | o caso idempotente cai |
| #124 | remover o schema de query | o caso do `limit=abc` cai |
| #125 | tirar o gate | o spec do gate cai |
| #126 | divergir um footer | o spec do gate cai |

## 7. Merge Danger — o que este PR passa a declarar

- **Este PR não abre rota nem muda contrato HTTP** — as rotas do #116 já
  estão mergeadas; aqui só muda o **comportamento** de `GET /users` (o recorte
  por permissão, que passa a valer) e o **código de erro** de query inválida
  (500 → 400).
- **Um novo papel Postgres** (`app_system`) e **uma nova credencial de ambiente**
  (`SYSTEM_DATABASE_URL`) — a porta que este PR abre.
- **A migration do RLS muda** — o `no_escopo_atual` deixa de aceitar `'*'`.
  Quem deployar precisa rodar a migration e ter a `SYSTEM_DATABASE_URL`.
- **Dois gates novos** no preflight (`check-openapi-contract`,
  `check-version-footers`) + **um check** (`execSync` sem interpolação).
- **O `openapi.json` sai do `.gitignore`** e passa a ser versionado — o build
  agora tem um artefato gerado no meio da árvore.


---

## 8. Revisão adversarial do plano (executada antes da implementação)

Sete achados. Cinco mudaram o plano; dois confirmaram o plano como estava.
Todos verificados por **leitura do código**, não por suposição — cada um cita
o arquivo e a linha.

| # | Achado | Verificação | Efeito |
|---|---|---|---|
| **R1** | O desenho do #118 é **menor** do que o plano supunha: o app pode continuar fazendo `SET app.tenant_id='*'`. O que muda é o **significado** do `'*'`: ele deixa de ser disjunto da policy e vira valor inerte — quem concede o bucket de sistema passa a ser a **credencial** (`current_user='app_system'`). | `migration.sql:108` (o disjunto `escopo_atual()='*'`) + os 8 call sites de `escopoDoTenant(null)` | **Plano corrigido** (§2 D1, T10.4). O item 2 deixa de ser um redesenho do data-access e passa a ser 1 policy + 1 provider + 8 linhas. |
| **R2** | O plano alinhava os footers do #126 em **1.11.0** — errado. A convenção (`estrutura-e-versionamento.md:101`) diz **1.12.0**, e o `release-template.yml:66` lê o footer de `MONOREPO.md` como **fonte da tag**. Alinhar em 1.11.0 faria os 4 discordarem do release pendente. | `grep` nos 3 arquivos + `release-template.yml:66` | **Plano corrigido** (T9). Alinhamento em **1.12.0**. |
| **R3** | A raiz do #126 não é o footer — é a **procedência**. `.agents/workflows/release-mode.md:30` nomeia **3** dos 4 arquivos; `TEMPLATE_USAGE.md` não está na lista. Quem **escreve** é um agente seguindo essa prosa; quem **valida** é o `release-template.yml` (que aborta tarde demais). | Leitura direta de `release-mode.md:30` e `release-template.yml:98-104` | **Plano corrigido** (T9): corrigir a lista de 1 linha + script de bump + gate no preflight, para que a divergência seja barrada **no PR**. |
| **R4** | A lista de placeholders da #120 como a issue sugere (`startsWith('secret')`) recusa um segredo **legítimo** — `secreto-da-empresa-2026` começa com `secret`. O example real usa `CHANGE_ME_…`. | `.env.production.example:65,118` | **Plano corrigido** (T3): lista estreita (`CHANGE_ME`/`changeme` por prefixo; `trocar-esta-senha`/`your-secret-here` exatos) + **tamanho ≥ 32 bytes** como criterion principal. |
| **R5** | O critério de aceite da #117 ("`grep` que não devolve interpolação de valor externo") **não é verificável por `grep`** — o grep não distingue string fixa de template literal com dado externo. | `lint-review-routing.ts:100` e as outras 2 chamadas | **Plano corrigido** (T1): o gate passa a ser "nenhum `execSync` com template literal em `tooling/scripts/`" — verificável e mais forte. |
| **R6** | O `openapi:export` (que o gate do #125 vai rodar) **sobrevive** ao guard de boot da #120: o script usa `JWT_SECRET='somente-para-o-export-do-openapi-nao-serve-para-autenticar'` — 59 bytes, sem prefixo de placeholder. | `apps/api/scripts/export-openapi.ts` | **Plano confirmado.** Registrado porque a interação era plausível e seria um falso positivo. |
| **R7** | A ordem do setup da senha (#118) é ditada pelo entrypoint: `migrate deploy && node dist/main.js` (`Dockerfile:99`). Se a migration cria o papel `NOLOGIN`, o `ALTER ROLE` tem de vir **antes**, com a credencial de DONO que o container já tem. | `Dockerfile:99` | **Plano corrigido** (T10.2) — e **a implementação INVERTEU** (ver §9.1, item 7): o `ALTER ROLE` vem **depois** do `migrate deploy`, porque o papel que ele altera é **criado** pela migration. O entrypoint ficou `migrate deploy → prepara-papeis.sh (ALTER ROLE) → node`. |

**O que a revisão NÃO mudou:** a ordem de execução (§4), a decisão de fazer o
#118 por último (é o único que exige Postgres real para ser medido), e a lista
de fora-de-escopo da §5 — que segue correta, e é ela que impede o PR de
prometer o que não entrega.


---

## 9. Registro da implementação (o que mudou do plano quando o código foi escrito)

> Conformidade com a convenção do repo: o log de revisão vai para dentro, antes
> do commit que implementa, e vai junto com o código.

### 9.1 Correções que a implementação exigiu (e o plano não previa)

| # | O que o plano dizia | O que o código exigiu | Por quê |
|---|---|---|---|
| 1 | #119: "trocar `&&` por `||`" | **Decompor `semDireito` em dois sinais** (`temPerfilGlobal` e `faltaPermissaoDeLeitura`) e mover o carve-out do admin global para fora do recorte | `semDireito` carregava TRÊS termos encadeados: `isAdmin !== true && perfilGlobal === null && !permissions.includes('users.read')`. Trocar o `&&` por `||` derrubava o **admin global** (2 specs caíram). O carve-out do admin global é um sinal independente, e a correção é decompô-lo — não de trocar um operador. |
| 2 | #118: "a policy troca o `'*'` por `current_user='app_system'`" | **Um segundo cliente Prisma** (`SYSTEM_DATABASE_URL`), e os 8 call sites de escopo de sistema passam a usá-lo | Com uma credencial só, a sessão escolhe o GUC — e o GUC era o que concedia tudo. Quem concede tem de ser a credencial. O atalho sem o segundo cliente seria: a policy fecha o furo e a aplicação **quebra** (o bucket de sistema não abre). |
| 3 | #118: "a senha sai do repo" | **A migration nova também precisa `ALTER ROLE app_runtime NOLOGIN`** | A migration ANTIGA já tinha criado o papel COM a senha. Num banco novo (que roda as duas em sequência), ela continuaria valendo — o repo versionado continuaria valendo. O estado novo tem de ser FORÇADO, não só descrito. |
| 4 | #125: "o gate compara a spec versionada com a gerada" | **O export tem que escrever num caminho próprio** (`OPENAPI_OUTPUT_PATH`) | O `openapi:export` ESCREVE em `apps/api/openapi.json`. Um gate que roda o export e depois compara o arquivo com ele mesmo é "verde" sem medir nada — exatamente o "gate inócuo" que a issue descreve. O gate exporta para um temporário, e a árvore não é tocada. |
| 5 | #126: "um script de bump" | **O gate `check-version-footers` compara com a tag com `>=`, não `>`** | Depois do release, os footers ficam IGUAIS à tag recém-criada — e o gate roda em todo preflight depois disso. Igualdade é o estado normal; o que é defeito é os footers ficarem ATRÁS. |
| 6 | #117: "gate: nenhum `execSync` com interpolação" | **O gate achou 7 casos reais, não 2** | Os 2 do #117 (o `check-ignore` e o `gh pr view`) + 5 em spec e gate (`docker compose${flag}`, `node … --paths=${tmp}`, `git ls-files … ${pathspec}`, `bash ${script}`). **A auditoria que a issue pedia pagou mais do que o esperado** — e os 7 foram corrigidos. |
| 7 | #118 (T10.2): "o entrypoint passa a ser `ALTER ROLE → migrate → node`" | **`migrate deploy → prepara-papeis.sh (ALTER ROLE) → node`** | O `ALTER ROLE` altera um papel que **a própria migration cria**. Antes do `migrate deploy`, o papel não existe — e o `ALTER ROLE` morre com "role does not exist". A ordem que o plano propôs é a que falha; a que funciona aplica a senha DEPOIS de o papel existir. E o `ALTER ROLE` saiu do entrypoint para um script (`prepara-papeis.sh`), porque o passo é o mesmo no ambiente local (runbook §1.2.1) e na imagem. |

### 9.2 O que a implementação REFUTOU do plano

- **O plano dizia que o `mutação` do #119 cairia 1 teste.** Caiu **2** — e os
  2 revelaram que a mutação do plano estava errada (ela derrubava o admin
  global). A lição: a mutação de um plano é um **hipótese**, e a hipótese
  errada aparece como spec vermelha antes do commit.
- **O plano dizia que o #125 teria 16 endpoints sem `@ApiOperation`.** São
  **17** — e o `GET /api/v1/health` não estava na conta da issue.
- **O plano dizia que o guard do #120 seria "o mesmo padrão da #121"**. O
  padrão é o `decisaoDoAdminLocal` (função pura em `src/shared/auth/`, com
  spec) — e não um `if` dentro de um construtor. A #120 virou
  `segredoDeServico()` e a #121 reaproveitou `decisaoDoAdminLocal()` como
  está. Duas funções, um padrão.

### 9.3 As mutações medidas (o que prova que cada correção tem dente)

| Correção | Mutação | Testes que caem | Denominador |
|---|---|---|---|
| #117 | voltar a `execSync` interpolado | **3** | 23 (spec do lint) |
| #117 | o gate de shell injection para de detectar | **4** | 12 (spec do gate) |
| #118 | a policy volta a `escopo_atual() = '*'` | **1** (o de "as TRÊS funcoes") | 18 (spec do papel) |
| #118 | o guard aceita a senha exposta | **4** | 10 (spec do guard de credenciais) |
| #118 | a sessão de runtime volta a ler o bucket de sistema | **3** | 42 (spec de RLS, contra Postgres real) |
| #118 | o papel de sistema perde o `EXECUTE` da membership | **26** | 30 (integração do onboarding) |
| #118 | a auditoria volta a abrir o escopo de sistema na sessão de runtime | **1** | 11 (integração da auditoria) |
| #119 | a fórmula volta a `version() - 1`… (a do lock) | **1** | 117 (agregado + use case) |
| #119 | o recorte volta ao `&&` antigo | **2** | 65 (spec do controller) |
| #120 | o prefixo de placeholder é neutrizado | **4** | 49 (segredo + jwt) |
| #120 | o critério de tamanho é neutrizado | **5** | 49 (segredo + jwt) |
| #121 | `decisaoDoPrimeiroUser` promove sempre | **4** | 23 (spec do admin local) |
| #122 | o Swagger é habilitado sempre | **4** | 8 (spec do toggle) |
| #123 | o save volta a `version() - 1` | **1** | 117 (agregado + use case) |
| #124 | a validação da query é removida | **7** | 73 (spec do controller) |
| #125 | a comparação sempre passa | **3** | 10 (spec do gate) |
| #125 | a spec ausente é aceita | **1** | 10 (spec do gate) |
| #126 | a lista de footers perde um arquivo | **1** | 12 (spec do gate) |
| #126 | a divergência é ignorada | **1** | 12 (spec do gate) |
| #126 | o bump pula um arquivo | **1** | 8 (spec do bump) |

### 9.4 O que o CI do PR mediu DEPOIS da primeira versão

O plano previa a implementação; o CI mediu o que o plano não previu. Cada item
aqui nasceu de um run **vermelho**, e a correção é o que o run seguintes mediu
de novo.

| O que o CI mediu | Causa | Correção | Como ficou |
|---|---|---|---|
| `P3018` / `42601` — `mismatched parentheses at or near ";"` na migration | o `;` estava DENTRO do literal de `format(...)`, e ele encerra a instrução — o `)` que fecha a chamada ficava órfão | o `;` saiu de dentro do literal; o SQL que o `EXECUTE` executa não leva ponto-e-vírgula | migration aplicada do zero, em Postgres 16 real |
| `permission denied for function criar_membership` (26 de 30 testes de integração) | o escopo de sistema passou a rodar como `app_system`, e a migration `20261020000004` dá `EXECUTE` em `criar_membership` **só** a `app_runtime` | o papel de sistema recebe o mesmo `EXECUTE` — ele faz o mesmo trabalho | integração 145 de 145 |
| o teste "a sessão de SISTEMA continua enxergando as duas" caía com 0 entradas | o serviço de auditoria abria o escopo de SISTEMA na sessão de RUNTIME, e a policy da auditoria exige `current_user = 'app_system'` | o escopo de sistema abre na CREDENCIAL de sistema, em um método privado | 11 de 11 |
| a API não subia: "a senha do papel de runtime é uma senha EXPOSTA" | o `.env.example` ainda carregava a senha que a migration publicava — e o guard a recusa em qualquer `NODE_ENV` | o exemplo leva **placeholder**, e o runbook/README gained o passo de gerar e aplicar as duas senhas | `ci:boot`: API e web no ar |
| `expected '56 call site(s)' to contain '62 call site(s)'` | o serviço de auditoria passou a abrir o escopo em **um** método privado em vez de quatro: 4 × 2 casamentos → 2 | o número sobe com o PR que o mediu — é o comportamento certo de um gate que CONTA | 578 de 578 nos gates |

E um defeito **pré-existente** que o PR carregou junto: os 8 testes de entrada por
convite caíam com "expirado" desde 2026-10-26T12:00Z, porque a fixture usava
`expiresAt` **fixo** (`2026-10-26T12:00:00.000Z`). **MEDIDO na `main`**: os
mesmos 8 caem, com a mesma data — e o CI da `main` está verde porque o último
run dela é de 2026-10-22, antes do prazo. A fixture passou a usar instante
**relativo**; o commit é **separado**, com diagnóstico próprio.

### 9.5 O P0 que o PR #118 MESMO introduziu — e que só apareceu ao revisar o PR

A §9.4 registra o que o CI mediu. O que segue é o que a **revisão** mediu, e
é mais grave que o que o CI mediu: um defeito que a implementação do #118
introduziu, que nenhuma suíte pegou, e que teria quebrado **todo login em
produção**.

**O defeito.** A #118 trocou o disjunto `escopo_atual() = '*'` das policies por
`current_user = 'app_system'` — que é o ponto dela. MEDIDO no Postgres 16 real:
a sessão de RUNTIME com o escopo `'*'` passou a ver **ZERO** empresas e **ZERO**
usuários; a de SISTEMA vê todos. E o **LOGIN** é o caso que usava a sessão de
runtime: `findByEmail(email, null)` acontece antes de existir empresa (não há
header, e um usuário sem membership é invisível sob qualquer outro escopo).
O repositório abria esse escopo pela sessão de runtime — e, depois da #118, ele
via zero linhas. Em produção, todo login falharia com "credenciais inválidas",
sem erro em lugar nenhum.

**Por que nenhuma suíte pegou.** Porque o e2e e a integração sobem a aplicação
com a URI do **DONO** — superusuário, que ignora a RLS por completo — e a spec
de integração do repositório de usuários também. A spec que media a RLS de
verdade media a **sessão**, e o "a sessão de runtime vê zero" foi escrito como
se fosse a correção funcionando. Era a correção funcionando **e** o login
quebrado, na mesma frase.

**A correção** é uma regra, e não um conserto caso a caso: `tenantId` nulo é o
bucket de SISTEMA, e o bucket de SISTEMA é a **credencial** de sistema. O novo
`comEscopoDeEmpresa(prisma, tenantId, fn)` escolhe a credencial pelo próprio
`tenantId`, e todo repositório que aceita `tenantId: string | null` passou a
usá-lo: user, profile, authorization, membership — e o repositório de admin do
#127, que carrega este PR.

**O teste que faltava** está na spec de RLS: o login, pelo **repositório**,
contra o Postgres de verdade, com a credencial que a aplicação usa. E a
fixture foi corrigida pelo caminho — o id do usuário passou a ser UUID **v7**
(o `UserId` só aceita v7) e o `passwordHash` passou a ter o **formato
argon2id** (o mapper hidrata a senha). Sem isso, a fixture media a *exception*,
não o achado.

**MEDIDO**: integração 43 de 43 com a correção, e **1 de 43** com a correção
desfeita. E o gate de escopo ganhou a entrada da nova costura: sem ela, os
call sites que passaram a existir sumiriam do painel — o número cairia de 39
para 20 sem que ninguém tivesse removido um escopo.

**A MESMA CLASSE, OUTRO MÓDULO — e a revisão do PR a achou.** A regra acima
diz que *todo* repositório que aceita `tenantId: string | null` passou a usar
o `comEscopoDeEmpresa`. O `PrismaAuditService` NÃO passou: ele tinha uma
**cópia própria** do helper (`comEscopoDeAuditoria`), e a cópia foi aplicada
em **QUATRO dos SEIS** métodos. `listHistory` e `archive` ficaram na
tradução (`comEscopo` + `escopoDoTenant`), e os dois defeitos são do mesmo
tipo do login — com o agravante de que o `archive` é a **ESCRITA** do
soft-delete: ele morre em 42501 **depois** da exclusão já ter sido gravada, e
o cliente recebia 500 para uma escrita que já tinha efeito. Em `origin/main`
os dois fluxos funcionavam — é **regressão** do #118.

⚠️ A lição da COPIA é a que faltava: a regra foi aplicada aos repositórios que
o plano *nomeou*, e o serviço de auditoria ficou de fora — com a sua própria
versão da regra, o que é pior que não ter regra, porque a duplicata parece
correta. O conserto não é "lembrar do serviço de auditoria": é apagar a cópia
e usar o `comEscopoDeEmpresa` (o DONO da regra), que é o que a §9.5 já
afirmava ter sido feito.

**MEDIDO**: a spec de auditoria passa de 11 para 13 casos; com o conserto
revertido, **2 de 13 caem** (o histórico vazio em silêncio, e o 42501).

**A lição, para quem plans o próximo `PRISMA`:** o defeito não era no código do
escopo, era no **ambiente de teste**. O e2e mede a aplicação com a credencial
que ignora a RLS — então nenhuma suite que suba a aplicação mede a policy. A
regra que faltava: **quem muda a policy tem de medir com a credencial que a
aplicação usa**, e não com a que ignora a proteção. E a segunda, que este
PR pagou: **quem escreve a regra, apaga as cópias** — uma regra duplicada é
uma regra que diverge, e ninguém a mede.

### 9.6 O que ficou FORA (e é a mesma lista da §5, atualizada)

O escopo de tenant continua forgeável: a policy compara
`alvo::text = escopo_atual()`, e uma sessão com a credencial de runtime pode
apontar o GUC para outra empresa. Fechar isso exige ligar o escopo à
**membership** do ator em todas as tabelas — mudança de contrato, não
correção. **O vetor que o scan mediu** (`SET app.tenant_id='*'` devolvendo
todos os usuários de todas as empresas) é o que este PR fecha, e ele é
medido contra Postgres real na spec de RLS.

Os 16 achados P2 do relatório de 2026-10-26 continuam sem issue — e este PR
não os corrige. Três deles são falsos positivos que o próprio relatório
declara.
