---
state_snapshot: .agents/runs/state-snapshot-20261102T205345Z-revisao-branch-documentacao.md
demand_slug: revisao-branch-documentacao
date: 2026-11-02
branch: docs/melhoria-documentacao-aplicacao
base_main_sha: 194d305b88b176139379330baf07b622d3939910
---

# Plano — a revisão da branch `docs/melhoria-documentacao-aplicacao`

> A branch tem **9 commits** (`main..HEAD`) + **trabalho staged não
> commitado** (a onda 2: T1–T6 do plano anterior + a classe do IIFE + o gate
> novo `check-doc-claims`). Este plano audita **o resultado** e fecha o que a
> auditoria achou.
>
> **Veredito da auditoria: a onda 2 está bem-feita e passa tudo** — `pnpm
> tooling:test` → **649 passed** (42 arquivos), `pnpm typecheck:tooling` → 0,
> `pnpm ci:preflight` → **0 erro(s)**. Os 4 gates novos estão no painel, com
> denominador medido (22 / 14 / 14 / 10) e registrada no arquivo de dentes.
>
> **O que falta são 5 coisas**, e elas são da mesma família: **o instrumento
> mede o objeto errado** (G-101), **o claim envelheceu no commit que o criou**
> (G-102), **a convenção não declara o comportamento real** (G-103) e **o
> binding tem contagem stale** (G-104).

---

## §0. O que está em jogo

| # | Achado | Tipo | Onde | Medido | Fecha em |
|---|---|---|---|---|---|
| **G-101** | O gate mede um **objeto diferente** do comando que o doc cita | defeito | `check-doc-claims.ts` (derivação) | planta `PLANT-sonda.controller.spec.ts` com `@Get()` → gate **vermelho** contra um doc **correto** | **T1** |
| **G-102** | O claim do ledger envelheceu **no commit que o criou** (230 vs 290) | defeito | `documentacao.md` §6 | `wc -l …-pendencias.md` → **290** | **T2** |
| **G-103** | A convenção não declara o que o gate faz **sem a convenção** | lacuna | `documentacao.md` §5 | implementação = **erro**; o plano antigo dizia `skipped` | **T3** |
| **G-104** | Contagem stale no binding `.claude` (15/2 vs 16/3) | defeito | `.claude/README.md` §Verificação | `ls .claude/skills \| wc -l` → **16** | **T4** |
| **G-105** | O registry tem um campo `valor` **morto** — terceira cópia do número | defeito | `doc-claims.json` | trocar o `valor` de 7 para 99 → gate **verde** | **T6** |

E um sexto item, que não é um achado novo mas **um plano errado**: o plano da
onda anterior ([`2026-10-29-correcoes-review-pr129.md`](./2026-10-29-correcoes-review-pr129.md))
publica 4 afirmações que a própria implementação contradiz. Fecha em **T5**.

### §0-bis. A 2ª rodada — 3 reviewers acharam mais 15

Os 3 reviewers (o `review-router` sobre os 4 gates, o
`documentation-specialist` sobre a doc, e um revisor adversarial sobre este
próprio plano) acharam **15** coisas a mais. **Todas fechadas** — as
**12** de código/prosa viraram tarefas (T7–T10) e as **3** de escopo foram
**declaradas** (§4).

