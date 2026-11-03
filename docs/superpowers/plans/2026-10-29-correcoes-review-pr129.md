---
state_snapshot: .agents/runs/state-snapshot-20261029T221802Z-correcoes-pr129.md
demand_slug: correcoes-review-pr129
date: 2026-10-29
branch: docs/melhoria-documentacao-aplicacao
base_main_sha: 194d305b88b176139379330baf07b622d3939910
---

# Plano — as correções que a revisão do PR #129 pediu

> A revisão do [PR #129](https://github.com/b3ll3o/projeto-base/pull/129) (head
> `c65c594`) deixou **veredito: nenhum blocker** e **5 achados**. Este plano
> fecha os 5.
>
> **Escopo, com honestidade:** 4 dos 5 achados são **correções** de arquivos
> existentes (T1–T4). O 5º (A3) é um **produto novo** — um gate que não
> existia. Ele está aqui porque a revisão o pediu explicitamente ("a regra mais
> forte do PR não tem instrumento"), mas é **o maior bloco do plano** e o
> revisor do plano outziu: se A3 for adiado, o plano volta a ser o que o
> título promete.

---

## 0. O que está em jogo

A revisão deixou **5 comentários inline** e **1 comentário de topo** com 5
seções. O §0 mapeia **os 5 inline** (a lista que a revisão numerou) e
marca onde cada um é fechado.

| # | Achado (inline) | Tipo | Onde | Medido | Fecha em |
|---|---|---|---|---|---|
| **A1** | O gate não vê rota dentro de **route group** `(grupo)` | defeito | `check-doc-coverage.ts:102` | planta `apps/web/app/(marketing)/inicio/page.tsx` → `ok=true, errors=0` | **T1** |
| **A2** | O gate **não tem IIFE**: rodá-lo avulso não mede nada | defeito | `check-doc-coverage.ts:243` | `pnpm exec tsx …/check-doc-coverage.ts` → `EXIT=0`, sem saída | **T2** |
| **A3** | O spec **codifica a premissa errada** como regressão | defeito | `check-doc-coverage.spec.ts:83` | o `it()` afirmava `[]` para `(grupo)` **e** `@slot` | **T1** (RED) |
| **A4** | A convenção prescreve exceção que o gate não implementa | melhoria | `documentacao.md:148` | a regra é prosa; o gate não lê exceptions | **T3** |
| **A5** | Forma abreviada de rota lê como caminho de raiz | melhoria | `docs/api/users.md:27` | `POST /:id/restore` vs a notação do contrato `{id}` | **T4** |

**E o achado do §3 do comentário de topo** — que é o **A3 do plano**, e uma
**melhoria** (não um defeito): *"Doc que mente é P0" — a regra mais forte do PR
não tem instrumento*. Fecha em **T5** (o gate novo) + **T6** (os 5 drifts que
ele descobre).

> Por que a distinção importa: **A3-inline** é um **defeito** — um teste que
> fixa o comportamento errado. **A3-plano** é uma **melhoria** — um
> instrumento que não existe. Misturar os dois no mesmo rótulo foi o que a
> revisão deste plano apontou (§0 não correspondia à lista da revisão).

### Por que A1 e A2 são **defeito** e não "melhoria"

A1 é a **classe 2 do `guard-classes.md`** ("só a forma rara"): o gate acerta em
14 rotas e erra em **zero** — porque a forma que erra **não existe** no repo
hoje. `find apps/web/app -type d \( -name '*(*' -o -name '*@*' \)` → **vazio**.
A regra está gravada **errada** antes do primeiro `(grupo)` existir, e o dia
que alguém criar um `app/(marketing)/` a rota passa a existir **sem** aparecer
no catálogo — e o gate segue verde. A revisão está certa no mecanismo: o
**comportamento** do App Router é que `(grupo)` não materializa segmento na
URL, mas a página **dentro** dele **é** rota (`/inicio`).

A2 é pior que uma feature faltando: é o gate **medindo nada** quando alguém o
invoca direto. `check-tenant-scope-source.ts` — o irmão — tem o bloco IIFE de
4 linhas pelo mesmo motivo. Sem ele, o `import` num spec varre o repo inteiro
(por isso o spec não pode importar o arquivo sem IIFE — **é a razão de o
arquivo não ter IIFE hoje**? Não: hoje ele **não tem** IIFE, e o spec importa
`listarRotas` direto, o que é seguro; o IIFE precisa existir para o modo CLI
**e** para o import não disparar a varredura).

> ⚠️ **A2 tem uma consequência que o plano tem de respeitar:** o bloco IIFE
> tem que ser `import.meta.url === \`file://${process.argv[1]}\``, como nos
> irmãos — e `check-harness-location.ts` exige que o gate viva **na raiz** de
> `.tooling/scripts/ci/`. Ambos já são verdade para o arquivo.

### O que a revisão **confirmou** (e não precisa de correção)

- O gate novo **tem dentes**: 3 mutações caem de 14 (medido pela revisora).
- As correções factuais do PR **são verdade** (reconfirmei `engines.node`,
  22 paths / 28 operações, 6 docs de API × 21 linhas de tabela).
- A correção do `openssl rand -base64` → `-hex 32` é **a mais valiosa** do PR
  (63% de falha na senha do papel; reconferido).

---

## 1. Decisões de escopo

### D1 — `(grupo)` desce, `@slot` **não**

A revisora sugeriu "`continue` só para `@`". O plano **segue**, e a
justificativa é a Next.js oficial (MEDIDO em
`vercel/next.js` → `app-paths.ts` → `normalizeAppPath`):

```ts
if (isGroupSegment(segment)) return pathname   // (grupo) → ignorado na URL
if (segment[0] === '@') return pathname        // @slot   → ignorado na URL
```

Os **dois** são removidos da URL. A diferença é **o que a página dentro deles
significa**:

| Diretório | O que é | Rota? |
|---|---|---|
| `(grupo)` | agrupamento **organizacional**; a página dentro é uma rota normal com path sem o grupo | **SIM** — `/inicio` |
| `@slot` | **rota paralela**; a página dentro é renderizada *dentro* do layout pai, no mesmo segmento | **NÃO** — é o mesmo endereço do pai |

A revisora está certa nos dois casos: `(grupo)` → descer; `@slot` → pular. A
**correção** que ela propôs para o spec ("separar os dois casos") é a que o
plano executa: hoje o `it()` **junta** os dois e afirma `[]` para os dois.

### D2 — o path que o gate mede é o **path relativo do arquivo**, não a URL

Este é o ponto onde a revisão e o repo divergem, e o repo tem a razão
documentada — em
[`.agents/memory/documentation-specialist.md`](../../../.agents/memory/documentation-specialist.md)
("A rota do frontend é medida por menção do path"):

> **Contexto:** derivar a URL a partir da estrutura de diretórios do App
> Router quebra em route groups `(x)`, slots paralelos `@x` e intercepting
> routes.
> **Decisão:** o gate exige que o catálogo `docs/web/rotas.md` **mencione o
> path relativo do arquivo** (`apps/web/app/admin/flags/page.tsx`). É mecânico
> e não depende de interpretar o roteador.

E a doc do catálogo diz o mesmo (§1: "para cada `page.tsx` / `route.ts` sob
`apps/web/app/`, o **path relativo ao repo** tem de aparecer aqui. É por isso
que a coluna **Arquivo** traz o path completo").

**Consequência:** o gate **não** remove o segmento `(grupo)` do path que mede.
`app/(marketing)/inicio/page.tsx` → o path relativo do arquivo é
`apps/web/app/(marketing)/inicio/page.tsx` — **com** o grupo — e é esse que o
catálogo tem que mencionar. Remover o segmento faria o gate exigir um path
que **não existe no disco**, e o catálogo passaria a citar um endereço que
nenhum `ls` encontra.

> ⚠️ **Correção (2026-10-29, após a revisão deste plano):** a primeira
> versão deste plano justificava a decisão com uma perna **falsa** — "e o
> `check-doc-refs` acusaria o link quebrado". **Não acusa:** o gate
> **mascara** código inline (`check-doc-refs.ts:104` — `content.replace(/`[^`\n]+`/g, …)`)
> antes de casar links, e o catálogo cita **todo** path de rota como código
> inline. MEDIDO: um doc com o path quebrado em inline code **e** em link
> markdown → só o **link** é acusado. A perna boa — "o path não existe no
> disco, e o catálogo §1 manda citar o path **do arquivo**" — continua
> valendo, e é a que está escrita acima. A falsa foi removida **também** do
> cabeçalho de `check-doc-coverage.ts`.

O que muda em relação ao hoje é **só** que o gate deixa de **pular** a
subárvore: `(grupo)` passa a ser **descido**, e o path relativo do arquivo
(incluindo o grupo) é o que o catálogo tem que citar.

### D3 — A3 é uma **classe de gate**, não uma lista de correções manuais

A revisora propôs o caminho: "a convenção exige que cada afirmação numérica
venha **com o comando que a reproduz**... Esse par é comparável por script".

E o inventário confirma que o par **existe** no corpus: **18 ocorrências** do
formato "`comando` → `valor`" nos **6 docs de API**, que são **8 comandos
distintos** (6 greps de controller + 2 `node -e` do `openapi.json`). As
**outras** occurrences do corpus (as de `docs/web/rotas.md`, `docs/STACK.md`,
`docs/MONOREPO.md`, `docs/como-rodar.md`, `docs/fluxo-desenvolvimento.md`) são
formato **3** — comando sem `→`, derivação por `arquivo:linha`, ou número sem
comando — e **não** são parseáveis sem um parser de linguagem natural.

**E há 5 claims que já mentem hoje** (§3). Isso muda o escopo de A3: não é
"instrumentar uma classe para o futuro", é **"instrumentar uma classe que já
está quebrada no repo"**.

O instrumento: um gate novo, `check-doc-claims`, que **extrai** o par
(comando → valor) do doc, **roda o comando**, e compara. Sem shell de doc
arbitrário: o comando vem do **registry** (§4), não do texto do doc — o doc
**aponta** para a entrada do registry pelo texto exato do comando.

---

## 2. Tarefas

Ordem por dependência. Cada uma é RED → GREEN → REFACTOR (tdd.md).

### T1 — `[A1]` O gate desce em `(grupo)` e para em `@slot`

**Arquivos:** `.tooling/scripts/ci/check-doc-coverage.ts`,
`.tooling/scripts/ci/check-doc-coverage.spec.ts`

**RED:** o spec novo exige que uma rota dentro de `(grupo)` **apareça** em
`listarRotas`, e que uma dentro de `@slot` **não**. Hoje o `it()` existente
afirma `[]` para os **dois** — é a premissa errada que a revisão apontou, e
**é o teste que precisa mudar**.

**GREEN:**
- `SEGMENTOS_NAO_ROTA` → vira **dois** casos: `@slot` (pula a subárvore) e
  `(grupo)` (desce).
- O path relativo do arquivo **mantém** o segmento `(grupo)` (D2).
- O cabeçalho do gate passa a dizer **qual** dos dois é pulado e **por quê**,
  com a citação do `normalizeAppPath`.

**REFACTOR:** o nome `SEGMENTOS_NAO_ROTA` deixa de servir (agora é só `@`).
Renomear para o que ele é.

**Dente:** mutação no repo real — plantar `apps/web/app/(marketing)/inicio/page.tsx`
sem cite no catálogo tem de dar **vermelho**; e plantar `apps/web/app/@modal/x/page.tsx`
tem de ficar **verde** (é `@slot`, não é rota). Denominador do spec: 14 → 15.

### T2 — `[A2]` O gate mede quando rodado avulso

**Arquivos:** `.tooling/scripts/ci/check-doc-coverage.ts` (IIFE),
`.tooling/scripts/ci/check-doc-coverage.spec.ts` (teste de CLI)

**RED:** um teste que **executa o binário de verdade** (`execFileSync(TSX,
[SCRIPT])`) contra um repo plantado, e exige `stderr` com o erro nomeado e
`exit 1`. O padrão existe: `check-branch-up-to-date.spec.ts:280-305` faz
exatamente isso (executa o binário, compara `stderr` com `linhasDoRelato`).

**GREEN:** bloco IIFE de 4 linhas no fim do arquivo, no padrão dos irmãos
(`check-tenant-scope-source.ts`, `check-branch-up-to-date.ts`):
```ts
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = checkDocCoverage({ repoRoot: '.' });
  for (const linha of linhasDoRelato(r)) console.error(linha);
  process.exit(r.ok ? 0 : 1);
}
```
`linhasDoRelato` vem de `./check-types` — é o helper que **imprime as três
categorias** (erros, ressalvas, skip). Usar `r.errors` direto perderia o
`skipped` com motivo, que é exatamente o que o `check-types.ts` existe para
impedir.

**Cuidado que o plano tem de respeitar:** com o IIFE, **importar** o arquivo
num spec dispara a varredura? Não — `import.meta.url` do módulo **não** é
`process.argv[1]` quando o spec importa. O IIFE só dispara no modo CLI. Mas
`check-harness-location.ts` exige que o arquivo **não** tenha shebang (ele
classifica arquivo com shebang e nome errado como harness órfão) — o IIFE não
é shebang, então segue válido.

### T3 — `[A4]` A exceção declarada vira instrumento

**Arquivos:** `.tooling/scripts/conventions/documentacao.md` (§5),
`.tooling/scripts/ci/check-doc-coverage.ts`,
`.tooling/scripts/ci/check-doc-coverage.spec.ts`

**O mecanismo que a convenção já prescreve** (`documentacao.md:148`):
> "Uma exceção é uma **linha escrita**, com o motivo — o mesmo padrão de
> `tdd.md`. Exceção não declarada = gate quebrado. Hoje o gate **não tem**
> exceção."

O repo **já resolveu esse padrão** em `tdd.md`:
`check-test-set-covered.ts` lê a tabela de exceções de `tdd.md` e a reconcilia
**nos dois sentidos** (exceção declarada que não se aplica = documentation
lie).

**RED:** spec que exige (a) uma unidade listada na tabela de exceções
**não** gera erro; (b) uma exceção **declarada e inaplicável** gera erro
("a exceção já não vale — remova a linha"); (c) uma unidade **não** listada e
sem doc continua gerando erro.

**GREEN:**
- `documentacao.md` §5 ganha a tabela de exceções (mesmo formato de `tdd.md`:
  colunas por **NOME**, nunca por índice — a mesma doutrina de
  `check-test-set-covered.ts` e `check-e2e-flow-coverage.ts`).
- `check-doc-coverage.ts` lê a tabela, no padrão de `declaredNoOps()`: lê
  **por nome de coluna**, para sobreviver a reordenação.
- A §5 da convenção passa a dizer o que é verdade: "o gate lê a tabela
  §5.x; hoje a tabela tem **N** linhas".

**⚠️ De onde a convenção é lida — o acoplamento que a primeira versão do
plano não dizia.** O gate passa a ler **um `.md`**, e isso tem duas
consequências que precisam ser decididas aqui:

1. **De qual raiz?** Do `repoRoot` — **não** do `process.cwd()`. O precedente
   é `check-test-set-covered.ts:211`
   (`readFileSync(join(opts.repoRoot, '.agents/specs/conventions/tdd.md'))`).
   Ler do `cwd` aplicaria a convenção **real** a um repo **plantado** de
   teste — e o braço "exceção declarada e inaplicável" viraria "documentation
   lie" espúrio.
2. **Convenção ausente = o que?** O `check-test-set-covered` **falha alto**
   ("sem ela este check é teatro"), e o mesmo vale aqui: a tabela de exceções é
   a **única** fonte delas, e um gate sem fonte mede nada. A saída: o gate
   **aceita override** (`opts.excecoes`), como o spec precisa para plantar uma
   exceção; e **convenção ausente = ERRO**, não `skipped` — "verde por
   ausência" é a classe 5 do `guard-classes.md`, e `skipped` aqui seria
   justamente o silêncio que a regra proíbe.

   ⚠️ **Por que isso não vira "todo caso de cobertura em vermelho" nos specs:**
   o spec **escreve** a convenção no repo plantado (o helper `convencao()` do
   `check-doc-coverage.spec.ts`), então o gate tem a fonte em todo caso.

   ⚠️ Isso é uma **decisão** que muda o comportamento do gate, e o §5 da
   convenção tem que **declará-la** — senão o próximo leitor descobre o
   `erro` num repo plantado e não sabe se é bug.

   ⚠️ **Correção (2026-11-02, revisão da branch):** a primeira versão dizia
   "**convenção ausente = `skipped` COM MOTIVO**, não erro". A
   implementação deu **erro**, e o spec documenta o erro — a decisão certain
   é a do implementation, e a **convenção** passou a declará-la (a §5 do
   `documentacao.md` agora diz, com o motivo). O plano é que estava
   errado.

**Estado hoje:** a matriz §3 é fechada — **toda** unidade tem doc. Então a
tabela começa **vazia**, e o mecanismo é provado pelo spec (mutação), não
pelo corpus. É o que o `check-test-set-covered` faz com a `tdd.md` quando a
tabela tem 3 linhas — aqui começa com 0 e o **dente** do spec prova que
funciona. Declarar uma exceção sem necessidade seria inventar dívida.

### T4 — `[A5]` A forma abreviada some do `users.md`

**Arquivo:** `docs/api/users.md:26-28`

**GREEN:** as 5 rotas por `:id` passam a citar a forma do contrato (`{id}`),
que é a notação do `openapi.json` (`/api/v1/users/{id}` — MEDIDO) e a das
**outras** 5 docs de API (`tenancy.md` e `profiles.md` já usam `{id}`). A
prosa deixa de parecer rota de raiz.

**Sem guard, e isso é declarado.** A T4 é uma edição de **prosa** — não há
RED, não há spec, e **nenhum** instrumento a mede. Uma versão anterior deste
plano prometia que o `check-doc-claims` (T5) vigiaria esse trecho; **não
vigia**: o registry do T5 cobre as **18 ocorrências** de par comando → valor
dos 6 docs de API, e o trecho da §1 do `users.md` **não tem comando nem
valor** — não há o que conferir ali. O que a T4 faz é deixar a notação do
doc igual à do contrato, e é isso que a torna **verificável a olho** — o
`openapi.json` é a fonte, e qualquer leitor pode casar.

> ⚠️ **Correção (2026-10-29, após a revisão deste plano):** a primeira
> versão deste plano declarava um "dente" para a T4 que **não existe**. Um
> plano que inventa um instrumento para medir uma frase não instrumenta nada —
> só cria a impressão de cobertura.

### T5 — `[A3-plano]` O instrumento que faltava: `check-doc-claims`

**Arquivos:** `.tooling/scripts/ci/check-doc-claims.ts` (novo),
`.tooling/scripts/ci/check-doc-claims.spec.ts` (novo),
`.tooling/scripts/ci/doc-claims.json` (novo — o registry),
`.tooling/scripts/ci/preflight-gates.ts`,
`.tooling/scripts/ci/preflight.ts`,
`.agents/specs/conventions/documentacao.md` (§5),
`.agents/specs/conventions/ci-defense-in-depth-dentes.md`,
`.agents/specs/conventions/ci-defense-in-depth.md` (§Tabela de Checks),
`docs/fluxo-desenvolvimento.md` (3 contagens + 1 linha na §4),
`AGENTS.md` (§1.2, se a lista de gates mudar)

**RED:** spec que exige que um claim **errado** no doc seja vermelho, e que um
claim **certo** seja verde. O **dente tem de ser uma mutação no repo real**:
trocar `7` por `8` no `users.md` e ver o gate cair.

**GREEN — o instrumento:**

1. **Registry** (`.tooling/scripts/ci/doc-claims.json`): cada entrada declara
   o **doc**, o **texto exato do comando** que o doc cita, e a **derivação**
   nativa que recalcula o valor a partir do código. O registry é a fonte do
   **como medir**; o doc é onde o par (comando, valor) **aparece** e é
   conferido.

   > ⚠️ **Correção (2026-11-02, revisão da branch):** a primeira versão pedia
   > um campo `valor` na entrada ("o **valor** que o doc afirma ao lado").
   > Esse campo foi **removido** — era **morto** (trocá-lo de 7 para 99 deixava
   > o gate verde) e era uma **terceira cópia** do número, que a regra de
   > `dry.md` proíbe. O número tem duas cópias: a que o código produz (o
   > dono) e a que o doc afirma.

2. **Gate:** para cada entrada do registry —
   - localiza o par no doc (comando **e** valor, na proximidade declarada);
   - **recalcula o valor** a partir do repo;
   - compara o valor recalculado com o que o doc afirma.
   - Divergência → **vermelho**, nomeando o doc, o comando e os dois valores.

3. **⚠️ Como o valor é recalculado — a parte que a primeira versão errou.**
   A primeira versão do plano dizia "o gate usa `execFileSync` com **argv**,
   nunca string de shell". Isso **não roda** os comandos que o §4 lista: eles
   são **pipelines** (`grep … | wc -l`) e usam **glob** (`*.controller.ts`), e
   `execFileSync('grep', [...])` não interpreta `|` nem expande glob — o
   pipeline passaria o `|` como nome de arquivo. E o caminho de fuga
   (`execSync(cmdDoRegistry)`) **passa** o `check-shell-injection`: a regra do
   gate só acusa template literal com interpolação e concatenação com literal;
   um **identificador** não é nenhum dos dois — ou seja, a "restrição dura de
   segurança" daria **falso senso de segurança**.

   A saída é: **o registry declara a DERIVAÇÃO, não o comando de shell.** Cada
   entrada carrega uma derivação **nativa** (`contar-decoradores-http`,
   `contar-paths-openapi`, `contar-operacoes-openapi`) e o gate a executa em
   TypeScript, **sem shell nenhum**. O **comando** continua no registry como o
   **texto que o doc tem que citar** — é ele que amarra o doc ao valor —, mas
   **não é executado**. O registry é, portanto, uma superfície de **dados**,
   não de execução: um PR que edita o registry edita **o que o gate mede**
   (o caminho, o glob), não o número.

   ⚠️ **O registry ainda é a superfície de verdade** — é versionado, então um PR
   pode editá-lo. A defesa é a **revisão do PR** (o registry muda de forma
   visível), não o gate. Dizer isso no cabeçalho é melhor que fingir que o
   registry é inerte.

   > ⚠️ **Correção (2026-11-02, revisão da branch):** a primeira versão
   > declarava que "um PR que edita o registry edita **números**", e a entrada
   > do registry tinha um campo `valor`. **Esse campo era morto**: MEDIDO, trocar
   > o `valor` de uma entrada de 7 para 99 deixava o gate **verde**. O número
   > tem **duas** cópias — a que o **código** produz (o dono) e a que o **doc**
   > afirma — e uma terceira, livre, que nada lia. Ele foi **removido**: o
   > registry declara **como medir**, não **quanto**.

4. **Escopo:** os **8 comandos distintos** dos 6 docs de API (§4) — são os
   claims mais repetidos (**18 ocorrências**) e 100% determinísticos.

**⚠️ Restrição dura de segurança — nada de shell.**
Um doc é texto livre; se o gate executar o que está escrito no markdown, um
PR pode injetar `curl evil.sh | sh` no doc e o CI executa. Por isso:
- o gate **não executa comando nenhum** — a derivação é **nativa** (TypeScript),
  como o item 3 acima;
- o **texto do comando** fica no registry como o que o doc tem que **citar**
  (string exata) — é a âncora que amarra o doc ao valor, e nada mais;
- `check-shell-injection.ts` continua verde porque o gate não usa `execSync`
  **nem** `execFileSync`.

**Dente:** a mutação do repo real (trocar um valor no doc) + a **provável
dente do gate**: um registry cujas entradas apontam para derivação **errada**
tem de dar vermelho (a classe 3 — "guard que dispara em si mesmo" — significa
que a isenção tem de pagar pelo trabalho que declara).

### T6 — As 5 claims que já mentem (o payoff do T5)

T5 **descobre** as 5. Cada uma é corrigida **na fonte**:

| # | Doc:linha | Afirma | Real | Correção |
|---|---|---|---|---|
| 1 | `docs/fluxo-desenvolvimento.md:267` | `grep -c specialist …/preflight.ts` → **1** | **0** | corrigir para 0 e ajustar a prosa ("o hit é um comentário" não existe mais). ⚠️ **a causa**: o comentário que o citava saiu no `129015a9` (#66, 2026-10-08) — **não** no `6296b32`, que é o commit deste PR |
| 2 | `docs/fluxo-desenvolvimento.md:170` | `grep -rn 'Date.now()' tooling/ .tooling/` → **1** | **6** (3 em `boot-local.ts`, que é **código de produção**) | corrigir o número **e** a afirmação "nenhuma em código de produção" — que hoje é **falsa** |
| 3 | `.agents/specs/conventions/documentacao.md:173` | `wc -l` → **333** | **230** | o ledger **encolheu** no `6296b32` (333 → 230) porque as pendências fechadas foram para o arquivo irmão. ⚠️ a seção é a **§6** ("Quando NÃO aplicar"), não a §5 |
| 4 | `docs/fluxo-desenvolvimento.md:135` | `grep -rn 'review:route\|specialist:route' …` → "só as linhas do `package.json`" | **0** | **dois** defeitos: (a) o grep **sem `-E`** não casa `\|` como OR; (b) o `package.json` **não está** entre os paths buscados — a frase e o comando descrevem coisas diferentes. ⚠️ acrescentar `-E` **só** aos mesmos paths **continua devolvendo 0** (MEDIDO) |
| 5 | `docs/STACK.md:193` | `git log --oneline v1.11.0..origin/main` → **2** shas | **22** linhas | claim de **classe 7** (envelhece). ⚠️ trocar por "após a tag, `N` commits" **também** envelhece. O fato que o leitor precisa é **se** foi released, não **quantos** commits passaram |

⚠️ **Item 3 muda a §6 da convenção**: com 230 linhas, o ledger de pendências
**não** é mais uma exceção do teto — é um doc normal. Mas o bullet carrega
**dois** fatos: (i) o ledger está acima do teto — **falso hoje** — e (ii)
"registrar um item novo não pode exigir podar outro" — que **continua
verdadeiro** (é a razão de o ledger existir). **Decisão:** manter o bullet
**sem** a exceção do teto, reescrito como "o ledger guarda só o que está
aberto; uma pendência que fecha sai para o arquivo irmão". Preserva (ii) e
mata (i).

⚠️ **Item 4 — o par fechado:** o comando novo **e** o resultado novo. O
comando que responde à pergunta do doc ("os scripts existem mas nenhum hook
os invoca") é `git grep -nE 'review:route|specialist:route' -- .husky .github`
→ **vazio**, e a prosa vira "os dois scripts existem no `package.json` mas
**nenhum hook os invoca**". Deixar "corrigir o comando e o resultado" seria
delegar ao implementador uma frase sem valor — que é o que o item 5 condena.

---

## 3. O que o T5 encontra (MEDIDO 2026-10-29)

Os 5 drifts **reproduzidos** por mim, um a um:

```
$ grep -c specialist .tooling/scripts/ci/preflight.ts        → 0     (doc diz 1)
$ grep -rn 'Date.now()' tooling/ .tooling/ | wc -l            → 6     (doc diz 1)
$ wc -l .agents/specs/conventions/ci-defense-in-depth-pendencias.md → 230  (doc diz 333)
$ grep -rn 'review:route|specialist:route' … | wc -l          → 0     (doc diz "package.json")
$ git log --oneline v1.11.0..origin/main | wc -l              → 22    (doc diz 2)
```

Os 3 primeiros são **formato 2** (o que o gate vai ler). O 4º e o 5º são
**forma 3** (derivação por `arquivo:linha` / count que envelhece) — o gate
**não** os cobre, e isso é **declarado** no cabeçalho dele (§5 do plano).

---

## 4. O registry: as 8 entradas iniciais

MEDIDO em `docs/api/*.md` (todos `→ \`N\`` com o comando **imediatamente
antes**, ou na linha seguinte):

| Comando (registry) | Doc | Valor | Ocorrências |
|---|---|---|---|
| `grep -hoE "@(Get\|Post\|Patch\|Put\|Delete)\(" apps/api/src/modules/users/infrastructure/http/users.controller.ts \| wc -l` | `docs/api/users.md` | 7 | 1 |
| …idem para `auth` | `docs/api/auth.md` | 3 | 1 |
| …idem para `tenancy/…/*.controller.ts` | `docs/api/tenancy.md` | 5 | 1 |
| …idem para `profiles/…/*.controller.ts` | `docs/api/profiles.md` | 10 | 1 |
| …idem para `feature-flags/…/*.controller.ts` | `docs/api/feature-flags.md` | 2 | 1 |
| `grep -cE "@(Get\|Post\|Patch\|Put\|Delete)\(" apps/api/src/modules/health/health.controller.ts` | `docs/api/health.md` | 1 | 1 |
| `node -e "…Object.keys(d.paths).length…"` | os 6 docs | 22 | 6 |
| `node -e "…flatMap(p=>Object.keys(p)…)…"` | os 6 docs | 28 | 6 |

**18 ocorrências, 8 comandos** — e o `node -e` é o **mesmo** nos 6 docs
(`apps/api/openapi.json` é uma fonte única). O registry tem **18 entradas**,
uma por **(doc, comando)**: cada doc é conferido no seu próprio par, e não em
lote — é o que faz o gate dizer **qual** doc mente.

> ⚠️ **Correção (2026-11-02, revisão da branch):** a primeira versão dizia
> "o registry tem **8 entradas** com `docs: [...]` (multi-doc)". A
> implementação foi com **18 entradas** e `doc` singular — e é a forma
> melhor: um registry com `docs: [...]` teria de casar o valor com **cada**
> doc da lista, e um doc que deixou de citar o comando passaria em silêncio.

O `health.md` usa `grep -cE` (sem `-o`, sem pipe) — **outra forma** do mesmo
claim. O gate tolera as duas: o que importa é o **valor**, e a derivação é
nativa (item 3 do T5).

⚠️ **O `health.md` é o caso que impede a generalização "1 derivação por
comando":** o comando dele é `grep -cE` (conta **linhas**) e o dos outros é
`grep -hoE … | wc -l` (conta **ocorrências**). MEDIDO: hoje dão o mesmo
(1 decorador por linha em todos os 6 controllers), mas são **contagens
diferentes** — e a derivação nativa tem de declarar qual das duas mede. A
entrada do registry diz qual; o gate não infere.

---

## 5. O que o gate novo **não** mede (declarado, não descoberto)

O corpus tem claims de **formato 3** — comando sem `→`, derivação por
`arquivo:linha`, número sem comando, ou comando com placeholder (`<sha>`, `…`,
`wc -l <arquivo>`). São as claims de `docs/web/rotas.md`, `docs/STACK.md`,
`docs/MONOREPO.md`, `docs/como-rodar.md` e `docs/fluxo-desenvolvimento.md`.

**O gate NÃO os mede**, e diz isso no cabeçalho (§5 do
`guard-classes.md`: "O que este gate NÃO mede"). Cobri-los exigiria um parser
de linguagem natural — que é a classe 3 do `guard-classes.md` (o guard que
dispara em si mesmo) esperando para acontecer.

**O gate mede:** as **18 ocorrências** de par comando → valor dos **6 docs de
API**, que são **8 comandos distintos** e 100% determinísticos.

> ⚠️ **Correção (2026-10-29, após a revisão deste plano):** a primeira versão
> publicava "98 claims / 58 em formato 3 / 30 em formato 2 / 60%". Os números
> **não fechavam** (98 − 58 = 40, não 30) e **nenhum comando do repo os
> reproduz** — publicá-los seria criar claims envelhecíveis, que é a classe
> que o próprio plano existe para matar. O inventário foi **cortado** e
> substituído pelo que o gate **cobre**, que é o número que importa.

**E os 5 drifts de §3?** Os 3 primeiros são de par comando → valor →
**o gate os pega**. Os 2 últimos são formato 3 → **não**, e são corrigidos à
mão (T6).

---

## 6. Wiring (o gate novo tem que entrar em tudo)

Um gate fora do preflight **não é gate fraco — é pior que ausência**
(`docs/fluxo-desenvolvimento.md` §7.3). Então:

| Onde | O quê |
|---|---|
| `.tooling/scripts/ci/preflight-gates.ts` | entrada nova (id + nome + file) |
| `.tooling/scripts/ci/preflight.ts` | runner + import |
| `.agents/specs/conventions/ci-defense-in-depth-dentes.md` | linha na tabela de dentes, com o **comando da prova** e o denominador **medido** |
| `.agents/specs/conventions/ci-defense-in-depth.md` | linha na §Tabela de Checks (`check-teeth-registry` reconcilia **os dois sentidos**) |
| `.agents/specs/conventions/review-routing.md` | `path_glob` que alcance o gate novo (`check-teeth-registry` acusa gate não alcançado) — ⚠️ `.tooling/scripts/ci/**` **já** cobre; conferir que o glob não é por basename |
| `docs/fluxo-desenvolvimento.md` | **3 contagens** de gate (linhas **127**, **145**, **162**) — hoje **40** — **e** 1 linha nova na **§4 "Tabela de gates"** (linhas 200-202 são o precedente: os 3 gates de doc estão lá) |
| `.agents/specs/conventions/documentacao.md` §5 | o gate novo na tabela de "O que o gate mede" |
| `AGENTS.md` §1.2 | a lista de instrumentos |

⚠️ **`docs/fluxo-desenvolvimento.md` está em 299 linhas** — o teto é 300
(`check-doc-size` é gate). As 3 contagens de gate (127, 145, 162) são
**substituições** ("40" → "41"), não acréscimos. Mas a **§4** precisa de uma
linha **nova** para o gate novo — e 299 + 1 = **300**, que **cabe** no teto.
O plano mandava **cortar** uma linha equivalente (a §4 tem linhas de gate que
**não** rodam no preflight — `stack-code-reviewer`, `doc-sync` — e que podem
ser comprimidas) **ou** declarar a linha do gate novo em uma §5/§7 que já
exista.

> ⚠️ **Correção (2026-11-02, revisão da branch):** a primeira versão dizia que
> a linha nova **estourava** o teto. **A aritmética estava errada**: 299 + 1 =
> 300, e 300 **cabe** (o teto é "≤ 300"). Nenhum corte foi preciso — e o
> arquivo terminou em **300** linhas, no **limite exato**, porque a onda 2
> também mexeu na §7.3. A lição: o plano deu um **corte** que ninguém
> executou, com base numa subtração errada — e o teto deixou de ter folga
> sem que ninguém tenha decidido isso.

⚠️ **`AGENTS.md` está em 300 linhas** — o teto. A §1.2 (5) lista os
instrumentos; acrescentar um nome **quebra** o teto. Corte + reescrita.

---

## 5-bis. A CLASSE do achado A2 é maior que o achado — e o plano fecha ela

> **Achado do plano (2026-10-30, após a auditoria dos gates da onda 2).**

O achado **A2** ("gate sem IIFE") foi relatado no `check-doc-coverage.ts`. A
**mesma classe** aparece em **outros 2 gates do mesmo PR** (onda 2, `6296b32`),
que a revisão original **não viu** — ela revisou o head `c65c594`, e a onda 2
entrou depois.

MEDIDO 2026-10-29 (antes do conserto):

| Gate | `pnpm exec tsx <arquivo>` | O que o gate faria se fosse chamado |
|---|---|---|
| `check-doc-size.ts` | `exit 0`, **nenhuma saída** | reprovar com `documento acima do teto: 'docs/gigante.md' tem 400 linhas` |
| `check-path-alias.ts` | `exit 0`, **nenhuma saída** | reprovar com `alias morto: '@projeto/ui' …` |

**A regra do repo fecha a classe, não a instância**
(`guard-classes.md` §1: "regra que só existe em prosa é defeito" — e o
espelho: uma correção que deixa a mesma classe viva nos vizinhos é a mesma
correção pela metade). Então o plano **corrige os 3** — `check-doc-coverage`
(A2), `check-doc-size` e `check-path-alias` — e **cada um ganha um caso de CLI**
no spec, com o denominador medido no registro de dentes.

⚠️ **O que a auditoria achou além da classe do IIFE — e é uma lista para
depois, não agora.** O achado A2 é o que o plano fecha. Os outros 4 achados
da auditoria dos gates da onda 2 são **defeitos diferentes**, de outra classe:

| # | Onde | Classe | Por que fica para depois |
|---|---|---|---|
| 1 | `check-doc-size.ts:113` | corpus vem do **índice** do git, não do disco | um `.md` **não versionado** é invisível — a mesma classe de `gate-blind-to-uncommitted-work` (memória do repo). A mudança é de **escopo do gate**, não decorreção |
| 2 | `check-path-alias.ts:99` | a semântica do `paths` do TS ≠ "diretório" | o gate acusa `paths` com **wildcard** (que o repo usa em `apps/web/tsconfig.json`) e alvo que é **arquivo** — duas formas legítimas do TS acusadas como "alias morto". O gate **só** mede o `tsconfig.base.json` hoje, então está **latente** |
| 3 | `check-path-alias.ts:89` | `JSON.parse` rejeita o **JSONC** que o `tsc` aceita | o `catch` devolve `[]` **sem `skipped`** — verde silencioso (classe 5). **Latente**: o `tsconfig.base.json` é JSON limpo |
| 4 | `check-doc-size.spec.ts:104` | o caso do repo real é **controle positivo** | neutralizar o gate inteiro deixa 13 de 13 verdes — o caso não distingue "mede" de "não mede nada" |

**A decisão:** esses 4 entram como **pendência declarada** no ledger
(`ci-defense-in-depth-pendencias.md`), e não neste PR — são **3 classes
diferentes** que cada uma pede decisão de escopo (o corpus do gate, a semântica
do TS, o parser de JSONC, e o desenho do spec). Um PR que já tem 3 correções
de gate + 1 gate novo + 5 claims corrigidos não deve carregar 4 redesenhos de
gate junto — e a pendência **declarada** é o mecanismo que o repo usa para
isso (`guard-classes.md`: "dívida declarada, não silêncio").

> ⚠️ **O item 3 (JSONC) é o que morde primeiro**, porque os tsconfigs deste
> repo **já** adotam a convenção de comentário (`"//e2e"`, `"//"` como chave) e
> o `tsc` aceita. Se alguém acrescentar um `//` no `tsconfig.base.json`, o
> gate de alias passa a verde **sem medir**. É por isso que ele é o primeiro da
> fila — não é o mais grave, é o mais provável de morder.


> ⚠️ **Correção (2026-10-29, após a revisão deste plano):** a primeira versão
> dizia "contagem de gates (2 lugares)". São **3** — a linha 127 (`> **MEDIDO
> 2026-10-29: 40.**`) publica o valor do comando do bloco logo acima, e
> deixar 40 ali seria o **mesmo drift** que o plano existe para matar. E
> faltava a **§4 "Tabela de gates"**, que é onde os 3 gates de documentação
> já estão listados (linhas 200-202).

---

## 7. Verificação

```bash
pnpm tooling:test                                    # specs dos 4 gates
pnpm typecheck:tooling                               # o gate novo é typechecked
pnpm ci:preflight                                    # o painel inteiro
pnpm ci:local                                        # a Camada 1 inteira
```

**Dentes a medir e declarar** (o registro de dentes exige o **comando** e o
**denominador**):
- `check-doc-coverage` → denominador **medido depois** (era 14; o T1 quebra
  um `it()` em três e acrescenta dois, e o T3 acrescenta quatro → o
  denominador é o que o spec **tiver**, não o que o plano previa). A mutação
  do route group passa a **cair**.
- `check-doc-claims` (novo) → denominador medido; a mutação de um valor no
  doc **cai**.

**Revisão pós-tarefa:** `review-router` classifica o diff e despacha os
reviewers (§5 do `AGENTS.md`) — o diff toca **`.tooling/scripts/ci/****, que a
matriz de roteamento manda para `monorepo-specialist` (blocking).

---

## 8. Fora de escopo (declarado)

- **As claims de formato 3** — não são parseáveis sem parser de NL (§5). O
  inventário que as contava foi **descartado** por não fechar (§5), então
  **nenhum número** é publicado aqui — nem aqui, nem na §5.
- **O `check-doc-claims` sobre docs fora dos 6 de API + `rotas.md`** — o
  registry começa com 8 comandos; ampliar é mecânico, não é correção.
- **Mudar o `openapi.json`** — não é a mission; o gate **lê** ele.
- **O `review-router` / `specialist-router`** — o PR já os cobre.
- **Bump de versão do template** — `1.14.0` → `1.15.0` fica para o
  `release-mode`, que cria a tag (MEDIDO: `estrutura-e-versionamento.md` §
  "Fluxo automatizado" — `git tag` manual **não**).

---

## 9. Ordem de execução

```
T1 (route group)  → T2 (IIFE)  → T3 (exceção)  → T4 (users.md)
                                                            ↓
                                      T5 (check-doc-claims) → T6 (os 5 drifts)
                                                            ↓
                                      wiring (§6) → verificação (§7) → commit
```

T5 depende de T4 (o gate confere o par dentro do trecho que T4 reescreve) e
T6 depende de T5 (o gate **descobre** os drifts). T3 é independente e pode
paralelizar com T1/T2 no mesmo arquivo — mas **não** no mesmo **commit**:
mesmo arquivo, dois agentes → conflito de merge de verdade.

---

## 10. Estado da execução (2026-10-30)

| Tarefa | Estado | Dente medido |
|---|---|---|
| **T1** `[A1]` descida em route group | ✅ | mutação no repo real (planta `apps/web/app/(grupo-da-sonda)/inicio/**page.tsx`** — o **arquivo**, não o diretório) |
| **T2** `[A2]` bloco IIFE | ✅ | **1 de 22** cai com o IIFE neutralizado; o CLI mede e sai `exit 1` |
| **T3** `[A4]` exceção declarada | ✅ | **2 de 22** caem com a tabela de exceções neutralizada |
| **T4** `[A5]` notação do `users.md` | ✅ | **sem guard** — é prosa (ver §"Sem guard, e isso é declarado") |
| **T5** `[A3-plano]` `check-doc-claims` | ✅ | **2 de 14** caem com a derivação neutralizada; **2 mutações no repo real** (número trocado no doc; endpoint novo no controller) |
| **T6** os 5 claims que mentem | ✅ | os 5 foram medidos depois de corrigidos (0 · 6 · 230 · 0 · não-vazio) |
| **5-bis** a classe do IIFE | ✅ | `check-doc-size` e `check-path-alias` ganharam IIFE + caso de CLI; **1 de 14** e **1 de 10** caem com o IIFE neutralizado |
| **wiring** | ✅ | 41 gates; 3 contagens + linha na §4 de `fluxo-desenvolvimento.md`; 2 linhas no registro de dentes; 1 linha na §Tabela de Checks; `AGENTS.md` §1.2 |

**Verificação:** `pnpm tooling:test` → **643 passed** (42 arquivos) ·
`pnpm typecheck:tooling` → 0 · `pnpm turbo run lint typecheck` → 4/4 ·
`pnpm ci:preflight` → **0 erro(s)**.

**Pendências declaradas** (não corrigidas aqui — §5-bis): 4 achados de **outras
classes** na auditoria dos gates da onda 2, registrados em
`ci-defense-in-depth-pendencias.md` com o comando de reprodução de cada um.
