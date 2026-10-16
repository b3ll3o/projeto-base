# apps/web — Health Check API Route

> Browser/Docker → Next.js API route /api/health → JSON response

> Diagrama derivado da IR `docs/flows/web-app/web-app-flow-03/web-app-flow-03.sequence.json` pelo conversor
> `tooling/scripts/flow-ir-to-mermaid.ts` — regenerar com
> `pnpm tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write`.
> O `.html` ao lado (~813 KB) foi produzido pelo `archify flow`, removido;
> segue versionado como histórico e não é regenerável.

```mermaid
sequenceDiagram
    participant client as Docker / curl<br/>HEALTHCHECK
    participant next as Next.js<br/>App Router
    participant api_route as GET handler<br/>api/health/route.ts
    participant json_response as JSON 200<br/>{status,timestamp}
    rect Request
    activate next
    client->>next: GET /api/health
    activate api_route
    next->>api_route: GET() handler
    api_route->>next: NextResponse.json({status, timestamp})
    deactivate api_route
    end
    rect Respond
    activate json_response
    next->>json_response: serialize 200 OK
    json_response-->>next: headers + body
    deactivate json_response
    end
    next->>client: 200 { status: 'ok', timestamp }
    deactivate next
    Note over client,json_response: API route force-dynamic<br/>export const dynamic = 'force-dynamic' impede cache de response<br/>Cada chamada re-executa o handler (timestamp atual)<br/>GET handler retorna NextResponse.json()<br/>Sem DB coupling (apps/web version standalone) — só healthcheck leve
    Note over client,json_response: Docker HEALTHCHECK integration<br/>docker-compose.yml web service: node healthcheck a cada 10s<br/>curl /api/health → 200 → container marked healthy<br/>start_period 20s (tempo para Next.js bootar)<br/>retries 3 antes de marcar unhealthy
```

## Views

> A IR declara N views; Mermaid não tem troca de view, então o diagrama
> acima é a união e o conteúdo específico de cada uma fica aqui.

| View | Rótulo | Foco | Nota |
|------|--------|------|------|
| `health-route` | Health endpoint | `client`, `next`, `api_route`, `json_response` | API route estática (force-dynamic), usada por Docker healthcheck do container web. |
