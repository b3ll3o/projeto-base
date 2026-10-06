# Convenção: CI Defense in Depth — Estratégia de Defesa em Camadas

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).
> pt-BR prose, English technical identifiers.

## Objetivo

Drift estrutural (cross-refs quebradas em docs, tsconfigs divergentes,
regras ESLint legadas, extensões faltando em `tsconfig`) **não é capturado
por testes unitários nem por cobertura**: código compila e passa, mas o
monorepo fica progressivamente inconsistente até quebrar um build aleatório.
A estratégia defense-in-depth ataca o problema em **camadas progressivas** —
quanto mais cedo o drift é detectado, menor o custo do feedback loop e menor a
chance de merge de uma regressão estrutural.

São **3 camadas**: pre-push local (dev), preflight CI job (primeiro gate),
quality CI jobs (lint/typecheck/test/coverage, gated).

## As 3 Camadas

### Camada 1 — Pre-push local

`pnpm ci:local` roda **tudo que o CI roda** antes de `git push`, detectando
drift estrutural em ~11 s em vez de ~4 min de round-trip. Falha localmente
antes de gastar CI remoto. Script no `package.json` raiz; detalhes em
[git-workflow.md §Pre-Push Quality Gate](./git-workflow.md).

### Camada 2 — Preflight CI job

