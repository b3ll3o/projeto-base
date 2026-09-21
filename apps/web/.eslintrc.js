// apps/web/.eslintrc.js
import baseConfig from '@projeto/eslint-config';
import nextPlugin from 'eslint-config-next';

export default [
  ...baseConfig,
  {
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}'],
    rules: {
      // regras específicas Next.js adicionadas em CI
    },
  },
];
