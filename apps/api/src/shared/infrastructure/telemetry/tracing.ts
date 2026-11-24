import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { buildResource } from './resource.js';

declare global {
  var __otel_sdk__: NodeSDK | undefined;
}

export function initTracing(): void {
  if (process.env.OTEL_SDK_DISABLED === 'true') return;
  if (globalThis.__otel_sdk__) return;

  // O `sdk-node` 0.301.2 cria o `LoggerProvider` por default (o 0.54.2 só
  // criava se o app pedisse) e o exporter dele lê o
  // `OTEL_EXPORTER_OTLP_ENDPOINT` como URL BASE: com o endpoint do repo
  // apontando para `/v1/traces`, os logs iam para `/v1/traces/v1/logs` —
  // MEDIDO 2026-11-23 num sink OTLP local, `POST /v1/traces/v1/metrics`
  // (7.528 bytes). `none` faz o SDK **não criar** provider de logs nenhum
  // (`configureLoggerProviderFromEnv` sai antes de criar) — e é o que o
  // `.env.example` do repo já declarava.
  //
  // ⚠️ O default é `none` e não `otlp`: o `latest` do SDK para logs é `otlp`,
  // que leria o endpoint como URL BASE e mandaria para um path que não
  // existe. Quem quiser logs põe `OTEL_LOGS_EXPORTER=otlp` no ambiente — e
  // o endpoint tem de ser a BASE, não `/v1/traces`.
  if (!process.env.OTEL_LOGS_EXPORTER) process.env.OTEL_LOGS_EXPORTER = 'none';

  const sdk = new NodeSDK({
    resource: buildResource(),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://otel-collector:4318/v1/traces',
    }),
    // O `MeterProvider` é o outro provider que o 0.301.2 cria por default,
    // e o exporter dele tem o mesmo problema de URL BASE (as métricas iam
    // para `/v1/traces/v1/metrics`). Aqui o desligamento é **por código**,
    // e não por env: `metricReaders: []` faz o SDK não criar o provider
    // (ele só cria quando `readers.length > 0`), e o `.env.example` declara
    // `OTEL_METRICS_EXPORTER=otlp` — se o desligamento fosse pelo env, o
    // `.env.example` religaria as métricas no path errado.
    metricReaders: [],
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
