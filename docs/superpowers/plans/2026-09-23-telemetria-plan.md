# Plano de Implementação — Telemetria (OpenTelemetry)

> **Snapshot:** [`.agents/runs/state-snapshot-20260923T183938Z.md`](../../.agents/runs/state-snapshot-20260923T183938Z.md)
> **Spec (decisões):** [`.agents/agents/telemetry-specialist.md`](../../.agents/agents/telemetry-specialist.md) (com 3 siblings em `.agents/agents/telemetry-specialist/`)
> **Convenção:** [`.agents/specs/conventions/state-aware-planning.md`](../../.agents/specs/conventions/state-aware-planning.md)
> **Branch:** `feat/telemetria` (a partir de `main @ 24b1b8f`)
> **Pré-requisitos:** v1.7.0 merged (commit `cb48450`)

---

## Goal

Instrumentar o monorepo `projeto-base` (apps/api + apps/web + docker-compose) com **OpenTelemetry** (SDK Node + SDK Web + auto-instrumentations + Collector), garantindo correlação W3C Trace Context end-to-end (frontend → api → Prisma), bridge Pino↔OTel, métricas de web-vitals (LCP/CLS/INP), perfil Compose opt-in para o Collector, e atualização das matrizes `specialist-routing` + `review-routing`.

---

## Architecture

**3 camadas de runtime, 1 vendor-neutral stack:**

1. **Backend (apps/api):** `NodeSDK` carregado via `node --require` ANTES do `main.ts`, exportando OTLP HTTP para `otel-collector:4318/v1/traces`. Auto-instrumentations: HTTP, NestJS, Fastify, Pino, Prisma. Bridge Pino injeta `trace_id`/`span_id` em logs JSON.
2. **Frontend (apps/web):** `WebSDK` registrado via `instrumentation.ts` runtime-aware (`nodejs` + `edge` + client). Web Vitals reporters em `app/layout.tsx` client boundary emitem métricas (não logs).
3. **Collector (infra/otelcol):** perfil Compose `[observability]` opt-in. Recebe OTLP HTTP+gRPC, exporta `debug` no MVP (vendor-agnostic; trocar para Jaeger/Tempo/Honeycomb/Datadog/New Relic via `OTEL_EXPORTER_OTLP_ENDPOINT`).

**Decisões canônicas:** OpenTelemetry como vendor-neutral; Pino continua canônico (não trocar para `nest-winston`); Collector opt-in (não em dev/test default); sem vendor-lock (não hardcodar Datadog/Honeycomb); W3C Trace Context end-to-end (não `request.id` ad-hoc).

---

## Tech Stack (novas deps)

### Backend (`apps/api/package.json`)
| Pacote | Versão alvo | Função |
|--------|------------|--------|
| `@opentelemetry/sdk-node` | `^0.54.0` | NodeSDK bootstrap |
| `@opentelemetry/auto-instrumentations-node` | `^0.52.0` | Baseline auto-instr |
| `@opentelemetry/exporter-trace-otlp-http` | `^0.54.0` | OTLP HTTP exporter |
| `@opentelemetry/resources` | `^1.27.0` | Resource attributes |
| `@opentelemetry/semantic-conventions` | `^1.27.0` | SERVICE_NAME etc. |
| `@opentelemetry/api` | `^1.9.0` | API canônica (peer) |
| `@opentelemetry/instrumentation-pino` | `^0.46.0` | Bridge Pino |
| `@prisma/instrumentation` | `^6.0.0` | Prisma `$extends` (pacote oficial Prisma, alinhado com `@prisma/client@^6.0.0`; **NÃO usar** `@opentelemetry/instrumentation-prisma` que NÃO existe no npm) |

### Frontend (`apps/web/package.json`)
| Pacote | Versão alvo | Função |
|--------|------------|--------|
| `@opentelemetry/sdk-web` | `^1.27.0` | WebSDK |
| `@opentelemetry/auto-instrumentations-web` | `^0.43.0` | Baseline auto-instr |
| `@opentelemetry/exporter-trace-otlp-http` | `^0.54.0` | OTLP HTTP exporter |
| `@opentelemetry/api` | `^1.9.0` | API canônica |
| `@opentelemetry/instrumentation-fetch` | `^0.54.0` | fetch |
| `@opentelemetry/instrumentation-document-load` | `^0.43.0` | navigation |
| `@opentelemetry/instrumentation-user-interaction` | `^0.43.0` | cliques |
| `web-vitals` | `^4.2.4` | LCP/CLS/INP reporters |

### Infra
- Imagem Docker: `otel/opentelemetry-collector-contrib:0.103.0`
- Config: `infra/otelcol/config.yaml`

---

## Estrutura de Arquivos

### Novos arquivos
```text
apps/api/src/shared/infrastructure/telemetry/
├── tracing.ts                          # NodeSDK bootstrap (process-level)
├── tracing.spec.ts                     # idempotência
└── resource.ts                         # SERVICE_NAME/SERVICE_VERSION helper

apps/web/src/
├── instrumentation.ts                  # register() runtime-aware (Next 13+)
├── instrumentation-client.ts           # registerOTel()
└── telemetry/
    ├── web-vitals-reporter.tsx         # client component
    └── web-vitals-reporter.spec.tsx    # histogram spy

apps/api/test/
└── global-exception.filter.spec.ts     # EXTENSÃO: preservar t-42 + W3C

infra/otelcol/
└── config.yaml                         # receivers/exporters/pipelines

.env.example                            # EXTENSÃO: OTEL_* vars
apps/api/.env.example                    # EXTENSÃO: OTEL_* vars
```

