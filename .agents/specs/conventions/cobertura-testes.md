# Convenção: Cobertura de Testes — Regra Mínima de 80%

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).
> pt-BR prose, English technical identifiers.

## Objetivo

Garantir que todo código executável (lógica de negócio, adapters, serviços
de aplicação, controllers HTTP) esteja exercitado por testes automatizados,
de modo que regressões sejam detectadas em CI antes do merge.

A regra mínima é **80%** agregado por projeto vitest em todas as quatro
métricas (lines, functions, branches, statements) — o piso aceito por
SonarQube, Codecov e Vitest 2.x: alto o bastante para expor caminhos não
exercitados, baixo o bastante para não bloquear trabalho legítimo.

## Escopo

A regra vale para **todos os apps que rodam vitest** no monorepo:

- `apps/api` (NestJS 11 backend) — projetos `unit`, `integration` e
  `e2e` definidos em `apps/api/vitest.workspace.ts`.
- `apps/web` (Next.js 15 frontend) — único projeto em
  `apps/web/vitest.config.ts`.

`packages/*` são types-only (sem lógica executável) e `tooling/*` são
scripts — ambos ficam fora do escopo.

## Métricas

Quatro métricas, agregadas **POR PROJETO VITEST** (não por arquivo):

- `lines` — linhas executáveis cobertas.
- `functions` — funções invocadas ao menos uma vez.
- `branches` — ramos de decisões (if/else, ternários, switch) cobertos.
- `statements` — statements executados.

Vitest hard-fails a run quando QUALQUER métrica fica abaixo do threshold.

### Onde o threshold é declarado ( Vitest 2.1.9 )

