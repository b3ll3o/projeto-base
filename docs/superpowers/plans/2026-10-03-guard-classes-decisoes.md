---
name: guard-classes-decisoes
description: As 3 decisoes do owner do plano guard-classes (destino dos 34 results, onde ligar o differential, se a convencao entra no indice), cada uma com a medicao de 2026-10-05 que mudou a recomendacao. Sub-arquivo de docs/superpowers/plans/2026-10-03-guard-classes.md.
version: 1.0.0
updated: 2026-10-05
maintainer: stack-code-reviewer
related:
  - ./2026-10-03-guard-classes.md
  - ./2026-10-03-guard-classes-baseline.md
  - ../../../.agents/runs/state-snapshot-20261003T184236Z.md
---

# Decisões do owner — `guard-classes`

Sub-arquivo de [o plano](./2026-10-03-guard-classes.md). Existe porque as 3
decisões, com a evidência que as sustenta, não cabem no teto de 300 linhas do
plano — a divisão é a que a
[`tamanho-e-revisao.md`](../../../.agents/specs/conventions/tamanho-e-revisao.md)
prescreve.

**Data de referência: 2026-10-05.** Cada decisão foi reatacada depois de escrita, e
**duas das três recomendações caíram.** O número ao lado de cada afirmação é o que
eu medi, com o comando na baseline ou aqui.

---

## 1. O destino dos 34 results (task 1.4)

**Três saídas:** **(a)** mover tudo; **(b)** não mover; **(c)** arquivar só as **6
fontes de evidência**.

**A opção (c) — que a v2.1 recomendava — está errada.** Eu escrevi que ela "usa o
mecanismo de archive que o repo já tem". O mecanismo existe; **o formato não**.

| Medição | Comando | Saída |
|---------|---------|-------|
| results com os 8 campos do frontmatter de archive | comparar as chaves de `~/.claude/…/memory/b*-result.md` com `REQUIRED_FIELDS` em `archive-lint.ts:37` | **0 de 34** |
| esquema que os 34 realmente usam | idem | `name`, `description`, `metadata` — o schema de *memory*, não o de *archive* |
| campos que faltam | idem | `archived_at`, `original_run`, `demand_slug`, `prs`, `retro_refs`, `improvements`, `status`, `tags` — **34/34 perdem os 8** |
| exemplos do formato-alvo no repo | `find .agents/runs/archive -name '*.md' \| wc -l` (B14) | **0** — não há um único arquivo para copiar |

Então (c) não é "usar o que já existe": é uma **migração de schema** em 6 arquivos,
sem exemplo no repo, contra um linter que hoje **nem olha o diretório certo** (B19).

**O agravante que o plano não sabia:** pela B19, arquivar os 6 renderizaria `✓`
**sem validar nenhum deles** — porque o `archive:lint` que o preflight chama resolve
para `tooling/scripts/.agents/runs/archive`, que não existe. A opção (c), como
escrita, **entregaria a classe 1 que este plano existe para nomear.**

**O owner escolhe sabendo disso.** Se a resposta for "ainda assim, (c)", então 1.4
precisa ganhar, no mínimo: a migração dos 8 campos nos 6 arquivos, e a correção do
`--archive-dir` antes — senão o `✓` é teatro de novo.

---

## 2. Onde ligar o differential (task 4.1)

**`preflight` ou `ci:local`?** A v2.1 dizia: "8,2 s contra um preflight de ~10 s" e
"quase dobra o primeiro gate de todo push de PR". **O denominador estava errado.**

| Medição | Comando | Saída |
|---------|---------|-------|
| preflight, 5 corridas | `for i in 1..5; do time pnpm ci:preflight; done` | **2,512 · 2,527 · 2,528 · 2,533 · 2,526 s** |
| de onde veio o "~10 s" | `pnpm ci:local` | **10,101 s** — era o `ci:local`, não o preflight |
| differential, 3 corridas | `/usr/bin/time bash .tooling/scripts/ci/turbo-redirect-differential.sh` | **8,16 · 8,16 · 8,19 s** → 8,2 s se sustenta |
| efeito real | 2,5 s + 8,2 s | **quadruplica** o gate (2,5 → ~10,7 s), não "quase dobra" |
| o script roda onde o CI roda? | `sed -n '83p' .tooling/scripts/ci/turbo-redirect-differential.sh` | `node --experimental-strip-types -e "…"` |
| único uso da flag no repo | `git grep -n 'experimental-strip-types'` | **1**, só essa linha |
| onde a flag nasceu | release notes do Node | **22.6.0** (ago/2024) — o Node 20 nunca a teve |
| versão do CI | `grep -n 'node-version' .github/workflows/ci.yml` | **20** nos 3 jobs |
| o que o repo promete suportar | `package.json#engines.node` | `>=20.0.0` |

**A dependência não está declarada, e a Decisão 2 da v2.1 só listava "exige `pnpm
turbo` e um workspace temporário".** Sob Node 20 o comando é `bad option` — mas
isso é **inferido da release, não executado**: só há Node v24.15.0 nesta máquina
(`nvm ls` → uma versão), então a falha no CI está **medida quanto à dependência,
inferida quanto ao efeito.**

**Recomendo `ci:local`**, porque aí o custo quase dobra um gate que hoje leva 11 s,
e não um que leva 2,5 s. **E nenhum dos dois caminhos fecha sem decidir o Node**:
subir os 3 jobs para ≥22.6, ou reescrever a linha 83 sem a flag (`tsx`, que o repo
já tem). Sem essa segunda decisão, 4.1 entrega um gate que é verde local e **quebra
no CI** — a classe 1 deste plano, de novo, agora pelo motivo inverso.

---

## 3. A convenção nova entra no índice (task 2.2)?

A aritmética fecha; **a premissa não.**

| Medição | Comando | Saída |
|---------|---------|-------|
| convenções no diretório | `ls -1 .agents/specs/conventions/*.md \| wc -l` (B13) | **19** |
| linkadas no README | `grep -oE '\]\(\./[a-z-]+\.md\)' README.md \| sort -u \| wc -l` | **11** |
| não-linkadas no README | `comm -23 <(ls … \| xargs -n1 basename) <(grep … \| tr -d '](' \| sort -u)` | **8**, um deles o `README.md` → **7** |
| **das 7, estão no AGENTS.md?** | `grep -c '<arquivo>' AGENTS.md` para cada uma | **`evals.md` → 1, `engineering-loop.md` → 1**; as outras 5 → **0** |

A v2.1 afirmava que *"o índice morreu"*. **Falso, e falseado pelas 2 convenções mais
novas do repo** — `evals.md` e `engineering-loop.md`, ambas v1.9.0, estão no
`AGENTS.md` §6 (linhas 177-178), com link relativo que resolve. Elas nunca
espelharam no README das convenções.

O defeito real é **dois índices divergindo**: o `AGENTS.md` §6 (canônico, o que o
leitor lê) e o `README.md` das convenções (o que o `doc-sync` mantém). Isso muda o
trabalho de 2.2: não é "fechar um índice morto", é **espelhar nos dois** (ou eleger
um como canônico e declara-lo) — e as 5 realmente ausentes continuam órfãs nos dois.

**Recomendação mantida, escopo corrigido:** fechar as 7, sabendo que 2 delas já
têm chegada e 5 não têm.

---

## Revisão

- [x] `wc -l` ≤ 300
- [x] Cada número tem comando ao lado
- [x] As 2 recomendações que caíram estão marcadas como caídas, com o motivo
- [x] Links cruzados nos dois sentidos (plano ↔ este arquivo)
