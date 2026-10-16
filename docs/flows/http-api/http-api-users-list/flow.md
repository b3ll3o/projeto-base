# GET /users — Listar (cursor paginado + includeDeleted)

> GET /users?cursor=...&includeDeleted=... → UsersController → UserUseCases.listar → UserRepositoryPort.list → Prisma + cursor encoder

> Diagrama derivado da IR `docs/flows/http-api/http-api-users-list/http-api-users-list.sequence.json` pelo conversor
> `tooling/scripts/flow-ir-to-mermaid.ts` — regenerar com
> `pnpm tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write`.
> O `.html` ao lado (~813 KB) foi produzido pelo `archify flow`, removido;
> segue versionado como histórico e não é regenerável.

```mermaid
sequenceDiagram
    participant client as Cliente<br/>GET /users
    participant controller as UsersCtrl<br/>@Query()
    participant usecases as UserUseCases<br/>listar()
    participant repo as PrismaRepo<br/>list(opts)
    participant cursor as CursorEnc<br/>encode/decode
    participant pg as PostgreSQL<br/>users table
    rect Parse + validate input
    activate controller
    client->>controller: GET /users?cursor=&includeDeleted=
    controller->>usecases: listar({cursor,limit,includeDeleted})
    activate usecases
    usecases->>repo: list(opts)
    end
    rect Query + cursor encode
    activate repo
    activate cursor
    repo->>cursor: decode(cursor) → offset
    cursor-->>repo: PageRequest (offset/limit)
    activate pg
    repo->>pg: SELECT * FROM users WHERE...
    pg-->>repo: N rows + total
    deactivate pg
    repo->>cursor: encode(next offset)
    deactivate cursor
    repo-->>usecases: {users, nextCursor}
    deactivate repo
    usecases-->>controller: ListUsersOutput
    deactivate usecases
    end
    controller-->>client: 200 { users:[], nextCursor }
    deactivate controller
    Note over client,pg: Cursor pagination<br/>Cursor é opaco (encode/decode) — clients não inspecionam offset<br/>nextCursor=null é o sinal canônico de fim de página<br/>Page size default 20 (limite máximo configurável no PrismaRepo)
    Note over client,pg: includeDeleted case-insensitive<br/>includeDeleted?.toLowerCase() === 'true' || === '1' (linha 123 do controller)<br/>Default false esconde soft-deleted — sem flag → 404 illusion via list<br/>Truthy values: 'true', 'TRUE', 'True', '1' (apenas esses 2 tokens)
    Note over client,pg: Camada application vs infra<br/>Use case só recebe tipos primitivos (input DTO) — não conhece HTTP<br/>PrismaRepo encapsula SQL — use case depende apenas da port<br/>Output DTO tem {users, nextCursor} (não expõe entities)
```

## Views

> A IR declara N views; Mermaid não tem troca de view, então o diagrama
> acima é a união e o conteúdo específico de cada uma fica aqui.

| View | Rótulo | Foco | Nota |
|------|--------|------|------|
| `happy-path` | Cursor paginated list | `client`, `controller`, `usecases`, `repo`, `cursor`, `pg` | Lista página de users; nextCursor opaco para próxima página. |
| `include-deleted` | includeDeleted parsing | `client`, `controller`, `usecases`, `repo` | includeDeleted=TrUe|TRUE|1 case-insensitive normalized to boolean true. |
