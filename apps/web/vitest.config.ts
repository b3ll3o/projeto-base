// apps/web/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.spec.ts', 'components/**/*.spec.ts'],
  },
  resolve: {
    alias: {
      '@projeto/shared-types': new URL('../../packages/shared-types/src', import.meta.url).pathname,
    },
  },
});
