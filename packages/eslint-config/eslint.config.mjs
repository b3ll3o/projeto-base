// packages/eslint-config/eslint.config.mjs
//
// Flat config (ESLint 9) do PRÓPRIO pacote de regras.
//
// ⚠️ Este arquivo existe porque a regra `no-estilizacao-informal.js` (354
// linhas) e o `no-domain-imports-from-infra.js` NÃO eram lintados por
// NENHUM job: o pacote só tinha `lint:self` (`eslint index.js rules/`), que
// ninguém chama e que está QUEBRADO (sem `eslint.config.*`, o ESLint sai com
// "couldn't find an eslint.config.* file", exit 2). O `turbo run lint` — que
// o CI roda — só executa o script `lint` dos workspaces, e este pacote não
// tinha um.
//
// MEDIDO 2026-11-16: com o script `lint` no `package.json`, `pnpm turbo run
// lint` passa a lintar as DUAS regras do pacote, e uma violação nelas derruba
// o CI.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Parâmetro prefixado com `_` é assinatura de override, não código
      // morto — o mesmo motivo do `index.js` deste pacote.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['**/dist/**', '**/node_modules/**'],
  },
];
