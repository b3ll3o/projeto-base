# POST /users/:id/restore — Restaurar soft-deleted

> POST /users/:id/restore (If-Match) → findById(includeDeleted) → restaurar() → UPDATE users + audit RESTORE

> Diagrama derivado da IR `docs/flows/http-api/http-api-users-restore/http-api-users-restore.sequence.json` pelo conversor
> `tooling/scripts/flow-ir-to-mermaid.ts` — regenerar com
> `pnpm tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write`.
> O `.html` ao lado (~813 KB) foi produzido pelo `archify flow`, removido;
> segue versionado como histórico e não é regenerável.

```mermaid
sequenceDiagram
    participant client as Cliente<br/>POST + If-Match
    participant controller as UsersCtrl<br/>@Status 201
    participant usecases as UserUseCases<br/>restaurar()
    participant repo as PrismaRepo<br/>findById inc
    participant audit as AuditService<br/>record RESTORE
    participant pg as PostgreSQL<br/>users table
    participant filter as ExcFilter<br/>RFC 7807
    rect Restore + persist
    activate controller
    client->>controller: POST /users/:id/restore
    activate usecases
    controller->>usecases: restaurar({id,expectedVer})
    activate repo
    usecases->>repo: findById(id, includeDeleted:true)
    activate pg
    repo->>pg: SELECT WHERE id (sem filtro deletedAt)
    pg-->>repo: User soft-deletado
    usecases->>repo: restaurar + save(user,n-1)
    repo->>pg: UPDATE SET deletedAt=NULL WHERE version=n-1
    deactivate repo
    deactivate pg
    end
    rect Audit RESTORE
    activate audit
    usecases->>audit: pullEvents() → record RESTORE
    audit->>pg: INSERT INTO users_history
    deactivate audit
    usecases-->>controller: toUserOutput(user)
    controller-->>client: 201 + ETag: W/v(n+1)
    deactivate controller
    deactivate usecases
    activate usecases
    activate filter
    usecases->>filter: 404/412/422
    end
    deactivate usecases
    deactivate filter
    Note over client,filter: Restore cascade<br/>includeDeleted:true no findById (linha 232 do use-cases.ts) — necessário para carregar<br/>restaurar() seta deletedAt=null + emite UserRestoredEvent<br/>audit.record(RESTORE) com previousVersion=restoredFromVersion
    Note over client,filter: Optimistic locking obrigatório<br/>412 se If-Match divergente (mesma proteção do PATCH/DELETE)<br/>Sem If-Match → 400 IF_MATCH_REQUIRED<br/>Restore + soft-delete formam par simétrico de version increment
    Note over client,filter: Error mapping<br/>User não existe → ApplicationResourceNotFoundException → 404<br/>User existe mas deletedAt=null → ApplicationInvalidRestoreException → 422<br/>Version mismatch → ApplicationConcurrencyException → 412
```

## Views

> A IR declara N views; Mermaid não tem troca de view, então o diagrama
> acima é a união e o conteúdo específico de cada uma fica aqui.

| View | Rótulo | Foco | Nota |
|------|--------|------|------|
| `happy-path` | Restore → 201 | `client`, `controller`, `usecases`, `repo`, `audit`, `pg` | User soft-deletado restaurado, deletedAt=NULL, ETag atualizado. |
| `errors` | 404/412/422 | `client`, `controller`, `usecases`, `filter` | User não existe → 404; versão mismatch → 412; já ativo → 422. |