| # | Achado | Sev | Medido | Fecha em |
|---|---|---|---|---|
| **G-106** | A janela de 200 chars do valor **sangrava para o claim vizinho** — um doc que MENTIA passava **verde** | P0 | doc afirmando `7` com o código produzindo `1` → `EXIT=0` | **T7** |
| **G-107** | O tying tinha um buraco de **1 caractere**: a **barra final** passava, e a derivação lia o diretório inteiro | P0 | `…/http/` → tying `null`, derivação = o diretório todo | **T7** |
| **G-108** | O `health.md` citava `grep -cE` (conta **LINHAS**) e a derivação conta **OCORRÊNCIAS** | P0 | 2 decorators na mesma linha → o gate acusa um doc correto | **T7** |
| **G-109** | O gate **rejeitava** em vez de devolver `CheckResult` → abortava o preflight inteiro | P1 | `openapi.json` ausente → `EXIT=2`, 39 de 40 checks | **T7** |
| **G-110** | O `check-doc-claims` era o **único dos 4 sem caso de CLI** — o IIFE não tinha dente | P1 | IIFE neutralizado → **0** caem | **T7** |
| **G-111** | Spec **mascarado**: "catálogo de rotas ausente" era satisfeito pelo **outro** ramo | P1 | ramo neutralizado → **0 de 23** caem | **T8** |
| **G-112** | O gate podia **IGNORAR** a tabela de exceções da convenção e os specs seguiam verdes | P1 | leitura neutralizada → **0 de 23** caem | **T8** |
| **G-113** | A convenção canônica **não mencionava** o `check-doc-claims` | P1 | `grep -c check-doc-claims documentacao.md` → **0** | **T8** |
| **G-114** | O cabeçalho do gate afirmava que os docs fora do registry "usam comando sem `→`" — e é **falso** | P1 | `docs/STACK.md:63,89` e `docs/MONOREPO.md:188` têm o par | **T8** |
| **G-115** | O `ui-craft` afirmava **0** literal de cor e **68** usos de paleta — o real é **14** e **226** | P0 | MEDIDO (e já mentia no `main`: 17 e 226) | **T9** |
| **G-116** | O `MONOREPO.md` afirmava **12 tasks** (real **11**) e **4 aliases** (real **3**) | P0 | MEDIDO | **T9** |
| **G-117** | O `MONOREPO.md` tinha o parágrafo **duplicado** e o `\|\|` sobrando | P2 | 2 ocorrências do mesmo fato | **T9** |
| **G-118** | O `fluxo-desenvolvimento.md` apontava `doc-sync.ts:293` (real **299**), "12 testes verdes" (real **13**) e o footer `1.9.0` (real **`1.14.0`**) | P1 | MEDIDO | **T9** |
| **G-119** | O registro de dentes publicava **3** números que **não reproduziam** | P0 | MEDIDO: 2 de 14 (não 1), 6 de 10 (não 5), 0 de 22 (não 2) | **T10** |

⚠️ **G-106 é o mais grave da rodada** — é o **inverso** do que o gate existe
para: um doc que mente passava verde. A janela de 200 caracteres do
`valorCitado` pegava o `→ \`N\`` de uma **frase de prosa no meio** do
claim. O conserto não é "aumentar a janela" nem "diminuir a janela": é
**adjacency** — o valor tem que estar **colado** no comando (só branco, `>` e
o backtick no meio).

⚠️ **G-107 é a classe de G-101 com 1 caractere de folga.** A barra final
passava pelo tying porque o `path.join` do resolver normaliza a barra e o
tying comparava a barra. O conserto: **normalizar uma vez** e usar o mesmo
valor nos dois lados.

### Por que G-101 é o achado central

A **premissa** do `check-doc-claims` é: *"o doc cita um comando e afirma um
valor ao lado; a derivação recalcula esse valor a partir do código; se
divergem, o doc mente"*. A premissa **só vale se a derivação medir o que o
comando mede**.

MEDIDO 2026-11-02, no repo real:

