# Plano — a revisão do #144: 3 erros e 4 melhorias

> Continuação do plano [`2026-11-03-start-local-sem-p1001.md`](./2026-11-03-start-local-sem-p1001.md).
> Este ciclo trata **o que a revisão do PR #144 achou** (comentário de `b3ll3o`,
> 2026-11-03 21:06Z) e nada mais.

## 0. O estado MEDIDO (o que a revisão viu × o que está no disco hoje)

A revisão foi escrita contra `b56d35c`. O HEAD desta branch é `eba6ab6`, e
**alguns dos achados já foram corrigidos depois**. Verificar antes de mexer é
metade do trabalho — um "conserto" de algo já consertado é um diff que não
corrige nada.

| # | Achado da revisão | Estado MEDIDO em `eba6ab6` | Decisão |
|---|---|---|---|
| **E1** | A CI está vermelha: `pr-refresh-gate: 1 claim(s) divergente(s) fora de parágrafo marcado` (`L66 declarado=6, medido=29`) — o parágrafo de Blast Radius dizia "a doc mudou em **6 arquivos**", fora do marcador `<!--pr-refresh:live-->` | **JÁ RESOLVIDO.** O corpo do PR foi reescrito (a frase hoje não tem número) e a CI está **verde**: `gh pr checks 144` → **8 entradas, todas `pass`**, nos runs `41726549750` (`push`) e `41726562469` (`pull_request`), ambos no SHA `eba6ab6` = HEAD. ⚠️ A medida local (`PR_BODY_FILE=<corpo> pnpm pr:marker` → exit 0) **mediu 0 claims** — o corpo atual só tem claims de suíte (`Test Files 46 passed`), que não são comparáveis contra o diff: um exit 0 com denominador vazio não prova nada. A prova de que o gate tem dente é o **step `pr-refresh-gate` da CI**, que roda com o payload do evento e a base certa | **Não há o que corrigir.** Registrar no corpo do PR que o claim divergente foi resolvido pela reescrita da frase — e **não** recriar número no corpo |
| **E2** | O PR não dá bump de versão: os 6 footers estão **idênticos aos da `main`** (`1.17.0`) | **ABERTO.** Medido: `README.md`, `AGENTS.md`, `docs/MONOREPO.md`, `docs/STACK.md`, `docs/TEMPLATE_USAGE.md` e `.agents/specs/conventions/estrutura-e-versionamento.md` → todos `1.17.0`, e `origin/main` → todos `1.17.0` | **T1** — bump para `1.18.0` (minor: script novo + comportamento de boot observável) |
| **E3** | O README perdeu 2 linhas do troubleshooting — "docker compose diz 'port already in use'" (o sintoma que o `pnpm ambiente:check` agora detecta e nomeia) e "curl /api/v1/health retorna 503" (sem relação com o PR) | **ABERTO.** Medido: `README.md` §Troubleshooting tem 5 linhas; a `main` tinha 6 + a nova do P1001 | **T2** — devolver as 2 linhas; a do "port already in use" **atualizada** para o remédio novo |
| **M4** | O `cause` do `Error` guarda o stack original: `throw new Error(traducao)` perde o stack do Prisma | **ABERTO.** `prisma.service.ts:67` → `throw new Error(traducao);` | **T3** — `new Error(traducao, { cause: erro })` + spec do `cause` |
| **M5** | A constante do container está duplicada entre o app e o tooling, **sem guard**: renomear o container faz o `pnpm dev` mandar `docker start <nome-velho>` | **ABERTO.** `traducao-de-falha-de-conexao.ts:73` e `ambiente-local.ts:56` têm `projeto-base-pg-local`; a receita dona é `docs/como-rodar.md` §1.1 | **T4** — guard que amarra as 3 superfícies |
| **M6** | 3 `docker inspect` para uma informação, **sem timeout**, e "o Docker não respondeu" confundido com "o container não existe" | **PARCIAL.** O timeout **JÁ EXISTE** (`PRAZO_DO_DOCKER_MS = 5_000`, commit `f7789c0` — o `execFileSync` de `inspecionarContainer` já o tem). Os outros dois pontos valem: **3 processos** para uma informação, e o `catch` que devolve `undefined` **não distingue** "não existe" de "o Docker não respondeu" | **T5** — 1 `docker inspect --format` + o estado `dockerRespondeu` + o veredito `docker-nao-respondeu` |
| **M7** | O check cobre a porta da API (`:3000`), mas **não a do web** (`:3001`): se a 3001 estiver ocupada, o `pnpm dev` morre no Next com `EADDRINUSE` cru — exatamente o que o PR existe para eliminar | **ABERTO.** `verificarPorta` olha só `PORT` (3000) | **T6** — asserção da porta do web |

