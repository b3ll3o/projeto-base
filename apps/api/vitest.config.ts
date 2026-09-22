// apps/api/vitest.config.ts
//
// Config base compartilhada. Cada project (unit/integration) vive em
// vitest.workspace.ts e herda opções daqui via `extends`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@projeto/shared-types': new URL('../../packages/shared-types/src', import.meta.url).pathname,
    },
  },
});
