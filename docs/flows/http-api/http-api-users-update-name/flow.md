# PATCH /users/:id — Renomear com If-Match optimistic locking

> PATCH /users/:id (If-Match: W/v<n>) → UsersController.parseIfMatch → UserUseCases.atualizarNome → version mismatch → 412 Precondition

> Diagrama derivado da IR `docs/flows/http-api/http-api-users-update-name/http-api-users-update-name.sequence.json` pelo conversor
> `tooling/scripts/flow-ir-to-mermaid.ts` — regenerar com
> `pnpm tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write`.
> O `.html` ao lado (~813 KB) foi produzido pelo `archify flow`, removido;
> segue versionado como histórico e não é regenerável.

```mermaid
sequenceDiagram
    participant client as Cliente<br/>PATCH + If-Match
    participant controller as UsersCtrl<br/>@If-Match
    participant usecases as UserUseCases<br/>atualizarNome()
    participant repo as PrismaRepo<br/>save(user,n-1)
    participant audit as AuditService<br/>record UPDATE
    participant pg as PostgreSQL<br/>users + history
    participant filter as ExcFilter<br/>RFC 7807
    rect Parse + load
    activate controller
    client->>controller: PATCH /users/:id {novoNome}
    controller->>usecases: parseIfMatch → expectedVersion
    activate usecases
    activate repo
    usecases->>repo: findById(UserId)
    activate pg
    repo->>pg: SELECT WHERE id AND deletedAt IS NULL
    end
    rect Renomear + persist + audit
    pg-->>repo: User (version=n)
    usecases->>repo: renomear + save(user,n-1)
    repo->>pg: UPDATE WHERE id AND version=n-1
    pg-->>repo: row updated
    deactivate repo
    deactivate pg
    activate audit
    usecases->>audit: pullEvents() → record UPDATE
    audit->>pg: INSERT INTO users_history
    deactivate audit
    end
    usecases-->>controller: toUserOutput(user)
    deactivate usecases
    rect Error paths (412/400)
    controller-->>client: 200 + ETag: W/v(n+1)
    deactivate controller
    usecases->>filter: version!=n → 412
    activate usecases
    activate filter
    controller->>filter: IfMatchInvalid → 400
    end
    deactivate usecases
    deactivate filter
    Note over client,filter: Optimistic locking flow (200)<br/>parseIfMatch regex /^W/&quot;v(\d+)&quot;$/i aceita 'W/v3' (case-insensitive)<br/>Curto-circuito em use case: 412 ANTES de tentar mutar (idempotente)<br/>save(user, expectedVersion=n-1) garante atomicidade (UPDATE ... WHERE version=n-1)
    Note over client,filter: RFC 7232 — If-Match semantics<br/>412 Precondition Failed = 'estado mudou desde que você viu'<br/>Header ausente/inválido → 400 (BadRequestException IF_MATCH_REQUIRED/INVALID)<br/>Sem ETag na resposta → cliente não pode fazer PATCH subsequo (Task 7.6)
    Note over client,filter: Audit cascade em UPDATE<br/>UserUpdatedEvent → mapEventNameToOperation('*.updated.v1') → UPDATE<br/>previousVersion = n-1 (extraído do evento)<br/>AuditContextStore.run() propaga W3C traceId OTel → correlationId
```

## Views

> A IR declara N views; Mermaid não tem troca de view, então o diagrama
> acima é a união e o conteúdo específico de cada uma fica aqui.

| View | Rótulo | Foco | Nota |
|------|--------|------|------|
| `happy-path` | Optimistic lock OK → 200 | `client`, `controller`, `usecases`, `repo`, `audit`, `pg` | version() === expectedVersion → renomear + UPDATE + audit cascade. |
| `version-mismatch-412` | Stale If-Match → 412 | `client`, `controller`, `usecases`, `repo`, `filter` | version() !== expectedVersion → ApplicationConcurrencyException → 412 Precondition Failed. |
| `if-match-invalid-400` | Header ausente/inválido → 400 | `client`, `controller`, `filter` | parseIfMatch rejeita sem W/v<n> → BadRequestException → 400. |