### Arquivos modificados
```text
apps/api/package.json                            # +8 deps
apps/api/src/main.ts                             # bootstrap do Pino depois do tracing
apps/api/src/app.module.ts                       # sem mudança (LoggerModule)
apps/api/src/shared/infrastructure/prisma/prisma.service.ts  # $on() registrado
apps/api/src/shared/infrastructure/http/global-exception.filter.ts  # W3C migration
apps/api/src/modules/users/infrastructure/http/users.controller.ts  # AuditContext W3C
apps/api/Dockerfile                              # prod target adiciona --require
apps/web/package.json                            # +7 deps
apps/web/next.config.mjs                         # outputFileTracingIncludes (se standalone)
apps/web/app/layout.tsx                          # <WebVitalsReporter />
docker-compose.yml                               # +serviço otel-collector (profile: observability)
.agents/specs/conventions/specialist-routing.md  # +entries telemetry (path_globs + keywords)
.agents/specs/conventions/review-routing.md      # +diff_patterns OTel
docs/STACK.md                                    # já tem v1.7.0 entry (commit cb48450)
docs/MONOREPO.md                                 # já tem v1.7.0 entry
```

---

## Plano Detalhado por Fase

### Fase 1 — Backend OTel Bootstrap (resolve G-001)

#### Task 1.1: Instalar deps OpenTelemetry em `apps/api`

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Adicionar 8 deps OTel (RED: lock desatualizado)**

```bash
cd apps/api && pnpm add \
  @opentelemetry/sdk-node@^0.54.0 \
  @opentelemetry/auto-instrumentations-node@^0.52.0 \
  @opentelemetry/exporter-trace-otlp-http@^0.54.0 \
  @opentelemetry/resources@^1.27.0 \
  @opentelemetry/semantic-conventions@^1.27.0 \
  @opentelemetry/api@^1.9.0 \
  @opentelemetry/instrumentation-pino@^0.46.0 \
  @prisma/instrumentation@^6.0.0
```

- [ ] **Step 2: Verificar lock file (GREEN)**

Run: `cd apps/api && pnpm install --frozen-lockfile 2>&1 | tail -5`
Expected: instalação sem erros; `pnpm-lock.yaml` atualizado.

- [ ] **Step 3: Validar dedupe (`@opentelemetry/api` é peer)**

Run: `cd apps/api && pnpm dedupe --check 2>&1 | tail -5`
Expected: zero warnings de duplicação.

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "feat(telemetry): adicionar deps OpenTelemetry ao backend (apps/api)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

#### Task 1.2: Criar `apps/api/src/shared/infrastructure/telemetry/resource.ts`

**Files:**
- Create: `apps/api/src/shared/infrastructure/telemetry/resource.ts`
- Create: `apps/api/src/shared/infrastructure/telemetry/resource.spec.ts`

- [ ] **Step 1: Escrever spec RED (helper de resource attributes)**

```typescript
// apps/api/src/shared/infrastructure/telemetry/resource.spec.ts
import { describe, it, expect } from 'vitest';
import { buildResource } from './resource.js';

describe('buildResource', () => {
  it('returns SERVICE_NAME from env when set', () => {
    const r = buildResource({ OTEL_SERVICE_NAME: 'svc-x' });
    expect(r.attributes['service.name']).toBe('svc-x');
  });

  it('defaults SERVICE_NAME to "projeto-base-api" when env unset', () => {
    const r = buildResource({});
    expect(r.attributes['service.name']).toBe('projeto-base-api');
  });

  it('includes SERVICE_VERSION from env or default "0.0.0"', () => {
    expect(buildResource({ OTEL_SERVICE_VERSION: '1.2.3' }).attributes['service.version']).toBe('1.2.3');
    expect(buildResource({}).attributes['service.version']).toBe('0.0.0');
  });

  it('includes DEPLOYMENT_ENVIRONMENT from NODE_ENV or "development"', () => {
    expect(buildResource({ NODE_ENV: 'production' }).attributes['deployment.environment']).toBe('production');
    expect(buildResource({}).attributes['deployment.environment']).toBe('development');
  });
});
```

- [ ] **Step 2: Rodar spec — verificar FAIL**

Run: `cd apps/api && pnpm vitest run src/shared/infrastructure/telemetry/resource.spec.ts 2>&1 | tail -15`
Expected: FAIL ("Cannot find module './resource.js'").

- [ ] **Step 3: Implementar helper (GREEN)**

```typescript
// apps/api/src/shared/infrastructure/telemetry/resource.ts
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

type Env = Record<string, string | undefined>;

export function buildResource(env: Env = process.env): Resource {
  return new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]:
      env.OTEL_SERVICE_NAME ?? 'projeto-base-api',
    [SemanticResourceAttributes.SERVICE_VERSION]:
      env.OTEL_SERVICE_VERSION ?? '0.0.0',
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
      env.NODE_ENV ?? 'development',
  });
}
```

- [ ] **Step 4: Rodar spec — verificar PASS**

Run: `cd apps/api && pnpm vitest run src/shared/infrastructure/telemetry/resource.spec.ts 2>&1 | tail -10`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/infrastructure/telemetry/resource.ts apps/api/src/shared/infrastructure/telemetry/resource.spec.ts
git commit -m "feat(telemetry): adicionar buildResource helper com SERVICE_NAME/VERSION/ENV

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

#### Task 1.3: Criar `apps/api/src/shared/infrastructure/telemetry/tracing.ts` (NodeSDK idempotente)

**Files:**
- Create: `apps/api/src/shared/infrastructure/telemetry/tracing.ts`
- Create: `apps/api/src/shared/infrastructure/telemetry/tracing.spec.ts`

