// apps/api/vitest.workspace.ts
//
// Workspaces para o Vitest 2.x — separa `unit` (smoke + specs em memória)
// de `integration` (Testcontainers + Prisma real).
//
// pt-BR: vitest 2.x não suporta o array `projects` no config raiz; em vez
// disso, define-se aqui via `defineWorkspace`. Cada projeto estende
// vitest.config.ts para herdar resolve/aliases e sobrescreve só `test.*`.

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
          // Fase 3: cobertura baixa (só smoke). Sobe nas Fases 4-7.
          lines: 30,
          functions: 30,
          branches: 30,
          statements: 30,
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
    },
  },
]);
