// apps/web/eslint.config.mjs
// Flat config (ESLint 9) para o app Next.js.
// Estende a config compartilhada @projeto/eslint-config e adiciona
// ajustes específicos do frontend (TS para JSX, hooks rules).
import baseConfig from '@projeto/eslint-config';

export default [
  ...baseConfig,
  {
    ignores: [
      // Arquivos auto-gerados / config do Next.js (não mexer).
      '**/next-env.d.ts',
      '**/postcss.config.js',
      '**/tailwind.config.ts',
      // Já ignorados pelo baseConfig também, mas explícito:
      '**/.next/**',
      // pt-BR (2026-10-08): `.next-e2e` é o `distDir` da suíte Playwright
      // (ver `apps/web/next.config.mjs`). O `.gitignore` da raiz já o lista, mas
      // o ESLint não lê `.gitignore` — MEDIDO: sem esta linha, `pnpm lint` do web
      // reportava **24952 erros** em 85 arquivos de output compilado, porque o
      // build standalone ali dentro é JavaScript CommonJS gerado, e cada página
      // gera centenas de `no-undef`/`no-unused-vars`. Era `eslint .` varrendo
      // 400 MB de artefato.
      '**/.next-e2e/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
    ],
  },
  {
    // pt-BR (2026-10-08): `mjs` entrou junto porque `next.config.mjs` — que é
    // `.mjs`, não `.js` — ficou de fora deste bloco e o `no-undef` disparou em
    // `process.env.NEXT_DIST_DIR` (MEDIDO: `pnpm lint` do web vermelho com
    // `'process' is not defined`, linha 18). A lista de globals já é a do
    // ambiente que o arquivo roda; sem o `mjs`, o glob não a entregava.
    files: ['**/*.{ts,tsx,jsx,js,mjs}'],
    languageOptions: {
      globals: {
        // Next.js / browser
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      // Frontend não tem a regra de pureza de domínio (regra do DDD é
      // exclusiva do backend, ver packages/eslint-config/rules/).
    },
  },
  {
    // pt-BR (2026-10-08): `no-empty-pattern` desligado SÓ para `e2e/`, e o
    // motivo é um contrato do framework, não uma preferência de estilo.
    //
    // `base.extend` do Playwright valida que o primeiro argumento de cada
    // fixture é um padrão de desestruturação de objeto. Uma fixture que não
    // depende de nenhuma outra tem, por isso, de escrever `({}, use)` — não há
    // outra forma de declarar "não quero nada do contexto".
    //
    // MEDIDO: a tentativa de resolver pelo lado do código (trocar `{}` por um
    // parâmetro nomeado) deixou o lint verde e derrubou a suíte INTEIRA na
    // carga dos specs, com "First argument must use the object destructuring
    // pattern". Silenciar a regra onde ela briga com uma API é o conserto certo;
    // o `e2e/` é todo harness, e nenhum outro lugar do app usa este padrão.
    files: ['e2e/**/*.ts'],
    rules: {
      'no-empty-pattern': 'off',
    },
  },
];
