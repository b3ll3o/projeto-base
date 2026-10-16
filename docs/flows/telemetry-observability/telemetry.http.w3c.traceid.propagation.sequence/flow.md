# Telemetry W3C traceId Propagation

> Browser RSC → traceparent header → NestJS Controller span → AuditContext store → PostgreSQL

> Diagrama derivado da IR `docs/flows/telemetry-observability/telemetry.http.w3c.traceid.propagation.sequence/telemetry.http.w3c.traceid.propagation.sequence.sequence.json` pelo conversor
> `tooling/scripts/flow-ir-to-mermaid.ts` — regenerar com
> `pnpm tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write`.
> O `.html` ao lado (~813 KB) foi produzido pelo `archify flow`, removido;
> segue versionado como histórico e não é regenerável.

```mermaid
sequenceDiagram
    participant rsc as apps/web<br/>RSC fetch
    participant fetch as fetch()<br/>traceparent
    participant traceparent as traceparent<br/>HTTP header
    participant controller as Controller<br/>@Span()
    participant otel as OTel SDK<br/>extract ctx
    participant audit as AuditContext<br/>store
    participant pg as PostgreSQL<br/>audit_event
    rect HTTP request com traceparent
    activate fetch
    rsc->>fetch: apiClient.get('/users')
    fetch->>traceparent: inject header
    activate controller
    traceparent->>controller: 00-{traceId}-{spanId}-01
    deactivate fetch
    activate otel
    controller->>otel: extract context
    end
    rect Audit context store
    activate audit
    otel->>audit: AsyncLocalStorage.run()
    end
    rect Persist com traceId
    activate pg
    audit->>pg: INSERT audit_event w/ traceId
    deactivate otel
    pg-->>audit: row OK
    deactivate audit
    deactivate pg
    audit-->>controller: traceId correlate
    deactivate controller
    end
    Note over rsc,pg: W3C trace context<br/>traceparent: 00-<32 hex traceId>-<16 hex spanId>-01<br/>W3C TraceContext spec (não Zipkin B3)<br/>Propagator configurado em OTel SDK
    Note over rsc,pg: Browser ↔ API correlation<br/>fetch() injection automatic via OTLP context<br/>ApiClient send traceparent header em toda request<br/>Backend extract ctx antes do controller
    Note over rsc,pg: AsyncLocalStorage context<br/>AuditContext.store.run() seta ctx na thread<br/>Each request has own store (per-request isolation)<br/>Correlation available em todos use-cases
    Note over rsc,pg: Persistência no PostgreSQL<br/>audit_event.traceId column (VARCHAR 32)<br/>Correlacionável com Tempo back-end<br/>apps/web ApiClient trata 412 via ProblemDetails
```

## Views

> A IR declara N views; Mermaid não tem troca de view, então o diagrama
> acima é a união e o conteúdo específico de cada uma fica aqui.

| View | Rótulo | Foco | Nota |
|------|--------|------|------|
| `propagation` | traceId propagation | `rsc`, `fetch`, `traceparent`, `controller`, `otel`, `audit`, `pg` | W3C trace context flui browser→API→DB com correlação. |
