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
  // pt-BR (2026-10-06): telemetria NUNCA pode derrubar a aplicação. Este
  // módulo é avaliado durante o bootstrap do bundle do cliente, e uma
  // exceção aqui aborta a hidratação inteira — nenhuma Client Component
  // funciona, sem erro de tela, só no console.
  //
  // Medido, exatamente assim: sem `NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT`
  // configurada, o fallback era a URL RELATIVA `/api/otel/collect` (e essa
  // rota nem existe no app). O `OTLPTraceExporter` exige URL absoluta e
  // lança "Could not parse user-provided export URL" — o formulário de
  // cadastro, no navegador, não recebia cliques: aparecia um GET nativo
  // para `?nome=&email=.`. Com a variável apontando para
  // `http://localhost:4318/...` a mesma página passou a hidratar e a
  // funcionar, sem nenhuma mudança no código do formulário.
  //
  // Dois filtros: URL absoluta (o erro que existia) e `try/catch` (qualquer
  // erro futuro de OTel). Sem endpoint não há telemetria — e isso é
  // preferível a um app que não reage ao clique.
  const endpointBruto = process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT;
  const endpoint = endpointBruto && /^https?:\/\//i.test(endpointBruto) ? endpointBruto : null;

  if (endpoint) {
    try {
      const provider = new WebTracerProvider({
        resource: new Resource({
          [SemanticResourceAttributes.SERVICE_NAME]:
            process.env.NEXT_PUBLIC_OTEL_SERVICE_NAME ?? 'projeto-base-web',
        }),
      });

      // pt-BR: a URL precisa ser absoluta para o navegador. O caminho de
      // produção via Next.js API route continua válido, mas essa rota
      // precisa existir de verdade (ainda não existe em apps/web) — até lá,
      // apontar `NEXT_PUBLIC_*` para o collector e o caminho que funciona.
      provider.addSpanProcessor(new BatchSpanProcessor(new OTLPTraceExporter({ url: endpoint })));

      // Register the provider as global BEFORE instantiating the auto-instrumentations:
      // each instrumentation calls `trace.getTracer(name, version)` in its super()
      // constructor (InstrumentationAbstract), and that resolves through the global
      // tracer provider — so we need to set it first to avoid NoopTracers.
      // `provider.register()` does NOT accept `instrumentations` in `SDKRegistrationConfig`
      // (that pattern is NodeSDK-only); for the web SDK we just instantiate the
      // auto-instrumentations and they auto-enable + patch globals on construction.
      provider.register();

      getWebAutoInstrumentations({
        '@opentelemetry/instrumentation-fetch': { enabled: true },
        '@opentelemetry/instrumentation-document-load': { enabled: true },
        '@opentelemetry/instrumentation-user-interaction': { enabled: true },
      });
    } catch (erro) {
      console.warn('[otel] telemetria do browser desabilitada:', erro);
    }
  }
}
