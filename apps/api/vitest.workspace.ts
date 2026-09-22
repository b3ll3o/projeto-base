// apps/api/vitest.workspace.ts
//
// Workspaces para o Vitest 2.x — separa `unit` (smoke + specs em memória)
// de `integration` (Testcontainers + Prisma real).
//
// pt-BR: vitest 2.x não suporta o array `projects` no config raiz; em vez
// disso, define-se aqui via `defineWorkspace`. Cada projeto estende
// vitest.config.ts para herdar resolve/aliases + coverage.exclude canônico
// e sobrescreve só `test.*` (thresholds + include/exclude patterns).
//
// Regra de cobertura mínima: 80% agregado POR projeto vitest (lines,
// functions, branches, statements). Ver `.agents/specs/conventions/
// cobertura-testes.md` para a regra completa e lista de exclusões.

import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    test: {
      name: 'unit',
      include: ['src/**/*.spec.ts'],
      exclude: ['src/**/*.integration.spec.ts', 'src/**/*.testcontainers.spec.ts'],
      environment: 'node',
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html', 'lcov'],
        thresholds: {
          lines: 80,
          functions: 80,
          branches: 80,
          statements: 80,
        },
      },
    },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'integration',
      include: ['src/**/*.integration.spec.ts', 'src/**/*.testcontainers.spec.ts'],
      exclude: [],
      environment: 'node',
      // Testcontainers pode levar mais de 10s para subir a imagem na
      // primeira execução, então elevamos os timeouts. hook cobre
      // beforeAll/afterAll que bootam o container.
      testTimeout: 60_000,
      hookTimeout: 60_000,
      // fork pool com singleFork: o container PostgreSQL é compartilhado
      // por todos os testes da mesma run; múltiplos workers poderiam
      // competir pela mesma porta efêmera.
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
      // pt-BR: coverage habilitado para visibilidade/relatório mas SEM
      // `thresholds` — o projeto `integration` só exercita os adapters
      // Prisma (~38% agregado, esperado); a porta de enforcement da
      // regra de 80% é o projeto `unit`. Ver cobertura-testes.md §CI
      // Enforcement.
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html', 'lcov'],
      },
    },
  },
  {
    // pt-BR: projeto `e2e` (Fase 7 Task 7.7) — sobe o AppModule inteiro
    // (controller + use cases + PrismaModule + AuditInfraModule) e bate
    // nas rotas HTTP via `app.inject(...)`. Diferente do `integration`
    // porque exercita o boundary HTTP completo: ZodValidationPipe,
    // GlobalExceptionFilter, optimistic locking, ETag/If-Match.
    extends: './vitest.config.ts',
    test: {
      name: 'e2e',
      include: ['test/**/*.e2e.spec.ts'],
      exclude: [],
      environment: 'node',
      // Testcontainers + boot do NestApp + apply migrations — margem
      // generosa para CI.
      testTimeout: 120_000,
      hookTimeout: 120_000,
      // singleFork: o container Postgres + NestApp são compartilhados
      // por todos os testes da run; múltiplos workers competiriam pela
      // mesma porta efêmera e levantariam apps duplicados.
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
      // pt-BR: cobertura habilitada para relatório, mas SEM thresholds —
      // e2e exercita o stack inteiro (controller + use cases + Prisma +
      // audit + filter + pipe), então o agregado é próximo de 100%; o
      // gate de 80% fica no projeto `unit`.
      coverage: {
        provider: 'v8',
        reporter: ['text', 'json', 'html', 'lcov'],
      },
    },
  },
]);
