// Browser-side OTel SDK init for Next.js client components.
// Loaded automatically by Next.js when NEXT_RUNTIME === 'browser'.
// (Note: NOT loaded via instrumentation.ts — Next.js's bundler auto-discovers
// this file in the project root and includes it in the client bundle.)
//
// IMPORTANTE: todo código side-effect deste módulo é guardado por
// `typeof window !== 'undefined'` para evitar ReferenceError durante
// prerender de páginas estáticas (Next.js avalia o módulo no build
// pipeline mesmo quando o bundle final é client-only). Esse guard é
// equivalente em runtime ao contrato do Next.js (executar só no
// browser) mas permite que o build pipeline faça tree-shaking seguro.

import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

if (typeof window !== 'undefined') {
  const provider = new WebTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]:
        process.env.NEXT_PUBLIC_OTEL_SERVICE_NAME ?? 'projeto-base-web',
    }),
  });

  provider.addSpanProcessor(
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        // Browser MUST use public env vars (NEXT_PUBLIC_*) — these are inlined
        // at build time. Production endpoint goes via the Next.js API route
        // (`/api/otel/collect`) to avoid CORS — direct collector URL only in dev.
        url: process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT ?? '/api/otel/collect',
      }),
    ),
  );

  // Register the provider as global BEFORE instantiating the auto-instrumentations:
  // each instrumentation calls `trace.getTracer(name, version)` in its super()
  // constructor (InstrumentationAbstract), and that resolves through the global
  // tracer provider — so we need it set first to avoid NoopTracers.
  // `provider.register()` does NOT accept `instrumentations` in `SDKRegistrationConfig`
  // (that pattern is NodeSDK-only); for the web SDK we just instantiate the
  // auto-instrumentations and they auto-enable + patch globals on construction.
  provider.register();

  getWebAutoInstrumentations({
    '@opentelemetry/instrumentation-fetch': { enabled: true },
    '@opentelemetry/instrumentation-document-load': { enabled: true },
    '@opentelemetry/instrumentation-user-interaction': { enabled: true },
  });
}