- [ ] **Step 1: Escrever spec RED (idempotência + early-return)**

```typescript
// apps/api/src/shared/infrastructure/telemetry/tracing.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';

describe('initTracing (idempotência)', () => {
  beforeEach(() => {
    delete (globalThis as { __otel_sdk__?: unknown }).__otel_sdk__;
    delete process.env.OTEL_SDK_DISABLED;
  });

  it('inicializa NodeSDK uma única vez', async () => {
    const { initTracing } = await import('./tracing.js');
    initTracing();
    const first = (globalThis as { __otel_sdk__?: unknown }).__otel_sdk__;
    initTracing();
    const second = (globalThis as { __otel_sdk__?: unknown }).__otel_sdk__;
    expect(first).toBe(second);
  });

  it('não inicializa quando OTEL_SDK_DISABLED=true', () => {
    process.env.OTEL_SDK_DISABLED = 'true';
    const { initTracing } = await import('./tracing.js');
    initTracing();
    expect((globalThis as { __otel_sdk__?: unknown }).__otel_sdk__).toBeUndefined();
  });
});
```

- [ ] **Step 2: Rodar spec — verificar FAIL**

Run: `cd apps/api && pnpm vitest run src/shared/infrastructure/telemetry/tracing.spec.ts 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Implementar `tracing.ts` (GREEN)**

```typescript
// apps/api/src/shared/infrastructure/telemetry/tracing.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
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
      url:
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
        'http://otel-collector:4318/v1/traces',
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });
  sdk.start();
  globalThis.__otel_sdk__ = sdk;
}

// NOTA: NÃO usar `require.main === module` aqui — projeto é ESM (`type: module`),
// e `require` é undefined em top-level ESM. Auto-init é responsabilidade do caller
// (Task 1.4: `main.ts` faz `import './shared/infrastructure/telemetry/tracing.js'`
// e chama `initTracing()` explicitamente — side-effect import + explicit call).
// Para init via flag de boot, usar `node --import` (ESM-aware), não `--require` (CJS-only).
```

- [ ] **Step 4: Rodar spec — verificar PASS**

Run: `cd apps/api && pnpm vitest run src/shared/infrastructure/telemetry/tracing.spec.ts 2>&1 | tail -10`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/infrastructure/telemetry/tracing.ts apps/api/src/shared/infrastructure/telemetry/tracing.spec.ts
git commit -m "feat(telemetry): adicionar initTracing idempotente com NodeSDK + OTLP HTTP

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

#### Task 1.4: Carregar `tracing.ts` ANTES de `main.ts` (bootstrap order)

**Files:**
- Modify: `apps/api/src/main.ts` (linha 1)

- [ ] **Step 1: Escrever spec RED (import side-effect)**

```typescript
// apps/api/src/main.ts.spec.ts
import { describe, it, expect } from 'vitest';

describe('main.ts bootstrap order', () => {
  it('importa tracing.ts antes do NestFactory', async () => {
    const mainSource = await import('node:fs').then((fs) =>
      fs.promises.readFile('apps/api/src/main.ts', 'utf8'),
    );
    const tracingIdx = mainSource.indexOf('telemetry/tracing');
    const nestIdx = mainSource.indexOf('NestFactory');
    expect(tracingIdx).toBeGreaterThanOrEqual(0);
    expect(nestIdx).toBeGreaterThan(tracingIdx);
  });
});
```

- [ ] **Step 2: Rodar spec — verificar FAIL**

Run: `cd apps/api && pnpm vitest run src/main.ts.spec.ts 2>&1 | tail -10`
Expected: FAIL (tracing não importado).

- [ ] **Step 3: Adicionar import no topo de `main.ts` (GREEN)**

```typescript
// apps/api/src/main.ts — adicionar linha 1 (antes de qualquer outro import)
import './shared/infrastructure/telemetry/tracing.js';
```

- [ ] **Step 4: Rodar spec — verificar PASS**

Run: `cd apps/api && pnpm vitest run src/main.ts.spec.ts 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/main.ts apps/api/src/main.ts.spec.ts
git commit -m "feat(telemetry): carregar tracing.ts antes do NestFactory bootstrap

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

#### Task 1.5: Atualizar `apps/api/Dockerfile` prod target com `--require`

**Files:**
- Modify: `apps/api/Dockerfile`

- [ ] **Step 1: Localizar ENTRYPOINT/CMD do target `prod`**

```bash
grep -n "CMD\|ENTRYPOINT\|node dist" apps/api/Dockerfile
```

- [ ] **Step 2: Adicionar `NODE_OPTIONS` com `--require` tracing.js**

```dockerfile
# apps/api/Dockerfile — target prod
ENV NODE_OPTIONS="--require ./dist/shared/infrastructure/telemetry/tracing.js"
CMD ["sh", "-c", "node dist/main.js"]
```

- [ ] **Step 3: Validar build (smoke)**

Run: `docker build --target prod -t projeto-base-api:test apps/api 2>&1 | tail -10`
Expected: build OK; `docker run --rm projeto-base-api:test node -e "console.log(process.env.NODE_OPTIONS)"` imprime `--require ./...`.

- [ ] **Step 4: Commit**

```bash
git add apps/api/Dockerfile
git commit -m "feat(telemetry): NODE_OPTIONS com --require tracing no Dockerfile prod

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Fase 2 — Pino Bridge + W3C traceId (resolve G-007, G-008, G-011)

#### Task 2.1: Habilitar `instrumentation-pino` em `tracing.ts`

**Files:**
- Modify: `apps/api/src/shared/infrastructure/telemetry/tracing.ts`

- [ ] **Step 1: Spec RED (Pino injects trace_id/span_id)**

```typescript
// apps/api/src/shared/infrastructure/telemetry/tracing-pino.spec.ts
import { describe, it, expect } from 'vitest';
import pino from 'pino';
import { trace, context } from '@opentelemetry/api';

