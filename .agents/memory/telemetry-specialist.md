---
name: telemetry-specialist-memory
description: Memória acumulada do agent telemetry-specialist — decisões sobre instrumentação OpenTelemetry, propagação, exporters, correlação Pino↔OTel, collector e web-vitals
---

# Memória: `telemetry-specialist`

> Arquivo de memória do agent `telemetry-specialist`. Atualizado após
> cada execução significativa. Limite 300 linhas
> (`tamanho-e-revisao.md`).

## Decisões Tomadas

### 2026-09-23 — Criação do agent transversal `telemetry-specialist`

**Contexto:** projeto-base declarou OpenTelemetry na stack
(`docs/STACK.md` linha 41), mas o código não tinha nenhuma
instrumentação. `nestjs-specialist` carregava §2.7 com 3 linhas sobre
OTel (linhas 95 e 222) — coverage insuficiente. `agent-architect-memory`
marcava `devops-sre` como lacuna P3, mas com escopo mais amplo
(CI/CD+observabilidade+SLOs+runbooks). Frontend (`apps/web`) sem
`instrumentation.ts`, sem RUM, sem web-vitals. Compose sem OTel
Collector. Zero env vars `OTEL_*` no repo.

**Decisão:** criar `telemetry-specialist` como **specialist transversal**
(cross-stack: backend + frontend + docker), e **migrar §2.7 OpenTelemetry
do `nestjs-specialist`** para cá (a fazer em PR de cleanup). Boundary
explícito: este agent é dono de **instrumentação** (SDK init, exporters,
propagação, sampling, instrumentations libraries, web-vitals reporters,
collector config); não cria módulos de negócio, Dockerfiles, páginas
Next.js, ou políticas de segurança. Regras de coordenação com
`nestjs-specialist`, `nextjs-specialist` e `docker-specialist` na seção
"Coordenação" do agent.

**Consequências:**

- Matriz `specialist-routing.md` precisa ganhar entradas para
  `apps/api/**/telemetry/**`, `apps/web/**/instrumentation*`,
  `apps/web/**/web-vitals*`, `infra/otelcol/**` (path_globs +
  demand_keywords com regex `(?i)telemetry|tracing|opentelemetry|otel|spans?`).
- Matriz `review-routing.md` precisa ganhar entradas para regex
  `@Trace\(|@Span\(|SpanKind\.|context\.with\(|\.setAttribute\(`.
- Templates `.agents/` ganham v1.8.0 (nova convention + novo agent =
  minor bump por `estrutura-e-versionamento.md`).
- Pitfall conhecido: `@opentelemetry/api` já é peer de
  `babel-plugin-react-compiler` em `pnpm-lock.yaml:3139` — verificar
  `pnpm dedupe` para não duplicar.

### 2026-09-23 — Bridge Pino ↔ OTel via instrumentação canônica

**Decisão:** NÃO trocar `nestjs-pino` por `nest-winston` ou logger
custom "para integrar com OTel". Em vez disso, adicionar
`@opentelemetry/instrumentation-pino`, que injeta `trace_id` e
`span_id` no contexto de cada log automaticamente. Manter pino-pretty
no dev e JSON cru no prod (regra já existente em `app.module.ts:15-24`).

**Consequência:** OTel **Logs signal** fica desligado no MVP (evita
duplicação Pino↔OTel-Logs). Custo: zero benefício marginal enquanto
Pino está emitindo structured JSON. Quando a observabilidade exigir
correlação logs↔traces em backend deLogs (Datadog/Honeycomb/Loki),
revisar.

## Padrões Descobertos

- `AuditContextStore` (baseado em `node:async_hooks.AsyncLocalStorage`) é
  **compatível** com o Context manager default de `@opentelemetry/api`
  — sem mudança de API; apenas alimentar `correlationId` do span ativo.
- `global-exception.filter.ts:36` atualmente usa `request.id` (Fastify)
  ou `randomUUID()` como fallback. Migração para
  `trace.getActiveSpan().spanContext().traceId` precisa preservar o
  teste existente (`spec:212` injeta `id: 't-42'`).
- `PrismaService` declara eventos `query/error/warn` no `log:`
  constructor do `super()` mas NÃO registra `$on('query', ...)` —
  queries ficam silenciosamente não-logadas. Decidir entre:
  registrar `$on` OU instrumentar via `$extends({ query })`
  (preferível — `$use()` deprecated desde Prisma 4.x).
- `FastifyAdapter({ logger: false })` em `main.ts:13` silencia logger
  Fastify nativo para evitar duplicação com `pino-http`. **Não
  religar** ao instrumentar — `pino-http` continua load-bearing.
- `output: 'standalone'` do Next.js pode exigir
  `outputFileTracingIncludes` em `next.config.mjs` para que módulos
  `@opentelemetry/*` sejam detectados no bundle.
- OTel Collector em Compose deve ser declarado com
  `profiles: [observability]` — não liga por padrão em dev/test.
- `pnpm-lock.yaml:3139` já tem `@opentelemetry/api` como peer de
  `babel-plugin-react-compiler` — adicionar SDK cliente requer
  `pnpm dedupe` para evitar dual-version.

## Lições Aprendidas

- ❌ **Tracer init no lugar errado**: se algum log Pino é emitido antes
  do `sdk.start()`, ele fica sem span. Por isso init precisa rodar
  como `--require`/`-r` antes do `main.ts`.
- ❌ **Endpoint hardcoded** do collector no código: nunca. Sempre via
  `OTEL_EXPORTER_OTLP_ENDPOINT`.
- ❌ **Collector sempre ligado** no Compose: polui dev/test. Sempre
  via `profiles: [observability]`.
- ❌ **`web-vitals` como log**: vira ruído. Sempre via OTel Metrics
  (`meter.createHistogram`).
- ❌ **Auto-instrumentation de `fs`**: ruído puro. Sempre
  `enabled: false` em `@opentelemetry/instrumentation-fs`.
- ❌ **`@opentelemetry/instrumentation-ioredis` antes do ioredis
  existir**: instalador falha. Aguardar Redis entrar (atualmente sem
  Redis no `package.json`).

## Sugestões de Evolução

- [ ] Atualizar matriz `specialist-routing.md` Seção 1 (path_globs) +
  Seção 2 (demand_keywords) para reconhecer este agent (pendente
  v1.8.0 ou v1.9.0 — quando plano de telemetria arrancar)
- [ ] Atualizar matriz `review-routing.md` Seção 3 (diff_patterns) para
  identificar spans manuais em code review
- [ ] ADR-0002-telemetria-backend (decisões OTel SDK Node,
  exporters, propagação W3C)
- [ ] ADR-0003-telemetria-frontend (instrumentation.ts, web-vitals,
  exporters browser)
- [ ] Skill `telemetry` em `.agents/skills/telemetry/SKILL.md` quando
  plano de telemetria produzir múltiplos tasks worth a skill
  dedicada (regra: **skill antes de agent** se for specialist puro,
  mas aqui já temos o agent; skill será metodológica)
- [ ] Testar matriz com `lint-specialist-routing.ts` após atualizar
  paths (validar que lint aceita ou bloqueia corretamente)
- [ ] Considerar `devops-sre` agent (escopo amplo: CI/CD + SLOs +
  runbooks) como evolução futura pós-telemetria-MVP