O threshold é lido **exclusivamente do config raiz**
(`apps/api/vitest.config.ts`). Declarado dentro de um projeto
`defineWorkspace` (`vitest.workspace.ts`), o bloco `thresholds` é
**inerte**: o reporter de coverage é construído com o `ctx` do projeto
raiz e lê `ctx.config.coverage` (`dist/chunks/cli-api*.js:10582-10588`).
Prova: threshold de 99 sobre uma medição de 67% sai com exit 0 e zero
erros. Ver [issue #40](https://github.com/b3ll3o/projeto-base/issues/40).

A segunda armadilha da mesma família: um bloco `coverage: { provider,
reporter }` dentro de um projeto do workspace **também é inerte** — o
projeto herda esses mesmos valores do config raiz, que ele estende.
Medido: remover os blocos de `apps/api/vitest.workspace.ts` deixa o
`coverage-final.json` do projeto `integration` **byte-a-byte idêntico**.
Eles ainda são *inválidos* (`coverage` não existe em `ProjectConfig`),
o que só não aparecia no `tsc` porque o arquivo nunca entrou no programa
— não está no `include` do `tsconfig.json`. **Não declare `coverage` por
projeto**; declare uma vez no config raiz.

Como consequência, **não existe opt-out por projeto via config** — nem
`thresholds: { lines: 0 }` sobrepõe o piso herdado. O piso é derivado do
projeto ativo por `isCoverageEnforced()`
(`apps/api/test/config/coverage-floor.ts`, coberto por
`coverage-floor.spec.ts`), chamada no `vitest.config.ts`. O config raiz
injeta os nomes de projeto lidos do próprio `vitest.workspace.ts`, e a
seleção é resolvida com a **mesma semântica de wildcard do Vitest**
(`--project=u*` seleciona `unit`; o padrão é âncora cheia e
case-insensitive). O opt-out pela CLI foi descartado porque a ordem
das flags importa: um `--coverage` vindo depois de
`--coverage.thresholds.*` sobrescreve os thresholds (verificado).

**Por agregado, não por arquivo.** Um arquivo individual pode estar
abaixo de 80% desde que o projeto como um todo atinja o piso. Isso
permite que código bootstrap (módulos, type-only, ports) fique fora do
cálculo sem distorcer a métrica.

## Exclusões Canônicas

Lista canônica (usar nas configs vitest E neste doc). Cada item
representa código sem lógica executável, type-only, ou já testado em
outro nível (E2E/integração):

- `coverageConfigDefaults.exclude` — **obrigatório, e primeiro na
  lista**. O Vitest faz shallow spread (`{...coverageConfigDefaults,
  ...config}`) em `dist/coverage.js`: um array `exclude` do usuário
  **substitui** a lista default em vez de mesclar. Perde-se `**/[.]**`
  (que segura `.next/`, `dist/`, `coverage/`) e o glob default de
  test/spec. Medido mudando **só** essa linha:
  - `apps/api` — **36 → 60 arquivos**, **96.48% → 67.48%**, com
    `vitest.config.ts`, `vitest.workspace.ts` e `.eslintrc.js`
    (106 statements a 0%) aparecendo no relatório.
  - `apps/web` — **74 → 6 arquivos**, **16.28% → 47.24%**, dos 74
    originais 67 eram build output do Next.js.
- `**/dist/**` — **NÃO** declare. O `dist/**` que vem dentro de
  `coverageConfigDefaults.exclude` já cobre esse diretório, porque é
  relativo à raiz do coverage root. Medido: manter ou remover a linha
  explícita dá resultado **byte-a-byte idêntico** (36 arquivos, 1250
  statements, 96.48%). A crença antiga de que ela era necessária veio
  do sintoma — `dist/` buildado remapeia por sourcemap de volta para
  `src/*.ts` (`excludeAfterRemap` é `false` por default) e por isso
  *parece* furar o glob — mas a proteção já vinha do default. A causa
  real da inflação era a ausência do spread, não a ausência da linha.

> **Declare mesmo assim as exclusões que o default já cobre.** A
> redundância é o que se quer: os globs se cobrem dois a dois e o
> relatório só regride quando o par responsável cai junto. Medido em
> `apps/web` (`pnpm run test:coverage`, lista final como base):
>
> | variação | arquivos | lines |
> | -------- | -------- | ----- |
> | este config | 6 | 47.24% |
> | sem `**/.next/**` | 6 | 47.24% |
> | sem o spread | 6 | 47.24% |
> | sem os dois | 73 | 12.07% |
>
> E atenção ao sentido da falha: sem o spread mas com o glob antigo
> `**/*.spec.ts`, um `.spec.tsx` entra no relatório como 100% coberto e
> a cobertura **sobe** para **55.92%**. Cobertura que melhora sem
> ninguém escrever teste é config quebrada, não progresso — conferir o
> número de **arquivos** do relatório, não só o percentual.
- `**/main.ts` — bootstrap, chamado uma vez no startup.
- `**/*.module.ts` — DI wiring puro, sem lógica de negócio.
- `**/ports/**` — contratos de interface (type-only, sem implementação).
- `**/shared/domain/**/*.ts` que NÃO exportem classes executáveis
  (eventos são types).
- `**/prisma.service.ts` — wrapper do PrismaClient; substituído em
  teste por mock ou testcontainers.
- `**/*.d.ts` — type declarations (não geram código executável).
- `**/shared/audit/application/audit-service.port.ts` — interface port
  (não pertence ao BC `users` mas é injetada via símbolo). Excluída
  para não inflar denominador.
- `**/prisma-{audit.service,user.repository}.ts` — Adapters Prisma
  puros, com lógica espelhada nos InMemory correspondentes (testados em
  `unit`) + specs Testcontainers. Fora para evitar mock frágil do client.
- `**/test/**` — diretório `test/` contém helpers de teste (não lógica
  de produção) e por isso é excluído da medição de cobertura.
- Em `apps/web`: `app/**` — Next.js RSC pages. Ficam fora do denominador
  unitário porque a cobertura delas é a suíte de **browser** — a definida em
  [`e2e-playwright.md`](./e2e-playwright.md).
- Em `apps/web`: `next-env.d.ts` — gerado pelo Next.js, não editado.
- Em `apps/web`: `**/.next/**` (build output do Next.js) e
  `**/*.spec.{ts,tsx}` (testes — o `{ts,tsx}` é necessário porque o app
  tem Client Component testado; `**/*.spec.ts` não casa `.tsx`).
  Ambos redundantes dado o spread, e declarados de propósito — ver o
  blockquote acima.

Configurações vitest devem referenciar esta lista via `coverage.exclude`.

## Comando de Verificação

Por app:

```bash
pnpm --filter @projeto/api test:unit
pnpm --filter @projeto/web test:coverage
```

Global (todos os apps):

```bash
pnpm test:coverage
```

(`test:coverage` é definido em `package.json` raiz e despacha via
`turbo run test:coverage`.)

Cada app invoca vitest com `--coverage` e declara seus próprios reporters
— leia o `coverage.reporter` de cada config, não adivinhe pela CLI:

| App     | `coverage.reporter`                       | Artefato em `coverage/`         |
|---------|------------------------------------------|---------------------------------|
| `api`   | `text`, `json`, `html`, `lcov`            | `coverage-final.json`, `index.html` |
| `web`   | `text`, `json-summary`                    | `coverage-summary.json`         |

> Para as flags de CLI funcionarem com pnpm, use `pnpm run <script> --<flag>`
> **de dentro do package** (ex.: `cd apps/api && pnpm run test:integration --coverage`).
> `pnpm --filter X test:integration -- --coverage` repassa um `--` literal que
> o vitest ignora, e a coverage nunca roda.

## CI Enforcement

- Vitest hard-fails localmente quando threshold é violado (sem flag extra).
- CI deve rodar `pnpm test:coverage` em todo PR; não-80% bloqueia merge.
- O coverage report fica em `apps/<app>/coverage/` (gitignored) e é
  uploadado como artifact para auditoria.
- Integrações (Testcontainers) são verificadas em CI com Docker; local
  é opt-in via `pnpm --filter @projeto/api test:integration`.
- A porta de enforcement da regra de 80% é a união dos projetos cujo
  script `test:coverage` carrega `--coverage`: para `apps/api`, apenas
  o projeto `unit`; para `apps/web`, o projeto único. Os projetos
  `integration` e `e2e` do `apps/api` mantêm coverage **habilitado**
  para visibilidade/relatório, mas **não enforced** — o escopo reduzido
  deles fica abaixo do piso agregado; o mesmo comportamento já é
  coberto no `unit` via InMemory audit/repository.
- O enforcement é derivado do projeto ativo por `isCoverageEnforced()`
  (`apps/api/test/config/coverage-floor.ts`), porque thresholds por
  projeto são inertes no Vitest 2.1.9 (ver §Métricas). Os nomes vêm do
  próprio `vitest.workspace.ts`, então **adicionar um projeto novo não
  exige mudar nada no gate** — ele é registrado ao ser declarado e, por
  ser diferente de `unit`, deixa de ser enforced sozinho.
  `REPORT_ONLY_SCRIPTS` é só fallback para quando o `argv` não traz
  `--project`; `test:integration`/`test:e2e` passam `--project`. Um teste
  amarra `ENFORCED_PROJECT` ao nome real: renomear o projeto `unit`
  quebra a suíte em vez de desligar o gate em silêncio.

### Como verificar que o gate realmente fecha

Um gate que nunca falha não é gate. Para provar que o piso de 80% é
aplicado de fato, suba-o temporariamente e confirme o contrário:

```bash
# deve sair exit 1 com 4× "ERROR: Coverage ... global threshold (99%)"
sed -i 's/^const COVERAGE_FLOOR = 80;/const COVERAGE_FLOOR = 99;/' \
  apps/api/vitest.config.ts
pnpm --filter @projeto/api test:coverage
```

O mesmo comando em `--project integration` deve sair **exit 0** — é o
que prova que o opt-out está isolado e não mascarando o gate do `unit`.

## CI Defense in Depth

A regra de 80% é **apenas uma camada** da estratégia de CI. Para prevenir
falhas estruturais (drift de tsconfig, ESLint config legada, refs quebradas),
o monorepo usa:

1. **Pre-push local** (`pnpm ci:local`) — devs rodam antes de push; detecta
   em **69,5 s, 69,6 s e 74,1 s** (n=3, `{ time pnpm ci:local; }`, 2026-10-08) o que o
   CI detectaria em ~4min, e desde 2026-10-08 inclui `test:integration` e
   `test:e2e`. Ver [git-workflow.md §Pre-Push Quality Gate](./git-workflow.md).
2. **Pre-flight CI job** (workflow `ci.yml`) — primeiro job, valida
   cross-refs, tsconfig drift, ESLint drift. Falha rápido em 10s.
3. **Quality CI job** (atual) — lint, typecheck, test, coverage. Roda
   **apenas se preflight passou**.
4. Para referência completa da estratégia defense-in-depth (3 camadas, checks ativos, pendências), ver [ci-defense-in-depth.md](./ci-defense-in-depth.md). O preflight detecta cross-ref depth bug (commit ffb5342) — exemplo real de falha capturada em camada 2 antes de chegar à camada 3.

Threshold de cobertura pode ser ajustado por package em **report-only** mode
(apps/web durante scaffolding) — ver nota em `apps/web/vitest.config.ts`.
Reativar para 80% via PR que adiciona a primeira feature BC.

## Revisões

A regra vale **desde o PR #1** — toda feature nova ou refactor deve
manter ≥ 80% agregado. Reduzir threshold só é permitido via ADR explícito
(mover este doc + atualizar a tabela de AGENTS.md).

Cobertura alta é sinal de que código pode ir para exclusões canônicas;
cobertura baixa exige action — testes (TDD) ou ADR. Cobertura que **sobe**
sem teste novo, checar o §Exclusões antes de comemorar: pode ser config.

## Trabalho Pendente

Medido em 2026-10-02 (issue #40), com o gate corrigido. Reproduza com:

```bash
rm -rf apps/api/coverage
pnpm --filter @projeto/api test:coverage                          # unit
cd apps/api && rm -rf coverage && pnpm run test:integration --coverage
cd apps/api && rm -rf coverage && pnpm run test:e2e --coverage
```

| Projeto | Statements | Branches | Funções | Enforced |
|---------|-----------:|---------:|--------:|----------|
| `unit`      | 96.48% | 90.57% | 96.52% | ✅ sim |
| `integration` | 37.76% | 66.12% | 64.04% | ❌ não |
| `e2e`        | ~63% | ~73% | ~71% | ❌ não |

> `unit` e `integration` são estáveis entre runs. **`e2e` não é
> bit-reproduzível**: o provider v8 varia ~0.1pp por run (medições
> repetidas deram 73.11% e 73.23% em branches), então a linha do `e2e`
> está arredondada de propósito — é ordem de grandeza, não constante.

`integration` (~38%) exercita apenas os adapters Prisma; `e2e` (~63%)
sobe o AppModule inteiro mas com 23 testes, o que ainda não cobre os
use cases a fundo. Ambos são **intencionalmente não enforced**: o
projeto `unit` é a porta de enforcement da regra de 80%. Esta é uma
lacuna conhecida, não uma violação da spec — a regra se aplica a
projetos que **rodam** coverage com threshold; os outros reportam
coverage para visibilidade mas são opt-in. O alvo aspiracional é
crescer a cobertura de `integration` e `e2e` para ≥ 80% conforme mais
specs forem adicionados; nenhum ADR é necessário até lá.

Margem mais apertada do `unit`: **branches a 90.57%** (~10.5pp contra
~16pp das outras três). É por `branches` que uma feature quebra o gate.

## Exceções

Apenas via ADR explícito (registrado em `docs/adr/`). Cada exceção
deve listar:

- Arquivo/glob afetado.
- Justificativa (type-only, gerado, E2E coberto, etc.).
- Alternativa de verificação (outro teste, lint, type-check).
- Data e autor.

Sem ADR → sem exceção. Vitest threshold é lei.
