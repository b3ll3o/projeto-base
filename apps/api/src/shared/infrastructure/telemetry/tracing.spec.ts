import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('initTracing (idempotência)', () => {
  beforeEach(() => {
    delete (globalThis as { __otel_sdk__?: unknown }).__otel_sdk__;
    delete process.env.OTEL_SDK_DISABLED;
    // Reset module cache so OTEL_SDK_DISABLED is read fresh
    vi.resetModules();
  });

  it('inicializa NodeSDK uma única vez (idempotente)', async () => {
    const { initTracing } = await import('./tracing.js');
    initTracing();
    const first = (globalThis as { __otel_sdk__?: unknown }).__otel_sdk__;
    initTracing();
    const second = (globalThis as { __otel_sdk__?: unknown }).__otel_sdk__;
    expect(first).toBeDefined();
    expect(second).toBe(first);
  });

  it('NÃO inicializa quando OTEL_SDK_DISABLED=true', async () => {
    process.env.OTEL_SDK_DISABLED = 'true';
    const { initTracing } = await import('./tracing.js');
    initTracing();
    expect((globalThis as { __otel_sdk__?: unknown }).__otel_sdk__).toBeUndefined();
  });

  it('NÃO auto-inicializa ao importar (sem side-effect)', async () => {
    // Reset state
    delete (globalThis as { __otel_sdk__?: unknown }).__otel_sdk__;
    vi.resetModules();
    // Apenas importa — NÃO chama initTracing
    await import('./tracing.js');
    expect((globalThis as { __otel_sdk__?: unknown }).__otel_sdk__).toBeUndefined();
  });
});
