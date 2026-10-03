import baseConfig from '@projeto/eslint-config';

export default [
  ...baseConfig,
  {
    rules: {},
  },
  {
    ignores: ['dist/**', 'coverage/**'],
  },
];
