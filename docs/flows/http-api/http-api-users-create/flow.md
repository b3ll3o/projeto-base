# POST /users — Criar Usuário (com cascade de auditoria)

> POST /users → UsersController (+ ZodValidationPipe) → UserUseCases → User aggregate → PrismaUserRepo → PostgreSQL + AuditServicePort → users_history

> Diagrama derivado da IR `docs/flows/http-api/http-api-users-create/http-api-users-create.sequence.json` pelo conversor
> `tooling/scripts/flow-ir-to-mermaid.ts` — regenerar com
> `pnpm tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write`.
> O `.html` ao lado (~813 KB) foi produzido pelo `archify flow`, removido;
> segue versionado como histórico e não é regenerável.

```mermaid
sequenceDiagram
    participant client as Cliente<br/>POST /users
    participant controller as UsersCtrl<br/>+ ZodPipe
    participant usecases as UserUseCases<br/>+ User agg
    participant repo as PrismaRepo<br/>save(user,0)
    participant audit as AuditService<br/>record INSERT
    participant pg as PostgreSQL<br/>users+history
    participant filter as ExcFilter<br/>RFC 7807
    rect Validation
    activate controller
    client->>controller: POST /users {nome,email}
    activate usecases
    controller->>usecases: ZodPipe(parsed) + run(ctx,criar)
    activate repo
    usecases->>repo: save(user, expectedVersion=0)
    end
    rect Persist + audit
    activate pg
    repo->>pg: INSERT INTO users
    pg-->>repo: row inserted
    deactivate repo
    deactivate pg
    activate audit
    usecases->>audit: pullEvents() → record INSERT
    activate pg
    audit->>pg: INSERT INTO users_history
    audit-->>usecases: ack
    deactivate audit
    deactivate pg
    usecases-->>controller: toUserOutput(user)
    deactivate usecases
    controller-->>client: 201 + ETag: W/v1
    deactivate controller
    end
    rect Caminhos de erro
    activate usecases
    activate filter
    usecases->>filter: throw EmailAlreadyInUse 409
    activate controller
    controller->>filter: ZodError → 400
    deactivate usecases
    filter->>client: RFC 7807 problem+json
    deactivate controller
    filter->>client: RFC 7807 problem+json
    end
    deactivate filter
    Note over client,filter: Caminho feliz — INSERT + audit cascade<br/>expectedVersion=0 (criação inicial) garante que outro writer não sobrescreve<br/>AuditContextStore.run() propaga W3C traceId do OTel span ativo<br/>UserCreatedEvent → mapEventNameToOperation() → INSERT em users_history
    Note over client,filter: Defesa em profundidade<br/>ZodValidationPipe no boundary HTTP (400 cedo com mensagem útil)<br/>ApplicationValidationException dentro do use case (defesa secundária)<br/>GlobalExceptionFilter converte tudo em RFC 7807 problem+json
    Note over client,filter: Email duplicado — 409<br/>findByEmail() pré-check antes de User.criar() — evita lock contention<br/>ApplicationEmailAlreadyInUseException mapeia para 409 (conflict)<br/>Email uniqueness também é validação do VO Email.create (formato)
```

## Views

> A IR declara N views; Mermaid não tem troca de view, então o diagrama
> acima é a união e o conteúdo específico de cada uma fica aqui.

| View | Rótulo | Foco | Nota |
|------|--------|------|------|
| `happy-path` | CREATE caminho feliz | `client`, `controller`, `usecases`, `repo`, `audit` | INSERT user + INSERT audit record (UserCreatedEvent). |
| `validation-409` | Email duplicado → 409 | `client`, `controller`, `usecases`, `repo`, `filter` | findByEmail pré-check lança ApplicationEmailAlreadyInUseException → 409. |
| `validation-400` | Payload inválido → 400 | `client`, `controller`, `filter` | ZodValidationPipe rejeita DTO antes do handler (defense-in-depth). |
