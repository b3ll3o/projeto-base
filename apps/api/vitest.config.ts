// apps/api/vitest.config.ts
//
// Config base compartilhada. Cada project (unit/integration/e2e) vive em
// vitest.workspace.ts e herda opções daqui via `extends`.
//
// Coverage (regra de 80% — ver `.agents/specs/conventions/
// cobertura-testes.md`):
//
// 1. `thresholds` mora AQUI, e não em `vitest.workspace.ts`, porque o
//    Vitest 2.1.9 só resolve `coverage.thresholds` a partir do config
//    raiz. Declarado num projeto `defineWorkspace`, o bloco é inerte:
//    um threshold de 99 sobre uma medição de 67% sai com exit 0 e zero
//    erros (verificado — issue #40). O texto de erro do Vitest é
//    literalmente "global threshold", confirmando a atribuição.
//
// 2. `exclude` começa com `coverageConfigDefaults.exclude` porque o
//    Vitest faz shallow spread (`{...coverageConfigDefaults, ...config}`)
//    em `dist/coverage.js`: um array `exclude` do usuário SUBSTITUI a
//    lista default em vez de mesclar. Sem o spread, declarar qualquer
//    pattern aqui derruba a proteção de `node_modules/`, `dist/` e
//    `coverage/` — o relatório infla (medido: 60 → 151 arquivos).
//
// 3. `dist/` NÃO precisa de linha própria: o `dist/**` que vem no spread
//    dos defaults já cobre esse diretório, mesmo sendo relativo à raiz do
//    coverage root. Medido: remover a linha explícita produz resultado
//    byte-a-byte idêntico (36 arquivos, 1250 statements, 96.48%). O que
//    o `dist/` buildado fazia era REMAPEAR por sourcemap de volta para
//    `src/*.ts` (`excludeAfterRemap` é `false` por default) — proteção
//    que o `dist/**` do default já fornecia. Ver issue #40.
import { coverageConfigDefaults, defineConfig } from 'vitest/config';

// pt-BR: o Vitest 2.1.9 constrói o reporter de coverage com o `ctx` do
// projeto RAIZ (`initCoverageProvider` → `ctx.config.coverage`,
// `dist/chunks/cli-api*.js:10582-10588`). Logo, `coverage.thresholds`
// dentro de um projeto `defineWorkspace` é INERTE — não existe forma de
// declarar um piso por projeto em config, e nem `thresholds: {lines: 0}`
// sobrepõe o valor herdado.
//
// Como o gate de 80% se aplica apenas ao projeto `unit` (o único cujo
// script `test:coverage` passa `--coverage`; ver cobertura-testes.md
// §CI Enforcement), o piso é derivado do projeto ativo. A decisão mora em
// `test/config/coverage-floor.ts` — fora do config porque o config é
// avaliado pelo Vite e não é importável pelo runner de specs — e é
// coberta por `test/config/coverage-floor.spec.ts`.
//
// Os nomes dos projetos vêm do próprio workspace, para que o gate
// resolva os wildcards do `--project` (`--project=u*` seleciona `unit`)
// e para que um projeto novo seja registrado ao ser declarado. Não há
// ciclo de import: `extends: './vitest.config.ts'` no workspace é uma
// STRING resolvida pelo Vitest depois, não um import de módulo.
//
// O opt-out pela CLI (`--coverage.thresholds.*=0` nos scripts) foi
// descartado: a ordem das flags importa — um `--coverage` vindo DEPOIS
// sobrescreve os thresholds (verificado: exit 1 com 4 erros).
import workspace from './vitest.workspace.js';
import { isCoverageEnforced } from './test/config/coverage-floor.js';

const COVERAGE_FLOOR = 80;

const PROJECT_NAMES = workspace
  .map((project) => project.test?.name)
  .filter((name): name is string => typeof name === 'string');

const coverageThreshold = isCoverageEnforced(process.argv, {
  projects: PROJECT_NAMES,
  lifecycleEvent: process.env.npm_lifecycle_event,
})
  ? COVERAGE_FLOOR
  : 0;

export default defineConfig({
  resolve: {
    alias: {
      '@projeto/shared-types': new URL('../../packages/shared-types/src', import.meta.url).pathname,
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      // Gate de 80% — único lugar onde o Vitest 2.1.9 o honra. O piso
      // acima é aplicado só ao projeto `unit`; `integration` e `e2e`
      // reportam cobertura sem enforcement (justificativa em
      // cobertura-testes.md §Trabalho Pendente).
      thresholds: {
        lines: coverageThreshold,
        functions: coverageThreshold,
        branches: coverageThreshold,
        statements: coverageThreshold,
      },
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        // pt-BR: os defaults do Vitest vêm PRIMEIROS — o array do usuário
        // substitui o default em vez de mesclar (ver nota 2 no topo). É
        // daqui que vêm a proteção de `dist/**`, `coverage/**` e
        // `**/node_modules/**` contra build artifact e dependência.
        ...coverageConfigDefaults.exclude,
        // pt-BR: exclusões canônicas — ver .agents/specs/conventions/cobertura-testes.md
        '**/main.ts',
        '**/*.module.ts',
        '**/ports/**',
        '**/shared/domain/**/*.ts',
        '**/prisma.service.ts',
        '**/*.d.ts',
        '**/*.spec.ts',
        '**/shared/audit/application/audit-service.port.ts',
        // pt-BR: adapters Prisma são cobertura do projeto `integration`
        // (Testcontainers + PrismaClient real); excluir do unit evita
        // mock frágil de PrismaClient só para inflar coverage.
        '**/prisma-audit.service.ts',
        '**/prisma-user.repository.ts',
        // pt-BR: diretório `test/` contém helpers de teste (não lógica
        // de produção) e por isso é excluído da medição de cobertura.
        '**/test/**',
        // pt-BR: testes e2e (Task 7.7) sobem o AppModule inteiro via
        // Testcontainers + app.inject; a porta de enforcement do gate
        // de 80% é o projeto `unit`. Excluir explicitamente evita que
        // a medição agregada do unit colete arquivos fora do `src/`.
        '**/test/e2e/**',
        // pt-BR: `scripts/` contém utilitários one-shot (export-openapi,
        // futuras migrations, etc.) executados via tsx, não cobertos
        // por specs unitários. Excluir evita inflar denominador com 0%.
        '**/scripts/**',
      ],
    },
  },
});
