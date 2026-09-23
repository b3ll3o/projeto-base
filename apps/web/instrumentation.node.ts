// apps/web/instrumentation.node.ts
// Server-side OpenTelemetry SDK init for the Next.js Node runtime
// (RSC, API routes, server actions). Loaded as a side-effect via the
// runtime-aware `instrumentation.ts` shim when NEXT_RUNTIME === 'nodejs'.
//
// Pattern mirrors `apps/api/src/shared/infrastructure/telemetry/tracing.ts`:
//   - NodeSDK bootstrap with OTLP HTTP exporter,
//   - resource attributes from the same semantic-conventions module,
//   - auto-instrumentations bundle com fs instrumentation desabilitada
//     (ruído excessivo em server runtime),
//   - idempotency via `globalThis.__otel_sdk__` (HMR-friendly em dev).
//
// Diferenças vs apps/api/tracing.ts:
//   - Não usa PinoInstrumentation (apps/web não usa Pino; usa console + Next).
//   - Não tem `initTracing()` explícito: a inicialização acontece como
//     side-effect na importação do módulo, pois é o contrato esperado pelo
//     `await import('./instrumentation.node')` em instrumentation.ts.

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

declare global {
  // eslint-disable-next-line no-var
  var __otel_sdk__: NodeSDK | undefined;
}

if (!globalThis.__otel_sdk__) {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]:
        process.env.OTEL_SERVICE_NAME ?? 'projeto-base-web',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318/v1/traces',
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs instrumentation gera ruído massivo em RSC e build pipeline;
        // desabilitar para manter o collector legível.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });
  sdk.start();
  globalThis.__otel_sdk__ = sdk;
}
