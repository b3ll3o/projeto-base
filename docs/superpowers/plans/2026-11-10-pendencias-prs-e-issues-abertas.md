# Plano — as pendências dos PRs e da issue abertos, fechadas em UM PR

- **Data:** 2026-11-10
- **Branch:** `fix/pendencias-prs-e-issues-abertas`
- **Base:** `origin/main` = `d7a24ee` (v1.27.0, o #164 mergeado)
- **Origem:** os 6 PRs abertos + a issue #149
- **State snapshot:** [`.agents/runs/state-snapshot-20261110T221736Z.md`](../../../.agents/runs/state-snapshot-20261110T221736Z.md)

## 1. O que está aberto (medido 2026-11-10)

`gh pr list --state open` → **6**; `gh issue list --state open` → **1**.

| Item | Título | CI | Conteúdo |
|---|---|---|---|
| #163 | `fix(deps): a claim de advisories do registro volta a bater com o audit medido` | 🟢 6 ✓ | 1 arquivo: `.tooling/scripts/ci/excecoes-de-dependencias.json` (a prosa que afirmava 41 advisories) |
| #162 | `deps: Bump eslint from 9.39.5 to 10.14.0` | 🔴 2 falha | major |
| #161 | `deps: Bump @opentelemetry/exporter-trace-otlp-http from 0.54.2 to 0.301.0` | 🔴 2 falha | linha 0.x |
| #160 | `deps: Bump jsdom from 30.1.3 to 31.0.0` | 🔴 2 falha | major |
| #159 | `deps: Bump @opentelemetry/resources from 1.30.1 to 3.1.0` | 🔴 2 falha | major |
| #158 | `deps: Bump @opentelemetry/auto-instrumentations-web from 0.43.0 to 0.70.0` | 🔴 2 falha | linha 0.x |
| #149 | issue `documentation` / `severity:p2` / `type:gap` — "os pontos de atualização que a camada de skills ainda tem em aberto" | — | F1–F5 |

## 2. O que a medição encontrou

### 2.1 A causa comum dos 5 PRs vermelhos NÃO é a dependência deles

O `tooling/scripts/commit-msg-gate.ts` aceita 7 tipos — `feat`, `fix`, `chore`,
`docs`, `test`, `refactor`, `ci` — e a spec diferencial roda o gate sobre o
`git log --format=%s` **real** do repositório. O `.github/dependabot.yml` diz
ao Dependabot, no bloco `npm`:

```yaml
    commit-message:
      prefix: 'deps'
```

Logo, todo PR de npm nasce com subject `deps: Bump …` — tipo que **não** está
na lista. MEDIDO 2026-11-10:

| Medida | Comando | Resultado |
|---|---|---|
| PRs de npm com subject `deps:` | `gh pr list --state open` | **5**, todos com CI vermelho |
| PRs de `github-actions` | idem | 5 (#150–#154), prefixo `ci` → **todos verdes** |
| `deps:` no histórico | `git log --format=%s \| grep -c '^deps:'` | **0** — o tipo nunca entrou |
| a convenção do repo | `git log --format=%s \| grep -c '^chore(deps):'` | **2** |

A diferença entre o PR verde e o PR vermelho não é a dependência: é o prefixo
que o bot usa. O PR #162 (eslint) e o PR #150 (`actions/checkout`) falham ou
passam pelo mesmo motivo.

**A prova, no log do CI** (job `preflight` do PR #162, MEDIDO 2026-11-10):

```
"deps: Bump eslint from 9.39.5 to 10.14.0  ->  tipo \"deps\" fora da lista — use um de: feat, fix, chore, docs, test, refactor, ci (medido em git log; se o novo tipo é legítimo, acrescente aqui e o teste diferencial cobra)"
```

**O conserto é do config, não do PR:** `prefix: 'chore'` + `include: 'scope'`
produzem `chore(deps):` / `chore(deps-dev):` — o mesmo formato que o repo já
usa (`chore(deps):` × 2 no histórico), e `chore` está na lista do gate.

### 2.2 Por que as 5 versões não sobem agora (medido no registro)

`npm view <pkg>@<versão> dependencies peerDependencies engines --json`:

| PR | Incompatibility medida | Registro que segura |
|---|---|---|
| #162 eslint 10.14.0 | `eslint-config-next@15.5.29` declara `peerDependencies.eslint: ^7.23.0 \|\| ^8.0.0 \|\| ^9.0.0` — o 10 está fora | pendência `eslint` (majorNova 10) |
| #160 jsdom 31.0.0 | `engines.node: ^22.22.2 \|\| ^24.15.0 \|\| >=26.0.0` — o repo declara `engines.node: >=22.6.0` (o piso 22.6.0 não instala) | pendência `jsdom` (majorNova 31) |
| #159 resources 3.1.0 | o tarball exporta `type Resource` **só como tipo** (`grep "export {" dist/index.d.cts` → `type Resource`), e o repo usa `new Resource({…})` em **3 arquivos**: `apps/api/src/shared/infrastructure/telemetry/resource.ts:7`, `apps/web/instrumentation-client.ts:44`, `apps/web/instrumentation.node.ts:49` | pendência `@opentelemetry/resources` (majorNova 3) |
| #161 exporter 0.301.0 | `dependencies: { "@opentelemetry/sdk-trace": "3.1.0", … }` — o repo declara `@opentelemetry/sdk-trace-base: ^1.30.1`: duas gerações do SDK na mesma árvore | pendência `@opentelemetry/sdk-trace-base` (majorNova 2) |
| #158 auto-instrumentations-web 0.70.0 | `dependencies` puxam `instrumentation ^0.301.0`, `instrumentation-fetch ^0.301.0`, `instrumentation-document-load ^0.70.0`, `instrumentation-user-interaction ^0.69.0`; o repo declara `instrumentation-fetch ^0.54.2` e `instrumentation-document-load ^0.43.0` — duas gerações | pendência `@opentelemetry/resources` (majorNova 3) |

### 2.3 A pendência declarada não é instrumentada (o buraco que permite o pior)

`check-dependency-freshness` reprova quando a pendência envelhece por **pacote
removido** ou por **faixa que já permite a major** (`>=`). Ele **não** vê a
major **adotada**: `majorNova <= majorAtual` encerra o laço antes de a
pendência ser olhada.

MEDIDO 2026-11-10, plantando a árvore quebrada (as 5 `package.json` reais com
`eslint: ^10.14.0`, `@eslint/js: ^10.14.0`, `jsdom: ^31.0.0` e as duas
tabelas versionadas):

```
ok= true
errors= []
advisories= ["25 major(s) declarada(s) como pendentes, com dono e motivo, …"]
```

Ou seja: as 3 pendências dizem "a major **N** não sobe agora" e a árvore
declara a major N — e o gate **verde**. A regra que segura a política
("a major não sobe agora") não tem instrumento. É a lacuna que faz um PR de
major parecer normal.

### 2.4 A claim de advisories que envelheceu (F5)

MEDIDO 2026-11-10 com `pnpm --config.engine-strict=false audit --json`:

```
metadata.vulnerabilities: {"info":0,"low":1,"moderate":26,"high":3,"critical":1}   → 31
ids distintos: 26  (entre eles os 4 que reprovam: 1139528, 1242658, 1243066, 1124011)
```

O arquivo `.tooling/scripts/ci/excecoes-de-dependencias.json` afirma
**41** (1 crítica, 3 altas, 32 moderadas, 5 baixas). O PR #163 traz a
correção (31) e a nota de que o número envelhece — e a nota diz que
**"O gate NÃO o confere"**.

### 2.5 O ledger não enxerga a linha 0.x

`majorDeclarada('^0.54.2')` → `0`, e o registro grava `0` para os pacotes 0.x
(`@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/auto-instrumentations-web`,
`@opentelemetry/instrumentation-*`). Uma pendência de 0.x não tem como existir
no modelo atual — e por isso as duas dependências que o #158 e o #161 pedem
**não têm dono** no registro. (§6: fora do escopo deste PR, com o motivo.)

> A regra nova do freshness só julga a pendência **coerente** (`majorNova` >
> `majorAtual`): o modelo não diz "a major foi adotada" para um pacote 0.x, e
> uma pendência 0.x escrita à mão seria accuseada com uma mensagem sem
> sentido ("a major 0 não sobe agora"). MEDIDO 2026-11-10: com o corte, o gate
> não julga o que o modelo não expressa.

## 3. O escopo do PR único

| # | Arquivo | Mudança | Por quê |
|---|---|---|---|
| 1 | `.github/dependabot.yml` | bloco npm: `prefix: 'deps'` → `prefix: 'chore'` + `include: 'scope'`; o comentário que afirma "`versioning-strategy: increase` mantém o range `^`" (falso — o #162 subiu `^9.39.5` → `^10.14.0`) corrigido | nasce PR verde + a convenção do repo |
| 2 | `.tooling/scripts/ci/check-dependency-freshness.ts` (+ spec) | regra nova: pendência cuja major foi **adotada** (major declarada ≥ `majorNova` da pendência) → **ERRO** | a política "a major não sobe" passa a ter instrumento (§2.3) |
| 3 | `.tooling/scripts/ci/excecoes-de-dependencias.json` | a claim vai para **31** (medido em 2026-11-10) + campo `advisoriesEsperadas` (o número lido pela máquina, não só pela prosa) | F5 (§2.4) |
| 4 | `.tooling/scripts/ci/check-dependency-audit.ts` (+ spec) | compara o declarado com o medido: **declarado > medido → ERRO** (o repo afirma mais do que existe); **medido > declarado → aviso** (o registro publicou advisory nova — não é mudança do repo) | a claim deixa de envelhecer em silêncio |
| 5 | `.agents/specs/conventions/ci-defense-in-depth-dentes.md` | 2 linhas: contagem de testes e mutação dos 2 gates tocados | o registro de dentes é a fonte do "N testes" |
| 6 | `.agents/specs/conventions/ci-defense-in-depth.md` | 2 linhas do catálogo | idem |
| 7 | 6 footers + histórico de versões | 1.27.0 → **1.28.0** | o `check-version-footers` exige versão > última tag (`v1.27.0`) |
| 8 | `docs/fluxo-desenvolvimento.md` | a linha do `check-dependency-freshness` ganha o 3º caso de aging; a contagem de gates do preflight sai de **53** para **54** (MEDIDO 2026-11-10: `grep -cE "^\s+name: '" .tooling/scripts/ci/preflight-gates.ts` → 54 — a doc já estava defasada, e ela é tocada aqui) | a doc do fluxo é a fonte do "quem barra o quê" |
| 9 | este plano + state snapshot | registro datado | §1.2: a doc faz parte do código |

> **`docs/MONOREPO.md` fica com o footer bumpsado e SEM linha nova no histórico:** o
> arquivo está com **300 linhas** (o teto do `check-doc-size`), e o histórico de lá
> já pula versões (1.8.0, 1.15–1.19, 1.23, 1.24). `docs/STACK.md` e
> `estrutura-e-versionamento.md` recebem a linha — os dois têm folga no teto.

## 4. O que este PR **não** faz

- **Não adota nenhuma das 5 versões** — cada uma tem a incompatibilidade
  medida em §2.2 e o dono no registro de pendências.
- **Não generaliza o ledger para a linha 0.x** (§2.5): mudaria o formato do
  registro gerado, o `scan-dependency-majors`, o gate e as 25 pendências.
  É um PR de formato de dado, não de pendência de tracker — e as 2 PRs 0.x já
  estão barradas por incompatibilidade medida, não por política.
- **Não fecha a issue #149 por palavra-chave** — ela fecha com a tabela de
  estado, que é o que o dono propôs no comentário de 2026-11-09.
- **Não faz merge** — `main` é protegida; o merge é do dono.

## 5. Como cada pendência é fechada

| Item | Decisão | Onde fica registrado |
|---|---|---|
| #163 | **fechado** — o diff dele entra no PR #165 | commit `fix(gates):` + o arquivo |
| #162 | **fechado** — major de flat-config fora do peer do `eslint-config-next` | comentário de fechamento com a medida |
| #160 | **fechado** — `engines.node` incompatível com o piso do repo | idem |
| #159 | **fechado** — a classe `Resource` sai do pacote e 3 arquivos a usam | idem |
| #161 | **fechado** — o SDK 3.x contra o `sdk-trace-base` 1.x do repo | idem |
| #158 | **fechado** — duas gerações de instrumentação na mesma árvore | idem |
| #149 | **fechada** com a tabela de estado F1–F5 (§7) | comentário de fechamento + este plano |

## 6. A execução

1. Branch a partir do `origin/main` atualizado. ✔ (feito)
2. **TDD:** spec vermelha da regra nova do `check-dependency-freshness`
   (a árvore plantada da §2.3 tem que reprovar), e spec do drift de advisory
   (declarado ≠ medido → erro/aviso). — **FEITO**: as 2 specs ficaram
   vermelhas primeiro (`ok=true` com a major adotada; `undefined` sem o campo
   declarado) e o código depois as fez verdes.
3. Implementar 1–4. — **FEITO**, com as medições:
   - a regra nova do freshness: **2 de 20** caem com a regra neutralizada, e o
     gate contra o repo real reprova (EXIT=1) com a `majorNova` da pendência
     baixada para a major já declarada (restaurada: EXIT=0);
   - a conferência da claim do audit: **3 de 26** caem com ela neutralizada, e
     o gate contra o repo real reprova quando o `advisoriesEsperadas` declara 41
     contra os 31 medidos (restaurado: verde).
4. Medir a mutação dos 2 gates tocados e **re-medir** a contagem de testes
   das 2 linhas do registro de dentes (a contagem envelhece com a spec).
5. Atualizar o catálogo (6), os footers e o histórico (7).
6. `pnpm ci:preflight` (0 erro), suíte do tooling, `typecheck`, `lint`.
7. Commit, push, **1 PR**.
8. Fechar #158–#163 e a #149, com o motivo medido em cada comentário.
9. Revisar o PR (2 revisores em paralelo) e corrigir o que achar.

## 7. A tabela de estado da issue #149

| Ponto | O que era | Onde está | Estado |
|---|---|---|---|
| F1 | a camada de binding comparava wrapper × canônico | `check-binding-canonico` (#155) | ✅ entregue — e **superado**: a pasta `.claude/` saiu do repo (#157), os 29 wrappers foram junto, e a regra virou "DESCOBRÍVEL" (`check-agent-frontmatter`) |
| F2 | a camada de skills não tinha instrumento de cobertura | `check-skill-coverage` (#148) + `check-audit-skills` (#155) | ✅ entregue |
| F3 | a decisão de binding não tinha dono escrito | ADR-0008 + ADR-0009 | ✅ entregue |
| F4 | a cristalização memória→repo não fechava o laço nas 2 direções | `check-memory-crystallization` (#155) | ✅ entregue |
| F5 | a claim de advisories do registro não batia com o audit medido | este PR (itens 3 e 4) | ✅ entregue |

## 8. Aceitação

- [x] `pnpm ci:preflight` → **0 erro(s)**; 2 checks skipped (o mesmo painel do
      `origin/main`).
- [x] A spec do `check-dependency-freshness` reprova a árvore da §2.3
      (`REPROVA quando a pendencia envelhece porque a major foi ADOTADA`).
- [x] A spec do `check-dependency-audit` reprova o drift de advisory
      (**3 de 26** caem com a conferência neutralizada).
- [x] `pnpm tooling:test` → **1035 passed (1035)**, 56 arquivos.
- [x] Os 6 footers em 1.28.0, com a linha do histórico em
      `estrutura-e-versionamento.md` e `docs/STACK.md`.
- [x] `pnpm ci:local` verde (o gate de pre-push do repo).
- [x] 1 PR aberto (**#165**, `fix(deps): as pendências dos 6 PRs e da issue #149
      fechadas em UM PR`), com os 6 PRs antigos (#158–#163) e a #149 fechados e as
      6 branches apagadas — com as 6 tags `backup/<branch>` preservando o conteúdo
      que o exame de conteúdo mediu fora da `main`.
