import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import noDomainImportsFromInfra from './rules/no-domain-imports-from-infra.js';

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: {
      'ddd-hexagonal': {
        rules: { 'no-domain-imports-from-infra': noDomainImportsFromInfra },
      },
    },
    rules: { 'ddd-hexagonal/no-domain-imports-from-infra': 'error' },
  },
  {
    // Parâmetro prefixado com `_` é assinatura de override (ex.: o
    // `_metadata` de `PipeTransform.transform`), não código morto — o
    // argumento precisa existir, só não é lido pelo corpo.
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/node_modules/**'],
  },
];