Workflow `.github/workflows/ci.yml`, job `preflight`. **Primeiro job do
pipeline** — os demais (lint, typecheck, test, coverage) declaram
`needs: preflight` e não rodam se ele falhar. São os checks estruturais
registrados em [`preflight.ts`](../../../.tooling/scripts/ci/preflight.ts) —
a contagem envelhece, então quem precisar dela roda
`grep -cE "^\s+name: '" .tooling/scripts/ci/preflight.ts`. Todos vivem em
`.tooling/scripts/ci/` exceto o lint da matriz;
veja a [Tabela de Checks](#tabela-de-checks) e o
[Registro de dentes](#registro-de-dentes).

### Camada 3 — Quality CI

Lint, typecheck, test, coverage. Roda **apenas se preflight passou**.
~4min. Aplica as regras funcionais (negócio, tipos, cobertura 80% por
[cobertura-testes.md §CI Defense in Depth](./cobertura-testes.md)).

## Tabela de Checks

Escopo de todos: **todo `.md` versionado** sob a raiz que o preflight passa
(`docs` **e** `.agents/specs`) — o cabeçalho de `preflight.ts:7` diz "docs e
.agents/specs", e foi ele que pegou o link quebrado desta própria tabela.

| Check | Tipo | Detecta |
|---|---|---|
| `check-doc-refs` | cross-refs | paths relativos quebrados em qualquer `.md` versionado do escopo |
| `check-tsconfig-drift` | tsconfig | extensões/extends divergentes entre tsconfigs |
| `check-eslint-drift` | eslint config | regras duplicadas/legadas em configs ESLint |
| `check-turbo-drift` | turbo pipeline | drift em `turbo.json` (`$schema` ausente, nomes inválidos, `cache:false` com `outputs`) |
| `check-package-json-drift` | package.json raiz | scripts canônicos ausentes, `tsx <path>` fantasma, ou `turbo run <task>` que o turbo não resolve |
| `check-docker-drift` | docker | `.dockerignore` ausente, `Dockerfile` > 100 linhas, base image sem glibc (distro) ou com major ≠ a de `engines.node` (major) — as duas são guardas separados |
| `check-archive-integrity` | archive | frontmatter canônico de `.agents/runs/archive/*.md` |
| `check-memory-dir-concordance` | retro | segunda declaração do destino do result file, em 6 notações históricas |
| `check-agent-memory-drift` | agents | agent com **mudança de comportamento** e memória (`.agents/memory/<agent>.md`) intocada no mesmo range |
| `check-tooling-typecheck` | typecheck | erro de tipo em `.tooling/scripts/**` sob a barra de `tsconfig.base.json`; `tsc` != 0 **sem** diagnóstico também é vermelho (issue #46) |
| `review-routing` matrix lint | roteamento | YAML inválido, reviewer inexistente, pattern duplicado, LOC > 300, `blocking: true` casando 0 arquivos |
| `check-branch-up-to-date` | git workflow | demanda que não contém `origin/main` (regra de rebase de [`git-workflow.md`](./git-workflow.md)); "sem ancestral comum" é motivo **diferente** de "atrasada"; rebase **parado em conflito** é vermelho antes de qualquer contagem; base ausente é `skipped`, nunca verde |

> **`check-types.ts` NÃO é um check** e saiu desta tabela: tem um único
> `export interface CheckResult` (medido, `wc -l` = 23) e é importado **só**
> como `import type`. A versão anterior lhe atribuía uma capacidade e um custo
> que **não existem** — foi a task 3.1 do plano
> [`guard-classes`](../../../docs/superpowers/plans/2026-10-03-guard-classes.md)
> que mediu e corrigiu. A [SKILL](../../skills/ci-defense-in-depth/SKILL.md)
> já dizia certo ("— não roda"); a convenção é que estava errada.
>
> **A coluna "Custo" foi removida, não corrigida.** Ela somava **16 s**
> (5+3+3+1+2+2) para um preflight medido em **~2,6 s** — e o preflight não
> imprime tempo por check, então nenhum dos números tinha derivação. Somar
> números inventados numa coluna que ninguém consegue reproduzir é a classe 7
> desta demanda; o que dá para medir hoje é o todo, e o todo mudou quando a
> task 4.1 ligou o differential:
> `time pnpm ci:preflight` → **10,84 / 10,77 / 10,78 s** (medido 2026-10-05,
> n=3, com o array completo de checks). O mesmo comando com os 12 checks de
> antes da 4.1 dava **2,62 / 2,64 / 2,62 s** (n=3), e o
> `turbo-redirect-differential.sh` sozinho mede **8,17 / 8,15 / 8,20 s**
> (n=3) — `2,62 + 8,17 = 10,79`, que bate com os 10,78. É essa aritmética que
> a coluna inventada não tinha: um custo que não fecha com o todo não é um
> custo, é uma história.

Todos os checks seguem o template `CheckResult` compartilhado
extraído em commit `59eb083` (refactor que consolidou fixtures herméticas).

## Registro de dentes

> **Verde não é prova.** Um gate que roda sobre uma árvore já verde é
> indistinguível de um gate que não faz nada. Por isso cada gate declara
> **como se prova que tem dentes** — e a prova é sempre um **vermelho**.

| Nível | O que é | Vale como prova? |
|---|---|---|
| **mutação** | o teste quebra o **sistema real** e afirma vermelho | **sim** — a única que prova |
| **controle negativo** | alimenta entrada errada (tmpdir) e afirma vermelho | parcial — prova a lógica, não a integração |
| **desconhecida** | só afirma verde | **não** |

| Gate | Onde o dente está | Nível | Comando da prova | Arquivo |
|---|---|---|---|---|
| `check-archive-integrity` | `check-archive-integrity.spec.ts` — `arquivo INVÁLIDO no archive REAL` + `arquivo inválido no diretório ERRADO` (o par) | **mutação** | comando 1 → **3 de 7 vermelho** (medido 2026-10-05) | `.tooling/scripts/ci/check-archive-integrity.ts` |
| `check-memory-dir-concordance` | `check-memory-dir-concordance.spec.ts` — `a derivação canônica resolve para um diretório que existe de verdade` | **mutação** | comando 2 → **3 de 27 vermelho** (medido 2026-10-05) | `.tooling/scripts/ci/check-memory-dir-concordance.ts` |
| `check-agent-memory-drift` | `check-agent-memory-drift.spec.ts` — o par `APENAS path corrigido NÃO é delta` / `prosa NOVA É delta` + `findDriftedAgents` com memória tocada | **mutação** | `npx vitest run --root .tooling/scripts/ci check-agent-memory-drift` → **5 de 12** com `hasBehaviorDelta` sempre true, **3 de 12** com `findDriftedAgents` sempre vazio (medido 2026-10-06) | `.tooling/scripts/ci/check-agent-memory-drift.ts` |
| `check-tooling-typecheck` | `check-tooling-typecheck.spec.ts` — `NÃO reporta verde quando o tsc falha sem imprimir diagnóstico` / `…sem saída nenhuma` (o par) | **mutação** | `npx vitest run --root .tooling/scripts/ci check-tooling-typecheck` → **3 de 11** com `parseTscDiagnostics` sempre `[]`, **2 de 11** com o `status !== 0` neutralizado (medido 2026-10-06, issue #46) | `.tooling/scripts/ci/check-tooling-typecheck.ts` |
| `check-turbo-drift` | `check-turbo-drift.spec.ts` — 5 de 6 testes | controle negativo | `npx vitest run --root .tooling/scripts/ci check-turbo-drift` | `.tooling/scripts/ci/check-turbo-drift.ts` |
| `check-package-json-drift` | `check-package-json-drift.spec.ts` — 9 de 23 | controle negativo | `npx vitest run --root .tooling/scripts/ci check-package-json-drift` | `.tooling/scripts/ci/check-package-json-drift.ts` |
| `check-docker-drift` | `check-docker-drift.spec.ts` — o par `alpine é VERMELHA por glibc` / `base image na major ATUALIZADA é VERDE`, mais `as duas são motivos DIFERENTES` | **mutação** | `npx vitest run --root .tooling/scripts/ci check-docker-drift` → **2 de 8** com o guarda de distro neutralizado, **2 de 8** com o de major (medido 2026-10-06, issue #48) | `.tooling/scripts/ci/check-docker-drift.ts` |
| `check-eslint-drift` | `check-eslint-drift.spec.ts` — 2 de 5 | controle negativo | `npx vitest run --root .tooling/scripts/ci check-eslint-drift` | `.tooling/scripts/ci/check-eslint-drift.ts` |
| `check-doc-refs` | `preflight.spec.ts` → `describe('checkDocRefs')` — **o spec não é `check-doc-refs.spec.ts`**, é o do runner | controle negativo | `npx vitest run --root .tooling/scripts/ci -t checkDocRefs` | `.tooling/scripts/ci/check-doc-refs.ts` |
| `review-routing` matrix lint | `tooling/scripts/lint-review-routing.spec.ts` — **diretório diferente** (veja a armadilha abaixo) | controle negativo | `npx vitest run --root tooling/scripts lint-review-routing` | `tooling/scripts/lint-review-routing.ts` |
| `check-tsconfig-drift` | `check-tsconfig-drift.spec.ts` — 1 de 2 | controle negativo | `npx vitest run --root .tooling/scripts/ci check-tsconfig-drift` | `.tooling/scripts/ci/check-tsconfig-drift.ts` |
| `check-teeth-registry` | `check-teeth-registry.spec.ts` — 13 testes | **mutação** | comando 3 → **vermelho nomeando o gate** (medido 2026-10-05) | `.tooling/scripts/ci/check-teeth-registry.ts` |
| `check-self-firing-guard` | `check-self-firing-guard.spec.ts` — 10 testes | **mutação** | comando 5 → **diferencial vira 0 → 0** (medido 2026-10-05) | `.tooling/scripts/ci/check-self-firing-guard.ts` |
| `turbo-redirect-differential` | o próprio script — 18 formas de redirect contra o turbo REAL; e o comando 7. **O veredito** (`[ "$div" -eq 0 ]`) é coberto por `turbo-redirect-differential.spec.ts` — 2 de 3 | **mutação** | comando 7 → **1 e 3 de 18 divergentes**; e o veredito `-eq 0` → `-ge 0` → **2 de 3 vermelho** (medido 2026-10-05) | `.tooling/scripts/ci/turbo-redirect-differential.sh` |
| `check-harness-owner` | `check-harness-owner.spec.ts` — 19 testes, incluindo o segundo órfão | **mutação** | comando 6 → **exit 0** (medido 2026-10-05) | `.tooling/scripts/ci/check-harness-owner.ts` |
| `check-branch-up-to-date` | `check-branch-up-to-date.spec.ts` — `VERMELHO numa demanda implementada com a main desatualizada` / `após o rebase, a mesma demanda fica verde` (o par, contra **git de verdade**), mais `NÃO confunde "sem ancestral comum" com "atrasada"` e `VERMELHO, e nomeando o estado, com um rebase PARADO em conflito` | **mutação** | `npx vitest run --root .tooling/scripts/ci check-branch-up-to-date` → **2 de 9** com a detecção de "atrasada" neutralizada, **1 de 9** com `128` fundido em "atrasada", **2 de 9** com o `skipped` removido, **1 de 9** com o rebase-em-andamento neutralizado, **1 de 9** com a junção do caminho ao `repoRoot` removida (medido 2026-10-06) | `.tooling/scripts/ci/check-branch-up-to-date.ts` |

> A coluna **Arquivo** é a chave de reconciliação, e não um enfeite: o
> `check-teeth-registry` casa o registro com o `preflight.ts` por ela. Sem a
> coluna, o gate é identificado pelo **nome de exibição** — e aí
> `'Cross-refs em .md versionados'` casa com `` check-doc-refs `` por
> coincidência, `check-eslint-drift` (2 entradas) contaria como dois gates, e
> qualquer gate novo entraria no preflight sem aviso. Foi a ausência desta
> coluna que o check acusou na primeira execução (9 de 9 sem correspondência).

Os **sete comandos de mutação**, medidos 2026-10-05. Cada um reverte o
arquivo ao final — a mutação é efêmera por desenho, e o `git diff` depois
deles tem de estar vazio:

```bash
# 1) check-archive-integrity — reintroduz o B19: sem --archive-dir, o linter
#    resolve relativo ao SEU cwd (tooling/scripts) e nunca lê o archive real.
sed -i "s|\`--archive-dir=\${archiveDir}\`||" .tooling/scripts/ci/check-archive-integrity.ts
npx vitest run --root .tooling/scripts/ci check-archive-integrity   # -> 3 de 7 vermelho
git checkout -- .tooling/scripts/ci/check-archive-integrity.ts

# 2) check-memory-dir-concordance — a derivação canônica passa a apontar para
#    um path que ninguém cria. O path é neutro de propósito: um caminho real
#    aqui seria uma 2ª declaração do destino, que é o defeito que o check caça.
sed -i 's|^MEMORY_DIR=.*|MEMORY_DIR="$HOME/caminho-que-nao-existe/memory"|' \
  .agents/specs/conventions/retrospective-capture.md
npx vitest run --root .tooling/scripts/ci check-memory-dir-concordance  # -> 3 de 27 vermelho
git checkout -- .agents/specs/conventions/retrospective-capture.md

# 3) check-teeth-registry (reconciliação) — some uma linha da tabela de dentes.
#    O gate continua RODANDO; é a documentação que ficou órfã. Vermelho
#    nomeando o arquivo, não um "registro divergente" genérico.
sed -i '/^| `check-docker-drift` |/d' .agents/specs/conventions/ci-defense-in-depth.md
npx tsx .tooling/scripts/ci/check-teeth-registry.ts   # -> 1 erro, nomeando check-docker-drift.ts
cp /tmp/ci-defense.bak .agents/specs/conventions/ci-defense-in-depth.md   # restaurado byte-exato

# 4) check-teeth-registry (roteamento) — o prefixo de "." some da path_glob.
#    A rota continua existindo e o lint da matrix continua verde (a regra não é
#    blocking): só que ela casa 0 arquivos. 12 dos 13 gates ficam sem rota —
#    classe 1, "condição inalcançável". Este é o RED que a task 3.2 achou.
sed -i 's|- pattern: "\.tooling/scripts/ci/\*\*"|- pattern: "tooling/scripts/ci/**"|' \
  .agents/specs/conventions/review-routing.md
npx tsx .tooling/scripts/ci/check-teeth-registry.ts   # -> 12 erros "não alcançado por nenhuma path_glob"
sed -i 's|- pattern: "tooling/scripts/ci/\*\*"|- pattern: ".tooling/scripts/ci/**"|' \
  .agents/specs/conventions/review-routing.md       # restaurado byte-exato

# 5) check-self-firing-guard (classe 3) — a isenção mecânica é neutralizada.
#    O guard NÃO fica vermelho: a linha que cita o nome dele casa o símbolo
#    que é parte do próprio nome, e a seção canônica o absorve. É por isso
#    que este check é um DIFERENCIAL (N → 0) e não uma asserção de verde —
#    sem o `N`, "verde" e "isenção inerte" são o mesmo resultado.
perl -0pi -e "s|return line\.replaceAll\(SELF_NAME, ''\);|return line;|" \
  .tooling/scripts/ci/check-memory-dir-concordance.ts
npx tsx .tooling/scripts/ci/check-self-firing-guard.ts   # -> 8 erros "dispara em si mesmo"
perl -0pi -e "s|^function stripSelfName\(line: string\): string \{\n  return line;\n\}|function stripSelfName(line: string): string {\n  return line.replaceAll(SELF_NAME, '');\n}|m" \
  .tooling/scripts/ci/check-memory-dir-concordance.ts   # restaurado byte-exato (conferido com diff)

# 6) check-harness-owner (controle desligado) — a prova de dente é INVERTIDA:
#    neutraliza-se a resolução de dono, e o check tem de FICAR VERDE. Se ele
#    continuar vermelho, o vermelho não vinha da dívida — vinha de outra coisa.
perl -i -pe "s/^  const owners: string\[\] = \[\];\$/  const owners: string[] = ['preflight.ts#checks']; return owners;/" \
  .tooling/scripts/ci/check-harness-owner.ts
npx tsx .tooling/scripts/ci/check-harness-owner.ts   # -> exit 0
perl -i -pe "s/^  const owners: string\[\] = \['preflight.ts#checks'\]; return owners;\$/  const owners: string[] = [];/" \
  .tooling/scripts/ci/check-harness-owner.ts   # restaurado byte-exato (conferido com diff)

# 7) turbo-redirect-differential — o parser volta a errar a forma que o
#    turbo real trata como task. Duas mutações medidas: perder o `>&` deixa
#    1 de 18 divergente, perder a proteção de aspas deixa 3 de 18.
perl -0pi -e 's|\.replace\(/>&/g, `>\$\{BOTH_STREAMS\}`\);|.replace(/x-NEVER/g, `x`);|' \
  .tooling/scripts/ci/check-package-json-drift.ts
bash .tooling/scripts/ci/turbo-redirect-differential.sh   # -> exit 1, "1 divergentes"
cp /tmp/cpjd.bak .tooling/scripts/ci/check-package-json-drift.ts   # restaurado byte-exato
```

> **A cobertura do comando 7 tem um limite, nomeado porque um leitor que
> tropeça nele vai concluir que o gate é inerte.** Remover o
> `nextIsRedirectTarget = false` de dentro do `if` — o bug da 3ª versão do
> parser — **deixa o differential VERDE**: nas 18 formas do corpus esse
> `reset` só muda o resultado quando um operador *nu* é seguido de *duas*
> tasks, e o corpus tem `build > ALVO` (uma task depois) e
> `build >out.log ALVO` (alvo colado), nunca `build > ALVO build2`. Não é
> dente fraco: é **cobertura** — a mesma distinção da coluna Nível, e um gate
> diferencial mede o corpus dele, nunca o infinito.

Os números deste registro são medidos e trazem o `n` ao lado. O comando 7
divergente em **1 e 3 de 18** formas (n=2 mutações: perder o `>&`, perder a
proteção de aspas) — citar uma só seria o mesmo erro do `3+` com outro
número. A classe 3 diverge em **8** erros (n=1 mutação). A primeira redação
dizia "`3+`" por ter lido três linhas: o mesmo erro do `X8` do backlog, e a
coluna Nível existe para torná-lo visível. Já envelheceram — classe 7.

Um segundo acerto veio da redação anterior: ela citava o símbolo que o guard
procura, e o guard — com razão — a acusou enquanto eu a escrevia. Um guard que
pega o autor da própria documentação está funcionando; o conserto é no texto,
nunca no guard.

> Comandos 3 a 5 **não** usam `git checkout --` como 1 e 2: reverteriam
> trabalho ainda não commitado de quem está no meio da task. O `sed`/perl
> inverso é a restauração, conferido com `diff` contra um backup.

**A armadilha de ler este registro por nome de arquivo.** `tooling/` e
`.tooling/` são **dois diretórios distintos**, ambos versionados, ambos rodados
pelo mesmo `pnpm tooling:test`. Todos os `check-*` vivem em `.tooling/scripts/ci/`;
o `lint-review-routing` e o `archive-lint` em `tooling/scripts/`; e o spec do
`check-doc-refs` mora dentro do `preflight.spec.ts`. Indexar por
`ls check-*.spec.ts` conclui, errado, que dois deles não têm spec.

**Três claims da tabela já tinham envelhecido**, corrigidas ao montá-la:
(a) `check-types` nunca foi check — ver a nota acima; (b) a coluna "Custo" foi
removida, e o motivo está na [Tabela de Checks](#tabela-de-checks); (c) o
teste `a derivação canônica resolve para um diretório que existe de verdade`
tinha **o nome de um dente e a assertion de um verde** (`ok:true, errors:[]`,
idêntica à do vizinho). Um teste cujo nome promete mais do que a assertion
entrega é a classe 7 em forma de spec — e só apareceu porque o registro exige
classificar por **nível**, e não por **contagem de testes**. Corrigido: o teste
agora executa a derivação e verifica que o path derivado existe.

## Comando de Verificação

```bash
# Local (camada 1 — tudo que o CI roda)
pnpm ci:local

# Apenas preflight (camada 1 reduzida, ~10s)
pnpm ci:preflight
```

`pnpm ci:local` é o pré-requisito de push em `AGENTS.md` §6;
`pnpm ci:preflight` é o atalho para devs iterando em docs/tsconfig.

## Histórico de drift detectado

Só entram aqui os rows em que um check **achou** algo. A introdução de um
check é TDD (Red→Green→Refactor — ver [tdd.md](./tdd.md)) e vive no git.

| PR / commit | Check | Drift | Correção |
|---|---|---|---|
| `df70f5d` | `check-doc-refs` | falsos positivos em code blocks | preflight pula code blocks |
| `4b3d297` | registro de dentes | 3 claims envelhecidos (gate de `check-types`, coluna "Custo", teste com nome de dente e assertion de verde) | corrigidos; ver [Tabela de Checks](#tabela-de-checks) |

## Pendências conhecidas

As pendências abertas vivem no companion
[`ci-defense-in-depth-pendencias.md`](./ci-defense-in-depth-pendencias.md).
Elas crescem a cada gate novo e este documento está no teto de 300 linhas da
convenção [`tamanho-e-revisao.md`](./tamanho-e-revisao.md) — um item novo aqui
significa um corte em outro.
## Dívida de controles

Controles que **existem e não rodam** — o oposto da tabela de dentes, que só
lista o que o `preflight` invoca. Escrever a dívida aqui é o que impede a
convenção de publicar uma regra sobre controle desligado enquanto entrega um
controle desligado.

**Nenhuma em aberto (2026-10-05).** A única era o
`turbo-redirect-differential.sh` — 2 menções, 0 invocações (B11) — e fechou na
task 4.1, que lhe deu dono no `preflight`. A seção fica, e vazia de propósito:
`check-harness-owner` garante que ela continue vazia, e um detector de dívida
que some junto com a dívida deixa de existir no dia em que a dívida volta.

## Cross-references

- [git-workflow.md §Pre-Push Quality Gate](./git-workflow.md)
- [cobertura-testes.md §CI Defense in Depth](./cobertura-testes.md)
- [post-merge-release.md](./post-merge-release.md)
- [../../skills/ci-defense-in-depth/SKILL.md](../../skills/ci-defense-in-depth/SKILL.md)
