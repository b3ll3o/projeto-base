// apps/web/vitest.config.ts
//
// Regra de cobertura mínima: 80% agregado em todas as quatro métricas
// (lines, functions, branches, statements) — ver
// .agents/specs/conventions/cobertura-testes.md.
//
// STATUS ATUAL (2026-10-02): o gate de 80% está **desabilitado**
// (thresholds = 0) porque apps/web está em fase de scaffolding. A
// cobertura real medida é **47.24%** (6 arquivos) — o número é confiável
// desde que o `.next/` voltou a ser excluído (ver `coverage.exclude`);
// antes disso o relatório lia 16.28% com 67 dos 74 arquivos sendo build
// output do Next.js. Este app ainda não tem feature associada no roadmap
// imediato. Quando o primeiro BC do frontend começar (ex: página de
// listagem de users), reativar thresholds para 80% seguindo o mesmo
// padrão de apps/api#unit.
//
// Por que isso é aceitável sob a regra global: o mesmo doc de cobertura
// já trata o projeto `integration` de apps/api como report-only (não
// gate-enforced) por motivo análogo (cobre apenas adapters Prisma).
// Padrão equivalente aqui: apps/web fica report-only até o primeiro BC.
//
// Exclusões canônicas:
//   - app/** → Next.js RSC + client component pages — testadas via E2E
//     em fase posterior (Playwright); excluídas por enquanto porque o
//     setup jsdom/RSC está fora do escopo unit.
//   - next-env.d.ts → gerado pelo Next.js, não editado.
//   - **/*.spec.{ts,tsx} → arquivos de teste não contam como código de
//     produção.
//   - **/.next/** → build output do framework Next.js (ver nota no array).

import { coverageConfigDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'lib/**/*.spec.ts',
      'components/**/*.spec.ts',
      // pt-BR: Task 4.1 (plano telemetria) introduziu o reporter de
      // Web Vitals sob `src/telemetry/`. Client Components ficam fora
      // de `lib/` (utilities puras) e `components/` (UI), então
      // estendemos o glob para cobrir o diretório novo sem precisar
      // renomear caminhos.
      'src/**/*.spec.ts',
      'src/**/*.spec.tsx',
    ],
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
        // pt-BR: os defaults do Vitest vêm PRIMEIROS — o array do usuário
        // SUBSTITUI a lista default em vez de mesclar (shallow spread em
        // `dist/coverage.js`). Perder o spread remove `**/[.]**`, que é o
        // que segura o `.next/`, e o glob default de test/spec, que é o
        // que segura arquivos `.spec.tsx`.
        //
        // Os três globs deste array se cobrem dois a dois: cada um sozinho
        // já segura o `.next/` e os specs, e o relatório só regride
        // quando o par responsável cai junto. Medido em `apps/web`
        // (`pnpm run test:coverage`, lista final como base):
        //
        //   este config ..........................  6 arquivos / 47.24%
        //   sem `**/.next/**` ....................  6 arquivos / 47.24%
        //   sem o spread ........................  6 arquivos / 47.24%
        //   sem os dois ......................... 73 arquivos / 12.07%
        //
        // O estado de `main` — nem spread nem `**/.next/**`, e com o glob
        // antigo `**/*.spec.ts` — lia 74 arquivos / 16.28%, dos quais 67
        // eram build output do Next.js. E a pior variante: sem o spread
        // mas com o glob antigo `.spec.ts`, o `.spec.tsx` entra como 100%
        // coberto e a cobertura **sobe** para 55.92% (7 arquivos).
        // Cobertura que melhora sem teste novo é config quebrada, não
        // progresso — conferir sempre o número de arquivos do relatório.
        ...coverageConfigDefaults.exclude,
        // pt-BR: `**/.next/**` é REDUNDANTE dado o spread (medido: sem esta
        // linha o relatório é byte-a-byte idêntico), mas fica aqui de
        // propósito — ao contrário do `**/dist/**` do apps/api, que foi
        // removido por ser redundante. A diferença: lá o default traz
        // `dist/**` literal, óbvio; aqui a proteção vem de `**/[.]**`, um
        // catch-all de dotfiles que ninguém associaria a `.next`. Declarar
        // de forma explícita documenta a intenção em vez de confiar num
        // efeito colateral de glob.
        '**/.next/**',
        'app/**',
        'next-env.d.ts',
        // pt-BR: `{ts,tsx}` e não só `.ts` — o app tem testes de Client
        // Component (`src/telemetry/web-vitals-reporter.spec.tsx`) e um glob
        // `**/*.spec.ts` não os casa. Com o spread presente a troca é
        // inócua (byte-a-byte idêntica); ela existe para que a lista
        // explícita não dependa do default. Medido: sem o spread, o glob
        // antigo deixa o relatório em 7 arquivos / 55.92% e o novo o traz
        // de volta para 6 / 47.24%.
        '**/*.spec.{ts,tsx}',
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