describe('Pino-OTel bridge', () => {
  it('log entry inclui trace_id quando há span ativo', () => {
    // Após initTracing(), Pino deve injetar trace_id do span ativo
    const log = pino({ name: 'test' });
    const span = trace.getTracer('test').startSpan('op');
    const captured: Record<string, unknown>[] = [];
    const stream = { write: (s: string) => captured.push(JSON.parse(s)) };
    const child = pino({ name: 'test' }, stream);
    context.with(trace.setSpan(context.active(), span), () => {
      child.info('hello');
    });
    expect(captured[0]).toHaveProperty('trace_id');
  });
});
```

- [ ] **Step 2: Rodar spec — verificar FAIL**

Run: `cd apps/api && pnpm vitest run src/shared/infrastructure/telemetry/tracing-pino.spec.ts 2>&1 | tail -10`
Expected: FAIL (sem `trace_id` no log).

- [ ] **Step 3: Adicionar PinoInstrumentation em `tracing.ts` (GREEN)**

```typescript
// apps/api/src/shared/infrastructure/telemetry/tracing.ts — adicionar import
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';

// No NodeSDK:
instrumentations: [
  getNodeAutoInstrumentations({
    '@opentelemetry/instrumentation-fs': { enabled: false },
    '@opentelemetry/instrumentation-pino': { enabled: true },
  }),
],
```

- [ ] **Step 4: Rodar spec — verificar PASS**

Run: `cd apps/api && pnpm vitest run src/shared/infrastructure/telemetry/tracing-pino.spec.ts 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/infrastructure/telemetry/tracing.ts apps/api/src/shared/infrastructure/telemetry/tracing-pino.spec.ts
git commit -m "feat(telemetry): habilitar PinoInstrumentation (trace_id/span_id em logs)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

#### Task 2.2: Migrar `global-exception.filter.ts` para W3C traceId (preservar `t-42`)

**Files:**
- Modify: `apps/api/src/shared/infrastructure/http/global-exception.filter.ts:36-37`
- Modify: `apps/api/test/unit/shared/infrastructure/http/global-exception.filter.spec.ts`

- [ ] **Step 1: Spec RED (W3C 32-hex fallback para request.id)**

```typescript
// No spec existente (linha 212): injetar `id: 't-42'` continua funcionando.
// Adicionar novo teste:
it('extrai traceId W3C (32 hex chars) quando há span ativo', () => {
  // arrange: span ativo via OTel API mock
  const span = { spanContext: () => ({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) }) };
  vi.spyOn(require('@opentelemetry/api').trace, 'getSpan').mockReturnValue(span);
  // act: filter.handle(...)
  // assert: body.traceId === 'a'.repeat(32)
});
```

- [ ] **Step 2: Rodar spec — verificar FAIL**

Run: `cd apps/api && pnpm vitest run test/unit/shared/infrastructure/http/global-exception.filter.spec.ts 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Editar `global-exception.filter.ts` (GREEN)**

```typescript
// apps/api/src/shared/infrastructure/http/global-exception.filter.ts:36-37
import { trace, context } from '@opentelemetry/api';

// ...
const span = trace.getSpan(context.active());
const traceId = span?.spanContext().traceId ?? request.id ?? randomUUID();
```

- [ ] **Step 4: Rodar spec completo do filter — verificar PASS (incluindo `t-42`)**

Run: `cd apps/api && pnpm vitest run test/unit/shared/infrastructure/http/global-exception.filter.spec.ts 2>&1 | tail -10`
Expected: PASS (todos os testes, incluindo `t-42`).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/infrastructure/http/global-exception.filter.ts apps/api/test/unit/shared/infrastructure/http/global-exception.filter.spec.ts
git commit -m "feat(telemetry): migrar global-exception.filter para W3C traceId (preserva t-42)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

#### Task 2.3: Migrar `AuditContext.correlationId` em `users.controller.ts`

**Files:**
- Modify: `apps/api/src/modules/users/infrastructure/http/users.controller.ts:258`
- Modify: `apps/api/test/unit/modules/users/infrastructure/http/users.controller.spec.ts`

- [ ] **Step 1: Spec RED (correlationId vem do span ativo)**

```typescript
it('AuditContext.correlationId === traceId do span ativo', () => {
  const span = { spanContext: () => ({ traceId: 'c'.repeat(32), spanId: 'd'.repeat(16) }) };
  vi.spyOn(require('@opentelemetry/api').trace, 'getSpan').mockReturnValue(span);
  // act: POST /users
  // assert: AuditContextStore.run callback recebe correlationId === 'c'.repeat(32)
});
```

- [ ] **Step 2: Rodar spec — verificar FAIL**

Run: `cd apps/api && pnpm vitest run test/unit/modules/users/infrastructure/http/users.controller.spec.ts 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Editar `users.controller.ts` (GREEN)**

```typescript
// apps/api/src/modules/users/infrastructure/http/users.controller.ts:258
import { trace, context } from '@opentelemetry/api';

const span = trace.getSpan(context.active());
const correlationId = span?.spanContext().traceId ?? request.id;
const auditContext = AuditContext.create({ correlationId, /* ... */ });
```

- [ ] **Step 4: Rodar spec — verificar PASS**

