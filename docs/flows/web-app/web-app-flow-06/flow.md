# apps/web — ApiClient Error Path (RFC 7807 → ApiError)

> RSC → ApiClient.get() → fetch apps/api → non-2xx → ProblemDetails → ApiError throw → client catch

> Diagrama derivado da IR `docs/flows/web-app/web-app-flow-06/web-app-flow-06.sequence.json` pelo conversor
> `tooling/scripts/flow-ir-to-mermaid.ts` — regenerar com
> `pnpm tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write`.
> O `.html` ao lado (~813 KB) foi produzido pelo `archify flow`, removido;
> segue versionado como histórico e não é regenerável.

```mermaid
sequenceDiagram
    participant rsc as RSC<br/>app/users/page.tsx
    participant api_client as ApiClient<br/>fetch wrapper
    participant fetch as fetch<br/>node/browser
    participant api as apps/api<br/>NestJS
    participant problem as Problems<br/>RFC 7807
    participant api_error as ApiError<br/>throw new
    participant fallback_ui as fallback UI<br/>error message
    rect Request
    activate api_client
    rsc->>api_client: api.get('/users?limit=20')
    activate fetch
    api_client->>fetch: build URL + headers
    activate api
    fetch->>api: GET /api/v1/users
    end
    activate problem
    api->>problem: Throw HttpException
    deactivate api
    rect Error path
    problem->>fetch: 400/404/500 ProblemDetailsDto
    deactivate problem
    fetch->>api_client: res.ok=false
    deactivate fetch
    end
    activate api_error
    api_client->>api_error: await res.json() → ProblemDetails
    rect Recover
    api_error->>api_client: throw new ApiError(title, code, status)
    deactivate api_error
    api_client->>rsc: throw ApiError (rejected promise)
    deactivate api_client
    end
    activate fallback_ui
    rsc->>fallback_ui: try/catch render fallback UI
    deactivate fallback_ui
    Note over rsc,fallback_ui: ApiClient.ts estratégia de erro<br/>if (!res.ok) parse body as ProblemDetailsDto<br/>throw new ApiError(title, code, status, problem)<br/>ApiError extends Error com .problem (full DTO)<br/>catch upstream via try/catch no RSC (app/users/page.tsx)
    Note over rsc,fallback_ui: ProblemDetailsDto contrato<br/>type: https://errors.projeto.com/{code}<br/>title: human-readable summary<br/>code: VAL id do erro (definido em @projeto/shared-types)<br/>traceId: W3C 32 hex chars (correlaciona com backend spans)<br/>errors[]: campo + message + code (Zod) — detalhe granular
    Note over rsc,fallback_ui: RSC fallback UX<br/>app/users/page.tsx: try/catch → set error string<br/>Renderiza &lt;p className='mt-4 text-red-600'&gt;Erro ao carregar: ...&lt;/p&gt;<br/>Não exibe stack (apenas message.title)<br/>Recovery: client pode retry via router.refresh()
```

## Views

> A IR declara N views; Mermaid não tem troca de view, então o diagrama
> acima é a união e o conteúdo específico de cada uma fica aqui.

| View | Rótulo | Foco | Nota |
|------|--------|------|------|
| `api-error` | Error path | `rsc`, `api_client`, `fetch`, `api`, `problem`, `api_error`, `fallback_ui` | non-2xx → body JSON parse → ApiError com ProblemDetailsDto → client component catch → fallback UI. |
