// apps/api/vitest.config.ts
//
// Config base compartilhada. Cada project (unit/integration) vive em
// vitest.workspace.ts e herda opções daqui via `extends`.
//
// Coverage: define `exclude` canônico (main.ts, *.module.ts, ports/**,
// type-only domain, prisma.service.ts, *.d.ts) herdado por todos os
// projetos. Os thresholds ficam no workspace project porque são por
// agregado-por-projeto (regra de 80% ver `cobertura-testes.md`).
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@projeto/shared-types': new URL('../../packages/shared-types/src', import.meta.url).pathname,
    },
  },
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
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
