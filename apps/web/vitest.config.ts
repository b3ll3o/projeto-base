// apps/web/vitest.config.ts
//
// Regra de cobertura mínima: 80% agregado em todas as quatro métricas
// (lines, functions, branches, statements) — ver
// .agents/specs/conventions/cobertura-testes.md.
//
// STATUS ATUAL (re-medido em 2026-10-06): o gate de 80% continua
// **desabilitado** (thresholds = 0). A cobertura real medida é **72,83% em
// 8 arquivos** (`pnpm exec vitest run --coverage`, a partir de apps/web).
//
// Este número é uma FOTOGRAFIA, não uma constante: ele muda a cada teste e a
// cada arquivo novo. Re-meça antes de citá-lo em qualquer lugar.
//
// O que puxa a média para baixo são os 4 arquivos de telemetria
// (`instrumentation-client.ts` e os três de `telemetry/`), todos em 0% —
// nenhum exercitado por teste unitário. O que a tela de cadastro acrescenta
// está em 100%: `components/cadastro-usuario-form.tsx` e
// `lib/cadastro-usuario-schema.ts`.
//
// Duas ressalvas que o número sozinho esconde:
//  - `app/**` está no `coverage.exclude` (decisão de diseño abaixo), então
//    `app/users/novo/actions.ts` — a Server Action, ~120 linhas de tradução de
//    erro — NÃO aparece no relatório. Os 13 testes dela rodam; a cobertura
//    dela não é medida. Green por ausência, que é o modo de falha que a
//    classe 3 descreve.
//  - Reativar o gate a 80% hoje ficaria VERMELHO: 72,83% < 80%. O gatilho
//    declarado abaixo ("quando o primeiro BC do frontend começar") já
//    dispara, mas desligar o número ou escribilhar o teto não são a mesma
//    coisa — a decisão é de quem mantém o gate, não de um comentário.
//
// Por que report-only é aceitável sob a regra global: o mesmo doc de
// cobertura já trata o projeto `integration` de apps/api como report-only
// (não gate-enforced) por motivo análogo (cobre apenas adapters Prisma).
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
    // pt-BR (2026-10-06): a tela de cadastro introduces o PRIMEIRO
    // Client Component com DOM do app, e a primeira Server Action com
    // I/O. O glob anterior só enxergava `components/**/*.spec.ts`, que
    // não casa um spec em `.tsx` (o `.tsx` só aparecia sob `src/`, por
    // causa do glob do web-vitals). Sem estes dois globs, os testes da
    // tela de cadastro seriam silenciosamente NÃO EXECUTADOS — o Vitest
    // não falha por arquivo não coletado, ele apenas roda menos. É o
    // mesmo modo de falha de "gate que casa vazio": o verde sem ter
    // testado nada.
    include: [
      'lib/**/*.spec.ts',
      'components/**/*.spec.ts',
      // pt-BR: spec de Client Component (renderiza DOM, precisa de
      // `// @vitest-environment jsdom` no topo do arquivo).
      'components/**/*.spec.tsx',
      // pt-BR: a Server Action mora em `app/users/novo/actions.ts`. O
      // `app/**` continua excluído da COBERTURA (decisão de diseño
      // acima, inalterada) — aqui é só `include` de descoberta.
      'app/**/*.spec.ts',
      // pt-BR: Task 4.1 (plano telemetria) introduziu o reporter de
      // Web Vitals sob `src/telemetry/`. Client Components ficam fora
      // de `lib/` (utilities puras) e `components/` (UI), então
      // estendemos o glob para cobrir o diretório novo sem precisar
      // renomear caminhos.
      'src/**/*.spec.ts',
      'src/**/*.spec.tsx',
    ],
    // pt-BR: matcher do Testing Library (`toBeInTheDocument`, `toHaveValue`…).
    // Carregado só nos specs que declaram ambiente DOM, mas é global —
    // não custa nada nos de `node`.
    setupFiles: ['./vitest.setup.ts'],
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
  // pt-BR (2026-10-06): o tsconfig do app declara `jsx: "preserve"`, que é
  // o correto para o Next — quem compila JSX é o compilador dele. Mas o
  // Vitest usa o esbuild, e com `preserve` ele volta ao transform CLÁSSICO,
  // que exige `React` no escopo de cada arquivo: o sintoma é
  // `ReferenceError: React is not defined` em TODO spec `.tsx`, com o teste
  // morrendo no `render` e não no que ele deveria verificar.
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      // pt-BR (2026-10-06): o alias `@/` é o que o Next resolve em runtime
      // (tsconfig `paths`), e todo import dentro de `app/` e `components/`
      // o usa. Sem espelhá-lo aqui, QUALQUER spec que importe um módulo do
      // app morre em "Failed to load url @/lib/..." — e o sintoma é o teste
      // inteiro sumindo, não um erro de import legível. A lista de aliases
      // tem de ser derivada do mesmo `paths` do tsconfig, senão as duas
      // resoluções divergem em silêncio.
      '@': new URL('.', import.meta.url).pathname,
      '@projeto/shared-types': new URL('../../packages/shared-types/src', import.meta.url).pathname,
    },
  },
});