### Um defeito a mais, encontrado no caminho (e está no `main`)

**Marcadores de conflito de merge commitados** em
`.agents/specs/conventions/estrutura-e-versionamento.md:105-109`:

```
<<<<<<< HEAD
=======
| `1.16.0` | **Auditoria de segurança** …
| `1.15.2` | Bump patch …
>>>>>>> bbd0a9a (chore(version): 1.16.0 — a auditoria de seguranca)
```

**MEDIDO: está no `origin/main` também** (`git show origin/main:<path>` → as
mesmas linhas). É anterior a este PR — mas o arquivo é **exatamente** o que o
T1 precisa editar (o footer e a tabela de histórico), e um `<<<<<<< HEAD` em
cabeçalho de tabela é um doc que mente. **T1** limpa os 3 marcadores e
**mantém as duas linhas** (o conteúdo dos dois lados é histórico legítimo).

## 1. As tarefas

Composição: **sequential** na implementação (T3/T4/T5/T6 tocam arquivos
próximos e a spec deles é o mesmo contrato), **parallel** na revisão (§3).

### T1 — Bump de versão (E2) + os marcadores de conflito

| # | Entrega |
|---|---|
| 1.1 | `pnpm tooling:bump-version 1.18.0` — escreve os **quatro** footers do script (`docs/MONOREPO.md`, `docs/STACK.md`, `docs/TEMPLATE_USAGE.md`, `.agents/specs/conventions/estrutura-e-versionamento.md`) |
| 1.2 | **Manuais** — `README.md` (`**Versão:**`) e `AGENTS.md` (`**Versão do documento:**`): o `bump-version` **não** escreve nesses dois (só 4 dos 6), e o gate `check-version-footers` cobra os **seis** |
| 1.3 | Limpar os 3 marcadores de conflito (§0) **e as 2 linhas perdedoras** — o conteúdo delas já está na tabela (`1.15.2` e `1.16.0` existem em outras linhas), e a linha do `1.16.0` perdedora era uma cópia desatualizada do texto do `1.17.0`. **Mantê-las** criaria linhas duplicadas e órfãs (antes do cabeçalho da tabela) |
| 1.4 | **Linha de histórico `1.18.0`** na tabela de `estrutura-e-versionamento.md` — o que este PR entrega, com o **comando** que mede (regra: claim sem comando não entra). A linha vai **no fim**, e a ordem final da tabela é conferida (a tabela tinha `1.17.0` antes do `1.16.0`) |
| 1.5 | Medir: `pnpm tooling:bump-version 1.18.0` → 6 footers `1.18.0`; `pnpm ci:preflight` (o gate `check-version-footers`) verde |

> ⚠️ **Por que `1.18.0` e não `1.17.1`:** o PR traz **script novo**
> (`pnpm ambiente:check`) e **comportamento observável** (o `pnpm dev` passa a
> recusar o start; o P1001 sai traduzido) — a regra do repo é *adição de
> agent/skill = minor bump*, e o mesmo critério vale para script + comportamento.

### T2 — As duas linhas do troubleshooting (E3)

| # | Entrega |
|---|---|
| 2.1 | Devolver a linha do **"port already in use"**, **atualizada**: o remédio novo (`pnpm ambiente:check` → ele diz o **dono** da porta e o comando de parar) é melhor que o `lsof` — mas o `lsof` fica como alternativa |
| 2.2 | Devolver a linha do **"curl /api/v1/health retorna 503"** — **verbatim**: ela não tem relação com este PR, e perdê-la não foi pedido |
| 2.3 | Medir: `wc -l README.md` ≤ 300 (hoje 293 → 295) e `pnpm ci:preflight` verde |

