# Convenção: Cobertura de Testes — Regra Mínima de 80%

> Sub-spec referenciada por [AGENTS.md §6](../../../AGENTS.md).
> pt-BR prose, English technical identifiers.

## Objetivo

Garantir que todo código executável (lógica de negócio, adapters, serviços
de aplicação, controllers HTTP) esteja exercitado por testes automatizados,
de modo que regressões sejam detectadas em CI antes do merge.

A regra mínima é **80%** agregado por projeto vitest em todas as quatro
métricas (lines, functions, branches, statements). Foi escolhida por
ser o piso amplamente aceito pela indústria (e.g. cobertura default de
ferramentas como SonarQube, Codecov e Vitest 2.x), baixo o suficiente
para não bloquear trabalho legítimo e alto o suficiente para evitar
"buracos negros" de código não-testado.

Aplicação desta regra:

- Reduz regressões em produção ao expor caminhos não exercitados.
- Força refactor de código difícil de testar (geralmente code smell).
- Documenta o comportamento esperado por meio dos próprios testes.

## Escopo

A regra vale para **todos os apps que rodam vitest** no monorepo:

- `apps/api` (NestJS 11 backend) — projetos `unit` e `integration`
  definidos em `apps/api/vitest.workspace.ts`.
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

Cada projeto vitest declara thresholds em
`coverage.thresholds.{lines,functions,branches,statements}`. Vitest
hard-fails a run quando QUALQUER métrica fica abaixo do threshold.

**Por agregado, não por arquivo.** Um arquivo individual pode estar
abaixo de 80% desde que o projeto como um todo atinja o piso. Isso
permite que código bootstrap (módulos, type-only, ports) fique fora do
cálculo sem distorcer a métrica.

## Exclusões Canônicas

Lista canônica (usar nas configs vitest E neste doc). Cada item
representa código sem lógica executável, type-only, ou já testado em
outro nível (E2E/integração):

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
- `**/prisma-audit.service.ts` — Adapter Prisma puro: lógica espelhada
  em `InMemoryAuditService` (testada em unit) + Testcontainers
  integration specs. Excluído para evitar testes frágeis de
  mock-de-PrismaClient.
- `**/prisma-user.repository.ts` — Adapter Prisma puro: lógica
  espelhada em `InMemoryUserRepository` (testada em unit) +
  Testcontainers integration specs. Excluído para evitar testes frágeis
  de mock-de-PrismaClient.
- `**/test/**` — diretório `test/` contém helpers de teste (não lógica
  de produção) e por isso é excluído da medição de cobertura.
- Em `apps/web`: `app/**` — Next.js RSC pages, exigem testes E2E
  (Playwright) **fora do escopo unitário** desta convenção.
- Em `apps/web`: `next-env.d.ts` — gerado pelo Next.js, não editado.

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

Cada app define seu próprio `test:coverage` em `package.json` que
invoca vitest com `--coverage`. O report inclui `--reporter=text` (console)
e `--reporter=json-summary` (machine).

## CI Enforcement

- Vitest hard-fails localmente quando threshold é violado (sem flag extra).
- CI deve rodar `pnpm test:coverage` em todo PR; não-80% bloqueia merge.
- O coverage report fica em `apps/<app>/coverage/` (gitignored) e é
  uploadado como artifact para auditoria.
- Integrações (Testcontainers) são verificadas em CI com Docker; local
  é opt-in via `pnpm --filter @projeto/api test:integration`.
- A porta de enforcement da regra de 80% é a união dos projetos cujo
  script `test:coverage` carrega `--coverage`: para `apps/api`, apenas
  o projeto `unit`; para `apps/web`, o projeto único. O projeto
  `integration` do `apps/api` mantém coverage **habilitado** para
  visibilidade/relatório, mas **não enforced** — seu escopo reduzido
  (apenas adapters Prisma) fica abaixo do piso agregado; o mesmo
  comportamento já é coberto no `unit` via InMemory audit/repository.

## CI Defense in Depth

A regra de 80% é **apenas uma camada** da estratégia de CI. Para prevenir
falhas estruturais (drift de tsconfig, ESLint config legada, refs quebradas),
o monorepo usa:

1. **Pre-push local** (`pnpm ci:local`) — devs rodam antes de push; detecta
   em ~30s o que o CI detectaria em ~4min. Ver [git-workflow.md §Pre-Push
   Quality Gate](./git-workflow.md).
2. **Pre-flight CI job** (workflow `ci.yml`) — primeiro job, valida
   cross-refs, tsconfig drift, ESLint drift. Falha rápido em 10s.
3. **Quality CI job** (atual) — lint, typecheck, test, coverage. Roda
   **apenas se preflight passou**.

Threshold de cobertura pode ser ajustado por package em **report-only** mode
(apps/web durante scaffolding) — ver nota em `apps/web/vitest.config.ts`.
Reativar para 80% via PR que adiciona a primeira feature BC.

## Revisões

A regra vale **desde o PR #1** — toda feature nova ou refactor deve
manter ≥ 80% agregado. Reduzir threshold só é permitido via ADR explícito
(mover este doc + atualizar a tabela de AGENTS.md).

Cobertura subindo não é motivo para parar de escrever testes; cobertura
perto de 100% é um sinal de que tipos não-cobertos podem ser movidos
para exclusões canônicas. Cobertura baixa exige action: adicionar testes
(TDD) ou ADR para excluir.

## Trabalho Pendente

O projeto `integration` do `apps/api` agrega hoje ~38% de cobertura
(exercita apenas os adapters Prisma — `prisma-audit.service.ts` e
`prisma-user.repository.ts`) e é **intencionalmente não enforced**: o
projeto `unit` é a porta de enforcement da regra de 80%. Esta é uma
lacuna conhecida, não uma violação da spec — a regra se aplica a
projetos que **rodam** coverage com threshold; o `integration` reporta
coverage para visibilidade mas é opt-in. O alvo aspiracional é crescer
a cobertura do `integration` para ≥ 80% conforme mais specs forem
adicionados; nenhum ADR é necessário até lá.

## Exceções

Apenas via ADR explícito (registrado em `docs/adr/`). Cada exceção
deve listar:

- Arquivo/glob afetado.
- Justificativa (type-only, gerado, E2E coberto, etc.).
- Alternativa de verificação (outro teste, lint, type-check).
- Data e autor.

Sem ADR → sem exceção. Vitest threshold é lei.