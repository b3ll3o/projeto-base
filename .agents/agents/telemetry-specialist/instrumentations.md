# Telemetry — Instrumentations (Passos 1, 2 e 10)

> Sibling de [`telemetry-specialist.md`](../telemetry-specialist.md) (split-by-responsibility).
> Contém o **Passo 1** (mapeamento AS-IS), **Passo 2** (tabela canônica de pacotes)
> e **Passo 10** (specs de teste). Passos 3-9 em [`patterns.md`](./patterns.md).

---

## Passo 1: Mapear Pontos de Instrumentação

Coletar estado atual **antes** de propor mudanças (regra `state-aware-planning`):

```bash
# Backend: SDK já está rodando?
ls apps/api/node_modules/@opentelemetry/ 2>/dev/null || echo "ZERO OTel deps"

# Backend: entrypoint de tracing existe?
grep -rn "sdk.start\|NodeSDK\|registerInstrumentations" apps/api/src/ \
  || echo "ZERO init"

# Backend: loggers canônicos
grep -rn "pino-http\|nestjs-pino" apps/api/src/ apps/api/package.json

# Frontend: instrumentation.ts?
ls apps/web/instrumentation.ts apps/web/instrumentation-client.ts \
  2>/dev/null || echo "ZERO instrumentation"

# Env vars OTel declaradas em qualquer .env/Dockerfile/compose
grep -rn "OTEL_" apps/ docker-compose*.yml apps/*/Dockerfile .env.example \
  2>/dev/null || echo "ZERO OTEL_*"
```

### Saída esperada (estado-AS-IS)

```yaml
estado_atual:
  backend_otel_sdk: ausente
  backend_exporters: []
  backend_pino_ativo: true
  backend_prisma_events_registrados: false   # gap conhecido
  backend_global_exception_filter_traceid_source: request.id   # gap a migrar
  backend_audit_context_store: AsyncLocalStorage (compatível com OTel Context)
  frontend_instrumentation_ts: ausente
  frontend_rum: ausente
  frontend_web_vitals: ausente
  compose_collector: ausente
  otel_env_vars: []
```

---

## Passo 2: Decidir SDK + Auto-Instrumentations

Lista canônica a considerar (não instalar tudo; instalar conforme demanda):

| Pacote | Quando ligar |
|--------|-------------|
| `@opentelemetry/sdk-node` | Sempre (backend) |
| `@opentelemetry/auto-instrumentations-node` | Baseline MVP |
| `@opentelemetry/instrumentation-nestjs-core` | Backend NestJS |
| `@opentelemetry/instrumentation-fastify` | Backend Fastify (cuidado: `logger: false` em `main.ts:13`) |
| `@opentelemetry/instrumentation-http` | HTTP client (Pino + Outbound) |
| `@opentelemetry/instrumentation-pino` | Injeta `trace_id`/`span_id` em logs Pino |
| `@opentelemetry/instrumentation-prisma` | ⚠️ **NÃO EXISTE no npm** — usar `@prisma/instrumentation` (pacote oficial Prisma, alinhado com `@prisma/client@^6.0.0`) |
| `@opentelemetry/instrumentation-ioredis` | Quando Redis entrar |
| `@opentelemetry/instrumentation-bullmq` | Quando BullMQ entrar |
| `@opentelemetry/exporter-trace-otlp-http` | Exportar para OTel Collector HTTP |
| `@opentelemetry/exporter-trace-otlp-proto` | Exportar para OTel Collector gRPC |
| `@opentelemetry/resources` + `@opentelemetry/semantic-conventions` | Resource attributes canônicos |
| `@opentelemetry/sdk-web` | Frontend (browser) |
| `@opentelemetry/instrumentation-fetch` | Frontend fetch |
| `@opentelemetry/instrumentation-document-load` | Frontend navigation |
| `@opentelemetry/instrumentation-user-interaction` | Frontend cliques |
| `@opentelemetry/instrumentation-web-vitals` | Frontend LCP/CLS/INP |
| `web-vitals` | Reporter manual fallback |

---

## Passo 10: Auditar Cobertura de Testes

Adicionar specs de telemetria (regra `cobertura-testes.md`):

- `tracing.spec.ts` — bootstrap idempotente (`globalThis.__otel_sdk__` early-return)
- `global-exception.filter.spec.ts` — extra (preservar teste `t-42` após migração W3C)
- `audit-context-store.spec.ts` — `correlationId` vem do span ativo
- `web-vitals.spec.ts` (frontend) — reporter chama `meter.record()`
- `compose-observability-profile.spec.ts` (smoke) — `docker compose --profile observability config` valida YAML

**Estratégia de mock:** usar `InMemorySpanExporter` (SDK Node) e `metrics.getMeter('test').createHistogram()` + spy para web-vitals, evitando dependência de collector externo nos testes unitários.

---

**Arquivo:** `.agents/agents/telemetry-specialist/instrumentations.md`
**Parent:** [`telemetry-specialist.md`](../telemetry-specialist.md)
**Siblings:** [`patterns.md`](./patterns.md) · [`output-schema.md`](./output-schema.md)
