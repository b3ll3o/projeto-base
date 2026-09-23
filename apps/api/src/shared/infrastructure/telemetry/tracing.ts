import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { buildResource } from './resource.js';

declare global {
  // eslint-disable-next-line no-var
  var __otel_sdk__: NodeSDK | undefined;
}

export function initTracing(): void {
  if (process.env.OTEL_SDK_DISABLED === 'true') return;
  if (globalThis.__otel_sdk__) return;

  const sdk = new NodeSDK({
    resource: buildResource(),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318/v1/traces',
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });
  sdk.start();
  globalThis.__otel_sdk__ = sdk;
}

// Auto-init se carregado via `node --require`
if (require.main === module || process.env.OTEL_AUTO_INIT === 'true') {
  initTracing();
}
