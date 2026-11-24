// apps/api/src/shared/infrastructure/telemetry/tracing.config.spec.ts
//
// Contrato do `NodeSDK` que a API sobe — o que o SDK recebe, não o que ele
// faz depois.
//
// pt-BR: o `sdk-node` 0.301.2 (o bump do PR #188) passou a criar o
// `MeterProvider` e o `LoggerProvider` por default, e os dois exporters leem
// o `OTEL_EXPORTER_OTLP_ENDPOINT` como URL BASE. Com o endpoint do repo
// apontando para `/v1/traces`, as métricas iam para `/v1/traces/v1/metrics`
// e os logs para `/v1/traces/v1/logs` — dois paths que não existem. MEDIDO
// 2026-11-23 num sink OTLP local: `POST /v1/traces/v1/metrics`, 7.528 bytes.
//
// O conserto são os dois arrays VAZIOS na config do SDK. Esta spec existe
// para que ninguém tire esses dois arrays sem perceber que está devolvendo
// o defeito: sem ela, a remoção passa verde e o erro só reaparece no
// collector (path errado), nunca na suíte.
//
// A config é capturada no CONSTRUTOR (mesmo formato do spec irmão do web,
// `apps/web/instrumentation.node.spec.ts`) — é o único ponto em que o SDK
// ainda não criou provider nenhum.
import { describe, it, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  cfg: undefined as
    | {
        metricReaders?: unknown[];
        logRecordProcessors?: unknown[];
        traceExporter?: { url?: string };
      }
    | undefined,
  start: vi.fn(),
}));

vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: vi.fn((cfg: unknown) => {
    h.cfg = cfg as typeof h.cfg;
    return { start: h.start, stop: vi.fn() };
  }),
}));

// pt-BR: o `OTLPTraceExporter` real esconde a URL num campo interno — para
// ler o path é preciso do mock, que devolve o que o SDK receberia.
vi.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: vi.fn((cfg: { url: string }) => ({ url: cfg.url })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  h.cfg = undefined;
  delete (globalThis as { __otel_sdk__?: unknown }).__otel_sdk__;
  delete process.env.OTEL_SDK_DISABLED;
  vi.resetModules();
});

describe('initTracing — a config do NodeSDK', () => {
  it('sobe sem provider de métricas e sem provider de logs', async () => {
    const { initTracing } = await import('./tracing.js');
    initTracing();

    expect(h.cfg?.metricReaders).toEqual([]);
    expect(h.cfg?.logRecordProcessors).toEqual([]);
  });

  it('o exporter de traces aponta para o path de traces, não para a URL base', async () => {
    // pt-BR: o path `/v1/traces` no endpoint é o que faz o SDK montar
    // `/v1/traces/v1/metrics` quando alguém liga um exporter de métricas.
    const { initTracing } = await import('./tracing.js');
    initTracing();

    expect(h.cfg?.traceExporter?.url).toContain('/v1/traces');
  });
});
