# Convenção: CI Defense in Depth — Estratégia de Defesa em Camadas

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).
> pt-BR prose, English technical identifiers.

## Objetivo

Drift estrutural (cross-refs quebradas em docs, tsconfigs divergentes,
regras ESLint legadas, extensões faltando em `tsconfig`) **não é capturado
por testes unitários nem por cobertura**: código compila e passa, mas o
monorepo fica progressivamente inconsistente até quebrar um build
aleatório. A estratégia defense-in-depth ataca o problema em **camadas
progressivas** — quanto mais cedo o drift é detectado, menor o custo do
feedback loop (5s local vs 4min no CI) e menor a chance de merge de uma
regressão estrutural.

A estratégia tem **3 camadas**: pre-push local (dev), preflight CI job
(primeiro gate), quality CI jobs (lint/typecheck/test/coverage, gated).

## As 3 Camadas

### Camada 1 — Pre-push local

`pnpm ci:local` roda **todas as validações que o CI roda** em ~30–60s.
Devs executam **antes** de `git push`. Detecta drift estrutural em ~5s
(o que o CI detectaria em ~4min). Falha localmente antes de gastar um
round-trip com o CI remoto. Script definido em
`package.json` raiz; detalhes em [git-workflow.md §Pre-Push Quality
Gate](./git-workflow.md).

### Camada 2 — Preflight CI job

