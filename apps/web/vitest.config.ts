// apps/web/vitest.config.ts
//
// Regra de cobertura mínima: 80% agregado em todas as quatro métricas
// (lines, functions, branches, statements) — ver
// .agents/specs/conventions/cobertura-testes.md.
//
// Exclusões canônicas:
//   - app/** → Next.js RSC + client component pages — tested via E2E
//     em fase posterior (Playwright); currently excluded porque
//     jsdom/RSC setup está fora do escopo unit.
//   - next-env.d.ts → gerado pelo Next.js, não editado.
//   - **/*.spec.ts → arquivos de teste não contam como código de produção.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.spec.ts', 'components/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
      exclude: [
        'app/**',
        'next-env.d.ts',
        '**/*.spec.ts',
        // pt-BR: configs Next.js e ferramentas — type declarations, sem
        // lógica de produção a ser exercitada por testes unitários.
        'next.config.*',
        'tailwind.config.*',
        'postcss.config.*',
        '.eslintrc.*',
        'vitest.config.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@projeto/shared-types': new URL('../../packages/shared-types/src', import.meta.url).pathname,
    },
  },
});
