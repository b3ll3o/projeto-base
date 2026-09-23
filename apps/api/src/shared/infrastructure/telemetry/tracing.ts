import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
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
      // Auto-bundle para o que NÃO tem bridge específica de log.
      // Pino é tratado explicitamente abaixo (precisa ser uma versão
      // recente para suportar pino v10 que vem via Fastify/nestjs-pino).
      // Mantemos `@opentelemetry/instrumentation-pino` desabilitado no
      // auto-bundle para evitar conflito de versão/carregamento duplo.
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-pino': { enabled: false },
      }),
      // PinoInstrumentation: ao chamar `pino().info(...)` dentro de um span
      // ativo, injeta automaticamente os campos `trace_id`, `span_id` e
      // `trace_flags` no JSON do log (correlation Pino ↔ OTel sem precisar
      // passá-los manualmente em cada chamada).
      //
      // É CRÍTICO inicializar o SDK ANTES de qualquer `import 'pino'`,
      // pois o hook `import-in-the-middle` só intercepta módulos no
      // momento da carga. Em runtime isso é garantido pelo `init.ts`
      // (carregado via `--import` antes do código da aplicação).
      new PinoInstrumentation({
        logKeys: {
          traceId: 'trace_id',
          spanId: 'span_id',
          traceFlags: 'trace_flags',
        },
      }),
    ],
  });
  sdk.start();
  globalThis.__otel_sdk__ = sdk;
}

// NOTA: initTracing() NÃO é auto-invocado neste módulo.
// Em runtime ESM (projeto é `type: module`), `require` é undefined — qualquer
// side-effect de auto-init precisa ser feito pelo chamador. O contrato é:
//   1. main.ts faz `import './shared/infrastructure/telemetry/tracing.js'` (side-effect import)
//   2. logo após, chama `initTracing()` explicitamente
// Isso mantém o módulo livre de side-effects na importação (facilita testes)
// e mantém o controle de inicialização no composition root (main.ts).
