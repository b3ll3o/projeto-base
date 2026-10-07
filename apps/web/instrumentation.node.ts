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
  var __otel_sdk__: NodeSDK | undefined;
}

// pt-BR (2026-10-06): este arquivo age por importação, e um `throw` aqui
// NÃO é um erro de telemetria — é o servidor inteiro fora do ar. RSC, API
// routes e Server Actions morrem juntos, porque todos passam por aqui.
//
// Este é o mesmo defeito que já foi corrigido em `instrumentation-client.ts`
// (lá, matava a hidratação do browser): o `OTLPTraceExporter` exige URL
// ABSOLUTA e lança "Could not parse user-provided export URL" no construtor.
// O conserto tinha sido aplicado de um lado só — o cliente ganhou os dois
// filtros (URL absoluta + `try/catch`), o servidor ficou com nenhum.
//
// `instrumentation.node.spec.ts` é o que segura esta invariante.
const endpointBruto = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
const endpoint =
  endpointBruto && /^https?:\/\//i.test(endpointBruto)
    ? endpointBruto
    : 'http://otel-collector:4318/v1/traces';

if (!globalThis.__otel_sdk__) {
  try {
    const sdk = new NodeSDK({
      resource: new Resource({
        [SemanticResourceAttributes.SERVICE_NAME]:
          process.env.OTEL_SERVICE_NAME ?? 'projeto-base-web',
        [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ?? 'development',
      }),
      traceExporter: new OTLPTraceExporter({ url: endpoint }),
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
  } catch (erro) {
    console.warn('[otel] telemetria do server desabilitada:', erro);
  }
}
