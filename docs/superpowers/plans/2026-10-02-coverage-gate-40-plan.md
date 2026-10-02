# Plano — Issue #40: gate de cobertura de 80% inerte no `apps/api`

> Branch: `fix/coverage-gate-40` (base `main` @ `d094cab`)
> Issue: [#40](https://github.com/b3ll3o/projeto-base/issues/40)
> Convenção afetada: [cobertura-testes.md](../../../.agents/specs/conventions/cobertura-testes.md)

## Diagnóstico

> Estado **pré-fix** (`main` @ `d094cab`); as referências a linhas
> citam os arquivos como estavam antes da correção.

**Duas falhas independentes**, nenhuma exigindo teste de *produção* —
são erros de leitura de config, e a medição é o teste. A seção
"Falha 2" registra uma terceira hipótese que a medição **refutou**;
está aqui porque o erro é instrutivo, não porque tenha sido
implementada. O que *exigiu* teste foi a lógica nova que o fix
introduziu (o gate derivado) — 27 testes, pela
[convenção de TDD](../../../.agents/specs/conventions/tdd.md).

### Falha 1 — `coverage.thresholds` é lido só do config raiz

O Vitest 2.1.9 resolve `coverage.thresholds` a partir do
`ctx.config.coverage` do projeto **raiz**, nunca do bloco `test.coverage`
de um projeto `defineWorkspace`. O bloco `thresholds` em
`apps/api/vitest.workspace.ts:28-33` é configuração morta.

Prova empírica (verificador C1, duas execuções na **mesma árvore de
trabalho**, mudando só onde o threshold é declarado):

| Experimento | Onde o threshold 99 vive | Exit | Erros |
|---|---|---|---|
| Root config | `vitest.config.ts` | 1 | 4× `ERROR: ... global threshold (99%)` |
| Controle (C1 step 3) | `vitest.workspace.ts` | 0 | 0 |

Medições nessas execuções: **67.44%** e **67.67%**. A variação de 0.2pp
é ruído entre runs — o `dist/` local muda de estado entre elas — e é
irrelevante para a prova. O que a prova mostra é que a **única**
variável que muda entre as duas linhas é o lugar onde o threshold está
declarado, e ela decide o exit code. Um gate de 99% sobre uma medição
de ~67% que sai com 0 erros é **inerte**, não apenas leniente.

### Falha 2 — hipótese refutada: `dist/` stale "furaria" o `exclude`

Sintoma observado: `dist/` de build antigo (2026-09-23, 100 arquivos
`.map`, gitignored via `.gitignore:3`) aparecia no relatório. A
explicação intuitiva — e a primeira hipótese deste plano — era que
`excludeAfterRemap` (`false` por default em `@vitest/coverage-v8`,
`provider.js:2592-2594`) remapeia os `.js` de `dist/` de volta para
`src/*.ts` e **re-injeta** arquivos já filtrados por glob. O mecanismo
é real: `dist/main.js.map` contém `"sources":["../src/main.ts"]`, e
ligar `excludeAfterRemap: true` derruba o vazamento de `main.ts` /
`*.module.ts` de 8 arquivos para 0.

**Mas a hipótese estava errada quanto à causa.** Medido em célula
isolada, três variantes da lista `exclude`, todas com `dist/` presente:

| Variante | Arquivos no relatório | Statements | % |
|---|---|---|---|
| Spread + `**/dist/**` explícito | 36 | 1250 | 96.48% |
| Spread **sem** a linha `**/dist/**` | 36 | 1250 | 96.48% |

**Byte-a-byte idênticas.** A linha explícita é redundante: o `dist/**`
que vem dentro de `coverageConfigDefaults.exclude` já cobre o
diretório, porque o pattern é relativo à raiz do coverage root
(aqui `apps/api/`). A linha foi removida do config.

A crença de que ela era necessária vinha do sintoma — `dist/` buildado
*parece* furar o glob, porque o remapeamento existe — mas quem
efetivamente protegia era o spread da Falha 3, que estava ausente. As
duas coisas se confundiam porque o `dist/` stale estava sempre lá.

### Falha 3 — `exclude` do usuário SUBSTITUI os defaults (causa raiz)

`_initialize` faz shallow spread em
`node_modules/vitest/dist/coverage.js:65`
(`{...coverageConfigDefaults, ...config}`). Passar `coverage.exclude`
remove de uma vez a lista default do Vitest — `**/node_modules/**`,
`**/dist/**`, `**/coverage/**` et al. Confirmado pelo verificador C2:
CLI com `--coverage.exclude='**/main.ts'` fez o relatório **piorar**,
de 60 para 151 arquivos.

Consequência: **é esta a causa raiz da inflação**, não o `dist/`. O
`exclude` atual nunca protegeu `dist/`, `node_modules/` nem os próprios
arquivos de config — e como o default inteiro tinha sido substituído,
`vitest.config.ts` (42 statements), `vitest.workspace.ts` (51) e
`.eslintrc.js` (13) entravam no relatório com 0%: exatamente 106
statements de cobertura-zero somando a 532.

Medido, mudando **só** a linha do spread:

| Variante | Arquivos | Statements |
|---|---|---|
| Com `...coverageConfigDefaults.exclude` | **36** | **96.48%** |
| Sem o spread | 60 | 67.48% |

## Resultado medido

| Métrica | Antes | Depois | Threshold |
|---|---|---|---|
| Statements | 67.48% | **96.48%** (1206/1250) | 80 |
| Lines | 67.48% | **96.48%** | 80 |
| Functions | ~79% | **96.52%** (111/115) | 80 |
| Branches | ~84% | **90.57%** (317/350) | 80 |
| Arquivos no relatório | 60 | **36** | — |
| Exit code | 0 (gate inerte) | 1 quando o piso é violado | — |

O par 67.48% → 96.48% vem de um A/B limpo: **uma única linha** de
diferença (o spread dos defaults) — é o número que isola a causa. O
`main` intocado, numa cópia isolada, dá **~68% / 59 arquivos**: o
absoluto varia ~1pp com o estado do `dist/` local, e por isso o A/B é
a citação usada. Reproduza em cobertura-testes.md §Trabalho Pendente.

**O numerador não muda: permanece 1206.** Todo o ganho vem de remover 532
statements de cobertura-zero que entravam por `dist/` e pelos próprios
arquivos de config. Não faltava nenhum teste; não é preciso escrever
teste de produção nem baixar o piso. Nenhum ADR de exceção é
necessário.

Margem mais apertada: `branches` a 90.57% (~10.5pp de folga). As outras
três ficam em ~16pp.

## Tasks

| # | Task | Arquivo | Risco |
|---|---|---|---|
| T1 | Mover `thresholds` para o config raiz | `apps/api/vitest.config.ts` | baixo |
| T2 | Espalhar `coverageConfigDefaults.exclude` antes da lista canônica | `apps/api/vitest.config.ts` | baixo |
| T3 | Remover bloco `thresholds` morto; derivar o piso do projeto ativo | ambos | **médio** |
| T4 | Remover a linha `**/dist/**` explícita (redundante, cf. Falha 2) | `apps/api/vitest.config.ts` | baixo |
| T5 | Corrigir docs que afirmam comportamento falso | `cobertura-testes.md` | baixo |
| T6 | Regra trunk-based: toda alteração parte de `main` atualizada | `git-workflow.md` | baixo |
| T7 | Remover blocos `coverage:` mortos/inválidos do workspace | `apps/api/vitest.workspace.ts` | baixo |

### T7 em detalhe (achado não planejado)

O teste de alinhamento (importar `vitest.workspace.ts` no spec) puxou o
arquivo para o programa do `tsc` — ele não está no `include` do
`apps/api/tsconfig.json`, então seus erros de tipo estavam **latentes**.
Apareceram 3× `TS2353: 'coverage' does not exist in type 'ProjectConfig'`,
em código pré-existente do `main`.

Antes de "consertar" o tipo, a pergunta certa era se o bloco fazia
alguma coisa. Não fazia: removidos os três blocos `coverage: { provider,
reporter }` (idênticos ao que o config raiz já define, e herdados por
`extends`), o `coverage-final.json` do `integration` sai
**byte-a-byte idêntico**. Eram config morto *e* inválido — a combinação
esconde a segunda falha atrás da primeira.

A lição cabe numa frase: um arquivo que ninguém typechecava não tem
erro de tipo resolvido, tem erro de tipo **latente**. Importá-lo o acordou.

### T3 em detalhe (único ponto de risco real)

`thresholds` no root são **globais**: vazam para todo projeto que faz
`extends: './vitest.config.ts'`. Medido: `integration` fica em 37.76% →
exit 1.

Duas abordagens foram testadas e **descartadas** antes de chegar na
implementação final:

1. **`thresholds: { lines: 0, ... }` por projeto no workspace.** Parece
   correto, não funciona. O Vitest 2.1.9 constrói o reporter com o
   `ctx` do projeto raiz e lê `ctx.config.coverage`
   (`dist/chunks/cli-api*.js:10582-10588`), então o bloco do projeto é
   inerte — nem `0` sobrepõe o piso herdado. Verificado: exit 1 com 4
   erros mesmo com os zeros presentes.
2. **Opt-out pela CLI nos scripts** (`--coverage.thresholds.*=0` em
   `test:integration` / `test:e2e`). Funciona, mas é frágil: a ordem
   das flags importa. Um `--coverage` vindo **depois** sobrescreve os
   thresholds (verificado: exit 1). Bastaria um dev digitar
   `pnpm run test:integration --coverage` para o gate quebrar com um
   erro que parece bug de config.

**Solução adotada:** derivar o piso no config raiz a partir do projeto
ativo. A decisão mora em `apps/api/test/config/coverage-floor.ts`
(`isCoverageEnforced`), chamada por `vitest.config.ts` com três
entradas:

1. **`PROJECT_NAMES`** — injetado pelo config raiz, lido do próprio
   `vitest.workspace.ts`. Não há duplicação da lista de projetos, e um
   projeto novo é registrado ao ser declarado.
2. **`process.argv`** — os valores de `--project`, quando presentes.
3. **`npm_lifecycle_event`** — só como fallback para quando o `argv`
   não traz `--project` (ex.: chamar o vitest direto).

`--project` tem precedência sobre o lifecycle event. A seleção resolve
wildcards com a **mesma semântica do Vitest** (`projectPatternToRegExp`:
o padrão é convertido em regex, ancorado `^...$`, case-insensitive) —
isso não é detalhe cosmético. A primeira versão comparava o valor do
argv **literalmente** contra `'unit'`:

```ts
// versão com o furo: o Vitest expande o wildcard, o comparador não
const selected = activeProjects(argv);          // ['u*']
return selected.every((name) => name === 'unit');   // 'u*' === 'unit' → false
```

Com `--project=u*` o Vitest roda o projeto `unit` inteiro — mas
`every()` recebe a string `u*`, que não é igual a `unit`, devolve
`false`, e o gate **desliga**. Pior: como `selected` é não-vazio, o
caminho nem chega ao fallback do lifecycle event, então nem o
`test:coverage` voltava a proteger. Um gate que se desliga sozinho
quando alguém digita um glob é pior do que um gate inerte — o inerte
falha sempre, esse falha só em parte dos casos.

Fechado com TDD: `projectPatternToRegExp` + `selectedProjects`, e os
testes que ancoram o comportamento (`--project=u*` → gate ON;
`--project=*` → gate OFF, porque o agregado inclui integration/e2e;
`--project=uni` → sem match → gate ON, por prudência).

A lógica ficou fora do config — e não inline nele — porque
`vitest.config.ts` é avaliado pelo Vite e não é importável pelo runner
de specs; extraí-la é o que permitiu cobri-la com os **27 testes** de
`test/config/coverage-floor.spec.ts`. Três deles são de *alinhamento*,
não de comportamento: amarram `ENFORCED_PROJECT` ao nome real no
workspace, para que renomear o projeto `unit` sem atualizar a
constante **quebre a suíte** em vez de desligar o gate em silêncio.

Estado final: `unit` 96.48% enforced; `integration` 37.76% e `e2e`
62.88% reportam sem enforcement.

## Verificação

Matriz executada (todos os casos conferidos):

```bash
rm -rf apps/api/coverage   # o reporter v8 tem race de teardown com stale dir
pnpm --filter @projeto/api test:unit          # exit 0, 257 testes / 28 arquivos
pnpm --filter @projeto/api test:coverage      # exit 0, 96.48%
pnpm --filter @projeto/api test:integration   # exit 0, 20 testes
pnpm --filter @projeto/api test:e2e           # exit 0, 23 testes

# opt-out por script (dev rodando coverage em projeto não-enforced)
cd apps/api && pnpm run test:integration --coverage   # exit 0, 37.76%
cd apps/api && pnpm run test:e2e --coverage           # exit 0, 62.88%

# NEGAÇÃO — o gate tem que poder falhar
sed -i 's/COVERAGE_FLOOR = 80/COVERAGE_FLOOR = 99/' apps/api/vitest.config.ts
pnpm --filter @projeto/api test:coverage      # exit 1, 4× ERROR global threshold (99%)

# o opt-out continua isolado, mesmo com o piso em 99:
cd apps/api && pnpm run test:integration --coverage   # exit 0

# e o wildcard NÃO é um buraco (a regressão que quase entrou no PR).
# Invocação direta: `test:unit` já carrega `--project unit`, então
# passá-lo de novo produziria uma união, não o caso que importa.
cd apps/api && npx vitest run --project='u*' --coverage   # exit 1, 4× ERROR (99%)
cd apps/api && npx vitest run --project='*'  --coverage   # exit 0 (agregado inclui integration/e2e)

pnpm ci:local
```

Os 257 testes do `unit` = 230 originais + 27 de
`test/config/coverage-floor.spec.ts`. Os `Error: boom` / `Error: x` no
stderr são ruído pré-existente de
`global-exception.filter.spec.ts` — specs de ExceptionFilter imprimem
o erro que esperam tratar. Não são falha.

> `pnpm --filter @projeto/api test:integration -- --coverage` **nunca**
> rodou coverage: o pnpm repassa um `"--"` literal que o Vitest ignora.
> Os comandos de plans de 2026-09-21 tinham esse bug; a forma correta é
> `pnpm run <script> --coverage` de dentro de `apps/api`.

## `apps/web` (mesmo bug, corrigido aqui)

`apps/web/vitest.config.ts` tinha o mesmo bug latente de
`exclude`-substitui-defaults (Falha 3): **67 dos 74 arquivos** do relatório
eram artefatos de `.next/` e o número lido era **16.28%** quando o real
é **47.24%**. O gate do frontend não está inerte — os `thresholds: 0` são
honrados — mas o número que ele reportava era falso.

A ordem correta era **consertar o `exclude` primeiro, reativar o piso
depois** — senão o app reprovaria por build artifact, não por falta de
teste. O `exclude` foi corrigido neste mesmo PR (spread + `**/.next/**`
+ `**/*.spec.{ts,tsx}`): 74 arquivos / 16.28% → 6 / 47.24%. O piso segue
em `report-only`; a reativação para 80% depende do primeiro BC do
frontend, não desta correção.

## Aprendizados

1. **Gate que nunca falha não é gate** — e gate que falha *às vezes*
   é pior, porque o desvio se disfarça de configuração. Os seis testes
   de wildcard existem por isso: sem eles, o próximo glob digitado por
   alguém desligava a porta sem erro visível.
2. **Read de config ≠ feature de config.** As duas falhas estão no
   mesmo arquivo de 40 linhas, no mesmo bloco `coverage`, e nenhuma
   delas aparece em teste de comportamento — só em leitura de relatório.
   O que expôs as duas foi subir o piso a 99 e exigir `exit 1`.
3. **"Corrigir o sintoma" e "corrigir a causa" divergiram de verdade
   aqui.** A linha `**/dist/**` parecia necessária, foi testada, e é
   redundante. Se a solução tivesse sido escrita depois de medir, e não
   antes, o PR teria carregado uma linha sem efeito com uma justificativa
   plausível no comentário — e a justificativa teria sido aceita na
   revisão, porque ela *explica* o sintoma. Ela só não é a causa.

> Todo número deste doc tem comando reproduzível na §Verificação. Onde a
> medição variou entre execuções (o `e2e`, ~0.1pp), o texto diz que é
> ruído em vez de escolher o número mais bonito.
