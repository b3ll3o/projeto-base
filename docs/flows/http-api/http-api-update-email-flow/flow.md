# Update Email — Use Case (sem rota HTTP dedicada)

> Use case UpdateEmail existe em apps/api mas SEM controller dedicado (gap documentado)

> Diagrama derivado da IR `docs/flows/http-api/http-api-update-email-flow/http-api-update-email-flow.sequence.json` pelo conversor
> `tooling/scripts/flow-ir-to-mermaid.ts` — regenerar com
> `pnpm tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write`.
> O `.html` ao lado (~813 KB) foi produzido pelo `archify flow`, removido;
> segue versionado como histórico e não é regenerável.

```mermaid
sequenceDiagram
    participant client as Client<br/>external
    participant controller as UsersCtrl<br/>REST
    participant update_email_uc as UpdateEmailUC<br/>use case
    participant user_aggregate as User Agg<br/>domain
    participant audit_record as users_history<br/>audit
    rect Request
    activate controller
    client->>controller: PATCH /users/:id {email:...}
    activate update_email_uc
    controller->>update_email_uc: execute({userId, newEmail, If-Match})
    activate user_aggregate
    update_email_uc->>user_aggregate: load + version check
    end
    rect Domain
    user_aggregate-->>update_email_uc: current state v&lt;N&gt;
    update_email_uc->>user_aggregate: apply email + bump version
    end
    rect Audit + Response
    activate audit_record
    user_aggregate->>audit_record: INSERT audit UPDATE_EMAIL
    audit_record-->>user_aggregate: audit_id (FK)
    deactivate audit_record
    user_aggregate->>update_email_uc: UserOutput (new ETag)
    deactivate user_aggregate
    update_email_uc-->>controller: Result
    deactivate update_email_uc
    controller->>client: 200 OK (ETag W/&quot;u-N+1&quot;)
    end
    deactivate controller
    Note over client,audit_record: Use Case sem Rota Dedicada (gap)<br/>UpdateEmail existe em Application layer (use case canônico)<br/>Mas SEM PATCH /users/:id/email dedicado no controller<br/>Clients atualmente usam PATCH /users/:id genérico com campo email<br/>Phase 8 roadmap: rota dedicada + DTO separado + validação específica
    Note over client,audit_record: Implementação Atual<br/>PATCH /users/:id aceita body com campos parciais (name OR email)<br/>Mesmo use case path via ZodValidationPipe (validation compartilhada)<br/>Optimistic locking funciona (If-Match obrigatório)<br/>Audit gera evento UPDATE com diff de campos alterados
    Note over client,audit_record: Por que gap documentado<br/>Email tem regras específicas (RFC 5321 + uniqueness)<br/>Email update pode disparar email de verificação (futuro)<br/>Phase 8 deve adicionar rota dedicada com DTO UpdateEmailDto<br/>Por enquanto, comportamento funcional via rota genérica é OK
```

## Views

> A IR declara N views; Mermaid não tem troca de view, então o diagrama
> acima é a união e o conteúdo específico de cada uma fica aqui.

| View | Rótulo | Foco | Nota |
|------|--------|------|------|
| `use-case` | UpdateEmail use case | `controller`, `update_email_uc`, `user_aggregate`, `audit_record` | Use case existe (Application layer); controller NÃO está mapeado (gap). |
| `gap` | Gap documentado | `controller` | Sem PATCH /users/:id/email — clients usam PATCH /users/:id com campo email. |