### T3 — O `cause` do erro traduzido (M4)

| # | Entrega |
|---|---|
| 3.1 | `apps/api/src/shared/infrastructure/prisma/prisma.service.ts`: `throw new Error(traducao, { cause: erro })` |
| 3.2 | Spec: o erro lançado tem **`cause` === o erro original** (a mesma instância) — e a `message` continua sendo a traduzida |
| 3.3 | Spec: **o `cause` não reintroduz a senha**. A revisão pede este cuidado explicitamente ("se ele tiver a URL na mensagem, o `cause` a reintroduz no log"). A spec mede a **mensagem do erro original**, não a traduzida |
| 3.4 | ⚠️ O `cause` **ENTRA** no log de boot — e a justificativa de segurança é o **CONTEÚDO** do erro do Prisma, não o `Logger`. MEDIDO: o `main.ts` faz `console.error('Bootstrap falhou:', err)`, e o `util.inspect` do Node imprime a cadeia `[cause]` inteira. E o P1001 real (Prisma 6.19.3) **não** carrega credencial: a mensagem é "Can't reach database server at \`host:port\`", as propriedades enumeráveis são só `clientVersion`/`errorCode`/`retryable`/`name`, e nem a mensagem, nem o `stack`, nem o `util.inspect` têm a senha |
| 3.5 | Spec: o `util.inspect` do erro lançado (o **canal que imprime**) não contém a senha — `message`, `cause.message` e `stack` não bastam, e `JSON.stringify(erro)` seria VAZIO (`message` e `cause` não são enumeráveis) |

### T4 — O guard do nome do container (M5)

**A escolha:** um gate **novo** seria um arquivo novo + registro no preflight +
`RUNNERS` + linha no registro de dentes + linha no catálogo humano. O
`check-runbook-drift` **já é** o gate que compara o runbook com o código real,
**já está** no preflight, **já tem** spec — e a receita do container é
**literal do runbook** (`docker run -d --name projeto-base-pg-local`). Ele é o
dono natural da regra.

| # | Entrega |
|---|---|
| 4.1 | `check-runbook-drift.ts`: terceira classe de claim — **o container do banco local**. Extrai o nome das **3 superfícies**: o runbook (`--name X` da receita do §1.1), o app (`CONTAINER_DO_BANCO_LOCAL` em `traducao-de-falha-de-conexao.ts`) e o tooling (o mesmo nome, em `ambiente-local.ts`) — e **exige que os 3 sejam iguais** |
| 4.2 | As 3 superfícies são lidas como **TEXTO** (o padrão do repo para invariante entre unidades de build: `check-feature-flag-contract`, `check-tenant-scope-source`) — o tooling **não** importa do app, e o app **não** importa do tooling. MEDIDO (grafo do `graphify`, commit `eba6ab6`): as 3 vivem em **3 comunidades diferentes** (386 / 133 / 39) e o caminho mais curto entre elas passa por `ref_node_fs` — um nó genérico de filesystem, não uma dependência. Nenhum import as liga |
| 4.2.1 | A extração é **ancorada na DECLARAÇÃO** (`CONTAINER_DO_BANCO_LOCAL = '…'`), e não na primeira ocorrência do literal: o mesmo nome aparece em **comentários** das mesmas superfícies (o cabeçalho do arquivo fala dele), e um `includes` pegaria a prosa |
| 4.3 | ⚠️ **Anti-vacuuidade**: uma superfície de **CÓDIGO** ausente é **erro** — nunca verde por ausência (classe 5 de `guard-classes.md`). O **runbook** é a exceção: um repo que aponte o banco para um Postgres local (sem container) não tem receita de `docker run --name`, e acusá-lo seria um falso positivo — ele só entra na comparação quando DECLARA um container. E uma ausência **sai sozinha**: a divergência que ela produziria ("o nome difere") seria uma leitura enferrujada (o gate não sabe o nome; ele não sabe que o nome mudou) |
| 4.4 | Spec: 3 casos — os 3 iguais (verde), o app diferente (vermelho, nomeando as 3), superfície de código ausente (vermelho) + a extração ancorada na declaração + o `--name` da receita (e não um `docker start` solto) |
| 4.5 | **Mutação**: trocar o nome no app → o gate tem que reprovar (a prova de que o gate tem dente) — measured no repo REAL, não só na spec |
| 4.6 | Atualizar a **linha do registro de dentes** (`.agents/specs/conventions/ci-defense-in-depth-dentes.md`) e a **linha do catálogo** (`ci-defense-in-depth.md` §Tabela de Checks) — o `check-teeth-registry` reconcilia os dois lados — com os números **re-medidos** (a contagem de testes e os "N de M" envelhecem) — e o **cabeçalho do próprio gate**, que hoje diz "Duas classes de claim" num gate com três |
| 4.7 | Declarar o **escopo** do gate (o que ele **não** mede): o nome em `.husky/pre-push` e nas specs **não** são medidos — são consequência, não fonte; e renomear a **constante** (não o valor) deixa o gate vermelho por "superfície ausente" — quem renomear atualiza o gate |

