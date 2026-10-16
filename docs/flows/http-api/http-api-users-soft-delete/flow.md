# DELETE /users/:id — Soft-delete com audit + archive

> DELETE /users/:id (If-Match) → marcarExcluido + audit.record(DELETE) + audit.archive → users_archive

> Diagrama derivado da IR `docs/flows/http-api/http-api-users-soft-delete/http-api-users-soft-delete.sequence.json` pelo conversor
> `tooling/scripts/flow-ir-to-mermaid.ts` — regenerar com
> `pnpm tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write`.
> O `.html` ao lado (~813 KB) foi produzido pelo `archify flow`, removido;
> segue versionado como histórico e não é regenerável.

```mermaid
sequenceDiagram
    participant client as Cliente<br/>DELETE + If-Match
    participant controller as UsersCtrl<br/>@HttpCode 204
    participant usecases as UserUseCases<br/>softDelete()
    participant repo as PrismaRepo<br/>save(user,n-1)
    participant audit as AuditService<br/>record + archive
    participant pg as PostgreSQL<br/>tables x3
    participant filter as ExcFilter<br/>RFC 7807
    rect Mark deleted + persist
    activate controller
    client->>controller: DELETE /users/:id + If-Match
    activate usecases
    controller->>usecases: parseIfMatch + softDelete(input)
    activate repo
    usecases->>repo: findById(UserId)
    activate pg
    repo->>pg: SELECT WHERE id AND deletedAt IS NULL
    pg-->>repo: User (version=n)
    usecases->>repo: marcarExcluido(reason,ctx.ts)
    repo->>pg: UPDATE users SET deletedAt=NOW()
    deactivate repo
    deactivate pg
    end
    rect Audit record + archive
    activate audit
    usecases->>audit: pullEvents() → record DELETE
    audit->>pg: INSERT INTO users_history
    usecases->>audit: archive(entity=snapshot,reason)
    audit->>pg: INSERT INTO users_archive
    deactivate audit
    controller-->>client: 204 No Content
    deactivate controller
    activate filter
    usecases->>filter: 404 deleted / 412 mismatch
    deactivate usecases
    end
    deactivate filter
    Note over client,filter: Soft-delete semantics<br/>DELETE não remove o row — apenas seta deletedAt = NOW() (preserva histórico)<br/>204 No Content (controller @HttpCode(204)) — sem ETag/ETag='W/v(final)'<br/>findById subsequente retorna null (filtra deletedAt IS NULL)
    Note over client,filter: Audit cascade (DELETE + archive)<br/>audit.record(DELETE) insere em users_history (audit trail)<br/>audit.archive() insere snapshot completo em users_archive (restore path)<br/>extrai previousVersion + reason do UserDeletedEvent
    Note over client,filter: Optimistic locking obrigatório<br/>412 se If-Match divergente (sem If-Match = 400 IF_MATCH_REQUIRED)<br/>404 se User já soft-deletado (findById filtra deletedAt)<br/>PATCH/DELETE subsequentes exigem ETag atualizado — força cliente a recarregar
```

## Views

> A IR declara N views; Mermaid não tem troca de view, então o diagrama
> acima é a união e o conteúdo específico de cada uma fica aqui.

| View | Rótulo | Foco | Nota |
|------|--------|------|------|
| `happy-path` | Soft-delete cascade → 204 | `client`, `controller`, `usecases`, `repo`, `audit`, `pg` | marcarExcluido + UPDATE users + INSERT history + INSERT archive. |
| `errors` | 404/412 error paths | `client`, `controller`, `usecases`, `filter` | User não existe ou já deletado → 404; versão mismatch → 412. |
