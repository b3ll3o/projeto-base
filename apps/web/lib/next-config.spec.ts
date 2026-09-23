// apps/web/lib/next-config.spec.ts
//
// TDD (Task 3.5): garante que `apps/web/next.config.mjs` empacota
// `@opentelemetry/*` + `web-vitals` no output standalone via
// `experimental.outputFileTracingIncludes`.
//
// Por que arquivo-fonte (não runtime import)? O `next.config.mjs` é validado
// pelo Next.js no build; aqui queremos um guard portável e rápido contra
// regressões acidentais de remoção dos globs.
//
// Cobertura:
//   1. `output: 'standalone'` preservado (alinhado ao Dockerfile de prod).
//   2. `experimental.outputFileTracingIncludes` existe e mapeia `/**` para
//      ambos os globs `@opentelemetry/**/*` e `web-vitals/**/*`.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const configPath = fileURLToPath(new URL('../next.config.mjs', import.meta.url));
const source = readFileSync(configPath, 'utf8');

describe('next.config.mjs — outputFileTracingIncludes (Task 3.5)', () => {
  it('preserva output: "standalone" (alinhado ao Dockerfile prod)', () => {
    expect(source).toMatch(/output:\s*['"]standalone['"]/);
  });

  it('declara experimental.outputFileTracingIncludes para /**', () => {
    // bloco `experimental` precisa existir e referenciar outputFileTracingIncludes
    expect(source).toMatch(/experimental:\s*\{[\s\S]*?outputFileTracingIncludes[\s\S]*?\}/);
    // chave raiz '/**' presente
    expect(source).toMatch(/['"]\/\*\*['"]:\s*\[/);
  });

  it('inclui @opentelemetry/**/* e web-vitals/**/* nos globs de /**', () => {
    expect(source).toMatch(/['"]\.\/node_modules\/@opentelemetry\/\*\*\/\*['"]/);
    expect(source).toMatch(/['"]\.\/node_modules\/web-vitals\/\*\*\/\*['"]/);
  });
});
