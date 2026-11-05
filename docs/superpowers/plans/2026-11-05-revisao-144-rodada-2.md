# Plano — a 2ª rodada de revisão do #144: 2 erros e 3 melhorias

> Continuação de [`2026-11-03-revisao-144-correcoes.md`](./2026-11-03-revisao-144-correcoes.md).
> Este ciclo trata **a 2ª revisão do PR #144** (comentário de `b3ll3o`,
> 2026-11-05 12:47Z) — os 5 achados que ela deixou abertos — e nada mais.

## 0. O estado MEDIDO (a revisão de 2026-11-05 × o disco de hoje)

A 2ª revisão mediu contra o diff `b56d35c..HEAD` (9 commits novos). O HEAD
desta branch é `444a943` e **é o mesmo do remoto** (`git rev-parse HEAD
origin/feat/start-local-sem-p1001` → o mesmo SHA), então a leitura abaixo é do
código que vai para o merge.

| # | Achado | Estado MEDIDO em `444a943` | Decisão |
|---|---|---|---|
| **E1** | O check da imagem mente: `(estado.imagem ?? '').startsWith('postgres:')` só casa com a forma curta. `docker inspect` devolve `Config.Image` **como a pessoa digitou** — e a forma que o mundo usa é a **qualificada** (`docker.io/library/postgres:16-alpine`, copiada do Docker Hub). O veredito `container-imagem-inesperada` diz "que não é do Postgres" (é) e **a auto-recuperação não dispara** (o `docker start` é o propósito do check) | **ABERTO.** `.tooling/scripts/ci/ambiente-local.ts:272` → `startsWith('postgres:')`. MEDIDO por execução (a sonda da revisão): `postgres:16-alpine` → `subir-container`; `docker.io/library/postgres:16-alpine` → `container-imagem-inesperada`; `postgres` → `container-imagem-inesperada`; `bitnami/postgresql:16` → `container-imagem-inesperada`. A spec cobre só a forma curta (`postgres:16-alpine`, linha 194) e a forma obviamente errada (`outra-imagem:1`, linha 215) — **a qualificada não é coberta** | **T1** — `nomeDaImagem()` (basename → sem digest → sem tag) + 3 casos de spec |
| **E2** | Este PR e o [#145](https://github.com/b3ll3o/projeto-base/pull/145) bumparam para a **MESMA** versão (`1.18.0`) e editam as **MESMAS** linhas: `git merge-tree` acusou `CONFLICT (content)` em `.agents/specs/conventions/estrutura-e-versionamento.md` e em `README.md`. As duas linhas de `1.18.0` são **textos diferentes** para a mesma versão | **ABERTO.** Os 6 footers dos dois PRs estão em `1.18.0`; as duas linhas de histórico (`1.18.0` = *start local* no #144 · `1.18.0` = *4 skills de terceiro* no #145) são diferentes. Os 2 PRs tocam os mesmos 8 arquivos. MEDIDO: o #145 está **verde (8/8)** e **sem nenhum achado aberto**; o #144 tem 5 achados abertos (este ciclo) | **T5** — o #144 vai para `1.19.0` (a colisão some) |
| **M1** | A spec do Prisma **fabrica** o erro: ela inventa a frase `"Can't reach database server at \`localhost:5432\`"`. Se um upgrade do Prisma mudar a frase, a tradução **degrada em silêncio** para a mensagem neutra — e a spec continua **verde**, medindo o erro que ela mesma inventou | **ABERTO.** `apps/api/src/shared/infrastructure/prisma/traducao-de-falha-de-conexao.spec.ts:13` fabrica a mensagem. ⚠️ **MEDIDO (Prisma 6.19.3, erro real, porta fechada):** a mensagem de verdade é `"Can't reach database server at \`127.0.0.1:59999\`\n\nPlease make sure your database server is running at \`127.0.0.1:59999\`."` — com crases, e o regex `/at \`([^\`]+)\`/` casa. **A tradução funciona no erro real**; o defeito é o **acoplamento não estar preso** | **T2** — spec de **integração** com o P1001 de verdade + a contrapartida (o veredito neutro) na unitária |
| **M2** | A lista de `.env.example` do gate é **escrita à mão** e ninguém a prende: `chavesDeEnvExample()` lê 4 caminhos literais. Um `.env.example` novo em outro pacote não entra na varredura, e a lista não está em asserção de spec nenhuma | **ABERTO.** `.tooling/scripts/ci/check-runbook-drift.ts:306-311` → a lista literal. MEDIDO: o repo tem **exatamente** os 4 (`.env.example`, `.env.production.example`, `apps/api/.env.example`, `apps/web/.env.example`) — não há furo vivo, o furo é para a frente | **T3** — a lista deixa de ser lista: varredura derivada do disco, com o diferencial preso em spec |
| **M3** | `ambiente-local.ts` tem **1.017 linhas** — o maior arquivo de harness do repo (o próximo é o `check-audit-skills.ts`, com 428). A separação que o próprio arquivo já faz (decisão × efeito) pede mais um corte: o **adaptador do Docker** é uma unidade só, testável por igual, e sai inteira sem mudar nenhum contrato | **ABERTO.** `wc -l .tooling/scripts/ci/ambiente-local.ts` → **1017**. O arquivo já separa `decideSobre*` (decisão) de `inspecionarContainer`/`containersNaPorta`/`subirContainer`/`dockerRespondeu`/`postgresPronto` (efeito) | **T4** — o adaptador do Docker sai para `.tooling/scripts/ci/adaptador-docker.ts` |

### Um achado que a revisão não listou (medido no caminho, e é do mesmo tipo do M1)

O **mesmo** `adaptador-docker.ts` não pode existir sem uma consequência: o gate
`check-runbook-drift` lê o nome do container **como TEXTO** em
`.tooling/scripts/ci/ambiente-local.ts` (`SUPERFICIES_DO_CONTAINER`, linha 122).
A constante `CONTAINER_DO_BANCO_LOCAL` **fica** em `ambiente-local.ts` (ela é
constante de domínio, não do adaptador), e o regex do gate
(`/(?:export\s+)?const\s+CONTAINER_DO_BANCO_LOCAL\s*=\s*'([^']+)'/`,
`check-runbook-drift.ts:139`) continua casando. O T4 tem de **medir** isso — sem
medir, o split pode deixar o gate verde por inercia (a classe 5 de
`guard-classes.md`).

## 1. As tarefas

Composição: **sequential** na implementação (T1/T3/T4 tocam o mesmo arquivo e
o T2 cruza o app com o tooling), **parallel** na revisão (§3).

### T1 — E1: a imagem qualificada é a do Postgres (e a auto-recuperação dispara)

| # | Entrega |
|---|---|
| 1.1 | `nomeDaImagem(imagem)` em `ambiente-local.ts`: `split('@')[0]` (sem digest) → `split('/').pop()` (sem registro) → `split(':')[0]` (sem tag). O veredito passa a comparar `nomeDaImagem(estado.imagem) === 'postgres'` |
| 1.2 | Spec: `docker.io/library/postgres:16-alpine` → `subir-container` (**a forma qualificada — a que faltava**); `postgres` (sem tag) → `subir-container`; `bitnami/postgresql:16` → `container-imagem-inesperada` (o `postgresql` do Bitnami **não** é o Postgres do projeto — e **não** deve ser religado) |
| 1.3 | **DIFERENCIAL:** a spec que apaga a comparação (`nomeDaImagem(...) === 'postgres'` → `=== 'nunca'`) tem de ficar **vermelha** — sem isso, a spec mede o fixture e não o código |

> ⚠️ **Por que basename e não só `startsWith`:** `docker.io/library/postgres:16-alpine`
> → basename `postgres:16-alpine` → nome `postgres`. A forma **curta**
> (`postgres:16-alpine`) continua caindo; e `bitnami/postgresql:16` →
> `postgresql` ≠ `postgres` → o check **não** religa um container que não é o
> banco (o efeito colateral em máquina de quem desenvolve).

### T2 — M1: o P1001 de verdade (a spec deixa de fabricar o erro)

| # | Entrega |
|---|---|
| 2.1 | Spec **nova** `apps/api/src/shared/infrastructure/prisma/traducao-de-falha-de-conexao.integration.spec.ts`: um `PrismaClient` de verdade apontado para uma **porta fechada** (`datasourceUrl`), `$connect()` → o **P1001 real** → a tradução **nomeia o alvo**. A spec falha se o Prisma mudar a frase |
| 2.2 | A mesma spec afirma que o erro real **não carrega a senha** (o `util.inspect` do erro, que é o canal que imprime) |
| 2.3 | **Contrapartida** na spec unitária: fora do formato esperado, o veredito é o **neutro** — ele diz a causa e o remédio (`pnpm ambiente:check`, o runbook) e **não** afirma o que não sabe (não diz "o banco local", não manda `docker start`) |
| 2.4 | A spec unitária **deixa de fabricar** a forma do erro: a forma real (`at \`host:port\`` + a 2ª frase "Please make sure…") é a que a spec de integração mede — e a unitária passa a **derivar dela**, não inventar |

> ⚠️ **Por que a spec de integração e não a unitária:** o `PrismaClient` importado
> é o **client gerado** (`prisma generate`), que não existe num clone novo — e
> a suíte unitária tem de ser verde sem ele. O projeto `integration` roda no
> CI **depois** do `db:generate` (`.github/workflows/ci.yml:174`), e esta spec
> **não precisa de banco**: só de uma porta que ninguém escuta. MEDIDO: o
> `$connect()` contra a porta fechada falha em **125 ms** — o engine não
> espera, a conexão é recusada na hora.

### T3 — M2: a lista de `.env.example` deixa de ser lista

| # | Entrega |
|---|---|
| 3.1 | `chavesDeEnvExample()` passa a **derivar** do disco: varredura recursiva do repo por `.env.example` / `.env.production.example`, pulando `node_modules`, `.git`, `dist`, `coverage`, `.next`, `.turbo`, `build` |
| 3.2 | Spec do **diferencial**: um `.env.example` num pacote novo (fora dos 4 literais) **entra** na varredura — com a lista escrita à mão, ele **não** entraria |
| 3.3 | A varredura não pode varrer `node_modules` (lá há centenas de `.env.example`) — o spec afirma o limite |

### T4 — M3: o adaptador do Docker sai do `ambiente-local.ts`

| # | Entrega |
|---|---|
| 4.1 | Novo `.tooling/scripts/ci/adaptador-docker.ts`: `EstadoDoContainer`, `ContainerNaPorta`, `publicaPortaNasBindings`, `dockerRespondeu`, `inspecionarContainer`, `containersNaPorta`, `servicoComposeDe`, `subirContainer`, `postgresPronto`, `PRAZO_DO_DOCKER_MS`, `FORMATO_DO_INSPECT`, `SEPARADOR_DO_INSPECT` |
| 4.2 | `ambiente-local.ts` importa do adaptador; `CONTAINER_DO_BANCO_LOCAL` **fica** (constante de domínio) |
| 4.3 | ⚠️ **O gate não pode enfraquecer:** `check-runbook-drift` continua lendo as **3** superfícies (runbook, app, tooling) e a 4ª (o hook) — medido depois do split, com o **mesmo** mutante de nome que a revisão usou |
| 4.4 | A spec do tooling passa a importar o adaptador do **seu** módulo (uma origem só) |
| 4.5 | ⚠️ **Nenhum gate novo:** `check-harness-owner` só exige declaração de posse para *harness* (executável ou com shebang) — um `.ts` sem shebang **não** é harness. `check-harness-location` proíbe `check-*.ts` em subdiretório — `adaptador-docker.ts` está na raiz de `.tooling/scripts/ci/` e não começa com `check-` |

### T5 — E2: o #144 vai para `1.19.0` (a colisão com o #145)

| # | Entrega |
|---|---|
| 5.1 | `pnpm tooling:bump-version 1.19.0` — escreve os **quatro** footers do script (`docs/MONOREPO.md`, `docs/STACK.md`, `docs/TEMPLATE_USAGE.md`, `.agents/specs/conventions/estrutura-e-versionamento.md`) |
| 5.2 | **Manuais** — `README.md` (`**Versão:**`) e `AGENTS.md` (`**Versão do documento:**`): o `bump-version` **não** escreve nesses dois, e o gate `check-version-footers` cobra os **seis** |
| 5.3 | A linha de histórico `1.18.0` vira `1.19.0` (é a linha **deste** PR) — e o texto ganha **o que este ciclo entrega**, com o comando que mede |
| 5.4 | O corpo do PR declara a regra para quem mergear depois: **se o #145 entrar primeiro** (ele está verde e sem achados abertos), a sequência fica `1.17.0 → 1.18.0` (skills) `→ 1.19.0` (start local); **se o #144 entrar primeiro**, o #145 tem de renumerar para `1.20.0` |

> ⚠️ **Por que `1.19.0` e não `1.18.1`:** o defeito do E2 não é "a versão é
> pequena" — é "**dois PRs abertos claimam a mesma versão com textos
> diferentes**". O conserto é tirar a coincidência, e o único número
> disponível acima de `1.18.0` é `1.19.0`. E `1.18.0` **pertence** ao #145
> (as skills de terceiro foram criadas DEPOIS do #144 — #145 é de
> 2026-11-03T22:22Z, e o #144 é anterior no mesmo dia).
>
> ⚠️ **O ATrito do merge, MEDIDO** (num worktree descartável, `main` + #145 +
> este PR — não uma leitura de `git merge-tree`):
>
> | | #144 em `1.18.0` | #144 em `1.19.0` |
> |---|---|---|
> | arquivos em conflito | 2 | 6 (os 5 footers + a tabela de histórico) |
> | a tabela de histórico | conflito: **duas linhas `1.18.0`**, textos diferentes | **merge automático**: `1.18.0` (skills) e `1.19.0` (start local), na ordem |
> | os footers | merge automático (mesmo valor dos dois lados) | conflito **mecânico**: uma linha, dois valores |
>
> O atrito é o **mesmo**: a renomeação que o E2 pede ("quem mergear por
> último tem de renumerar para `1.19.0`") **é** escrever um valor diferente do
> que a `main` tem — os 6 conflitos aparecem de qualquer jeito no momento do
> merge. A diferença é que aqui eles são **visíveis e declarados** (neste
> plano e no corpo do PR), e não descobertos na hora do merge.

### T6 — o corpo do PR e as docs tocadas

| # | Entrega |
|---|---|
| 6.1 | O corpo do PR é reescrito: as claims measured, o marcador `<!--pr-refresh:live-->` no parágrafo certo, e **o que este ciclo entrega** — sem número que o scanner não consiga reproduzir |
| 6.2 | `docs/como-rodar.md` §1.1: a receita do container nomeia a imagem `postgres:16-alpine` — e o check agora **reconhece** a forma qualificada. A linha fica (a receita é a que cria o container) |
| 6.3 | A doc da nova unidade: `.tooling/scripts/ci/adaptador-docker.ts` **não** entra na matriz do `check-doc-coverage` (que cobre bounded context, rota do App Router e package) — medido, não presumido |

## 2. O que este plano **não** faz (e por quê)

- **Não** cria gate novo. Cada T fecha uma classe com o instrumento que já
  existe (a spec é o instrumento do M1/M2/M3; o `check-runbook-drift` é o do
  T4). Um gate novo seria infraestrutura para um defeito que a spec pega.
- **Não** mexe na tradução do P1001 (a mensagem, o regex, o `cause`). O
  M1 é sobre a **spec** que não prende o acoplamento — não sobre a
  tradução, que foi **medida** funcionando contra o erro real.
- **Não** renumera o #145. O #145 é de outro dono; o que este PR faz é
  **não claimar** a mesma versão, e **dizer** no corpo quem renumera.
- **Não** abre a `ALLOWED_ORIGINS` da API (a 4ª superfície da porta do web) —
  é uma invariante app↔app, declarada no PR como demanda distinta.

## 3. A revisão

Duas revisões **paralelas** sobre o diff implementado:

1. **Qualidade** — o diff está certo? (o `nomeDaImagem` casa com as formas
   reais?; o split do adaptador não quebrou o gate do nome?; a spec de
   integração mede o erro real?)
2. **Convenção** — o diff respeita o repo? (português, ≤300 linhas, TDD,
   documentação no mesmo PR, versionamento, `pnpm ci:local`)

Depois: `pnpm ci:preflight` + `pnpm tooling:test` + `pnpm turbo run test:unit
--filter=@projeto/api` + `pnpm --filter @projeto/api test:integration` +
`pnpm format:check` + `pnpm typecheck:tooling`.

## 4. A REVISÃO DO PLANO (o que ela mudou)

O plano foi revisado por **dois** agentes paralelos (um de exatidão técnica,
um de convenções do repo) antes da execução. As 5 tarefas saíram como
estavam — o diagnóstico técnico do E1/M1/M2/M3 se sustentou — mas a revisão
achou **buracos de envelope** que mudaram o como:

| Achado da revisão | Decisão |
|---|---|
| **TDD não é o diff**: o `tdd-enforcer` valida a **história do git** (commit de teste antes do de implementação; commit RED; commit GREEN) | Onde a task **tem** RED (T1 e T3), a história mostra os **dois commits** — o RED é a spec que falha (5 de 76 e 2 de 36, medidos), o GREEN é a implementação. Onde a task **não tem** RED (T2 é só spec — o defeito era a spec não prender o acoplamento; T4 é refatoração pura), o commit é um só, e o **dente** está no mutante medido |
| **O `review-router` é o caminho canônico**: a skill `review-routing` declara como anti-padrão "pular router e dispatchar reviewers manualmente" — e a matriz pede `monorepo-specialist` (blocking, para `.tooling/scripts/ci/**`), `release-versioning-specialist` (o diff bumpara 6 footers), `test-writer` (`*.spec.ts`), `stack-code-reviewer` (toda alteração de código) e `doc-sync`/`documentation-specialist` (`docs/**` e `.agents/specs/**`) | A §3 passa a ser o **`review-router`**, com a evidência em `.agents/runs/<ts>-review-<n>.yaml` e o **loop de fix/re-review** (findings BLOCKING/IMPORTANT sempre disparam correção) |
| **`pnpm ci:local` é obrigatório antes do push** (`git-workflow.md`) — e ele inclui o `ci:boot`, que **exige o banco local de pé** | A §3 termina com `pnpm ci:local` (não com uma lista de subcomandos), e o pré-requisito do banco fica declarado |
| **Rebase antes do push**, e **revisão de novo depois do rebase** (`git-workflow.md`) | Passo explícito antes do push |
| **`docs/como-rodar.md` está a 1 linha do teto** (299 de 300, contagem do gate) e o plano adicionava uma | A mudança no runbook é **de data, não de tamanho** (cabeçalho "Revisto em" + §1.4): zero linha nova. E as docs que **não** mudam são declaradas no corpo do PR (§1.2 pede dívida declarada, não silêncio) |
| **A varredura de `.env.example` com lista de pulo é a mesma classe do M2** (outra lista escrita à mão) | T3.1 mudou: **`git ls-files` primeiro** (é o `.gitignore` do repo que exclui o `node_modules` — uma fonte só), com a varredura do disco como reserva **avisada** (`advisories`). O fixture da spec virou um repo git, com `.gitignore` — a forma do repo real |
| **O M3 não tinha critério de aceite** — e o split não baixa o arquivo de 1.043 (o que foi partido) para 300 | Declarado: o alvo do corte é a **unidade Docker** (o adaptador, 268 linhas), e o que sobra (809 linhas no arquivo de decisão) é a próxima fatia, nomeada |
| **Claims numéricos sem o comando que os reproduz** (`tamanho-e-revisao.md` §4) | Cada número do plano ganhou o comando: 428 (`wc -l .tooling/scripts/ci/check-audit-skills.ts`), "centenas de `.env.example`" (`find . -path '*/node_modules/*' -prune -o -name '.env.example' -print \| wc -l` no `node_modules`), 125 ms (a spec de integração mede), "exatamente os 4" (`git ls-files -- '*.env.example' '*.env.production.example'`) |
| **A citação do regex do gate não era literal** | Corrigida para o literal de `check-runbook-drift.ts:139` |
| **`state-aware-planning` (camada 0) e `retrospective-capture` (plano ≥ 3 tasks) disparavam** | A §0 deste plano **é** o estado medido (commitada, com o comando que reproduz cada número) — um snapshot separado, gerado depois, seria um registro datado de uma medição que não aconteceu naquela data. O que a retro devolve é a **linha no ledger** (`.agents/runs/memory-triage.md`), e ela foi paga: a memória `spec-so-do-helper-nao-cobre-a-ligacao` (do ciclo anterior) nunca tinha ganhado linha, e o `check-memory-crystallization` acusava — o preflight local estava **vermelho** por causa disso |

### O que a revisão NÃO mudou

- As 5 tarefas e o diagnóstico delas — todos **medidos** contra o código.
- A decisão do E2 (`1.19.0`): a colisão entre os dois PRs abertos é real e
  independe da ordem de merge, e o único conserto que o #144 controla é
  **não claimar** a mesma versão que o #145.

## 5. A REVISÃO DO DIFF IMPLEMENTADO (o `review-router`, e o que ela achou)

O `review-router` despachou 7 reviewers (4 pulados com motivo) e gravou a
evidência em `.agents/runs/20261105T134833Z-review-02.yaml`. Veredito: **os 5
achados do ciclo FECHOU** — cada um com o dente medido (mutação + diferencial
contra o repo real) — e abriu **2 IMPORTANT + 4 MINOR + 1 INFO**.

| Achado | O que é | Correção |
|---|---|---|
| **I-01** | `docs/fluxo-desenvolvimento.md:169` afirmava **6** ocorrências de `Date.now()`; o disco tem **12**. E a PR re-datou o doc mantendo o número velho | O número foi corrigido (com a decomposição real: 4 no `ambiente-local.ts`, 3 no `boot-local.ts`, 2 no `check-audit-skills.ts`, 3 em specs), e o doc foi re-datado. ⚠️ Re-datar um doc obriga a **re-medir todos os números dele** — e o "41 gates" também estava velho (o comando do próprio doc devolve **44**). Os 3 lugares foram corrigidos, e os **outros** números do doc foram medidos um a um (memórias 30 ✓, `.claude/agents` 3 ✓, `process.exit` 3 ✓, `specialist` 0 ✓) |
| **I-02** | A varredura derivada só enxergava o **versionado** — um `.env.example` novo, sem `git add`, produzia gate **vermelho** acusando uma chave que ESTAVA no disco. Era uma **regressão**: a versão anterior lia o disco | `git ls-files --cached --others --exclude-standard` — o `.gitignore` continua sendo a fonte única do que fica de fora, e um arquivo novo **sem versionar** passa a contar. Spec nova para o caso |
| **M-01** | O split deixou **3 imports pendurados** (`dockerRespondeu`, `publicaPortaNasBindings`, `servicoComposeDe`) — nenhum gate pega, porque o `.tooling/` não é pacote do workspace e o `tsconfig` não declara `noUnusedLocals` | Removidos. MEDIDO: `tsc --noEmit --noUnusedLocals` → **0** ocorrências em `ambiente-local.ts` (os que restam são pré-existentes, de outros arquivos) |
| **M-02** | A linha de histórico dizia "1.017 linhas" — o arquivo **realmente partido** tinha **1.043** (1.017 era o tip da 1ª rodada, +26 do `nomeDaImagem` e da spec) | A linha e o corpo do PR passam a dizer 1.043, com o 1.017 explained |
| **M-03** | O registro de dentes tinha o parágrafo do "furo que a 2ª revisão achou" **duplicado verbatim** na mesma célula | A duplicata foi removida. ⚠️ E no caminho: o diferencial nomeava **3** superfícies, e são **4** (o `pre-push` entrou na 1ª rodada) |
| **M-04** | Uma **fixture** `.env.example` versionada conta como "chave declarada" → o gate não acusa uma chave que só existe em fixture (falso **negativo**). Hoje não há fixture (`git ls-files` → exatamente os 4 reais) | **Declarado, não corrigido** — e o porquê está no corpo do PR: excluir fixtures é **outra lista escrita à mão**, que é a mesma classe que o M2 acabou de matar. O furo é para a frente, e nenhum gate o acusa |
| **N-01** | `bitnami/postgres:16` religa (o namespace é descartado) enquanto o irmão `bitnami/postgresql:16` recusa | **Não é defeito**: o container religado é o `projeto-base-pg-local`, que por construção é o banco local de quem desenvolve. Registrado |

O denominador do `check-runbook-drift` foi **re-medido** (36 → **37** testes) e
o registro de dentes (`ci-defense-in-depth-dentes.md:70`) reescrito com os
números novos — inclusive a mutação do `--others` (o achado I-02), que não
existia antes.
