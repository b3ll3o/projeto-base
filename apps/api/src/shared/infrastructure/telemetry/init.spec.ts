import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('init.ts (bootstrap side-effect)', () => {
  beforeEach(() => {
    // Reset the global between tests so each import sees a fresh state
    delete (globalThis as { __otel_sdk__?: unknown }).__otel_sdk__;
    delete process.env.OTEL_SDK_DISABLED;
    vi.resetModules();
  });

  it('chama initTracing() quando importado (via side-effect)', async () => {
    const tracingModule = await import('./tracing.js');
    const spy = vi.spyOn(tracingModule, 'initTracing');
    await import('./init.js');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('aponta para um módulo que existe e tem side-effect', async () => {
    // Static check: the file must exist and contain the call
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const url = await import('node:url');
    const initPath = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), 'init.ts');
    const src = await readFile(initPath, 'utf8');
    expect(src).toMatch(/initTracing\(/);
  });
});
