# GET /users/:id — Buscar por ID (soft-deleted omitido por default)

> GET /users/:id → UsersController → UserUseCases.obterPorId → UserRepository.findById (deletedAt=null filter) → Prisma → PostgreSQL

> Diagrama derivado da IR `docs/flows/http-api/http-api-users-get-by-id/http-api-users-get-by-id.sequence.json` pelo conversor
> `tooling/scripts/flow-ir-to-mermaid.ts` — regenerar com
> `pnpm tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write`.
> O `.html` ao lado (~813 KB) foi produzido pelo `archify flow`, removido;
> segue versionado como histórico e não é regenerável.

```mermaid
sequenceDiagram
    participant client as Cliente<br/>GET /users/:id
    participant controller as UsersCtrl<br/>@Param('id')
    participant usecases as UserUseCases<br/>obterPorId()
    participant repo as PrismaRepo<br/>findById(id)
    participant pg as PostgreSQL<br/>users table
    participant filter as ExcFilter<br/>RFC 7807
    rect Find by id
    activate controller
    client->>controller: GET /users/0190a8b6-...
    activate usecases
    controller->>usecases: obterPorId({id})
    activate repo
    usecases->>repo: findById(UserIdVO)
    activate pg
    repo->>pg: SELECT * WHERE id=$1 AND deletedAt IS NULL
    pg-->>repo: row | null
    repo-->>usecases: User agg | null
    deactivate pg
    usecases-->>controller: toUserOutput(user)
    deactivate repo
    end
    controller-->>client: 200 UserOutput
    deactivate controller
    deactivate usecases
    rect 404 soft-deleted
    repo->>usecases: null (deletedAt != null)
    activate usecases
    usecases->>filter: throw ApplicationResourceNotFound 404
    activate filter
    filter->>client: 404 ProblemDetails
    deactivate usecases
    end
    deactivate filter
    Note over client,filter: Soft-delete semantics<br/>findById filtra deletedAt IS NULL por default — sem flag → 404 illusion<br/>findById com includeDeleted=true retorna o user (usado por restore flow)<br/>Comportamento documentado em prisma-user.repository.ts:103-112
    Note over client,filter: 404 vs soft-deleted<br/>Soft-deleted vira 404 (não 410 Gone) — Uniformidade com 'não existe'<br/>Traders 401/403 não se aplicam (auth será Fase 8 com JWT)<br/>RFC 7807 problem+json indica resourceName=User, resourceId=id
    Note over client,filter: Layered architecture<br/>Controller fino — só parse + delegação (sem regra de negócio)<br/>Use case valida VO via UserId.create() (defesa secundária)<br/>PrismaUserRepo encapsula SQL (camada infrastructure)
```

## Views

> A IR declara N views; Mermaid não tem troca de view, então o diagrama
> acima é a união e o conteúdo específico de cada uma fica aqui.

| View | Rótulo | Foco | Nota |
|------|--------|------|------|
| `happy-path` | User ativo → 200 | `client`, `controller`, `usecases`, `repo`, `pg` | User existe, deletedAt=null → retorna UserOutput. |
| `soft-deleted-404` | Soft-deleted omitido → 404 | `client`, `controller`, `usecases`, `repo`, `pg`, `filter` | deletedAt IS NOT NULL → repo retorna null → ApplicationResourceNotFoundException → 404. |
