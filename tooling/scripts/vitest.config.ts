// tooling/scripts/vitest.config.ts
//
// pt-BR: Config do Vitest para os scripts de tooling (stack-code-reviewer,
// doc-sync, lib/stack-detector). Coleta `*.spec.ts` na raiz e em `lib/`,
// ignora `node_modules` e `dist`. Sem thresholds de cobertura (tooling
// é dev tool, não código de produção — a regra de 80% se aplica só
// a apps/api e apps/web).

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['*.spec.ts', 'lib/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
    environment: 'node',
  },
});