Run: `cd apps/api && pnpm vitest run test/unit/modules/users/infrastructure/http/users.controller.spec.ts 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/users/infrastructure/http/users.controller.ts apps/api/test/unit/modules/users/infrastructure/http/users.controller.spec.ts
git commit -m "feat(telemetry): AuditContext.correlationId do span ativo (W3C-compliant)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

#### Task 2.4: Registrar `$on()` Prisma events

**Files:**
- Modify: `apps/api/src/shared/infrastructure/prisma/prisma.service.ts`
- Create: `apps/api/src/shared/infrastructure/prisma/prisma.service.spec.ts`

- [ ] **Step 1: Spec RED (queries são logadas via pino)**

```typescript
// apps/api/src/shared/infrastructure/prisma/prisma.service.spec.ts
it('registra $on("query") e loga SQL via pino', () => {
  const svc = new PrismaService({ log: ['query'] } as never);
  // assert: svc._engineConfig.loggers ou $on foi chamado
});
```

- [ ] **Step 2: Rodar spec — verificar FAIL**

Run: `cd apps/api && pnpm vitest run src/shared/infrastructure/prisma/prisma.service.spec.ts 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Adicionar `$on` handlers (GREEN)**

```typescript
// apps/api/src/shared/infrastructure/prisma/prisma.service.ts
import { Logger } from 'nestjs-pino';

constructor() {
  super({ log: ['query', 'error', 'warn'] });
  const logger = new Logger('Prisma');
  this.$on('query' as never, (e: { query: string; duration: number }) => {
    logger.debug({ sql: e.query, durationMs: e.duration }, 'prisma query');
  });
  this.$on('error' as never, (e: { message: string }) => {
    logger.error({ err: e.message }, 'prisma error');
  });
}
```

- [ ] **Step 4: Rodar spec — verificar PASS**

Run: `cd apps/api && pnpm vitest run src/shared/infrastructure/prisma/prisma.service.spec.ts 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/infrastructure/prisma/prisma.service.ts apps/api/src/shared/infrastructure/prisma/prisma.service.spec.ts
git commit -m "feat(telemetry): registrar Prisma \$on handlers (query/error/warn logados)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Fase 3 — Frontend OTel SDK (resolve G-002, G-003)

#### Task 3.1: Instalar deps OpenTelemetry em `apps/web`

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: Adicionar 7 deps OTel + web-vitals**

```bash
cd apps/web && pnpm add \
  @opentelemetry/sdk-web@^1.27.0 \
  @opentelemetry/auto-instrumentations-web@^0.43.0 \
  @opentelemetry/exporter-trace-otlp-http@^0.54.0 \
  @opentelemetry/api@^1.9.0 \
  @opentelemetry/instrumentation-fetch@^0.54.0 \
  @opentelemetry/instrumentation-document-load@^0.43.0 \
  @opentelemetry/instrumentation-user-interaction@^0.43.0 \
  web-vitals@^4.2.4
```

- [ ] **Step 2: Validar lock + dedupe**

Run: `pnpm install --frozen-lockfile && pnpm dedupe --check 2>&1 | tail -5`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "feat(telemetry): adicionar deps OpenTelemetry + web-vitals ao frontend (apps/web)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

#### Task 3.2: Criar `apps/web/instrumentation.ts` (runtime-aware)

**Files:**
- Create: `apps/web/instrumentation.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
// apps/web/instrumentation.ts (Next.js 13+ convention file)
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./instrumentation.node.js');
  } else if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./instrumentation.edge.js');
  }
}
```

- [ ] **Step 2: Validar typecheck**

Run: `cd apps/web && pnpm typecheck 2>&1 | tail -10`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/instrumentation.ts
git commit -m "feat(telemetry): adicionar apps/web/instrumentation.ts (register runtime-aware)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

#### Task 3.3: Criar `apps/web/instrumentation.node.ts` (server-side OTel)

**Files:**
- Create: `apps/web/instrumentation.node.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
// apps/web/instrumentation.node.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

declare global {
  // eslint-disable-next-line no-var
  var __otel_sdk__: NodeSDK | undefined;
}

