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
      '**/coverage/**',
      '**/dist/**',
      '**/node_modules/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx,jsx,js}'],
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
];
