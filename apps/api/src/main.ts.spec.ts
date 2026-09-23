import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';

describe('main.ts bootstrap order', () => {
  it('importa tracing.ts antes do NestFactory', async () => {
    const mainSource = await readFile('apps/api/src/main.ts', 'utf8');
    const tracingIdx = mainSource.indexOf('telemetry/tracing');
    const nestIdx = mainSource.indexOf('NestFactory');
    expect(tracingIdx).toBeGreaterThanOrEqual(0);
    expect(nestIdx).toBeGreaterThan(tracingIdx);
  });

  it('chama initTracing() dentro do main.ts (ou via side-effect)', async () => {
    const mainSource = await readFile('apps/api/src/main.ts', 'utf8');
    // Either explicit call OR side-effect import is acceptable.
    // Side-effect import alone is acceptable per tracing.ts comment.
    const hasImport = mainSource.includes('telemetry/tracing');
    expect(hasImport).toBe(true);
  });
});