if (!globalThis.__otel_sdk__) {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]:
        process.env.OTEL_SERVICE_NAME ?? 'projeto-base-web',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]:
        process.env.NODE_ENV ?? 'development',
    }),
    traceExporter: new OTLPTraceExporter({
      url:
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
        'http://otel-collector:4318/v1/traces',
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });
  sdk.start();
  globalThis.__otel_sdk__ = sdk;
}
```

- [ ] **Step 2: Validar typecheck**

Run: `cd apps/web && pnpm typecheck 2>&1 | tail -10`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/instrumentation.node.ts
git commit -m "feat(telemetry): apps/web/instrumentation.node.ts (NodeSDK para RSC)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

#### Task 3.4: Criar `apps/web/instrumentation-client.ts` (browser OTel)

**Files:**
- Create: `apps/web/instrumentation-client.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
// apps/web/instrumentation-client.ts
import { WebTracerProvider } from '@opentelemetry/sdk-web';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const provider = new WebTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'projeto-base-web',
  }),
});
provider.addSpanProcessor(
  new (require('@opentelemetry/sdk-trace-base').BatchSpanProcessor)(
    new OTLPTraceExporter({
      url:
        process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT ??
        '/api/otel/collect',
    }),
  ),
);
provider.register({
  instrumentations: [
    getWebAutoInstrumentations({
      '@opentelemetry/instrumentation-fetch': { enabled: true },
      '@opentelemetry/instrumentation-document-load': { enabled: true },
      '@opentelemetry/instrumentation-user-interaction': { enabled: true },
    }),
  ],
});
```

- [ ] **Step 2: Validar typecheck**

Run: `cd apps/web && pnpm typecheck 2>&1 | tail -10`
Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/instrumentation-client.ts
git commit -m "feat(telemetry): apps/web/instrumentation-client.ts (WebSDK browser)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

#### Task 3.5: Configurar `outputFileTracingIncludes` em `next.config.mjs`

**Files:**
- Modify: `apps/web/next.config.mjs`

- [ ] **Step 1: Localizar `output: 'standalone'` no config**

```bash
grep -n "output\|outputFileTracingIncludes" apps/web/next.config.mjs
```

- [ ] **Step 2: Adicionar `outputFileTracingIncludes` para OTel deps**

```javascript
// apps/web/next.config.mjs
export default {
  output: 'standalone',
  experimental: {
    outputFileTracingIncludes: {
      '/**': ['./node_modules/@opentelemetry/**/*', './node_modules/web-vitals/**/*'],
    },
  },
};
```

- [ ] **Step 3: Validar typecheck**

Run: `cd apps/web && pnpm typecheck 2>&1 | tail -10`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/next.config.mjs
git commit -m "feat(telemetry): next.config outputFileTracingIncludes para @opentelemetry + web-vitals

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Fase 4 — Web Vitals → OTel Metrics (resolve G-004)

#### Task 4.1: Criar `apps/web/src/telemetry/web-vitals-reporter.tsx` (client component)

**Files:**
- Create: `apps/web/src/telemetry/web-vitals-reporter.tsx`
- Create: `apps/web/src/telemetry/web-vitals-reporter.spec.tsx`

- [ ] **Step 1: Spec RED (reporter chama meter.record())**

```typescript
// apps/web/src/telemetry/web-vitals-reporter.spec.tsx
import { describe, it, expect, vi } from 'vitest';
import { onLCP, onCLS, onINP } from 'web-vitals';

vi.mock('web-vitals', () => ({
  onLCP: vi.fn(),
  onCLS: vi.fn(),
  onINP: vi.fn(),
  onFID: vi.fn(),
  onTTFB: vi.fn(),
}));

describe('WebVitalsReporter', () => {
  it('registra reporters LCP/CLS/INP', async () => {
    await import('./web-vitals-reporter.js');
    expect(onLCP).toHaveBeenCalled();
    expect(onCLS).toHaveBeenCalled();
    expect(onINP).toHaveBeenCalled();
  });

  it('callback do onLCP chama meter.record() com o valor', async () => {
    const record = vi.fn();
    vi.mock('@opentelemetry/api', () => ({
      metrics: {
        getMeter: () => ({
          createHistogram: () => ({ record }),
        }),
      },
    }));
    await import('./web-vitals-reporter.js');
    const cb = vi.mocked(onLCP).mock.calls[0][0];
    cb({ value: 1234 } as never);
    expect(record).toHaveBeenCalledWith(1234);
  });
});
```

- [ ] **Step 2: Rodar spec — verificar FAIL**

Run: `cd apps/web && pnpm vitest run src/telemetry/web-vitals-reporter.spec.tsx 2>&1 | tail -10`
Expected: FAIL.

- [ ] **Step 3: Implementar reporter (GREEN)**

```typescript
// apps/web/src/telemetry/web-vitals-reporter.tsx
'use client';

import { useEffect } from 'react';
import { onLCP, onCLS, onINP, onFID, onTTFB } from 'web-vitals';
import { metrics } from '@opentelemetry/api';

const meter = metrics.getMeter('projeto-base-web');

export function WebVitalsReporter(): null {
  useEffect(() => {
    const lcp = meter.createHistogram('web.vitals.lcp');
    const cls = meter.createHistogram('web.vitals.cls');
    const inp = meter.createHistogram('web.vitals.inp');
    const fid = meter.createHistogram('web.vitals.fid');
    const ttfb = meter.createHistogram('web.vitals.ttfb');

    onLCP((m) => lcp.record(m.value));
    onCLS((m) => cls.record(m.value));
    onINP((m) => inp.record(m.value));
    onFID((m) => fid.record(m.value));
    onTTFB((m) => ttfb.record(m.value));
  }, []);
  return null;
}
```

- [ ] **Step 4: Rodar spec — verificar PASS**

Run: `cd apps/web && pnpm vitest run src/telemetry/web-vitals-reporter.spec.tsx 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/telemetry/web-vitals-reporter.tsx apps/web/src/telemetry/web-vitals-reporter.spec.tsx
git commit -m "feat(telemetry): WebVitalsReporter (LCP/CLS/INP/FID/TTFB → OTel histograms)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

#### Task 4.2: Adicionar `<WebVitalsReporter />` em `app/layout.tsx`

**Files:**
- Modify: `apps/web/app/layout.tsx`

- [ ] **Step 1: Localizar `<body>` no layout**

```bash
grep -n "<body\|<html" apps/web/app/layout.tsx
```

- [ ] **Step 2: Importar e renderizar reporter dentro de `<body>`**

```typescript
// apps/web/app/layout.tsx
import { WebVitalsReporter } from '../src/telemetry/web-vitals-reporter';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <WebVitalsReporter />
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Validar typecheck + build**

Run: `cd apps/web && pnpm typecheck 2>&1 | tail -5`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/layout.tsx
git commit -m "feat(telemetry): montar WebVitalsReporter em app/layout.tsx

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Fase 5 — OTel Collector Compose + Env Vars (resolve G-005, G-006)

#### Task 5.1: Criar `infra/otelcol/config.yaml`

**Files:**
- Create: `infra/otelcol/config.yaml`

- [ ] **Step 1: Criar arquivo**

```yaml
# infra/otelcol/config.yaml
receivers:
  otlp:
    protocols:
      grpc: {}
      http: {}