### T5 — Um `docker inspect`, e o Docker que não responde (M6)

| # | Entrega |
|---|---|
| 5.1 | `inspecionarContainer`: **1** `docker inspect --format` com os 3 campos (`State.Status`, `HostConfig.PortBindings`, `Config.Image`) no **mesmo** template — 3 processos viram 1 |
| 5.2 | O estado ganha `dockerRespondeu`: o `catch` do `docker inspect` **não** devolve mais "o container não existe" para "o Docker não respondeu". A regra é "respondeu **só** quando o daemon disse `no such object`" — case-**IN**sensitive (o binário escreve em minúsculo: `error: no such object: <nome>`), e qualquer outra falha é "não respondeu" |
| 5.3 | `decideSobreBanco`: ramo novo `docker-nao-respondeu` — a mensagem diz que o **Docker** não respondeu (e o remédio é o do socket), e **não** afirma nada sobre o container |
| 5.4 | Spec com os **4 casos MEDIDOS** (Docker 29.1.3): `no such object` → o Docker respondeu; `Cannot connect to the Docker daemon at …` (socket TCP) → não respondeu; `failed to connect to the docker API at …` (socket unix) → não respondeu; `docker` fora do PATH / timeout (stderr vazio) → não respondeu. E o caminho REAL com um `docker` falso no `PATH` que responde como um daemon fora do ar |
| 5.5 | O `timeout` **já existe** (`PRAZO_DO_DOCKER_MS = 5_000`) — o que falta é o `catch` não confundir as duas causas |

### T6 — A porta do web (M7)

| # | Entrega |
|---|---|
| 6.1 | `verificarPorta` passa a medir **as duas** portas: a da API (`PORT`, default 3000) e a do **web** |
| 6.2 | ⚠️ A porta do web **não é uma constante nova**: ela é lida do **dono** — `apps/web/package.json` → `scripts.dev` = `next dev --port 3001`. Hardcodar 3001 seria **a mesma classe de drift** que o T4 fecha (e o T6 seria o próximo `docker start <nome-velho>`) |
| 6.3 | A asserção reusa `decideSobrePorta` — o dono da porta é nomeado do mesmo jeito. ⚠️ E o rótulo **e o sujeito** são parâmetros (`rotulo: 'porta do web'`, `quem: 'O web local'`): a mensagem que diz "A API local não sobe" para a porta do web seria uma afirmação **falsa** (a API sobe; o web é que não sobe) |
| 6.4 | Spec: web em 3001 occupied → veredito com o dono **e** o rótulo do web (e **sem** "A API local"); e o `apps/web/package.json` sem `--port` → o veredito diz que o Next cairia na 3000 (a da API) |
| 6.5 | ⚠️ **O que este T6 NÃO fecha** (declarado, não escondido): a porta do web tem uma **4ª superfície** com `3001` cravado — o default do `ALLOWED_ORIGINS` da API (`apps/api/src/main.ts:27`) e o guard de produção (`:82`). Se a porta do web mudar, o CORS da API tem que mudar junto, e **nada** no repo amarra os dois. Fica como pendência declarada (ver §5) |

### T7 — A doc do PR e o corpo

