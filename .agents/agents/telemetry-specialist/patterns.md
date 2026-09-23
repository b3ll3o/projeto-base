# Telemetry — Patterns (Passos 3 a 9)

> Sibling de [`telemetry-specialist.md`](../telemetry-specialist.md) (split-by-responsibility).
> Contém os snippets canônicos dos **Passos 3 a 9**: bootstrap tracing.ts, bridge
> Pino, migração W3C `traceId`, migração `AuditContext.correlationId`, frontend
> `instrumentation.ts`, web-vitals, OTel Collector via Compose.

---

## Passo 3: Posicionar Init sem Quebrar Bootstrap

Ordem obrigatória no backend (regra `main.ts` + ADR-0001):

1. Criar `apps/api/src/shared/infrastructure/telemetry/tracing.ts` com
   bootstrap idempotente (early-return se `OTEL_SDK_DISABLED=true`).
2. Carregar via `node --import ./apps/api/dist/shared/infrastructure/telemetry/tracing.js`
   **antes** do `main.ts` — ou via `NODE_OPTIONS='--require ...'`.
3. Garantir que `apps/api/Dockerfile` (target `prod`) adiciona `--require` no `CMD`.
4. **Não importar** `nestjs-pino` antes do tracing start (senão primeiro log fica sem span).

```typescript
// apps/api/src/shared/infrastructure/telemetry/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

if (process.env.OTEL_SDK_DISABLED !== 'true' && !globalThis.__otel_sdk__) {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]:
        process.env.OTEL_SERVICE_NAME ?? 'projeto-base-api',
      [SemanticResourceAttributes.SERVICE_VERSION]:
        process.env.OTEL_SERVICE_VERSION ?? '0.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
        process.env.NODE_ENV ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT
        ?? 'http://otel-collector:4318/v1/traces',
    }),
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
    })],
  });
  sdk.start();
  globalThis.__otel_sdk__ = sdk;
}
```

---

## Passo 4: Bridge Pino ↔ OTel (evitar duplicação)

`nestjs-pino` continua canônico (`main.ts:5,17`). Adicionar
`@opentelemetry/instrumentation-pino` injeta `trace_id` e `span_id` no
contexto dos logs automaticamente. **Não** trocar para `nest-winston` ou
logger custom sem remover `pino-http` (esse último é load-bearing em
`LoggerModule.forRoot`).

```typescript
// apps/api/src/app.module.ts — LoggerModule (mantém igual)
LoggerModule.forRoot({
  pinoHttp: { redact: [...] },   // já existe; pino-otel injeta via instrumentation
})
```

---

## Passo 5: Migrar `traceId` ad-hoc para W3C

Estado atual: `apps/api/src/shared/infrastructure/http/global-exception.filter.ts:36-37`
usa `request.id ?? randomUUID()` no `ProblemDetailsDto`. Migração:

```diff
- const traceId = request.id ?? randomUUID();
+ import { trace, context } from '@opentelemetry/api';
+ const span = trace.getSpan(context.active());
+ const traceId = span?.spanContext().traceId ?? request.id ?? randomUUID();
```

⚠️ **Atenção:** preservar teste `global-exception.filter.spec.ts:212`
que injeta `id: 't-42'` e exige o mesmo `traceId` no body. Manter
fallback para `request.id` quando não há span ativo (teste + CLI).

---

## Passo 6: Substituir `AuditContext.correlationId` (Math.random)

Migrar
`apps/api/src/modules/users/infrastructure/http/users.controller.ts:258`
para:

```typescript
const span = trace.getSpan(context.active());
const correlationId = span?.spanContext().traceId ?? request.id;
const auditContext = AuditContext.create({ correlationId, ... });
```

`AuditContextStore.run()` (baseado em `node:async_hooks.AsyncLocalStorage`)
**já é compatível** com o OTel Context manager default em Node.js — sem
mudança de API, apenas alimentar `correlationId` do span ativo.

---

## Passo 7: Frontend `instrumentation.ts`

```typescript
// apps/web/instrumentation.ts (Next.js 13+ convention file)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node');
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./instrumentation.edge');
  }
}

// apps/web/instrumentation-client.ts (carrega no client)
import { registerOTel } from '@vercel/otel'; // ou implementação manual
registerOTel({ serviceName: 'projeto-base-web' });
```

> **Verificar** conflito com `output: 'standalone'` do Next.js
> (`next.config.mjs`); pode ser necessário
> `outputFileTracingIncludes` em `next.config.mjs`.

---

## Passo 8: Web Vitals → OTel Metrics

```typescript
// apps/web/app/layout.tsx — Reporter de LCP/CLS/INP
'use client';
import { onLCP, onCLS, onINP, onFID, onTTFB } from 'web-vitals';
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('projeto-base-web');
const lcp = meter.createHistogram('web.vitals.lcp');
const cls = meter.createHistogram('web.vitals.cls');
const inp = meter.createHistogram('web.vitals.inp');

onLCP(m => lcp.record(m.value));
onCLS(m => cls.record(m.value));
onINP(m => inp.record(m.value));
```

---

## Passo 9: OTel Collector via Compose (profile)

```yaml
# docker-compose.yml — adicionar serviço opcional
services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.103.0
    profiles: [observability]
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes:
      - ./infra/otelcol/config.yaml:/etc/otelcol/config.yaml:ro
    ports:
      - "4317:4317" # OTLP gRPC
      - "4318:4318" # OTLP HTTP
```

```yaml
# infra/otelcol/config.yaml (novo path)
receivers:
  otlp:
    protocols: { grpc: {}, http: {} }
exporters:
  debug: { verbosity: detailed }
  # + exporters para backend escolhido (jaeger/tempo/honeycomb/...)
service:
  pipelines:
    traces: { receivers: [otlp], exporters: [debug] }
    metrics: { receivers: [otlp], exporters: [debug] }
```

---

**Arquivo:** `.agents/agents/telemetry-specialist/patterns.md`
**Parent:** [`telemetry-specialist.md`](../telemetry-specialist.md)
**Siblings:** [`instrumentations.md`](./instrumentations.md) · [`output-schema.md`](./output-schema.md)
