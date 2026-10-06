# Revisão de pendências do PR #44 — 2026-10-06

> **Workflow:** [`pr-pendencias`](../workflows/pr-pendencias.md) (v1.11.0, primeira execução)
> **Branch:** `feat/guard-classes` · **PR:** #44 (OPEN, 40 commits desde `origin/main`)
> **Cabeçalho:** 6 pendências declaradas · 5 issues criadas · 2 vereditos descartados

## TL;DR

As 6 pendências do corpo do #44 foram **re-medidas contra o repo vivo**, cada uma com um segundo agente que tentou **refutar** a primeira medição. Nenhuma sobreviveu como estava escrita:

| # | Pendência declarada | Veredito | Destino |
|---|---|---|---|
| P1 | Task 1.4 (arquivar a demanda) é pós-merge por desenho | `mudou-de-forma` | [#49](https://github.com/b3ll3o/projeto-base/issues/49) |
| P2 | X5: 17 erros de tipo em `.tooling/` | `viva` | [#46](https://github.com/b3ll3o/projeto-base/issues/46) |
| P3 | Memory files dos agents: retro escreve fora do repo | `mudou-de-forma` | [#47](https://github.com/b3ll3o/projeto-base/issues/47) |
| P4 | Dockerfiles em `node:20` com `engines.node >=22.6` | `viva` | [#48](https://github.com/b3ll3o/projeto-base/issues/48) |
| P5 | `.husky/pre-push` do pr-refresh **NÃO** foi adicionado | **falsa** | [#45](https://github.com/b3ll3o/projeto-base/issues/45) |
| P6 | O scanner pode ser usado como RCE via corpo de PR | `decisão-de-não-construir` | — (ver abaixo) |

**`vivas / medidas: 2 / 6`** — duas continuam exatamente como declaradas (P2, P4). Três mudaram de forma e uma era falsa. Duas não são pendência: uma é decisão de dono já registrada, uma se provou ser decisão de não construir.

## Os quatro destinos

O workflow classifica cada veredito em um de quatro destinos, e a distinção é o produto — não o número de issues.

### `viva` — o defeito continua, e a issue é quase o item original

**P2** (`.tooling/` sem typecheck) e **P4** (`node:20` vs `engines.node`) sobreviveram intactos. Em ambas a pendência estava certa no essencial e a issue Adds o que faltava.

P2 ganhou a refutação de que **"exige um pacote no workspace, o que muda a topologia do monorepo"** é falso — o CI já roda `.tooling/` inteiro fora do workspace (`pnpm ci:preflight`, `pnpm tooling:test`). Fechar é um arquivo, um script e uma linha no `ci.yml`.

P4 ganhou o fato que ninguém mapeou e que **trava o conserto**: `check-docker-drift.ts:16` tem `REQUIRED_BASE_IMAGE = 'node:20-bookworm-slim'`. Trocar a imagem **quebra o gate** — rodado contra uma árvore já corrigida, ele devolve `ok = false`. E `.npmrc` não existe (medido: 0), então `pnpm install --frozen-lockfile` dentro do container em node 20 hoje só avisa; o dia em que alguém ligar `engine-strict` para fechar isso, o build quebra em vez de avisar. **Imagens antes de engine-strict, nunca o contrário.**

### `mudou-de-forma` — a pendência literal está errada, o problema de fundo não

**P1.** A Task 1.4 está correta como escrita: `demand-archiving.md` §1 exige `state == MERGED` e o PR está OPEN (`{"mergedAt":null,"state":"OPEN"}`). O que apareceu foi outra coisa — `docs/fluxo-desenvolvimento.md:137` afirma que o check #9 "com o diretório vazio se declara `skipped`". Ele renderiza `✓`, porque `skipped: true` só sai quando o diretório **não existe**, e ele existe com um `.gitkeep`. **Classe 1**: o ramo é inalcançável, e archive vazio e archive correto produzem a mesma saída. A frase é de `ad0ff70`, **em `main`** — logo não é pendência do #44, é de outro PR.

**P3.** Zero memory files mudaram — e o zero é medido, não vacuoso: `.agents/memory/` tem 21 arquivos rastreados e o caminho vizinho, no mesmo formato de comando, devolve 13. Só **1 dos 3** agents alterados teve delta comportamental: `doc-sync` passou a report-only (`grep -c process.exit tooling/scripts/doc-sync.ts` → 0). Os outros dois eram correção de path relativo. E a razão registrada ("a retro escreve no destino canônico, fora do repo") cita o destino do **result file**, que é outro artefato — `evolucao-agents.md` obriga memória por agent, com gatilho explícito *"após mudança de comportamento"*.

### A falsa — e a instrumentada

**P5** é a mais instructive: o corpo do #44 afirma que o hook não foi adicionado. Ele existe, está commitado (`34e4e5c`), está no range do PR e está ativo. O ponteiro da pendência manda ler "Decisões pendentes" do `pr-refresh.md` — seção que tem **um** item só, e **zero** menções a `pre-push`.

O agente que a refutou trouxe mais do que a refutação:

```bash
$ gh pr view 44 --json body -q .body | grep -c 'pr-refresh:live'
0
```

O marcador que faz o `pr-refresh` reescrever o header **não está no corpo**. Sem ele o hook roda, acha 7 claims divergentes, imprime `marcadas=0` e sai por `.husky/pre-push:33-38`, que engole o código de saída. `grep -rn 'pr-refresh' .github/` → **0**. **Todo PR novo nasce inativo, e nenhum gate exige o marcador.** E `pr-refresh-scan.ts:46` reconhece só cinco classes numéricas (`commits|arquivos|insercoes|remocoes|testes`) — uma afirmação de existência ("NÃO foi adicionado") não é número e é **invisível para o instrumento construído para vigiar o corpo**.

### `decisão-de-não-construir` — o descarte

**P6** (o scanner poderia ser RCE via corpo de PR) foi refutado. A proibição **está** versionada: `pr-refresh.md:46`, commitada em `2311e2f`. Verifiquei antes de descartar — Se eu tivesse aceitado o "não construa" sem checar, teria criado uma issue para um controle que existe.

## Duas medidas que não estavam na lista

1. **O `pr-refresh-scan.ts` só reconhece claims numéricos.** Uma pendência que envelhece por ser *prosa* está fora do alcance do scanner por construção — o instrumento reescreve a região marcada, e a lista de pendências é prosa livre. A #45 registra isso como item 4, marcado como decisão de dono.
2. **O hook nasce inativo no PR que o introduz**, com 0 cobertura de CI. É classe 7 operando dentro da PR que a combate.

## Uma correção que este próprio run teve

**A primeira versão da [#46](https://github.com/b3ll3o/projeto-base/issues/46) trazia uma tabela de `17 / 20 / 19` erros de tipo.** Ao re-verificar antes de escrever este arquivo, **nenhuma combinação de glob e flags reproduziu esses números.** A tabela estava errada, e a issue foi corrigida com os valores que rodam, cada um com o comando ao lado (14 sem `noUncheckedIndexedAccess`, 27 com; 25/32/25 nas outras combinações).

A mesma issue afirmava que 14 erros de `noUncheckedIndexedAccess` estavam "concentrados em `check-doc-refs` (7) e `check-package-json-drift` (3)". Os dois números de arquivo estão certos; o 14 era a contagem **com a flag desligada**, e os dois arquivos somavam 10 dos 13 — faltava `review-router.ts` (3).

Os outros quatro vereditos foram auditados com o mesmo critério e **todos os números reproduzem**.

Isto é a classe 7 operando **no artefato deste run**, e é a razão de o critério de "feito" das cinco issues ser **por comando, não por número**. Um número num título envelhece a cada commit posterior — inclusive os que a própria issue pede.

## Estado do PR

Nada foi commitado. O corpo do #44 **continua falso** (o `pnpm pr:refresh` que corrige o header foi rodado com `--dry-run`; o marcador não está lá, e o PATCH do corpo foi negado pelo classificador de segurança — fica como comando do usuário):

```bash
pnpm pr:refresh            # liga o marcador e reescreve L7/L34/L35
```

Ver [`pr-refresh.md`](../workflows/pr-refresh.md) para o workflow irmão, que mede **números**; este mede **afirmações**.

## Cross-refs

- Workflow: [`pr-pendencias.md`](../workflows/pr-pendencias.md) · [`WORKFLOWS.md`](../WORKFLOWS.md)
- Convenção: [`guard-classes.md`](../specs/conventions/guard-classes.md) — classe 1 (gate que nunca dispara) e classe 7 (claim que envelhece)
- Método: [`demand-archiving.md`](../specs/conventions/demand-archiving.md), [`ci-defense-in-depth.md`](../specs/conventions/ci-defense-in-depth.md)
