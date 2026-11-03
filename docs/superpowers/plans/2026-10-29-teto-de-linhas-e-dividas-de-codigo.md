---
state_snapshot: .agents/runs/state-snapshot-20261029T164307Z-teto-de-linhas-e-dividas.md
demand_slug: teto-de-linhas-e-dividas
date: 2026-10-29
branch: docs/melhoria-documentacao-aplicacao
base_main_sha: 194d305
---

# Plano — o teto de 300 linhas vira gate, e as duas dividas de código saem da dívida

> Continuação do [PR #129](https://github.com/b3ll3o/projeto-base/pull/129), que
> deixou dois pontos explicitamente **fora de escopo**. Este plano os paga.

## 0. O que está em jogo

Dois debts que o PR #129 documentou em vez de resolver:

| # | Dívida | Onde | Medido |
|---|---|---|---|
| D-1 | O teto de 300 linhas é **prosa**: nenhum gate o mede | [`tamanho-e-revisao.md`](../../../.agents/specs/conventions/tamanho-e-revisao.md):7 | `grep -rln 'MAX_LOC' tooling/scripts/ .tooling/scripts/ \| grep -v spec` → **um** arquivo, e ele mede **uma** matriz só |
| D-2a | `@projeto/ui` é um **alias morto** | `tsconfig.base.json:27` → `./packages/ui/src`, que **não existe** | `ls packages/` → `eslint-config shared-types tsconfig` |
| D-2b | `@playwright/test` **sem caret** — e o motivo do pin não está escrito em lugar nenhum | `apps/web/package.json:40` | `docs/MONOREPO.md` §3.2: *"O motivo do pin não está documentado no repo"* |

**Por que D-1 não é "só mais um gate".** O teto existe para manter a doc
focada; sem instrumento ele é uma intenção. E há um agravante medido: **14
arquivos `.md` versionados o violam** — e a maioria é **histórico**
(`docs/superpowers/**`, `.agents/runs/**`, vendor). Aplicar o teto a eles sem
distinguir seria um PR de surgery que destroye registros datados para ganhar
uma regra.

## 1. Gap analysis AS-IS → TO-BE

### O que JÁ EXISTE (não reconstruir)

- **A regra do teto**, com o escape correto ("dividir em arquivos irmãos com
  índice e links cruzados") — falta só o instrumento.
- **O padrão de gate do repo**: `check-<nome>.ts` na raiz de
  `.tooling/scripts/ci/`, spec companion com **mutação**, registro em
  `PREFLIGHT_CHECKS` + `RUNNERS` + registro de dentes + catálogo humano, e as
  4 reconciliações do `check-teeth-registry`.
- **O ledger de pendências** (`ci-defense-in-depth-pendencias.md`), que já
  distingue pendência **aberta** de **FECHADO** no próprio texto — a separação
  que o split vai usar já está escrita lá.

### O que FALTA

1. **A distinção** entre doc que descreve o presente e doc que registra o
   passado — declarada, com critério, e **executável**.
2. **A dívida do alias morto** — e o instrumento que impede o próximo.
3. **A resposta ao pin** — remover a violação ou declarar a razão. As duas
   opções são legítimas; o que **não** é legível é a violação sem razão.

## 2. Fase 1 — o teto de 300 linhas vira gate

### 2.1 A distinção, declarada

`tamanho-e-revisao.md` ganha uma seção **"O que o teto cobre"**: o teto vale
para a **documentação viva** (descreve o estado ATUAL do repo, atualiza quando
o código muda) e **não** vale para três categorias, cada uma com um critério
verificável — não com uma lista de paths que apodrece:

| Categoria | Onde | Critério |
|---|---|---|
| `registro-datado` | `docs/superpowers/**` | plano/spec de demanda **já executada**; editar ou dividir falsearia o registro |
| `artefato-de-execucao` | `.agents/runs/**` | snapshot/ledger de execução; o `check-memory-crystallization` lê o ledger **como unidade** — dividir quebraria o consumidor |
| `vendor` | `.agents/skills/graphify/**` | skill de ferramenta externa, versionada como está |

E a **medição é declarada**: o gate conta **linhas como `wc -l` conta** (a
contagem que um humano faz), e diz isso no cabeçalho — porque os dois lints de
matriz já existentes contam **de formas diferentes**
(`lint-specialist-routing.ts:85` desconta o `\n` final;
`lint-review-routing.ts:151` não desconta). Um gate novo que discordasse dos
vizinhos em uma linha seria um gate que acusa um arquivo que o outro aceita.

### 2.2 O único documento vivo que viola o teto

Dos 14 arquivos acima de 300, **13 são das 3 categorias** (registro datado,
artefato de execução, vendor). **Um é documentação viva**:
`ci-defense-in-depth-pendencias.md` (333 linhas) — o ledger que "cresce sem
custar conteúdo", com 23 itens dos quais **5 são FECHADO** e **3 foram
cancelados**.

O split é semântico, não por tamanho: **o ledger guarda pendência aberta; a
pendência encerrada vai para o arquivo irmão de registro**. O ledger aberto
fica em ~120 linhas e a regra que o governa passa a ser mecânica:
*"pendência que fecha sai do ledger"*.

### 2.3 O gate `check-doc-size`

- Mede o teto sobre **todo `.md` versionado** fora das 3 categorias.
- As categorias são a **fonte única**, exportadas do gate — e a tabela da
  convenção é a leitura humana delas (o mesmo padrão de `FOOTERS_DE_VERSAO`).
- Dente: **mutação no repo real** — plantar um `.md` de 301 linhas (ou uma
  pendência fechada a mais) deixa o gate vermelho, sem tocar arquivo
  versionado.

### 2.4 Registro

`PREFLIGHT_CHECKS` + `RUNNERS` + registro de dentes + §Tabela de Checks do
`ci-defense-in-depth.md` + a tabela de gates do `docs/fluxo-desenvolvimento.md`
— que hoje afirma que a regra *"segue sem gate mecânico"*, e passa a ser
falso.

## 3. Fase 2 — as duas dividas de código

### 3.1 `@projeto/ui` sai

MEDIDO: `grep -rn "@projeto/ui" apps packages tooling .tooling tsconfig.base.json`
→ **uma** ocorrência, a própria declaração. Nenhum import. Os outros 3
aliases (`@projeto/shared-types`, `@projeto/shared-audit`,
`@projeto/shared-domain`) apontam para diretórios que **existem** — não são
mortos, e ficam.

A remoção é de **uma linha** em `tsconfig.base.json`. Verificação: `pnpm
typecheck` (4/4), `pnpm lint` (2/2) e `pnpm build` (2/2, incluindo o
`next build` de produção) — todos medidos verdes **depois** da remoção.

### 3.2 O instrumento que impede o próximo alias morto

`check-path-alias`: todo alias declarado em `paths` do `tsconfig.base.json`
tem de apontar para um diretório que **existe**. Sem ele, a regra "todo alias
aponta para onde existe" seria prosa — o mesmo defeito que este plano paga.

### 3.3 `@playwright/test` ganha o caret

**O pin é acidental.** MEDIDO:

- Nasceu no commit `e24141c7` (a instalação inicial da suíte), **sem
  comentário** no `package.json`, sem justificativa no corpo do commit e sem
  menção no corpo do PR #65.
- **Nada depende da versão exata**: não há imagem `mcr.microsoft.com/playwright`
  no repo (0 hits), não há `playwright install` com versão, não há
  `PLAYWRIGHT_BROWSERS_PATH`, e o peer opcional do `next`
  (`@playwright/test: ^1.51.1`) é satisfeito por `1.60.0` e por qualquer
  `1.x` acima disso.
- A revisão do browser (`chromium 1223`) mora **dentro do pacote** — trocar a
  versão troca o browser, e não há nada para re-pinar.

**E o caminho é o que a regra do repo quer.** O specifier exato é
**redundante para reprodutibilidade**: o `pnpm-lock.yaml` já fixa a versão
resolvida. MEDIDO: o registry tem `1.64.1` como última estável — ou seja,
`^1.60.0` sem lock poderia subir 4 minors e trocar o Chromium.

**Mas o lock segura.** MEDIDO 2026-10-29: com `"@playwright/test": "^1.60.0"`
e `pnpm install --lockfile-only`, o lock grava `specifier: ^1.60.0` e **mantém
`version: 1.60.0`** — o pnpm não re-resolve uma versão que a faixa aceita. O
diff do lock são 9 linhas: 1 do specifier e 8 de normalização do
peer-suffix do `next` (que carrega `@playwright/test` como peer opcional).
`pnpm install --frozen-lockfile` — o que o CI roda em 8 lugares — passa.

Resultado: **a regra do repo passa a valer sem exceção, e o comportamento
instalado não muda** (mesmo Playwright, mesmo Chromium).

## 4. Fase 3 — fechamento

| # | Entrega |
|---|---|
| 3.1 | `docs/MONOREPO.md` §3.2 (a regra do caret **sem** exceção) e §4 (3 aliases, nenhum morto) |
| 3.2 | `docs/STACK.md` (a versão do Playwright: `^1.60.0`, e a saída medida) |
| 3.3 | `docs/fluxo-desenvolvimento.md` (o teto **tem** gate; os 2 gates novos na tabela) |
| 3.4 | `check-version-footers` — os 4 footers canônicos concordam e não ficam atrás da última tag |
| 3.5 | Revisão por `code-reviewer` + `stack-code-reviewer` |
| 3.6 | `pnpm ci:local` verde (inclui a suíte e2e do Playwright, que roda com a versão **inalterada**) |
| 3.7 | Commits focados, push no **mesmo branch** (o PR #129 está aberto) e corpo do PR atualizado |

## 5. O Definition of Done

- [ ] `pnpm ci:preflight` verde, com **2 gates novos** rodando (40 no total).
- [ ] `pnpm tooling:test` verde — e a spec do `check-doc-size` **cai** quando o
      gate é neutralizado (mutação, não "controle negativo" de tmpdir).
- [ ] Nenhum `.md` **vivo** acima de 300 linhas: `git ls-files '*.md' | xargs
      wc -l | awk '$1>300'` devolve **só** as 3 categorias declaradas.
- [ ] `@projeto/ui` fora do `tsconfig.base.json`; `pnpm typecheck`, `pnpm lint`
      e `pnpm build` verdes.
- [ ] `check-path-alias` verde e **com dente**.
- [ ] `"@playwright/test": "^1.60.0"`, lock resolvendo `1.60.0`,
      `--frozen-lockfile` passando, e a regra do caret **sem** exceção na doc.
- [ ] A suíte e2e do Playwright verde (17 specs).

## 6. Fora de escopo (e por quê)

| Item | Por quê |
|---|---|
| **Subir o Playwright** para `1.64.1` (a última estável) | Seria uma mudança de comportamento (Chromium novo) em um PR de documentação. O caret **permite** o upgrade; ele é decisão à parte, com a suíte e2e revalidada. |
| **Remover `@projeto/shared-audit` e `@projeto/shared-domain`** | Apontam para diretórios que **existem** e podem ser intencação futura. Não são alias morto — e removê-los é escopo de quem usa. |
| **Dividir os 13 `.md` históricos** | São registro datado. Dividi-los falsearia o registro — e o teto nunca teve valor para eles. É o que a §2.1 declara. |
| **Um teto para o ledger de pendências** | O ledger para de crescer sozinho: pendência que fecha **sai** (§2.2). O teto deixa de ser a válvula de escape e vira consequência. |
