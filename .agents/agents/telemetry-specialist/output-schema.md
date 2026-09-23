# Telemetry — Output Schema (YAML canônico)

> Sibling de [`telemetry-specialist.md`](../telemetry-specialist.md) (split-by-responsibility).
> Schema YAML completo do bloco `result` retornado pelo agent após qualquer
> dispatch. Consumido pelo orquestrador (`orchestrator` / `specialist-router`)
> e pelo `review-router` para classificar diffs.

---

## Schema

```yaml
result:
  agent: telemetry-specialist
  status: success | done_with_concerns | blocked

  output:
    sdk_strategy:
      backend: "@opentelemetry/sdk-node + NodeSDK (process-level init)"
      frontend: "@opentelemetry/sdk-web + Next.js instrumentation.ts"
      init_order: "OTel tracing → NestJS bootstrap → Pino logger"

    instrumentations:
      backend: [http, nestjs-core, fastify, pino, prisma]
      frontend: [fetch, document-load, user-interaction, web-vitals]
      deferred: [ioredis, bullmq]   # quando libs entrarem

    exporter:
      backend: otlp-http → otel-collector:4318/v1/traces
      frontend: otlp-http → /api/otel/collect (Route Handler proxy reverso)
      collector_profile: docker compose --profile observability up

    propagation:
      format: W3C Trace Context (traceparent + tracestate + baggage)
      cross_stack: frontend → api → prisma (sem perda)
      span_links_when_crossing_process: true

    resource_attributes:
      service.name: ${OTEL_SERVICE_NAME}        # projeto-base-api | projeto-base-web
      service.version: ${OTEL_SERVICE_VERSION}
      deployment.environment: ${NODE_ENV}

    metrics_or_logs_bridge:
      logs_bridge: "@opentelemetry/instrumentation-pino injeta trace_id/span_id"
      logs_dedup: pino-pretty removido em prod; pino (JSON) canônico
      metrics_baseline:
        - http.server.duration (histogram)
        - prisma.query.duration (histogram)
        - prisma.query.errors (counter)
        - audit.record.duration (histogram)
      future_metrics: [bull.job.duration, web.vitals.lcp/cls/inp/fid/ttfb]

    findings:
      - severity: minor
        file: apps/api/src/main.ts
        line: 13
        issue: "Fastify logger desativado — não religar ao instrumentar"
        recommendation: "Manter `new FastifyAdapter({ logger: false })` — pino-http é load-bearing"
      - severity: major
        file: apps/api/src/shared/infrastructure/prisma/prisma.service.ts
        line: 9
        issue: "Prisma events declarados sem `$on` registrado → queries silenciosas"
        recommendation: "Registrar `$on('query'|'error'|'warn', ...)`; ou instrumentar via `$extends({ query })`"
      - severity: minor
        file: apps/api/src/shared/infrastructure/http/global-exception.filter.ts
        line: 36
        issue: "traceId via Fastify request.id — não é W3C-compliant"
        recommendation: "Migrar para `trace.getActiveSpan()?.spanContext().traceId` (preservar teste `t-42`)"

    recommendations:
      - title: "Adicionar OTel Collector profile `[observability]` no Compose"
        rationale: "Permite ligar/desligar stack observability sem alterar Compose canônico"
        effort: S
        impact: high
      - title: "Web Vitals reporter no `layout.tsx` client"
        rationale: "Sem RUM hoje; gap conhecido (frontend observability)"
        effort: S
        impact: high
      - title: "ADRs: ADR-0002 telemetria-backend, ADR-0003 telemetria-frontend (opcional)"
        rationale: "Canônico das decisões + cross-ref futuro"
        effort: S
        impact: medium

  next_steps:
    - "Despachar test-writer para specs de telemetria (RED)"
    - "Despachar nestjs-specialist para coordenar boundary em apps/api"
    - "Despachar docker-specialist para validar compose profile [observability]"
    - "Despachar nextjs-specialist para validar `outputFileTracingIncludes` se Next standalone"
    - "Despachar review-router no fim da implementação"
    - "Despachar retrospective-capture para capturar aprendizados cross-stack"
```

---

## Validação do schema

Antes de devolver `result`:

- [ ] `status` ∈ {`success`, `done_with_concerns`, `blocked`}
- [ ] `instrumentations.backend` e `instrumentations.frontend` são listas
- [ ] `exporter.backend` termina com `/v1/traces` ou vendor específico
- [ ] `propagation.format` = `W3C Trace Context`
- [ ] `resource_attributes.service.name` referencia env var
- [ ] `findings[].file` existe (path válido)
- [ ] `findings[].severity` ∈ {`blocker`, `major`, `minor`, `info`}
- [ ] `recommendations[].effort` ∈ {`S`, `M`, `L`, `XL`}
- [ ] `next_steps` lista ao menos 2 ações

---

**Arquivo:** `.agents/agents/telemetry-specialist/output-schema.md`
**Parent:** [`telemetry-specialist.md`](../telemetry-specialist.md)
**Siblings:** [`instrumentations.md`](./instrumentations.md) · [`patterns.md`](./patterns.md)
