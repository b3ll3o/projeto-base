# GET /users/:id/history — Audit history paginado

> GET /users/:id/history?cursor=... → UsersController → AuditServicePort.listHistory → users_history table

> Diagrama derivado da IR `docs/flows/http-api/http-api-users-history/http-api-users-history.sequence.json` pelo conversor
> `tooling/scripts/flow-ir-to-mermaid.ts` — regenerar com
> `pnpm tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write`.
> O `.html` ao lado (~813 KB) foi produzido pelo `archify flow`, removido;
> segue versionado como histórico e não é regenerável.

```mermaid
sequenceDiagram
    participant client as Cliente<br/>GET history
    participant controller as UsersCtrl<br/>@Param('id')
    participant audit as AuditService<br/>listHistory()
    participant cursor as CursorEnc<br/>decode/encode
    participant pg as PostgreSQL<br/>users_history
    rect List history (read-only)
    activate controller
    client->>controller: GET /users/:id/history?cursor=
    controller->>audit: listHistory(input)
    activate audit
    activate cursor
    audit->>cursor: decode(cursor)
    cursor-->>audit: offset/limit
    activate pg
    audit->>pg: SELECT FROM users_history WHERE entityId=$1 ORDER BY version DESC
    pg-->>audit: N audit events
    deactivate pg
    audit->>cursor: encode(next offset)
    deactivate cursor
    audit-->>controller: {events[], nextCursor}
    controller-->>client: 200 history
    deactivate controller
    deactivate audit
    end
    Note over client,pg: Audit history semantics<br/>history é read-only — sem If-Match, sem idempotência<br/>AuditContext não é necessário (listagem é passiva)<br/>Cursor pagination igual ao GET /users (mesma port de encoder)
    Note over client,pg: Cross-BC reuse<br/>AuditServicePort é compartilhado com outros BCs (audit é infra shared)<br/>users_history é uma tabela genérica (entityName+entityId columns)<br/>Sem soft-delete filter — histórico inclui eventos de users deletados
    Note over client,pg: Performance<br/>Index composto (entityName, entityId, version DESC) — query eficiente<br/>Sem N+1 — único SELECT retorna page inteira<br/>OpenAPI documenta cursor + limit query params
```

## Views

> A IR declara N views; Mermaid não tem troca de view, então o diagrama
> acima é a união e o conteúdo específico de cada uma fica aqui.

| View | Rótulo | Foco | Nota |
|------|--------|------|------|
| `happy-path` | History cursor pagination | `client`, `controller`, `audit`, `pg` | AuditServicePort.listHistory(entityName=User, entityId) → cursor-based page. |