Workflow `.github/workflows/ci.yml`, job `preflight`. **Primeiro job do
pipeline** — demais jobs (lint, typecheck, test, coverage) declaram
`needs: preflight` e não rodam se preflight falhar. Falha rápido em
~10s com 3 checks estruturais: `check-doc-refs`,
`check-tsconfig-drift`, `check-eslint-drift` (todos sob
`.tooling/scripts/ci/`). Veja a [Tabela de Checks](#tabela-de-checks).

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
| `check-docker-drift` | docker | `.dockerignore` ausente, `Dockerfile` > 100 linhas, base image ≠ `node:20-bookworm-slim` |
| `check-archive-integrity` | archive | frontmatter canônico de `.agents/runs/archive/*.md` |
| `check-memory-dir-concordance` | retro | segunda declaração do destino do result file, em 6 notações históricas |
| `review-routing` matrix lint | roteamento | YAML inválido, reviewer inexistente, pattern duplicado, LOC > 300, `blocking: true` casando 0 arquivos |

> **`check-types.ts` NÃO é um check** e saiu desta tabela. Ele contém um único
> `export interface CheckResult` (medido: `wc -l` = 23, um `export`). Não há
> lógica para rodar — ele é importado **só** como `import type` pelos outros
> 9 arquivos. A versão anterior desta tabela lhe atribuía uma capacidade
> ("tipos inconsistentes em scripts CI") e um custo ("~1s") que **não existem**:
> foi a task 3.1 do plano [`guard-classes`](../../../docs/superpowers/plans/2026-10-03-guard-classes.md)
> que mediu e corrigiu. A [SKILL](../../skills/ci-defense-in-depth/SKILL.md)
> já dizia certo ("— não roda"); a convenção é que estava errada.
>
> **A coluna "Custo" foi removida, não corrigida.** Ela somava **16 s**
> (5+3+3+1+2+2) para um preflight medido em **~2,6 s** — e o preflight não
> imprime tempo por check, então nenhum dos números tinha derivação. Somar
> números inventados numa coluna que ninguém consegue reproduzir é a classe 7
> desta demanda; o que dá para medir hoje é o todo:
> `time pnpm ci:preflight` → **2,62 / 2,64 / 2,62 s** (medido 2026-10-05,
> n=3, com os 12 checks do array). Um único `time` é `n=1` e não generaliza —
> por isso o `n` está escrito ao lado do número, e não é enfeite.

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
| `check-turbo-drift` | `check-turbo-drift.spec.ts` — 5 de 6 testes | controle negativo | `npx vitest run --root .tooling/scripts/ci check-turbo-drift` | `.tooling/scripts/ci/check-turbo-drift.ts` |
| `check-package-json-drift` | `check-package-json-drift.spec.ts` — 9 de 23 | controle negativo | `npx vitest run --root .tooling/scripts/ci check-package-json-drift` | `.tooling/scripts/ci/check-package-json-drift.ts` |
| `check-docker-drift` | `check-docker-drift.spec.ts` — 3 de 5 | controle negativo | `npx vitest run --root .tooling/scripts/ci check-docker-drift` | `.tooling/scripts/ci/check-docker-drift.ts` |
| `check-eslint-drift` | `check-eslint-drift.spec.ts` — 2 de 5 | controle negativo | `npx vitest run --root .tooling/scripts/ci check-eslint-drift` | `.tooling/scripts/ci/check-eslint-drift.ts` |
| `check-doc-refs` | `preflight.spec.ts` → `describe('checkDocRefs')` — **o spec não é `check-doc-refs.spec.ts`**, é o do runner | controle negativo | `npx vitest run --root .tooling/scripts/ci -t checkDocRefs` | `.tooling/scripts/ci/check-doc-refs.ts` |
| `review-routing` matrix lint | `tooling/scripts/lint-review-routing.spec.ts` — **diretório diferente** (veja a armadilha abaixo) | controle negativo | `npx vitest run --root tooling/scripts lint-review-routing` | `tooling/scripts/lint-review-routing.ts` |
| `check-tsconfig-drift` | `check-tsconfig-drift.spec.ts` — 1 de 2 | controle negativo | `npx vitest run --root .tooling/scripts/ci check-tsconfig-drift` | `.tooling/scripts/ci/check-tsconfig-drift.ts` |
| `check-teeth-registry` | `check-teeth-registry.spec.ts` — 12 testes | **mutação** | comando 3 → **vermelho nomeando o gate** (medido 2026-10-05) | `.tooling/scripts/ci/check-teeth-registry.ts` |
| `check-self-firing-guard` | `check-self-firing-guard.spec.ts` — 10 testes | **mutação** | comando 5 → **diferencial vira 0 → 0** (medido 2026-10-05) | `.tooling/scripts/ci/check-self-firing-guard.ts` |

> A coluna **Arquivo** é a chave de reconciliação, e não um enfeite: o
> `check-teeth-registry` casa o registro com o `preflight.ts` por ela. Sem a
> coluna, o gate é identificado pelo **nome de exibição** — e aí
> `'Cross-refs em .md versionados'` casa com `` check-doc-refs `` por
> coincidência, `check-eslint-drift` (2 entradas) contaria como dois gates, e
> qualquer gate novo entraria no preflight sem aviso. Foi a ausência desta
> coluna que o check acusou na primeira execução (9 de 9 sem correspondência).

Os **seis comandos de mutação**, medidos 2026-10-05. Cada um reverte o
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
#    blocking): só que ela casa 0 arquivos. 8 dos 9 gates ficam sem rota —
#    classe 1, "condição inalcançável". Este é o RED que a task 3.2 achou.
sed -i 's|- pattern: "\.tooling/scripts/ci/\*\*"|- pattern: "tooling/scripts/ci/**"|' \
  .agents/specs/conventions/review-routing.md
npx tsx .tooling/scripts/ci/check-teeth-registry.ts   # -> 8 erros "não alcançado por nenhuma path_glob"
sed -i 's|- pattern: "tooling/scripts/ci/\*\*"|- pattern: ".tooling/scripts/ci/**"|' \
  .agents/specs/conventions/review-routing.md       # restaurado byte-exato

# 5) check-self-firing-guard (classe 3) — a isenção mecânica é neutralizada.
#    O guard NÃO fica vermelho: a linha que cita o nome dele casa o símbolo
#    que é parte do próprio nome, e a seção canônica o absorve. É por isso
#    que este check é um DIFERENCIAL (N → 0) e não uma asserção de verde —
#    sem o `N`, "verde" e "isenção inerte" são o mesmo resultado.
perl -0pi -e "s|return line\.replaceAll\(SELF_NAME, ''\);|return line;|" \
  .tooling/scripts/ci/check-memory-dir-concordance.ts
npx tsx .tooling/scripts/ci/check-self-firing-guard.ts   # -> 9 erros "dispara em si mesmo"
perl -0pi -e "s|^function stripSelfName\(line: string\): string \{\n  return line;\n\}|function stripSelfName(line: string): string {\n  return line.replaceAll(SELF_NAME, '');\n}|m" \
  .tooling/scripts/ci/check-memory-dir-concordance.ts   # restaurado byte-exato (conferido com diff)

# 6) check-harness-owner (controle desligado) — o vermelho do dia a dia é
#    VERMELHO de propósito, então a prova de dente é invertida: neutraliza-se
#    a resolução de dono, e o check tem de FICAR VERDE. Se ele continuar
#    vermelho, o vermelho não vinha da dívida — vinha de outra coisa, e o
#    check estava medindo outra coisa. Este check não está na tabela acima
#    porque NÃO RODA no preflight enquanto for vermelho: ver "Dívida de
#    controles".
perl -i -pe "s/^  const owners: string\[\] = \[\];\$/  const owners: string[] = ['preflight.ts#checks']; return owners;/" \
  .tooling/scripts/ci/check-harness-owner.ts
npx tsx .tooling/scripts/ci/check-harness-owner.ts   # -> exit 0 (o vermelho era só a dívida)
perl -i -pe "s/^  const owners: string\[\] = \['preflight.ts#checks'\]; return owners;\$/  const owners: string[] = [];/" \
  .tooling/scripts/ci/check-harness-owner.ts   # restaurado byte-exato (conferido com diff)
```

> O `9` é medido, não estimado. E a primeira redação deste bloco dizia
> "`3+`" porque eu tinha lido só as três primeiras linhas da saída — o mesmo
> erro que o `X8` do backlog comete, e que a coluna **Nível** deste registro
> existe para tornar visível.

Um segundo acerto veio da redação anterior: ela citava, em prosa deste
arquivo, o símbolo que o guard procura, e o guard — com razão — a acusou
enquanto eu a escrevia. Um guard que pega o autor da própria documentação é
um guard funcionando; o conserto é no texto, nunca no guard.

> Comandos 3 a 5 **não** usam `git checkout --` como 1 e 2: eles reverteriam
> trabalho ainda não commitado de quem está no meio da task. O `sed`/perl
> inverso é a restauração, e cada um foi conferido com `diff` contra um
> backup antes de seguir.

**A armadilha de ler este registro por nome de arquivo.** `tooling/` e
`.tooling/` são **dois diretórios distintos**, ambos versionados, ambos rodados
pelo mesmo `pnpm tooling:test` (`package.json#tooling:test`). Todos os
`check-*` vivem em `.tooling/scripts/ci/`; o `lint-review-routing` e o
`archive-lint` vivem em `tooling/scripts/`. E o spec do `check-doc-refs` mora
dentro do `preflight.spec.ts`. Quem indexar por `ls check-*.spec.ts` conclui,
errado, que `check-doc-refs` e `review-routing` não têm spec nenhum.

**Duas linhas da tabela não eram só "sem mutação" — eram claims que tinham
envelhecido.** Foram corrigidas ao montar este registro:

- **`check-types` não é check** (ver a nota acima): a tabela atribuía a ele
  uma capacidade e um custo inexistentes.
- **A coluna "Custo" foi removida** (motivo na
  [Tabela de Checks](#tabela-de-checks)): somava 16 s para um preflight de
  ~2,6 s, e nenhum dos dois números tinha derivação.

E uma terceira, que é o achado do método: o teste
`a derivação canônica resolve para um diretório que existe de verdade` tinha
**o nome de um dente e a assertion de um verde** (`ok:true, errors:[]`,
idêntica à do teste vizinho). Um teste cujo nome promete mais do que a assertion
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

`pnpm ci:local` é referenciado em `AGENTS.md` §6 como pré-requisito de
push. `pnpm ci:preflight` é o atalho para devs iterando em docs/tsconfig.

## Histórico de drift detectado

| PR / commit | Check | Drift | Correção |
|---|---|---|---|
| `3f614dd` | `check-doc-refs` | primeiro check de cross-refs introduzido (TDD) | feature inicial |
| `df70f5d` | `check-doc-refs` | falsos positivos em code blocks | preflight pula code blocks |
| `2b158f8` | `check-tsconfig-drift` | primeiro check de drift de tsconfig (TDD) | feature inicial |
| `59eb083` | `check-tsconfig-drift` | fixtures compartilhadas + `CheckResult` unificado | refactor (fixtures herméticas) |
| `f4a5434` | `check-eslint-drift` | primeiro check de drift de ESLint (TDD) | feature inicial |
| `0008319` | preflight job | gate `needs: preflight` adicionado | feature inicial |

Cada novo check é introduzido por TDD (Red→Green→Refactor — ver
[tdd.md](./tdd.md)); o spec do check fica em `*.spec.ts` ao lado do
script.

## Pendências conhecidas

- **Skill `ci-defense-in-depth`:** publicada em
  [`.agents/skills/ci-defense-in-depth/SKILL.md`](../../skills/ci-defense-in-depth/SKILL.md)
  (adicionada em v1.4.0). Cobre o template `CheckResult`, fixtures herméticas
  via `fs.mkdtemp` e code-block-aware parsing para novos checks preflight.
- **Drift detectado por `check-turbo-drift`** em commit da v1.4.0:
  as tasks `stack:review` e `docs:sync` declaravam `outputs` apesar de
  `cache:false` (semanticamente contraditório). Corrigido removendo os
  `outputs` órfãos; registrado como caso de uso real que justifica o check.
- **A tabela de Checks acima é completa** (a task 3.1 do plano
  [`guard-classes`](../../../docs/superpowers/plans/2026-10-03-guard-classes.md)
  fechou as 3 lacunas que esta seção declarava). O `preflight` executa
  **12 entradas** — as **11** linhas da tabela de dentes, mais uma segunda
  entrada de `check-eslint-drift` (uma por app: `apps`, `packages`). Antes, a
  tabela listava 6, das quais uma (`check-types`) nem era check. Para auditar:
  `pnpm ci:preflight` e conte as linhas `•`.
- **Só 4 dos 11 gates têm mutação medida** (ver
  [Registro de dentes](#registro-de-dentes)). Os outros 7 provam a lógica com
  `controle negativo` em tmpdir, o que não prova a integração com o sistema
  real. Fechar os 7 restantes é change próprio, um por gate.
- **`check-package-json-drift` só varre o `package.json` raiz.** Task
  turbo fantasma declarada em `apps/*/package.json` escapa do gate, e os
  4 call-sites `pnpm turbo run` do `ci.yml` também não são varridos.
  Fechar isso é change próprio, com spec.

## Dívida de controles

Controles que **existem e não rodam** — o oposto da tabela de dentes, que só
lista o que o `preflight` invoca e é reconciliada nas duas direções pelo
`check-teeth-registry`. Escrever a dívida aqui é o que impede a convenção de
publicar uma regra sobre controle desligado enquanto entrega um controle
desligado.

- **`.tooling/scripts/ci/turbo-redirect-differential.sh`** — mede se o
  `turbo.json` ainda redireciona o que deveria, rodando o turbo de verdade.
  É o instrumento mais forte do diretório: aborta sozinho quando a medida não
  faz sentido, porque um instrumento quebrado produzindo `[]` nos dois lados
  casaria e reportaria `ok`.
  **Nenhum dono** (medido 2026-10-05): 2 menções, ambas em comentário,
  **0 invocações** — nem o `preflight`, nem script algum de
  `package.json#scripts`. Custo remedido 3×: **8,16 / 8,16 / 8,19 s**.
  **Fecha na task 4.1** do plano `guard-classes`, que lhe dá dono.
  Vigia: `check-harness-owner`, que por isso **falha de propósito** e não está
  no `preflight` enquanto for vermelho — gate vermelho no runner que o runner
  roda é push impossível, e gate impossível é gate que ninguém lê.

## Cross-references

- [git-workflow.md §Pre-Push Quality Gate](./git-workflow.md)
- [cobertura-testes.md §CI Defense in Depth](./cobertura-testes.md)
- [post-merge-release.md](./post-merge-release.md)
- [../../skills/ci-defense-in-depth/SKILL.md](../../skills/ci-defense-in-depth/SKILL.md)
