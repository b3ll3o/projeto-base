# Telemetry Frontend (Next.js) Bootstrap

> Browser → app/layout.tsx instrumentation → web-vitals → OTel metrics SDK OTLP

> Diagrama derivado da IR `docs/flows/telemetry-observability/telemetry.frontend.nodejs.bootstrap.sequence/telemetry.frontend.nodejs.bootstrap.sequence.sequence.json` pelo conversor
> `tooling/scripts/flow-ir-to-mermaid.ts` — regenerar com
> `pnpm tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write`.
> O `.html` ao lado (~813 KB) foi produzido pelo `archify flow`, removido;
> segue versionado como histórico e não é regenerável.

```mermaid
sequenceDiagram
    participant browser as Browser<br/>perf observer
    participant next as Next.js<br/>App Router
    participant instrument as Instr.ts<br/>register()
    participant reporter as Reporter<br/>client comp
    participant vitals as web-vitals<br/>LCP/CLS/INP
    participant otel_api as OTel API<br/>createHistogram
    participant otlp as OTLP<br/>/v1/metrics
    rect Boot
    activate next
    browser->>next: GET / (page load)
    next->>instrument: register()
    activate reporter
    instrument->>reporter: render &lt;WebVitalsReporter/&gt;
    deactivate next
    end
    rect Web Vitals capture
    activate vitals
    reporter->>vitals: onLCP/onCLS/onINP
    activate otel_api
    vitals->>otel_api: histogram value
    otel_api-->>reporter: histogram.record()
    deactivate vitals
    deactivate otel_api
    end
    rect OTLP export
    reporter->>otlp: POST /v1/metrics
    deactivate reporter
    end
    Note over browser,otlp: Next.js 15 instrumentation.ts<br/>App Router detecta instrumentation.ts automaticamente<br/>Roda antes de qualquer render<br/>Exports register() para OTel SDK
    Note over browser,otlp: Web Vitals automatic<br/>web-vitals lib captura LCP/CLS/INP/FID/TTFB<br/>Browser PerformanceObserver nativo<br/>Reporta ao OTel como histogram (não counter)
    Note over browser,otlp: SSR-safe module-load<br/>typeof window guard no top-level (PR #25)<br/>Reporter marcado como 'use client'<br/>Docker build nao quebra em SSR-only context
    Note over browser,otlp: OTLP/HTTP<br/>POST http://collector:4318/v1/metrics<br/>JSON encoding (protobuf optional)<br/>Correlacionado via trace context W3C
```

## Views

> A IR declara N views; Mermaid não tem troca de view, então o diagrama
> acima é a união e o conteúdo específico de cada uma fica aqui.

| View | Rótulo | Foco | Nota |
|------|--------|------|------|
| `boot` | Frontend boot | `browser`, `next`, `instrument`, `reporter`, `vitals`, `otlp` | Next.js 15 OTel instrumentation em node runtime. |