```
$ printf 'export class P { @Get() r() { return 1; } }\n' \
    > apps/api/src/modules/tenancy/infrastructure/http/PLANT-sonda.controller.spec.ts

$ grep -hoE "@(Get|Post|Patch|Put|Delete)\(" \
    apps/api/src/modules/tenancy/infrastructure/http/*.controller.ts | wc -l
5                                    # o comando que o DOC cita → 5

$ pnpm exec tsx .tooling/scripts/ci/check-doc-claims.ts
claim divergente: o doc 'docs/api/tenancy.md' afirma 5 e o código produz 6 — comando
citado: `grep -hoE "@(Get|Post|Patch|Put|Delete)\(" apps/api/src/modules/tenancy/
infrastructure/http/*.controller.ts | wc -l`. Corrija o DOC (o código é a fonte) …
EXIT=1
```

O gate acusa **6** porque a derivação lê **todos** os `.ts` do diretório
(inclusive `*.spec.ts`), enquanto o comando do doc usa o glob `*.controller.ts`.
**O doc está certo, o gate está errado** — e a mensagem manda corrigir o doc.

Isso atinge **3 das 6** entradas de `contar-decoradores-http` — 3 das **18**
do registry (`tenancy`, `profiles`, `feature-flags`, as que apontam para um
**diretório**). As 3 que apontam para um **arquivo** estão certas por
acidente.

⚠️ **O que o achado NÃO é:** não é "o gate conta decorators em string/comentário"
— isso é outra classe, e o repo já a resolveu no
`check-feature-flag-portas.ts` (`comentário com @Post(...) não vira rota`).
Hoje nenhum `.spec.ts` dos 3 diretórios tem decorator HTTP (MEDIDO), então o
**dado** confere; o que não confere é o **conjunto medido**.

### Por que G-102 é o achado mais fácil de deixar passar

O `check-doc-claims` cobre as **18 ocorrências** de par comando → valor dos 6
docs de API. O claim de G-102 está em `documentacao.md` — **formato 3** (o
número está no texto, o comando numa linha antes), que o gate **não** cobre por
decisão declarada (§5 do plano anterior).

Resultado: a branch **corrige um claim envelhecido** (`333` → `230`) e, **no
mesmo conjunto de mudanças**, **cria um novo claim envelhecido** — porque ela
adiciona 60 linhas ao arquivo que estava medindo. `333 → 290`, e o número
publicado é 230.

> ⚠️ **A correção certa não é trocar 230 por 290.** Um número que envelhece a
> cada commit é a **classe 7** — e o próprio plano da onda anterior condemna
> isso no item 5 do T6 (*"trocar por 'N commits' também envelhece"*). O que o
> leitor precisa é **se** o ledger está acima do teto, e quem garante isso é o
> **`check-doc-size`**. Então o número sai e o dono do fato passa a ser o gate.

### Por que G-103 é lacuna e não defeito

O gate funciona: convenção ausente → **erro** ("sem ele este check é teatro"),
que é o precedente do repo (`check-test-set-covered.ts` com a `tdd.md`). O
problema é que **a convenção não diz isso** — e a convenção é o contrato do
gate. Quem ler a §5 não descobre o que acontece no caso ausente; quem ler o
plano anterior (`skipped`) recebe a informação **errada**.

O conserto tem duas metades: **a convenção declara o comportamento real** e
**o plano anterior é corrigido** (T3 e T5).

### Por que G-105 é o achado que o PR não podia ver

O registry do `check-doc-claims` foi criado **na onda 2**, e a entrada nasceu
com três campos: `doc`, `comando` e `valor`. O `valor` **não é lido por
ninguém** — o gate compara o valor que o **doc** afirma com o valor que a
**derivação** produz, e o `valor` do registry fica no meio, **livre**.

MEDIDO 2026-11-02:

```
$ python3 -c "…muda o valor da 1a entrada de 7 para 99…"
$ pnpm exec tsx .tooling/scripts/ci/check-doc-claims.ts; echo $?
0                    # o gate não viu nada
```

O efeito é pior do que um campo inerte: o **plano anterior** diz que "um PR
que edita o registry edita **números**", e o cabeçalho do gate repetia a
mesma frase — as duas afirmações eram **falsas**. O registry não é a
superfície de verdade do **número**: ele é a superfície de verdade do
**como medir** (o caminho, o glob, a derivação). O número tem **duas** cópias
— a que o **código** produz (o dono) e a que o **doc** afirma — e a regra de
`dry.md` diz que o conhecimento tem **uma** representação.

Por isso o conserto é **remoção**, e não um check novo: um gate que conferisse
`registry.valor == derivação` criaria uma **terceira** restrição para
manter, sobre um número que o registry não tem autoridade para dizer.

---

## §1. Decisões de escopo

### D1 — A derivação passa a declarar **o caminho que o comando cita**

O conserto de G-101 **não** é "a derivação conta menos" — é "a derivação
conta **exatamente** o que o comando nomeia".

Duas formas possíveis:

| Forma | O que faz | Veredito |
|---|---|---|
| (a) o gate **parseia** o caminho de dentro do texto do comando | o comando vira a fonte única | **rejeitada** — o motivo real **não** é "não executar shell" (o gate já lê o texto do comando: `valorCitado` faz `doc.indexOf(comando)`). É que **o objeto medido nos 2 comandos `node -e` não é um arquivo** (é `d.paths`), e há **3 formas** de comando distintas no corpus (`grep … \| wc -l`, `grep -cE`, `node -e "…"`) — parsear as 3 é um interpretador de shell, não um tying |
| (b) o registry passa a declarar o **caminho** (com glob), e o gate **exige** que o comando citado contenha esse caminho | dois campos, amarrados por uma verificação | **adotada** — o registry continua sendo dado, e o tying é **verificado**, não presumido |

O tying é o que fecha a **classe**: sem ele, um registry pode declarar
`…/http` (diretório inteiro) e citar `…/*.controller.ts` — e o gate volta a
medir outra coisa, em silêncio. Com ele, o registry que se desamarra é
**vermelho**, nomeando os dois.

### D2 — O glob é resolvido por `path.matchesGlob`

Node `>=22.6.0` (o `engines.node` do repo) já tem `path.matchesGlob` (Node
`>=22.5.0`), e o `@types/node@20.19.43` instalado **já tipa** o método
(MEDIDO: `node_modules/@types/node/path.d.ts:105`). Sem dependência nova.

MEDIDO 2026-11-02, a semântica bate com o glob do shell:

```
admin-tenancy.controller.ts       vs *.controller.ts  → true
admin-tenancy.controller.spec.ts  vs *.controller.ts  → false   ← o que faltava
decorators/require-feature-flag.ts vs *.controller.ts → false
```

### D3 — O número do ledger **sai** (3 sítios, uma classe)

O fato *"o ledger cabe no teto"* tem **um dono**: o `check-doc-size`, que mede
todo `.md` vivo. Publicar o número em 3 lugares é a mesma dívida 3 vezes — e o
`dry.md` diz que o conhecimento tem **uma** representação.

| Sítio | O que diz hoje | O que passa a dizer |
|---|---|---|
| `documentacao.md` §6 | `wc -l …-pendencias.md` → **230** | (o número sai; o `check-doc-size` é o dono) |
| `ci-defense-in-depth.md` §Pendências conhecidas | "este documento está no teto de 300 linhas" | (a afirmação do teto sai; o ledger guarda só o que está **aberto**) |
| `ci-defense-in-depth-pendencias.md` cabeçalho | "a convenção está no teto de 300 linhas … registrar um item novo exige podar outro" | (idem — o cabeçalho passa a dizer a regra que **hoje** vale) |

⚠️ **O terceiro sítio é pré-existente, não nasceu nesta branch** — a
`ci-defense-in-depth.md` tem **183** linhas (MEDIDO), nunca 300. Ele entra
porque a branch **reescreveu a política do ledger** (`documentacao.md` §6: "o
ledger guarda só o que está ABERTO") e os 3 sítios precisam **dizer a mesma
coisa** — hoje já se contradizem. Corrigir 2 e deixar o 3º é a mesma correção
pela metade que a regra de `guard-classes.md` reprova.

### D4 — Os erros do plano anterior são corrigidos **no plano anterior**

O plano da onda anterior é um artefato versionado e ele é lido como fonte. 4
afirmações dele são falsas **hoje**. ⚠️ As referências são por **seção**, não
por linha — número de linha envelhece a cada edição, que é a classe 7 de
`guard-classes.md` aplicada a um plano:

| # | Onde (no plano anterior) | O que afirma | O que é |
|---|---|---|---|
| P1 | §T3, item 2 | "convenção ausente = `skipped` COM MOTIVO, não erro" | a implementação devolve **erro** (e o spec documenta o erro) |
| P2 | §4 | "o registry tem **8 entradas** com `docs: [...]` (multi-doc)" | o registry tem **18 entradas**, uma por (doc, comando), com `doc` singular |
| P3 | §8 | "As **58** claims de formato 3" | número do inventário que a própria §5 do plano **descartou** por não fechar (98 − 58 = 40, não 30) e que **nenhum comando reproduz** |
| P4 | §6 (Wiring) | "`docs/fluxo-desenvolvimento.md` está em **299** linhas … a §4 precisa de uma linha nova e isso **estoura** o teto" | o "299" **estava certo** (MEDIDO: `main` 298, `e1c8e95` 299, `b46287c` 299); o que estava errado era a **conclusão** — 299 + 1 = **300**, e 300 **cabe** (o teto é "≤ 300"). O plano mandava cortar uma linha que não precisava ser cortada |

### D5 — O `check-doc-claims` **não** ganha cobertura nova nesta onda

A tempting é meter `documentacao.md` no registry (o par comando → valor dele é
parseável). Seria **errado**: o valor do ledger muda a cada pendência
registrada, então o gate passaria a reprovar a cada commit — **classe 7**, o
que a §5 do plano anterior diz não medir. O conserto de G-102 é **tirar o
número**, não **instrumentá-lo**.

---

## §2. Tarefas

Ordem por dependência. Cada uma é RED → GREEN → REFACTOR
([`tdd.md`](../../../.agents/specs/conventions/tdd.md)).

### T1 — `[G-101]` A derivação mede o mesmo conjunto que o comando citado

**Arquivos:** `.tooling/scripts/ci/check-doc-claims.ts`,
`.tooling/scripts/ci/check-doc-claims.spec.ts`,
`.tooling/scripts/ci/doc-claims.json`

**RED (2 casos):**

1. **A derivação respeita o glob do comando.** Plantar um `*.spec.ts` com
   `@Get()` num dos 3 diretórios de controller → o gate tem que ficar
   **VERDE** (o comando do doc não conta o spec, e o doc não mudou). Hoje
   fica **vermelho** — MEDIDO acima.
2. **O tying.** Uma entrada de registry cujo `comando` **não contém** o
   caminho declarado → o gate tem de ficar **vermelho**, nomeando o comando e
   o caminho. (Este é o caso que impede a **reincidência** da classe: um
   registry que se desamarra passa a ser erro, não silêncio.)

**GREEN:**

- `Derivacao` passa a declarar `caminhos: string[]` — cada caminho pode ser um
  **arquivo**, um **diretório** ou um **glob** (`dir/*.controller.ts`).
- Um resolver resolve o glob com `path.matchesGlob` (D2).
- Uma verificação amarra o **comando citado** ao **caminho medido**: o comando
  tem que **conter** o caminho. Divergência → **vermelho**, nomeando os dois.
- O registry passa a declarar o glob nos 3 diretórios:
  `apps/api/src/modules/tenancy/infrastructure/http/*.controller.ts` (idem
  `profiles` e `feature-flags`).

**REFACTOR:** o campo `arquivos` (que mentia — o registry declarava
**diretórios** num campo que se chamava "arquivos") vira `caminhos`, e o
resolver passa a ter um nome que diz o que faz.

**Dente:** a mutação do repo real (plantar o `*.spec.ts`) **não pode** cair
— e é exatamente o que a mutação do item 1 prova. Denominador do spec: **14 →
19** (5 testes novos: o glob resolvido, o tying unitário, o tying do openapi, o
registry desamarrado e a mutação no repo real).

**⚠️ O que a mudança NÃO faz:** não toca no `valorCitado`, no `lerRegistry`
nem no formato do par comando → valor. A mudança é **onde** o gate mede, não
**como** ele lê o doc.

### T2 — `[G-102]` O número do ledger sai dos 3 sítios

**Arquivos:** `.agents/specs/conventions/documentacao.md` (§6),
`.agents/specs/conventions/ci-defense-in-depth.md` (§Pendências conhecidas),
`.agents/specs/conventions/ci-defense-in-depth-pendencias.md` (cabeçalho)

**GREEN:** prosa. Sem RED, sem spec — **e isso é declarado**, pela mesma razão
que o T4 do plano anterior declarou: é edição de prosa, e não há nada mecânico
a medir. O que a mede é o **leitor**, com o comando ao lado.

⚠️ **O teto de 300 linhas não pode estourar.** `documentacao.md` tem 220
(folga), `ci-defense-in-depth.md` tem 183 (folga) e o **ledger tem 290** —
folga de 10, e as 3 edições são substituições, não acréscimos. O
`check-doc-size` mede.

### T3 — `[G-103]` A convenção declara o comportamento quando ela falta

**Arquivo:** `.agents/specs/conventions/documentacao.md` (§5)

**GREEN:** a §5 passa a dizer, com o **comando** que reproduz:

- a convenção é lida do **`repoRoot`**, não do `process.cwd()` (por quê: o gate
  roda contra repos plantados nos specs, e ler do cwd aplicaria a convenção
  real a um repo de mentira);
- **convenção ausente → ERRO**, não `skipped` — porque a tabela de exceções é a
  **única** fonte delas, e um gate sem fonte mede nada (o precedente é
  `check-test-set-covered.ts` com a `tdd.md`);
- a **coluna Unidade** é o caminho da unidade, lido **por nome**.

**Sem guard, e isso é declarado:** é prosa de convenção. O **comportamento**
(já implementado e já coberto pelo spec) é o instrumento; a convenção é o
contrato que ele cumpre. Publicar o comando ao lado é o que faz a afirmação
verificável a olho.

### T4 — `[G-104]` As contagens stale do binding `.claude`

**Arquivo:** `.claude/README.md` (§Verificação)

**GREEN:** os 2 comentários do bloco de Verificação passam a dizer o que o
comando ao lado **imprime** — `16` e `3`. A tabela do mapa (16 de 24, 3 de 28)
e o §"Só 3 de 28 agents" **já** dizem o certo; o bloco de Verificação é o
único que ficou para trás.

### T5 — Os 4 erros do plano anterior

**Arquivo:** `docs/superpowers/plans/2026-10-29-correcoes-review-pr129.md`

**GREEN:** as 4 afirmações de D4 são corrigidas, cada uma com a **correção
(nota)** que a revisão deste plano vai registrar. As correções são de prosa:
P1 vira "**erro**" (e remete ao comportamento implementado), P2 vira "**18
entradas**, uma por (doc, comando)", P3 sai (o inventário foi descartado), P4
vira a aritmética certa.

⚠️ **O plano anterior não é fonte de verdade** — é registro datado. Mas ele é
lido, e um registro que afirma o que não é é a mesma classe que o plano
anterior existe para matar. `docs/superpowers/**` está fora do teto de 300
linhas (`tamanho-e-revisao.md`), então a edição não tem restrição de tamanho.

### T6 — `[G-105]` O campo `valor` sai do registry

**Arquivos:** `.tooling/scripts/ci/check-doc-claims.ts` (interface `Claim`),
`.tooling/scripts/ci/check-doc-claims.spec.ts`,
`.tooling/scripts/ci/doc-claims.json`,
`docs/superpowers/plans/2026-10-29-correcoes-review-pr129.md` (o texto que
manda recriá-lo)

**RED:** a entrada do registry **não** declara `valor`. O caso prova a decisão
de DRY: o número tem duas cópias (o código e o doc), e uma terceira — livre,
que nada lê — é a que a regra proíbe.

**GREEN:** o campo sai da interface, das 18 entradas do registry e dos
fixtures do spec. O cabeçalho do gate passa a dizer que o registry é a
superfície de verdade do **como medir**, não do número — e o plano anterior
deixa de mandar criar o campo.

**REFACTOR:** o comentário da interface `Claim` passa a explicar **por que**
não há `valor` (com a medição que o motivou).

**Dente:** o caso novo + os 4 casos do `lerRegistry`. Denominador do spec:
**19 → 20**.

---

### T7 — `[G-106..G-110]` O gate novo ganha os dentes que faltavam

**Arquivos:** `.tooling/scripts/ci/check-doc-claims.ts`,
`.tooling/scripts/ci/check-doc-claims.spec.ts`,
`.tooling/scripts/ci/doc-claims.json`, `docs/api/health.md`

- **G-106 — adjacency no lugar da janela.** O valor tem que estar **colado**
  ao comando; entre os dois só pode haver branco, `>` e o backtick. E a
  busca passa por **todas** as ocorrências do comando (a primeira que TEM
  valor é a do claim).
- **G-107 — normalizar o caminho uma vez.** `limparCaminho` tira a barra
  final, e o mesmo valor vai para o tying e para o resolver.
- **G-108 — unificar a forma do `health.md`.** O comando vira
  `grep -hoE … | wc -l`, o mesmo dos outros 5 — assim a derivação mede
  **exatamente** o que o comando cita, nos 6.
- **G-109 — o gate devolve `CheckResult`, não exceção.** O try/catch no
  `checkDocClaims` transforma uma falha de IO em **vermelho com motivo**.
- **G-110 — caso de CLI.** O gate tem de medir quando invocado avulso, e o
  spec tem de **provar** que mede (o binário de verdade, como nos outros 3).

**Dente:** denominador **23 → 23** (5 casos novos). Cada uma das 5 mutações
tem de cair: adjacency, tying, glob, derivação, IIFE.

### T8 — `[G-111..G-114]` Os specs e a convenção dos gates

**Arquivos:** `.tooling/scripts/ci/check-doc-coverage.spec.ts`,
`.agents/specs/conventions/documentacao.md`,
`.tooling/scripts/ci/check-doc-claims.ts` (cabeçalho)

- **G-111** — o spec do catálogo passa a afirmar a string que **só** o ramo
 produz ("catálogo de rotas"), e não uma que o outro ramo também produz.
- **G-112** — um caso novo planta a **convenção** com a exceção e exige que
  o gate a isente **sem** `opts.excecoes` — é a wiring, não o override.
- **G-113** — a §5 da convenção passa a ter os **dois** gates e a dizer o
  que cada um mede (e o que nenhum mede).
- **G-114** — o cabeçalho do gate deixa de dizer que os docs fora do
  registry "usam comando sem `→`" (é falso) e passa a listar os que têm o
  par, com a derivação de outra espécie.

**Dente:** `check-doc-coverage` **22 → 23**, e as 2 mutações novas (ramo do
catálogo, wiring da tabela) caem.

### T9 — `[G-115..G-118]` Os números que mentiam

**Arquivos:** `.agents/skills/ui-craft/SKILL.md`, `docs/MONOREPO.md`,
`docs/fluxo-desenvolvimento.md`

Números re-medidos e corrigidos, com o comando ao lado. Nenhum é
instrumentado: `ui-craft`, `MONOREPO.md` e `fluxo-desenvolvimento.md` não
entram no registry (o escopo é o dos 6 docs de API) — é a **dívida
declarada** do §4.

### T10 — `[G-119]` O registro de dentes re-medido

**Arquivo:** `.agents/specs/conventions/ci-defense-in-depth-dentes.md`

As 11 mutações declaradas foram **re-medidas** (as 3 que divergiam foram
corrigidas) e as 7 novas foram medidas e declaradas. Denominador novo:
`check-doc-claims` **23**, `check-doc-coverage` **23**.

## §3. Verificação

```bash
pnpm tooling:test          # os 4 specs dos gates + o resto
pnpm typecheck:tooling     # o gate novo é typechecked
pnpm ci:preflight          # o painel inteiro
```

**Dentes a medir e declarar** (o registro de dentes exige o **comando** e o
**denominador**):

| Gate | Dente novo | Denominador |
|---|---|---|
| `check-doc-claims` | o glob respeitado, o tying, a **adjacency** do valor, o **IIFE** (CLI) e a ausência do `valor` | 14 → **23** |
| `check-doc-coverage` | o ramo do catálogo e a **wiring** da tabela de exceções (o T8) | 22 → **23** |
| `check-doc-size` | (o bloco IIFE, já declarado) | 14 |
| `check-path-alias` | (o bloco IIFE, já declarado) | 10 |

⚠️ **A contagem de gates do preflight NÃO muda** (41 → 41): nenhuma tarefa
deste plano cria gate. O que muda é o **denominador** de 1 spec.

⚠️ **`docs/fluxo-desenvolvimento.md` está em 300 linhas** — o teto. Nenhuma
tarefa deste plano acrescenta linha nele (o T4 é prosa; o T2/T3 são
convenções). Se o T1 exigir uma linha nova na §4, ela sai junto de outra — o
plano não aceita um arquivo no teto sem folga.

**Revisão pós-tarefa:** `review-router` classifica o diff e despacha os
reviewers (§5 do `AGENTS.md`). O diff toca `.tooling/scripts/ci/**`, que a
matriz manda para `monorepo-specialist` (**blocking**).

---

## §4. Fora de escopo (declarado)

- **As claims de formato 3** — não são parseáveis sem parser de NL (§5 do
  plano anterior). O gate novo **não** as cobre, e continua não cobrindo.
- **A cobertura de `docs/fluxo-desenvolvimento.md`, `docs/STACK.md`,
  `docs/MONOREPO.md`, `docs/como-rodar.md`** — formato 3, idem.
- **Ampliar o registry do `check-doc-claims`** para docs fora dos 6 de API —
  mecânico, não é correção.
- **Os 4 achados de outras classes** que a onda 2 já declarou em
  `ci-defense-in-depth-pendencias.md` (JSONC, semântica de `paths`, corpus do
  índice do git, controle positivo do `check-doc-size`) — **já declarados**,
  e mexer neles é redesenhar 4 gates.
- **Um gate que impeça o `ubuntu-latest` de voltar** — a causa do commit
  `b46287c` foi um **alias que se move**, e o conserto foi fixar a imagem. Um
  gate que lê `.github/workflows/**` é **gate novo** (fiação + dentes + 3
  contagens de doc), e o GitHub Actions **não** tem YAML anchor — não há como
  DRY o `runs-on` sem mudar de suporte. **Declarado** em
  `ci-defense-in-depth-pendencias.md`.
- **A derivação do `check-doc-claims` contar decorator em COMENTÁRIO** —
  `DECORADOR_HTTP` é um regex cru. **Latente**: as 6 entradas do registry
  apontam para arquivo ou glob `*.controller.ts`, e nenhum tem decorator
  comentado — a proteção é **acidental**, não instrumentada. Corrigir só o
  gate faria o gate divergir do `grep` que o doc cita (que também conta o
  comentário) — o conserto é dos **dois** lados. **Declarado** no ledger.
- **A paridade estrita do CLI que não protege `skipped` nem `advisories`** —
  os 3 gates com caso de CLI só o exercitam contra repos plantados
  **não-skipped** e sem advisory (MEDIDO 2026-11-02: trocar
  `linhasDoRelato(r)` por `r.errors` → 0 de 22 / 0 de 14 / 0 de 10 caem).
- **O spec do `check-path-alias` que fixa como regressão uma forma
  legítima** — alvo de `paths` que é **arquivo** resolve no TypeScript, e o
  gate acusa "que não existe". O **gate** já está declarado no ledger; o
  **spec** é que ainda fixa o comportamento errado como regressão.
- **A matriz §3 da convenção com 11 linhas das quais o gate mede 3** —
  Endpoint, Model Prisma, Variável de ambiente, Script `pnpm`, Decisão
  arquitetural, Fluxo com IR, Regra de processo e Fluxo de agent **não** são
  medidos; e `apps/api/prisma/schema.prisma` tem **0** comentários `///`,
  apesar de a matriz exigir "`schema.prisma` (`///`) + seção em
  `docs/api/<bc>.md`".
- **O registry cobrindo só os 6 docs de API** — 5 claims no **mesmo formato**
  (`docs/STACK.md` ×2, `docs/MONOREPO.md` ×1, `ui-craft/SKILL.md` ×2) ficam
  fora, porque a derivação é de outra espécie (versão, contagem de arquivos,
  contagem de scripts, regex sobre vários arquivos).
- **Bump de versão do template** — `1.14.0` → `1.15.0` é do `release-mode`.

---

## §5. Ordem de execução

```
T1 (glob + tying)  →  T6 (campo `valor` sai)  →  T2 (3 sítios do ledger)
                                                          ↓
                              T3 (convenção declara)  →  T4 (.claude)
                                                          ↓
                              T5 (plano anterior)  →  verificação
```

T1 e T6 mexem no mesmo par de arquivos (o gate e o spec) — por isso são
**sequenciais**. T2, T3 e T4 são **independentes** e paralelizáveis entre si
(arquivos diferentes). ⚠️ **T5 e T6 NÃO são paralelizáveis entre si**: os dois
editam o plano anterior — um executor que siga a prosa perde escrita. T1 e T6
são os únicos que mudam comportamento de gate — e os únicos que exigem
RED→GREEN.

---

## §6. Estado da execução (2026-11-02)

| Tarefa | Estado | Dente medido |
|---|---|---|
| **T1** `[G-101]` glob + tying | ✅ | o glob ignorado → **2 de 23**; o tying neutralizado → **3 de 23** |
| **T2** `[G-102]` os 3 sítios do ledger | ✅ | sem guard — é prosa (o `check-doc-size` é o dono do teto) |
| **T3** `[G-103]` a convenção declara | ✅ | sem guard — é o contrato do gate, e o behavior é coberto pelo spec |
| **T4** `[G-104]` as contagens do `.claude` | ✅ | sem guard — é prosa |
| **T5** `[P1..P4]` o plano anterior | ✅ | sem guard — é registro datado |
| **T6** `[G-105]` o campo `valor` sai | ✅ | o `valor` de volta → **1 de 23** |
| **T7** `[G-106..G-110]` os dentes do gate novo | ✅ | adjacency → **1 de 23**; IIFE → **1 de 23** |
| **T8** `[G-111..G-114]` os specs e a convenção | ✅ | ramo do catálogo → **1 de 23**; wiring da tabela → **1 de 23** |
| **T9** `[G-115..G-118]` os números que mentiam | ✅ | sem guard — são prosa, com o comando ao lado |
| **T10** `[G-119]` o registro de dentes | ✅ | as 11 mutações declaradas re-medidas; 7 novas declaradas |

**Verificação (MEDIDO 2026-11-02):**

```
pnpm tooling:test        → 649 passed (42 arquivos)   [era 643 antes desta onda]
pnpm typecheck:tooling   → 0 erro
pnpm ci:preflight        → 0 erro(s), 1 check skipped (a memória vive fora do repo)
pnpm ci:local            → exit 0 (Camada 1 inteira, com Docker e Postgres)
npx prettier --check     → limpo
```

**Pendências declaradas** (não corrigidas aqui — §4 e o ledger
`ci-defense-in-depth-pendencias.md`): o decorator de HTTP em **comentário**
(a derivação não tem comment-awareness — o registry aponta para arquivo, o
que a protege por **acidente**); o runner do CI **fixado mas sem gate** (um
PR pode reintroduzir o `ubuntu-latest`); a paridade estrita do CLI que não
protege `skipped` nem `advisories`; o spec do `check-path-alias` que fixa
como regressão uma forma **legítima** do TypeScript; a matriz §3 da
convenção com **11** linhas das quais o gate mede **3**; e o registry que
cobre os 6 docs de API, deixando de fora 5 claims no mesmo formato.

**Riscos que o leitor precisa conhecer:**

- `docs/fluxo-desenvolvimento.md` e `AGENTS.md` estão em **300 linhas** — o
  teto exato, sem folga. A próxima edição em qualquer dos dois é um commit
  que só passa se outra linha sair.
- O ledger `ci-defense-in-depth-pendencias.md` está em **300** — o mesmo.
- A derivação do `check-doc-claims` conta decorator em **comentário**: hoje
  o registry aponta para arquivo, o que a protege por acidente (§4).
