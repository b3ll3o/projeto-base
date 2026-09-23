import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// pt-BR: resolve o caminho de main.ts relativo à localização do próprio spec
// (não depende de process.cwd()). Necessário porque `pnpm test:unit` (via
// turbo/CI) roda com CWD=apps/api/, enquanto `pnpm vitest run` direto roda
// com CWD=monorepo root. Ver apps/api/vitest.workspace.ts para o setup.
const specDir = dirname(fileURLToPath(import.meta.url));
const MAIN_TS_PATH = resolve(specDir, 'main.ts');

describe('main.ts bootstrap order', () => {
  it('importa tracing.ts antes do NestFactory', async () => {
    const mainSource = await readFile(MAIN_TS_PATH, 'utf8');
    const tracingIdx = mainSource.indexOf('telemetry/tracing');
    const nestIdx = mainSource.indexOf('NestFactory');
    expect(tracingIdx).toBeGreaterThanOrEqual(0);
    expect(nestIdx).toBeGreaterThan(tracingIdx);
  });

  it('chama initTracing() dentro do main.ts (ou via side-effect)', async () => {
    const mainSource = await readFile(MAIN_TS_PATH, 'utf8');
    // Either explicit call OR side-effect import is acceptable.
    // Side-effect import alone is acceptable per tracing.ts comment.
    const hasImport = mainSource.includes('telemetry/tracing');
    expect(hasImport).toBe(true);
  });
});
