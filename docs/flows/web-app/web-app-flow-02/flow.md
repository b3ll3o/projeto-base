# apps/web — Users List Page (RSC fetch)

> Browser → Next.js (RSC) → ApiClient → apps/api → Prisma → Users List Page render

> Diagrama derivado da IR `docs/flows/web-app/web-app-flow-02/web-app-flow-02.sequence.json` pelo conversor
> `tooling/scripts/flow-ir-to-mermaid.ts` — regenerar com
> `pnpm tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write`.
> O `.html` ao lado (~813 KB) foi produzido pelo `archify flow`, removido;
> segue versionado como histórico e não é regenerável.

```mermaid
sequenceDiagram
    participant browser as Browser<br/>GET /users
    participant next as Next.js<br/>App Router
    participant rsc as RSC<br/>users/page.tsx
    participant apiclient as ApiClient<br/>fetch wrapper
    participant api as apps/api<br/>NestJS
    participant pg as PostgreSQL<br/>users table
    rect RSC fetch
    activate next
    browser->>next: GET /users (page request)
    activate rsc
    next->>rsc: render UsersPage()
    activate apiclient
    rsc->>apiclient: api.get('/users?limit=20')
    activate api
    apiclient->>api: GET /api/v1/users?limit=20
    end
    rect API query
    activate pg
    api->>pg: SELECT FROM users
    pg-->>api: N rows
    deactivate pg
    api-->>apiclient: 200 {data,nextCursor}
    deactivate api
    apiclient-->>rsc: PaginatedResponse
    deactivate apiclient
    rsc->>next: RSC payload (server-rendered)
    next-->>browser: HTML stream
    deactivate next
    end
    rect Render
    rsc->>browser: RSC chunk (streaming)
    end
    deactivate rsc
    Note over browser,pg: RSC direct fetch pattern<br/>Server Component faz fetch DIRETO no server (sem useEffect)<br/>API_BASE_URL env var aponta para apps/api<br/>Dados serializados via @projeto/shared-types (DTO compartilhado)
    Note over browser,pg: Next.js 15 App Router<br/>app/users/page.tsx é async function component<br/>try/catch captura erro (renderiza fallback client-side)<br/>Streaming RSC: chunks chegam progressivamente
    Note over browser,pg: Shared types contract<br/>@projeto/shared-types exporta UserOutputDto + PaginatedResponse&lt;T&gt;<br/>apps/web e apps/api compartilham tipos sem duplicar<br/>Build monorepo garante consistência de contrato
```

## Views

> A IR declara N views; Mermaid não tem troca de view, então o diagrama
> acima é a união e o conteúdo específico de cada uma fica aqui.

| View | Rótulo | Foco | Nota |
|------|--------|------|------|
| `rsc-fetch` | RSC direct fetch | `browser`, `next`, `rsc`, `apiclient`, `api`, `pg` | Server Component fetcha direto, sem useEffect — Next.js 15 RSC. |