processors:
  batch: {}

exporters:
  debug:
    verbosity: detailed
  # + exporters para backend escolhido (jaeger/tempo/honeycomb/...)

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
    metrics:
      receivers: [otlp]
      processors: [batch]
      exporters: [debug]
```

- [ ] **Step 2: Validar YAML**

Run: `python3 -c "import yaml; yaml.safe_load(open('infra/otelcol/config.yaml')); print('OK')"`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add infra/otelcol/config.yaml
git commit -m "feat(telemetry): infra/otelcol/config.yaml (receivers OTLP + debug exporter)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

#### Task 5.2: Adicionar serviço `otel-collector` em `docker-compose.yml` (profile `observability`)

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Localizar seção `services:` no compose**

```bash
grep -n "^services:\|^  [a-z]" docker-compose.yml | head -10
```

- [ ] **Step 2: Adicionar serviço no final de `services:`**

```yaml
# docker-compose.yml — adicionar ao final de services:
  otel-collector:
    image: otel/opentelemetry-collector-contrib:0.103.0
    profiles: [observability]
    command: ["--config=/etc/otelcol/config.yaml"]
    volumes:
      - ./infra/otelcol/config.yaml:/etc/otelcol/config.yaml:ro
    ports:
      - "4317:4317" # OTLP gRPC
      - "4318:4318" # OTLP HTTP
    networks: [default]
```

- [ ] **Step 3: Validar compose (`--profile observability config`)**

Run: `docker compose --profile observability config --quiet 2>&1 | tail -5`
Expected: zero errors; serviço `otel-collector` listado.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(telemetry): adicionar otel-collector no Compose (profile observability)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

#### Task 5.3: Adicionar `OTEL_*` env vars em `.env.example`

**Files:**
- Modify: `.env.example`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Adicionar bloco OTEL em `.env.example`**

```bash
# .env.example — adicionar:
# OpenTelemetry (backend)
OTEL_SERVICE_NAME=projeto-base-api
OTEL_SERVICE_VERSION=0.0.0
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318/v1/traces
OTEL_SDK_DISABLED=false
```

- [ ] **Step 2: Adicionar bloco OTEL frontend em `apps/web/.env.example`**

```bash
# apps/web/.env.example — adicionar:
# OpenTelemetry (frontend browser)
NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT=/api/otel/collect
NEXT_PUBLIC_OTEL_SERVICE_NAME=projeto-base-web
```

- [ ] **Step 3: Validar formatação**

Run: `cat .env.example apps/api/.env.example apps/web/.env.example 2>&1 | grep -c "OTEL_"`
Expected: ≥ 5 entradas OTEL_.

- [ ] **Step 4: Commit**

```bash
git add .env.example apps/api/.env.example apps/web/.env.example
git commit -m "feat(telemetry): adicionar OTEL_* env vars (backend + frontend)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

#### Task 5.4: Smoke spec para Compose profile `observability`

**Files:**
- Create: `tooling/scripts/compose-observability-profile.spec.ts`

- [ ] **Step 1: Spec RED**

```typescript
// tooling/scripts/compose-observability-profile.spec.ts
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

describe('docker compose --profile observability', () => {
  it('config é válido', () => {
    const out = execSync('docker compose --profile observability config --quiet', { encoding: 'utf8' });
    expect(out).toContain('otel-collector');
    expect(out).toContain('profiles: [observability]');
  });

  it('expõe portas 4317 (gRPC) e 4318 (HTTP)', () => {
    const out = execSync('docker compose --profile observability config', { encoding: 'utf8' });
    expect(out).toMatch(/4317:4317/);
    expect(out).toMatch(/4318:4318/);
  });
});
```

- [ ] **Step 2: Rodar spec — verificar PASS (Docker disponível)**

Run: `pnpm vitest run tooling/scripts/compose-observability-profile.spec.ts 2>&1 | tail -10`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tooling/scripts/compose-observability-profile.spec.ts
git commit -m "test(telemetry): smoke spec para Compose profile observability

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

### Fase 6 — Matrix Updates + STACK Sync (resolve G-009, G-010)

#### Task 6.1: Atualizar `specialist-routing.md` com telemetry entries

**Files:**
- Modify: `.agents/specs/conventions/specialist-routing.md`

- [ ] **Step 1: Localizar tabela de path_globs (Seção 1)**

```bash
grep -n "path_globs\|demand_keywords" .agents/specs/conventions/specialist-routing.md | head -5
```

- [ ] **Step 2: Adicionar entry para telemetry**

```yaml
# Adicionar em .agents/specs/conventions/specialist-routing.md (Seção 1 - path_globs)
- id: telemetry-specialist
  paths:
    - "apps/api/**/telemetry/**"
    - "apps/web/**/instrumentation*"
    - "apps/web/**/web-vitals*"
    - "infra/otelcol/**"
  keywords:
    - telemetry
    - tracing
    - opentelemetry
    - otel
    - spans?
```

- [ ] **Step 3: Validar lint da matriz**

Run: `grep -c "telemetry" .agents/specs/conventions/specialist-routing.md`
Expected: ≥ 5 matches.

- [ ] **Step 4: Commit**

