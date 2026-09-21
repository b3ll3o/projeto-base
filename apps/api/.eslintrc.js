import baseConfig from '@projeto/eslint-config';

export default [
  ...baseConfig,
  {
    rules: {
      // Fase 2-3 overrides (placeholder; expanded in Phase 3)
    },
  },
  {
    ignores: ['dist/**', 'coverage/**'],
  },
];
