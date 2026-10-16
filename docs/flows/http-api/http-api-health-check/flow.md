# Health Check — GET /api/v1/health

> Liveness/readiness do apps/api (NestJS + Fastify + PrismaService + PostgreSQL)

> Diagrama derivado da IR `docs/flows/http-api/http-api-health-check/http-api-health-check.sequence.json` pelo conversor
> `tooling/scripts/flow-ir-to-mermaid.ts` — regenerar com
> `pnpm tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write`.
> O `.html` ao lado (~813 KB) foi produzido pelo `archify flow`, removido;
> segue versionado como histórico e não é regenerável.

```mermaid
sequenceDiagram
    participant client as Cliente<br/>curl / HEALTH
    participant fastify as Fastify<br/>HTTP server
    participant controller as HealthCtrl<br/>GET /health v1
    participant prisma as PrismaSvc<br/>client wrapper
    participant postgres as PostgreSQL<br/>db engine
    participant filter as ExcFilter<br/>RFC 7807 mapper
    rect 200 OK (DB up)
    activate fastify
    client->>fastify: GET /api/v1/health
    activate controller
    fastify->>controller: route → NestJS handler
    deactivate fastify
    activate prisma
    controller->>prisma: $queryRawUnsafe('SELECT 1')
    activate postgres
    prisma->>postgres: SELECT 1
    postgres-->>prisma: 1 row
    end
    prisma-->>controller: resolve()
    deactivate postgres
    rect 503 Service Unavailable (DB down)
    controller-->>client: 200 { status: ok, database: ok, ts }
    deactivate controller
    deactivate prisma
    activate fastify
    client->>fastify: GET /api/v1/health (DB indisponível)
    activate controller
    fastify->>controller: route → handler
    deactivate fastify
    activate prisma
    controller->>prisma: $queryRawUnsafe('SELECT 1')
    activate postgres
    prisma->>postgres: SELECT 1 (timeout/refused)
    postgres->>prisma: ECONNREFUSED
    activate filter
    controller->>filter: throw ServiceUnavailableException
    deactivate prisma
    deactivate postgres
    filter->>client: 503 ProblemDetails RFC 7807
    deactivate controller
    deactivate filter
    end
    Note over client,filter: Caminho 200 OK<br/>PrismaService.$queryRawUnsafe('SELECT 1') valida o pool de conexões<br/>Payload mínimo { status, checks.database } é contrato do HEALTHCHECK<br/>Latência típica < 50ms — adequado para docker HEALTHCHECK interval=10s
    Note over client,filter: Caminho 503 Degradado<br/>ServiceUnavailableException lançada pelo controller é mapeada via GlobalExceptionFilter<br/>Resposta segue RFC 7807 (application/problem+json)<br/>Docker HEALTHCHECK trata 503 como unhealthy → restart policy age
    Note over client,filter: Atores + Boundary<br/>FastifyAdapter recebe o request antes do NestJS pipeline<br/>PrismaService é o único port para PostgreSQL — não há SQL fora deste boundary<br/>Versão /v1 é obrigatória pelo FastifyAdapter (sem version: '1' → 500)
```

## Views

> A IR declara N views; Mermaid não tem troca de view, então o diagrama
> acima é a união e o conteúdo específico de cada uma fica aqui.

| View | Rótulo | Foco | Nota |
|------|--------|------|------|
| `happy-path` | DB up → 200 | `client`, `fastify`, `controller`, `prisma`, `postgres` | SELECT 1 retorna → 200 com payload { ok, database, timestamp }. |
| `degraded-path` | DB down → 503 | `client`, `fastify`, `controller`, `prisma`, `postgres`, `filter` | PrismaService.$queryRawUnsafe rejeita → ServiceUnavailableException → GlobalExceptionFilter → RFC 7807. |
