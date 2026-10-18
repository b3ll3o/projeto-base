# Plano — corrigir os 6 defeitos da auditoria pós-merge

**Data:** 2026-10-18 · **Base:** `main` @ `176c5f2` (PR #101 mergeado) · **Branch:** `fix/auditoria-6-defeitos`

---

## 0. A regra que decide quase tudo aqui

Este plano corrige **defeitos** — código que contradiz outro código, um contrato ou a
documentação do próprio repo. Ele **não constrói feature**.

Um item que é *código faltando* não se corrige, se implementa — e implementar é decisão
de produto.Onde o achado é lacuna de produto e não contradição, eu **reporto** e digo o
que a construção custaria, em vez de construir.

**A consequência prática:** dois dos seis achados (#102 e #106) têm uma parte que é
correção e uma parte que é decisão de produto, e a parte de produto está nomeada como
tal em cada item. Três dos seis (#103, #104, #105) são correções puras — código que
afirma uma coisa e faz outra.

## 1. Estado verificado antes de planejar

Nenhum item entra sem verificação por comando. Rodando os gates do repo e medindo:

| Verificação | Resultado | Classificação |
|---|---|---|
| `tsc --noEmit` (api + web) | exit 0 | ✅ limpo — **depois** de `prisma generate` |
| `vitest run src/` (api) | **924/924** | ✅ limpo |
| `tooling/scripts/` | 2 failed \| 719 passed | ⚠️ **artefato do sandbox**, ver §2 |
| `prisma generate` ausente | — | ⚠️ **artefato do sandbox**, ver §2 |

**Os dois "problemas" que eu quase reportei e não são defeito** — registrados porque a
armadilha é cara e o próximo vai cair nela:

| Sintoma | Veredito | Medida |
|---|---|---|
| 15 erros de `tsc` em specs (`Property 'invitation' does not exist on PrismaClient`) | **ARTEFATO.** Cliente Prisma não gerado no sandbox | `prisma generate` → exit 0 |
| 2 testes de `check-archive-integrity` vermelhos | **ARTEFATO.** `execFileSync('pnpm', …)` herda Node 20 sem `--config.engine-strict=false` | `pnpm --config.engine-strict=false archive:lint` → exit 0 |

A regra: **gate vermelho só entra no plano depois de re-rodado isolado.**

## 2. Correções — o que este plano implementa

### C0 · 🔴 A imagem prod da API não sobe (#104) — três falhas em cascata

**MEDIDO construindo a imagem a partir do `main` de hoje.** `ls node_modules | wc -l`
→ **16 pacotes**, todos de desenvolvimento. A API declara **26 `dependencies`** e 12
`devDependencies`. `@nestjs`, `@prisma` e o binário `prisma` estão todos ausentes.

As três falhas são **independentes e se mascaram em sequência** — corrigir só a primeira
revela a segunda:

```bash
# stage prod, USER 1001:
$ pnpm --version
  Error: EACCES: permission denied, mkdir '/home/app/.cache/node/corepack/v1'
  $ ls -ld $HOME → ls: cannot access '/home/app': No such file or directory

# com HOME=/tmp (corrige o corepack), o mesmo comando:
  Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@opentelemetry/sdk-node'
```

**(1) `HOME` inexistente.** `apps/api/Dockerfile:62` usa `--no-create-home`, deixando
`HOME=/home/app` sem diretório. O `pnpm` da imagem é shim do corepack, que grava em
`$HOME/.cache`. No stage `base` (antes do `USER 1001`) o mesmo comando responde
`9.12.0` — a falha é do `USER`, não da imagem base.

**(2) Dependências de produção ausentes.** A causa é que o stage `prod` **nunca copia
`/repo/apps/api/node_modules`**, que é onde elas vivem. MEDIDO no stage `builder`, que é a
fonte de todos os `COPY`:

```
/repo/node_modules/@nestjs                  → AUSENTE
/repo/apps/api/node_modules/@nestjs         → PRESENTE
/repo/node_modules/.bin/prisma              → AUSENTE
/repo/apps/api/node_modules/.bin/prisma     → PRESENTE
```

É a topologia do pnpm em workspace: as dependências de um pacote são linkadas dentro do
`node_modules` **do pacote**, e a raiz guarda só o que a raiz declara. O stage `prod` tinha
`COPY … /repo/node_modules node_modules` — 12 devDeps da raiz (eslint, prettier, tsc,
vitest) — e nenhuma das 26 `dependencies` da api.

> **Correção de uma alegação minha, feita pela revisão adversarial deste plano.** A
> primeira versão deste documento dizia que o `COPY` *"não copia os `package.json` de
> `packages/eslint-config`, `packages/shared-types`, `packages/tsconfig` nem o `tooling/*`"*
> e que o `prune` rodava contra um "grafo de workspace incompleto". **É FALSO**:
> `apps/api/Dockerfile:49` é `COPY --from=builder /repo/packages packages` — o diretório
> inteiro, com os `package.json` dentro. A causa é a ausência do
> `COPY … apps/api/node_modules`, acima; o grafo do workspace estava completo. A hipótese
> do grafo incompleto sobreviveu porque a medição seguinte (`pnpm prune` removendo symlinks
> de um `node_modules` que já não tinha as deps) era compatível com as duas leituras, e só
> a comparação dos dois `node_modules` no `builder` separa.

**(3) `NODE_OPTIONS` pré-carrega telemetria que não resolve.** `ENV NODE_OPTIONS="--import
./apps/api/dist/shared/infrastructure/telemetry/init.js"` (linha 73) é aplicado pelo runtime
em **qualquer** invocação de `node` no container, e `init.js` → `tracing.js` importa
`@opentelemetry/sdk-node`, que está em `dependencies` e também não sobreviveu.

**Por que o CI não pega.** `node --check` (linha 56) valida **sintaxe**, não resolução — e
roda **antes** do `ENV` (linha 73), então nem vê o `NODE_OPTIONS`:

```bash
# com o ENV do container (runtime):        node --check … → EXIT=1
# sem o ENV (build, como no Dockerfile):   node --check … → EXIT=0
```

E o job `docker-build-prod` (`ci.yml:224-227`) faz `docker buildx build … --load` e
**nunca executa** a imagem. `grep 'docker run' .github/workflows/` → vazio. O job se
chama "smoke" e não fuma nada.

**Correção:** trocar o `prune` por instalação explícita de produção (elimina a classe
inteira de "prune contra grafo incompleto"), `--create-home` no `useradd`, mover o
`ENV NODE_OPTIONS` para antes do `--check`, e transformar o smoke em smoke de verdade.

**Por que o web não sofre:** `apps/web/Dockerfile:51` usa `CMD ["node", …]` (o
`standalone` do Next), não `pnpm exec`.

---

### C1 · 🔴 `DATABASE_URL` resolve para string vazia no container (#105)

**MEDIDO com `docker compose config`.** `.env.production` com o valor correto:

```
DATABASE_URL=postgresql://projeto:***@postgres:5432/projeto_base?schema=public
```

```bash
$ docker compose config        # sem .env na raiz
level=warning msg="The \"DATABASE_URL\" variable is not set. Defaulting to a blank string."

api:
  DATABASE_URL: ""                                                  ← VAZIO
  DIRECT_DATABASE_URL: postgresql://projeto:***@postgres:5432/…    ← correto
```

Duas regras do Compose se cruzando: a interpolação roda **antes** do `env_file`, e
`environment:` **ganha** de `env_file` — então a chave vazia sobrescreve o valor certo.

Isto é a armadilha que o próprio `docker-compose.yml:95-102` documenta para o
`JWT_SECRET` (*"um default vazio aqui não é neutro, é apaga o segredo que o outro arquivo
tinha"*) — aplicada à linha 79, onde ninguém a replicou.

**Correção:** a omissão de `DIRECT_DATABASE_URL` do `environment:` (comentada nas linhas
107-127) **não protege nada** — `migrate deploy` exige `DATABASE_URL` não-vazio mesmo
usando `directUrl`. As duas chaves precisam do mesmo tratamento.

**Nota de decisão:** o `environment:` vazio **não** pode virar `${VAR:?}`, porque o próprio
arquivo explica que isso quebra `config`/`ps`/`down`. A saída correta é a mesma do
`JWT_SECRET`: **fail-fast no código**, com o nome da variável na mensagem.

---

### C2 · 🔴 `X-Tenant-Id` alheio devolve o diretório de outra empresa (#102)

**MEDIDO contra Postgres real**, com a conta intrusa provando não ter vínculo nenhum:

```
memberships da conta intrusa: 0
users.profile_id da intrusa:   NULL

X-Tenant-Id: <ACME>   → HTTP 200 · 2 usuario(s)  → ana@…, carla@…
X-Tenant-Id: <HEX>    → HTTP 200 · 1 usuario(s)  → bruno@…
```

**Causa.** `users.controller.ts:189`:

```ts
somenteUsuarioId: empresa === null && semDireito ? (request?.user?.sub ?? null) : null,
```

Com header, `empresa !== null`, então o recorte não se aplica. E a suposição implícita —
*"com empresa, a RLS já devolve só os membros"* — responde à pergunta errada:

```sql
usuario_no_escopo(alvo) = EXISTS (… WHERE m.user_id = alvo AND m.tenant_id = escopo_atual())
```

Pergunta **"esse usuário-alvo pertence à empresa do header?"**, nunca **"o ator pertence?"**.
O `JwtAuthGuard` valida o **formato** do UUID e publica; não confere vínculo.

**O que o PR #101 já fechou:** o caso **sem** header (bucket `'*'` devolvia a base
inteira) está fechado e bem fechado — `somenteUsuarioId` = o próprio `sub`.

**Correção (parte determinística):** trocar o gatilho do recorte pela ausência de vínculo
com *aquele* escopo, que o banco já sabe responder. Cobre os dois lados do furo com uma
regra só:

```ts
const semVinculo = perfil.profileId === null;   // findProfileId não resolveu perfil
somenteUsuarioId: (empresa === null || semVinculo) && semDireito ? sub : null,
```

**PARTE DE PRODUTO — não implemento:** a invariante de que *nenhuma* rota deva abrir escopo
a partir de um header não conferido. Isso é mudança de contrato (o header passa a exigir
membership verificado, ou a rota passa a recusar empresa sem vínculo), vale para todas as
24 rotas, e é decisão do dono do produto. Fica registrado em C2-D.

---

### C3 · 🟠 `admin/users` lê a coluna global em vez da membership (#106)

**MEDIDO no banco** — uma conta membro da ACME com perfil:

```
ana@lojadasilva.com.br   membership=bbbbbbbb-…-000000000001   global=NULL
carla@lojadasilva.com.br membership=NULL                     global=NULL
```

A coluna "Perfil atual" lê `users.profile_id` e mostra `<em>sem perfil</em>` **para quem tem
perfil**.

| etapa | arquivo | de onde lê |
|---|---|---|
| tela | `apps/web/app/admin/users/page.tsx:84` | `u.profileId` |
| origem | `apps/api/src/modules/users/application/dto/user.output.ts:35` | `users.profile_id` (**global**) |
| quem autoriza | `prisma-tenant-membership.repository.ts:31` | `tenant_memberships.profile_id` (**por empresa**) |

**Não é caso raro:** `provisionarEmpresaPropria` e `consumirEEntrar` gravam
`users.profile_id: null` explicitamente. Então **toda conta criada pelo produto** tem a
coluna global `NULL` e a tela sempre mostra "sem perfil".

**Correção:** `GET /users` precisa devolver o perfil **efetivo no escopo pedido**. O
`UserOutput.profileId` deixa de ser ambíguo — hoje o nome sugere "o perfil do usuário" e
significa "o do bucket global"; com tenancy o termo não tem leitura única.

---

### C4 · 🟡 Erro de transporte vira "Acesso restrito" (#107)

**MEDIDO por leitura do fluxo.** `obterMeuPerfil()` devolve `null` para **401, 403, 5xx,
timeout e rede caída** — o mesmo `null` de "não sou admin". As quatro telas `/admin/*`
leem isso como veredito:

```tsx
if (me === null || me.isAdmin !== true) → "Esta página exige perfil de administrador."
```

| evento | a pessoa vê | o que aconteceu |
|---|---|---|
| API caiu (502) | "Acesso restrito" | serviço fora |
| token expirou (15 min) | "Acesso restrito" | sessão expirada |
| timeout de 10 s | "Acesso restrito" | rede lenta |
| 403 real | "Acesso restrito" | não é admin |

Nas três primeiras, a pessoa é **administradora legítima** e recebe uma tela que afirma o
contrário. O padrão correto **já existe no mesmo repo**, em `users/page.tsx:56-64`
(`err instanceof ApiError && err.status === 401` → `redirect('/login')`).

O comentário em `perfil.ts` diagnostica certo (`statusCode` não existe em `ApiError`) e
conclui errado: os dois ramos **deviam** devolver coisas diferentes — `null` é o valor do
401, não de um 5xx.

**Correção:** propagar o erro em vez de dissolvê-lo, e nas telas admin distinguir os três
casos (401 → login; 403 → acesso restrito; 5xx → erro com retry).

---

### C5 · 🟡 `GET /admin/permissions` sem um único teste (#103)

**MEDIDO:**

```
grep -rn "admin/permissions" apps/api/test/                    → 0
ls admin-authorizations.controller.spec.ts                     → não existe
grep -rn "listarPermissoes" apps/api --include=*.spec.ts       → 0
grep -c "atribuir\|revogar" profiles.use-cases.spec.ts         → 35
```

Única das 24 rotas declaradas nos controllers sem cobertura, em qualquer camada. As outras
duas rotas do mesmo controller têm e2e HTTP.

**A classe de bug que fica passar:** o `PERMISSIONS` é declarado como *"fonte de verdade"*;
uma chave acrescentada ao array e não aplicada em nenhum perfil, ou removida do array mas
ainda em uso no banco, só quebra em runtime, na tela.

**Lacuna de raiz:** o gate `check-e2e-flow-coverage.ts` reconcilia **as telas do
`page.tsx`** com o inventário, **não as rotas da API**. Uma rota nova entra sem obrigação
de teste por construção e nada acusa.

**Correção:** spec do `AdminAuthorizationsController` cobrindo as três rotas + afirmação de
que `GET /admin/permissions` devolve exatamente `listAllPermissions()`.

---

## 3. Ordem de execução

Sequencial, uma branch, um PR — o fluxo é trunk-based e `main` nunca recebe commit direto.

| ordem | item | por que nesta ordem |
|---|---|---|
| 1 | **C0** imagem prod | sem isso, nada sobe; é o que impede o teste manual dos outros |
| 2 | **C1** `DATABASE_URL` | mesma aresta, mesma execução — emparelhar no mesmo PR |
| 3 | **C0-B** smoke de verdade | o blindagem; sem ele C0 volta em silêncio |
| 4 | **C2** header alheio | segurança; independente dos anteriores |
| 5 | **C3** coluna errada | depende do C2 para o recorte de tenant fazer sentido |
| 6 | **C4** erro de transporte | UX, fail-closed, menor urgência |
| 7 | **C5** rota sem teste | cobertura; fecha a lacuna de raiz |

**C0 e C1 no mesmo PR** porque descrevem o mesmo deploy falhando por lados opostos, e
verificar um exige subir o outro.

## 4. Como cada item é verificado

Sem exceção, **antes** (RED contra o estado real) e **depois** (GREEN), mais o caso
negativo — a prova de que o caminho legítimo não foi colateral.

| item | RED | GREEN | caso negativo |
|---|---|---|---|
| C0 | `ls node_modules \| wc -l` → 16 (só devDeps) | → deps de produção presentes | `node --check` + `node dist/main.js` carregam |
| C1 | `docker compose config` → `DATABASE_URL: ""` | → URL do app arrives | `DIRECT_DATABASE_URL` continua do `env_file` |
| C2 | `X-Tenant-Id` alheio → 2 linhas de outra empresa | → só a própria linha | membro com `users.read` continua vendo o diretório da empresa |
| C3 | membership `X`, global `NULL` → tela diz "sem perfil" | → mostra `X` | conta sem empresa não quebra a tela |
| C4 | 503 → "Acesso restrito" | 503 → erro com retry; 401 → login | 403 real continua dizendo "Acesso restrito" |
| C5 | sem spec → 0 cobertura | spec verde | — |

## 5. O que este plano NÃO implementa

| item | por que não |
|---|---|
| **C2-D** — invariante de que nenhuma rota abra escopo por header não conferido | mudança de contrato, vale para as 24 rotas, decisão de produto |
| **Tela de troca de empresa** no web | feature. `guardarTenant` sem caller é lacuna conhecida; `docs/superpowers/plans/2026-10-17-pr-101-correcoes.md:243` já a registra como R1 |
| **`ALTER DEFAULT PRIVILEGES` mais apertado** | não há tabela hoje que o default exponha (verificado). É dívida para a próxima migration que esquecer o `ENABLE ROW LEVEL SECURITY` |
| **`FORCE ROW LEVEL SECURITY`** | quebraria o leitor da chave no boot (`AssinaturaDeMembership` usa `directUrl`, que é o dono) |

## 6. Riscos

| risco | mitigação |
|---|---|
| C0 muda a imagem prod | `ci:local` + o próprio smoke novo; o build do `docker-build-prod` continua sendo o sinal |
| C2 toca autorização | caso negativo obrigatório: membro com `users.read` **precisa** continuar vendo o diretório da empresa |
| C3 muda o contrato de `GET /users` | `UserOutput` é literal de chaves fixas — o tipo é a trava; quebrar o compilador é o sinal |
| C4 toca 4 telas admin | o `catch` atual é fail-closed; a correção **não pode** afrouxar a checagem, só distinguir o motivo |

## 7. Estado inicial medido

```
main                    176c5f2  (PR #101 mergeado)
issues abertas          #102 #103 #104 #105 #106 #107
gates do preflight      30 registrados
tsc api + web           exit 0 (após prisma generate)
testes api              924/924
```

**Nada foi commitado nem pushado. Imagens e containers de probe removidos.**

## 8. O que a implementação mudou no plano

O plano é um documento; a implementação o corrigiu. O que mudou, e por quê:

### 8.1 Correções de uma alegação minha (a revisão adversarial pegou)

| Alegação | Veredito | Como separei as duas leituras |
|---|---|---|
| O `prune` rodava contra "grafo de workspace incompleto" — o `COPY` não trazia os `package.json` de `packages/*` e `tooling/*` | **FALSO.** `apps/api/Dockerfile:49` é `COPY --from=builder /repo/packages packages`, o diretório inteiro; a imagem construída tem `packages/eslint-config/package.json`, `packages/shared-types/package.json` e `packages/tsconfig/package.json` | Comparando os **dois** `node_modules` no stage `builder`: `node_modules/@nestjs` AUSENTE, `apps/api/node_modules/@nestjs` PRESENTE. A causa é o `COPY` ausente do `apps/api/node_modules` — que eu tinha medido antes de escrever o plano e mesmo assim descrevi errado |
| `prune --prod` era a causa | **FALSO.** Removida a linha e reconstruído: resultado **idêntico** (16 pacotes, `@nestjs` ausente). `prune` é inocente — a raiz não declara `dependencies` nenhuma, os "16 pacotes" são os 8 devDeps da raiz | `sed '52s/^RUN pnpm prune --prod$/# removido/'` + rebuild + medir |
| A correção prescrita (`pnpm install --prod`) funciona | **FALSO, e é a mais séria.** Em workspace ela pede confirmação interativa, não instala nada e — pior — **sai 0**. MEDIDO na imagem: ela deixa `vitest`, `@types` e `eslint` presentes, ou seja, não pruneou. O `COPY` sozinho é o que traz as 26 deps | Removendo o `COPY` e reconstruindo: o build **quebra** com `ERR_MODULE_NOT_FOUND`. Com ele: sobe. A linha do `install` foi REMOVIDA do Dockerfile |
| C1 se resolve removendo a linha 79 do compose | **PARCIALMENTE FALSO.** Remover resolve a URL vazia, mas o `.env.production.example` entregava o papel **DONO** — o que deixa toda a RLS inerte sem erro | `sed -i '79d'` + `docker compose config` → a URL chega. O segundo defeito só apareceu quando olhei para o que o `env_file` passou a decidir |
| A omissão de `DIRECT_DATABASE_URL` do `environment:` "não protege nada" | **FALSO.** A omissão é load-bearing, e é o que o próprio `docker-compose.yml:121-127` documenta: declará-la quebraria o boot em dois lugares (`migrate` e `AssinaturaDeMembership.onModuleInit`) | O problema da `DATABASE_URL` era que ela estava **declarada** com interpolação vazia; a omissão da `DIRECT_…` é justamente a correção |

**A soma de C0 é três erros meus empilhados**, e o terceiro só apareceu porque o primeiro estava errado: causa errada → correção errada → a correção errada mascarada pelo `&&`.

### 8.1b O detalhe que quase deixou passar

A linha inútil que eu commitei era **também a que mascarava um build quebrado**. No `RUN pnpm install --prod … && node --check`, o exit **243** do install era absorvido pelo `&&` porque o `--check` rodava depois e passava. Se o `--check` não existisse, o stage inteiro sairia 0 com a imagem sem dependência nenhuma.

Isto é a mesma classe do `node --check` que o Dockerfile já documentava como "defesa em profundidade" — só que invertido: a defesa passava porque não media a coisa. Mover o `ENV` para antes dele (§8.3) foi o que deu dentes ao gate; e o gate só deu dentes **depois** que o `install` foi embora.

### 8.2 Defeito que eu introduzi e o teste pegou

A primeira versão da guarda do `ENTRYPOINT` usou `$$DATABASE_URL`. No formato JSON com `sh -c` quem expande é o shell **do container**, então `$$` ficava como `$` literal e o teste rodava sobre a **string** `"$DATABASE_URL"` — nunca vazia. MEDIDO: com `$$` a guarda não disparava e o `prisma` recebia a URL vazia. Corrigido para `$`.

### 8.3 Efeito colateral do próprio conserto

`ENV NODE_OPTIONS="--import ./apps/api/dist/…"` usa caminho **relativo**, resolvido contra o CWD de cada processo `node`. Com o `cd /repo/apps/api` que o C0 exige (o binário do `prisma` só existe em `apps/api/node_modules/.bin`), o relativo quebrava: `pnpm exec prisma` procurava `apps/api/apps/api/dist/…`. O caminho passou a absoluto.

Isto é o custo real de um conserto que mexe na topologia do container: cada ajuste faz o anterior aparecer.

### 8.4 Ordem de execução real

O plano previa C0 e C1 no mesmo PR. Na prática **C0 obrigou C1**: sem a URL não há como subir o container para verificar o conserto, e sem o conserto do container não há como verificar o `docker compose config` do C1. E o C2 ganhou 3 testes novos que o plano não previa explicitamente — a mutation (reverter a condição) derruba **exatamente 1** dos 56.

### 8.5 O que o gate do repo cobrou

O `check-docker-drift` limita `apps/api/Dockerfile` a **100 linhas** (`MAX_DOCKERFILE_LINES`). A `main` está em 75; meus comentários levaram a 151. Condensei os blocos — preservando as três medições do `ENTRYPOINT` e as dos outros pontos — e removi o `docker drift` da lista de erros.

Tentei primeiro resolver economizando uma linha e introduzi lixo (`Ch的和urda`) num comentário. **Um Dockerfile é o lugar errado para essa economia**, e o aviso do próprio `stack-code-reviewer` sobre publicação sem nomear o segredo é exatamente a classe disso. Desfiz a linha e cortei conteúdo redundante, não texto.

## 9. Verificação da implementação

| item | RED | GREEN | caso negativo |
|---|---|---|---|
| **C0** | `ls node_modules \| wc -l` → 16 (só devDeps); `@nestjs` e `prisma` ausentes | 26 `dependencies` presentes; `prisma` no `.bin`; `HOME` existe; `pnpm --version` → `9.12.0` | `init.js` (telemetria) carrega; `@nestjs/core` resolvível; `node --check` passa com o `ENV` na frente |
| **C1** | `docker compose config` → `DATABASE_URL: ""`; `pnpm exec prisma` → `Command "prisma" not found` | valor chega pelo `env_file`; `pnpm exec prisma --version` responde | guarda **não** dispara com a URL presente |
| **C2** | `1 failed \| 55 passed` — só o caso do header alheio | `56 passed` | mutation da condição → `1 failed \| 55`, o vermelho é o novo; e2e `08-ownership` + `11-tenant-isolation` → `16/16` |

Suíte completa da API: **927/927** (924 + os 3 novos). `tsc --noEmit` exit 0. Prettier limpo.