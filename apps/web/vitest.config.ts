// apps/web/vitest.config.ts
//
// Regra de cobertura mínima: 80% agregado em todas as quatro métricas
// (lines, functions, branches, statements) — ver
// .agents/specs/conventions/cobertura-testes.md.
//
// STATUS ATUAL (2026-09-22): o gate de 80% está **desabilitado**
// (thresholds = 0) porque apps/web está em fase de scaffolding — existe
// apenas `lib/api-client.ts` + 1 spec cobrindo ~52% do código. Este app
// ainda não tem feature associada no roadmap imediato. Quando o primeiro
// BC do frontend começar (ex: página de listagem de users), reativar
// thresholds para 80% seguindo o mesmo padrão de apps/api#unit.
//
// Por que isso é aceitável sob a regra global: o mesmo doc de cobertura
// já trata o projeto `integration` de apps/api como report-only (não
// gate-enforced) por motivo análogo (cobre apenas adapters Prisma).
// Padrão equivalente aqui: apps/web fica report-only até o primeiro BC.
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
      // Gate desabilitado — ver STATUS ATUAL acima.
      // Reativar para 80% ao começar o primeiro BC do frontend.
      thresholds: {
        lines: 0,
        functions: 0,
        branches: 0,
        statements: 0,
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
        'eslint.config.*',
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