| # | Entrega |
|---|---|
| 7.1 | `docs/superpowers/plans/2026-11-03-start-local-sem-p1001.md`: uma §9 com o que este ciclo mudou (a §8 é a do ciclo anterior) |
| 7.2 | Corpo do PR: atualizar a seção de **Merge Danger** e a **Evidência** — e **nenhum claim novo sem o comando**; o marcador `<!--pr-refresh:live-->` fica onde a reescrita é legítima |
| 7.3 | ⚠️ O corpo **não** ganha contagem de arquivos/commits em prosa fora do marcador — é exatamente o que derrubou a CI (E1). A contagem é escrita pelo hook, que mede |

### T8 — A casa toda verde

| # | Entrega |
|---|---|
| 8.1 | `pnpm tooling:test` · `pnpm turbo run test:unit` · `pnpm ci:preflight` · `pnpm format:check` · `pnpm typecheck:tooling` |
| 8.2 | `pnpm ci:local` (o gate completo, com o app no ar) |
| 8.3 | `pnpm pr:marker` com o corpo final → exit 0 |
| 8.4 | Commit + push |

## 2. O Definition of Done

- [x] Os 6 footers de versão em `1.18.0` e **iguais entre si** (gate `check-version-footers` → `ok=true`)
- [x] A linha `1.18.0` no histórico de `estrutura-e-versionamento.md`, e os 3 marcadores de conflito **removidos** (as 2 linhas perdedoras descartadas — o conteúdo já estava na tabela), com a ordem conferida
- [x] O README com as **7** linhas de troubleshooting (5 + as 2 devolvidas), ≤ 300 linhas
- [x] O `Error` traduzido com `cause` === o erro original, e a spec provando que nem a mensagem traduzida, nem o `cause`, nem o `util.inspect` (o canal que imprime) carregam a senha
- [x] O gate do container: os 3 nomes **iguais** → verde; um diferente → **vermelho, nomeando as 3 superfícies**
- [x] `inspecionarContainer` faz **1** `docker inspect`, e "o Docker não respondeu" ≠ "o container não existe" (4 casos medidos)
- [x] A porta do web (`:3001`, lida do `apps/web/package.json`) verificada, com o dono nomeado e o rótulo do web
- [x] `pnpm tooling:test`, `pnpm ci:preflight`, `pnpm format:check`, `pnpm typecheck:tooling` **verdes**
- [ ] `pnpm pr:marker` com o corpo final → **exit 0**
- [ ] Nenhum claim novo no corpo do PR sem o comando que o reproduz

## 3. A revisão do plano (2 etapas, em paralelo)

O `review-router` despacha **spec** (o plano faz o que promete?) e **qualidade**
(a forma, o DRY, a doc) em paralelo. O implementador **não** revisa o próprio
trabalho: o revisor é um subagent novo, e o diff é **commitado** antes do
despacho (um reviewer que mede reverte o worktree).

### O que a revisão de SPEC achou (e o que mudou no plano)

A revisão (subagent novo, lente de spec) devolveu **11 achados**: 1 blocker,
4 major, 4 minor, 2 info. **Nenhum invalidou a forma do plano** — o esqueleto
(T1–T8, a cobertura dos 7 achados, a escolha do T4, o T6.2) estava certo. O que
faltava era precisão em 5 tasks, e a maior delas viraria o veredito ao contrário.