```bash
git add .agents/specs/conventions/specialist-routing.md
git commit -m "feat(routing): adicionar telemetry-specialist à matriz specialist-routing

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

#### Task 6.2: Atualizar `review-routing.md` com OTel diff_patterns

**Files:**
- Modify: `.agents/specs/conventions/review-routing.md`

- [ ] **Step 1: Localizar seção `diff_patterns`**

```bash
grep -n "diff_patterns" .agents/specs/conventions/review-routing.md | head -5
```

- [ ] **Step 2: Adicionar entry OTel**

```yaml
# Adicionar em .agents/specs/conventions/review-routing.md (Seção 3 - diff_patterns)
- id: otel-telemetry
  patterns:
    - "@Trace\\("
    - "@Span\\("
    - "SpanKind\\."
    - "context\\.with\\("
    - "\\.setAttribute\\("
  paths:
    - "apps/api/**/telemetry/**"
    - "apps/web/**/instrumentation*"
    - "infra/otelcol/**"
  dispatch_to: [telemetry-specialist]
  severity: major
```

- [ ] **Step 3: Validar lint da matriz**

Run: `grep -c "telemetry\|@Trace\|@Span\|SpanKind\|setAttribute" .agents/specs/conventions/review-routing.md`
Expected: ≥ 5 matches.

- [ ] **Step 4: Commit**

```bash
git add .agents/specs/conventions/review-routing.md
git commit -m "feat(routing): adicionar diff_patterns OTel à matriz review-routing

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

#### Task 6.3: Atualizar `AGENTS.md` §3.1 com entry telemetry-specialist

**Files:**
- Modify: `AGENTS.md` (linha de §3.1)

- [ ] **Step 1: Verificar entry atual (deve existir do commit cb48450)**

```bash
grep -n "telemetry-specialist\|state-aware-planning" AGENTS.md
```

- [ ] **Step 2: Se ausente, adicionar entry**

```markdown
# Em AGENTS.md §3.1 (Stack Specialists) — adicionar se cb48450 não cobriu:
| `telemetry-specialist` | Transversal cross-stack (backend+frontend+docker) | `.agents/agents/telemetry-specialist.md` |
```

- [ ] **Step 3: Validar cross-ref**

Run: `test -f .agents/agents/telemetry-specialist.md && echo "✓ agent file exists"`
Expected: ✓.

- [ ] **Step 4: Commit (somente se alterou)**

```bash
git add AGENTS.md
git commit -m "docs(agents): entry telemetry-specialist em AGENTS.md §3.1

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

#### Task 6.4: Tag `v1.7.1` (template bump após execução)

**Files:**
- Modify: nenhum (git tag)

- [ ] **Step 1: Validar estado pós-execução**

Run: `git log --oneline main..HEAD | wc -l`
Expected: ≥ 22 commits (5 fases × ~4 tasks cada + housekeeping).

- [ ] **Step 2: Criar tag anotada local**

Run: `git tag -a v1.7.1 -m "v1.7.1: telemetria OpenTelemetry end-to-end (backend+frontend+collector)"`

- [ ] **Step 3: Push (após merge via PR)**

Run: `git push origin v1.7.1`
Expected: tag pushed (idempotente).

---

## Critérios de Done Globais

- [ ] Todos os 11 gaps do snapshot resolvidos
- [ ] Todos os testes (unit + integration + e2e) verdes — `pnpm -r test`
- [ ] Coverage agregado ≥ 80% (regra `cobertura-testes.md`)
- [ ] `pnpm ci:preflight` 100% verde
- [ ] `docker compose --profile observability config` válido
- [ ] Matrizes `specialist-routing.md` + `review-routing.md` com entries telemetry
- [ ] `pnpm markdownlint` verde em todos os arquivos novos/modificados
- [ ] Cross-refs verificadas (0 broken links)
- [ ] PR criado via `gh pr create` com template preenchido
- [ ] CI passa (6/6 checks verdes)
- [ ] Tag `v1.7.1` anotada publicada (idempotente)

---

## Riscos

| Risco | Mitigação |
|-------|-----------|
| `next.config.mjs` com `outputFileTracingIncludes` quebra build | Manter fallback sem `experimental`; validar `pnpm build` em CI antes de merge |
| OTel SDK degrada latência em testes | `OTEL_SDK_DISABLED=true` por padrão em `vitest.config.ts` |
| Collector porta 4317/4318 conflita com dev | Perfil `[observability]` opt-in (não sobe em `docker compose up` default) |
| Pino instrumentation gera logs duplicados | Não trocar logger; apenas injetar via instrumentation-pino |
| W3C traceId quebra fallback `request.id` | Manter fallback: `span?.spanContext().traceId ?? request.id ?? randomUUID()` |
| `pnpm dedupe` detecta 2 versões de `@opentelemetry/api` | Validar com `pnpm dedupe --check` antes de cada commit de deps |

---

## Estratégia de Review

Para CADA task:

1. **Implementer** (subagent fresh) — implementa + testes + self-review + commit
2. **Spec reviewer** (subagent fresh, ≠ implementer) — confere aderência ao plano (sem extras/faltas)
3. **Code quality reviewer** (subagent fresh, ≠ implementer) — qualidade, segurança, DDD-H boundary
4. **Fix loop** — implementer corrige → reviewer re-valida até aprovar
5. **Próxima task** só após aprovação

**Reviewers adicionais** (despachados pelo `review-router` automaticamente via matriz atualizada em Task 6.2):
- `nestjs-specialist` — para tasks 1.x, 2.x (backend)
- `nextjs-specialist` — para tasks 3.x, 4.x (frontend)
- `docker-specialist` — para task 5.2 (Compose)
- `telemetry-specialist` — para TODAS as tasks (transversal cross-stack)

---

**Mantido por:** projeto-base contributors
**Versão do plano:** 1.0
**Total de tasks:** 22 (5 fases + housekeeping)
