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

  // ⚠️ O EFEITO, com o SDK REAL (o spec de config usa mock e afirma a forma;
  // este afirma o que o SDK faz com a config).
  //
  // MEDIDO 2026-11-24: `logRecordProcessors: []` é TRUTHY — o `sdk-node`
  // 0.301.2 criava o `LoggerProvider` global SEM processor (o array entrava no
  // ramo `if (configuration.logRecordProcessors)` e o `configureLoggerProviderFromEnv`
  // — que respeita o `OTEL_LOGS_EXPORTER` — nunca era chamado). Com
  // `OTEL_LOGS_EXPORTER=none` o SDK não cria provider de logs nenhum, e o
  // `MeterProvider` também não nasce (o SDK só o cria com `readers.length > 0`).
  it('não cria provider de métricas nem de logs (o SDK real, não o mock)', async () => {
    const { initTracing } = await import('./tracing.js');
    initTracing();

    const sdk = (globalThis as { __otel_sdk__?: unknown }).__otel_sdk__ as
      { _meterProvider?: unknown; _loggerProvider?: unknown } | undefined;

    expect(sdk?._meterProvider).toBeUndefined();
    expect(sdk?._loggerProvider).toBeUndefined();
  });
});