| # | sev. | O que mudou |
|---|---|---|
| 1 | blocker | Os literais de stderr do Docker do plano estavam errados. **MEDIDO** no Docker 29.1.3: o binário escreve `error: no such object` em **minúsculo**, e o "daemon fora" tem **dois** textos (`Cannot connect to the Docker daemon at …` no socket TCP, `failed to connect to the docker API at …` no unix). A regra implementada é "respondeu **só** com `no such object`", case-**IN**sensitive — e cobre as 4 causas (incluindo `docker` fora do PATH e timeout) |
| 2 | major | O `cause` **entra** no log de boot (`console.error` no `main.ts:124` → o `util.inspect` imprime a cadeia `[cause]`). A segurança vem do **CONTEÚDO** do erro do Prisma (medido: a mensagem nomeia o alvo; as propriedades enumeráveis são só `clientVersion`/`errorCode`/`retryable`/`name`), e não do `Logger`. A spec passou a medir o `util.inspect` — o canal que imprime |
| 3 | major | "Manter as 2 linhas" do conflito criaria linhas **duplicadas** e órfãs. As 2 perdedoras foram **descartadas** (o conteúdo já está na tabela) e a ordem da tabela foi conferida |
| 4 | major | `decideSobrePorta` tinha "porta da API" e "A API local não sobe" cravados — reusá-lo para o web produzia um veredito **falso**. O rótulo e o sujeito viraram parâmetros, e a spec afirma o rótulo do web e a **ausência** de "A API local" |
| 5 | major | A porta do web tem uma **4ª superfície** com `3001` cravado (`ALLOWED_ORIGINS` na API). Declarada fora de escopo, com o mecanismo (§4) — não escondido |
| 6 | minor | Os números do registro de dentes (18 testes, "2 de 18", "1 de 18") envelheceram: **re-medidos** (24 testes; 2/24, 1/24 e 2/24 nas 3 mutações) |
| 7 | minor | A extração ancorada na **DECLARAÇÃO** da constante, não na 1ª ocorrência do literal (o mesmo nome está em comentários) |
| 8 | minor | A evidência do E1 agora cita o **SHA** e as 8 entradas do `gh pr checks`, e diz que a medida local (0 claims) não prova nada — o denominador é vazio |
| 9 | minor | O cabeçalho do `check-runbook-drift` dizia "Duas classes" num gate com três — atualizado |
| 10 | info | "registro em 4 lugares" → **6** |
| 11 | info | A linha restaurada do 503 culpa o `postgres` do Compose (que desde o #91 não é alcançável da máquina) — anotado, sem mexer |

## 4. Fora de escopo (e por quê)

| Item | Por quê |
|---|---|
| **A Fase 6 do plano original** (o guard que proíbe `ports:` no `postgres` de produção) | Demanda **distinta** (hardening de produção). Já declarado no plano original, com o instrumento descrito |
| **A medição ao vivo com `docker stop` no container de quem desenvolve** | O auto mode bloqueia a interrupção de workload; a auto-recuperação já foi medida com um container descartável |
| **A porta do OTEL (`4317`/`4318`) e a do Postgres** | O `pnpm dev` não sobe o collector; o `postgres` do Compose não é alcançável da máquina (é o fato do #91, e o runbook §1.1 é o dono) |
| **Reescrever o scanner do `pr-refresh`** | E1 já está resolvido pela reescrita da frase; mexer no scanner seria instrumentar um defeito que não existe |
| **A versão "profunda" do check** (3 sondas do CLI do Prisma) | Está no §4 do plano original, com o gatilho para reabrir |
| **Um gate NOVO para o container** | O `check-runbook-drift` já é o dono da invariante "runbook × código", já está no preflight e já tem spec. Gate novo custaria registro em **6 lugares** (o gate, a spec, o `preflight.ts`, o `preflight-gates.ts`, o registro de dentes e o catálogo) para medir a mesma coisa |
| **Amarrar a porta do web ao `ALLOWED_ORIGINS` da API** | O default do CORS (`apps/api/src/main.ts:27`, e o guard de produção em `:82`) tem `3001` cravado — e a porta do web vem do `apps/web/package.json`. Se as duas divergirem, o navegador bloqueia a API em silêncio (não é um erro cru: é um CORS bloqueado). Fechar isso é uma **invariante app↔app**, que este `pnpm ambiente:check` não é o lugar de medir — e o conserto (gate novo, ou o `ALLOWED_ORIGINS` do ambiente local) é uma demanda distinta. **Declarado, não esquecido** |
| **A linha do troubleshooting "503 → `docker compose logs postgres`"** | Restaurada como veio (a revisão pediu), mas ela culpa o `postgres` do Compose — que desde o #91 não é alcançável da máquina. **Corrigida**: a linha nomeia os **dois** bancos (o log do Compose e o log do container da máquina) |

## 5. O que foi implementado (2026-11-05) — com o comando que mede

| # | Entrega | Medida |
|---|---|---|
| 1 | **6 footers em `1.18.0`** | `pnpm tooling:bump-version 1.18.0` → 4 arquivos; `README.md` e `AGENTS.md` manuais (o script não os escreve, e o gate cobra os 6). `checkVersionFooters({repoRoot: '.'})` → `{"ok": true, "errors": []}` |
| 1 | **O rodapé do README re-medido** | `ls .agents/specs/conventions/*.md \| grep -vE 'README\|gaps\|examples\|historico\|apendice' \| wc -l` → **24** (o README dizia **23** — claim desatualizada, agora com a data) |
| 1 | **Os marcadores de conflito** | `grep -c '^<<<<<<< \|^>>>>>>> ' .agents/specs/conventions/estrutura-e-versionamento.md` → **0** (antes: 3). As 2 linhas perdedoras foram descartadas (o conteúdo já estava na tabela) e a ordem final é `… 1.15.2, 1.16.0, 1.17.0, 1.18.0` |
| 2 | **As 2 linhas do troubleshooting** | `README.md` §Troubleshooting: 5 → **7** linhas. A do "port already in use" agora manda o `pnpm ambiente:check` (que nomeia o **dono** da porta), e a do 503 voltou como veio |
| 3 | **O `cause`** | `throw new Error(traducao, { cause: erro })`. A spec mede o `util.inspect` do erro lançado (o canal que o `console.error` imprime) — e um P1001 **real** (Prisma 6.19.3, URI com senha): mensagem `"Can't reach database server at \`127.0.0.1:59999\`"`, enumeráveis `['clientVersion','errorCode','retryable','name']`, `cause: undefined`, e **nenhuma** ocorrência da senha na mensagem, no `stack` nem no `util.inspect` |
| 4 | **O gate do container** | `checkRunbookDrift({repoRoot: '.'})` → `ok=true`. **Mutação medida**: renomear a constante no app → `ok=false` com `runbook=projeto-base-pg-local · app=projeto-base-pg-NOVO · tooling=projeto-base-pg-local`; restaurado → `ok=true`. A **spec** também cai (2 de 24) com a mutação |
| 4 | **Os números do registro de dentes** | `npx vitest run --root .tooling/scripts/ci check-runbook-drift` → **24 testes**; mutações: `if (!scripts.has(s))` → **2 de 24**, `if (!envExamples.has(k))` → **1 de 24**, `if (distintos.length > 1)` → **2 de 24** |
| 5 | **1 `docker inspect`** | O formato único é `{{.State.Status}}␟{{.Config.Image}}␟{{json .HostConfig.PortBindings}}` (separador `U+001F` — MEDIDO no Docker 29.1.3: `exited␟postgres:16-alpine␟{"5432/tcp":[{"HostIp":"127.0.0.1","HostPort":"5434"}]}`). Antes: 3 processos |
| 5 | **"o Docker não respondeu"** | 4 casos medidos: `no such object` → respondeu; `Cannot connect to the Docker daemon at …` → não; `failed to connect to the docker API at …` → não; `docker` fora do PATH / timeout → não. O veredito novo é `docker-nao-respondeu` (a mensagem **não** afirma nada sobre o container, e o remédio é `docker info`) |
| 6 | **A porta do web** | `portaDoWeb()` lê o `apps/web/package.json` → **3001** (o dono, não uma constante nova). O check agora imprime `✓ porta do web (:3001): livre`. E o `package.json` sem `--port` → veredito `porta-do-web-desconhecida` (o Next cairia na 3000, a da API) |
| — | **As suítes** | `pnpm tooling:test` → **402** (18 arquivos) + **781** (46 arquivos); `pnpm turbo run test:unit --filter=@projeto/api` → **1092**; `pnpm ci:preflight` → **0 erro(s)**; `pnpm format:check` → ✓; `pnpm typecheck:tooling` → ✓ |
| — | **O grafo** | `graphify update .` → 5.880 nós, 12.195 arestas, 436 comunidades, no commit `eba6ab6`. As 3 superfícies do nome do container vivem em **3 comunidades** (386 / 133 / 39), e o caminho mais curto entre elas passa por `ref_node_fs` — **nenhum import as liga** |
