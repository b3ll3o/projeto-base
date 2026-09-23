import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'node:module';
import { trace, context, SpanKind } from '@opentelemetry/api';
import type pinoType from 'pino';

describe('Pino-OTel bridge (PinoInstrumentation)', () => {
  beforeEach(() => {
    // Reset module cache and SDK singleton so initTracing() can re-init cleanly
    delete (globalThis as { __otel_sdk__?: unknown }).__otel_sdk__;
    delete process.env.OTEL_SDK_DISABLED;
    vi.resetModules();
  });

  it('log entry inclui trace_id W3C (32 hex chars) quando há span ativo', async () => {
    // 1. Inicializa SDK (vai hookear a próxima carga de `pino` via
    // `require-in-the-middle` — ESM `import` estático NÃO é interceptável
    // após o módulo ter sido carregado, então usamos createRequire para
    // acionar o hook CJS).
    const tracing = await import('./tracing.js');
    tracing.initTracing();

    // 2. Carrega pino via createRequire (CJS) — primeira carga será
    // interceptada pelo hook e pino será "patched" com o OTel mixin.
    const req = createRequire(import.meta.url);
    const pino = req('pino') as typeof pinoType;

    // 3. Cria um tracer e inicia um span para gerar um trace_id W3C válido
    const tracer = trace.getTracer('test-tracer');
    const span = tracer.startSpan('test-span', {
      kind: SpanKind.INTERNAL,
      attributes: {},
    });
    const spanCtx = span.spanContext();
    // Sanity check: W3C trace ID é 32 chars lowercase hex
    expect(spanCtx.traceId).toMatch(/^[0-9a-f]{32}$/);

    // 4. Stream para capturar log JSON
    const captured: Record<string, unknown>[] = [];
    const stream = {
      write: (s: string) => {
        try {
          captured.push(JSON.parse(s));
        } catch {
          // ignore non-JSON lines
        }
      },
    };
    const log = pino({ name: 'test', level: 'info' }, stream);

    // 5. Loga dentro do contexto do span
    context.with(trace.setSpan(context.active(), span), () => {
      log.info('hello');
    });

    // 6. Captura dos logs deve incluir trace_id do W3C context
    // O PinoInstrumentation injeta automaticamente `trace_id` e `span_id`
    const entryWithTrace = captured.find(
      (c) => typeof c.trace_id === 'string' && c.trace_id.length === 32,
    );
    expect(entryWithTrace).toBeDefined();
    expect(entryWithTrace?.trace_id).toBe(spanCtx.traceId);
  });
});
