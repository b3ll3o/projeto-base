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
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/node_modules/**',
    ],
  },
];
