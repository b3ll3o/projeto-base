# 03 — Fluxo de Operações (Use Cases)

> Documento: parte do design [`2026-09-21-cadastro-usuario-com-auditoria-design.md`](./2026-09-21-cadastro-usuario-com-auditoria-design.md)

## §1. Invariantes Globais

1. **Atomicidade**: `prisma.$transaction([opPrincipal, opHistory, opArchive?])` — ou tudo ou nada.
2. **Optimistic locking**: UPDATE sempre `WHERE id = X AND version = N`. Conflito → `ConcurrencyException` → HTTP 409.
3. **Snapshot é profundo**: `JSON.stringify(aggregate.toObject())` realizado **dentro da transação**, antes de qualquer mudança externa.
4. **`changedBy` vem do contexto**: extraído de `AuditContextPort.current().userId` (preenchido pelo middleware HTTP via JWT).
5. **Domain events publicados após commit** da transação.

## §2. CREATE — `CreateUserUseCase`

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. HTTP Request → UsersController                           │
│    POST /users { email, name }                              │
│    Validação: CreateUserDto (class-validator)               │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Application — CreateUserUseCase.execute(input, ctx)      │
│    a. ctx = AuditContextPort.current()                      │
│    b. Verifica unicidade (findByEmail)                      │
│    c. user = User.create({ email: Email.of(input.email),    │
│                             name: Name.of(input.name),      │
│                             createdBy: ctx.userId })         │
│    d. user.addDomainEvent(new UserCreatedEvent(user))       │
│    e. userRepositoryPort.save(user)                         │
│    f. auditServicePort.record({                             │
│         operation: 'INSERT',                                │
│         entityId: user.id,                                  │
│         version: 1,                                         │
│         previousVersion: null,                              │
│         snapshot: user.toSnapshot(),                        │
│         metadata: { changedBy: ctx.userId,                  │
│                     changedAt: ctx.now }                    │
│       })                                                    │
│    g. eventBusPort.publish(user.pullDomainEvents())         │
│    h. return UserOutputDto.from(user)                       │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Infrastructure — PrismaUserRepository.save(user)         │
│    await prisma.$transaction([                              │
│      prisma.user.create({ data: UserMapper.toPrisma(user) }),│
│      prisma.userHistory.create({ data: { ...INSERT } })     │
│    ])                                                       │
└─────────────────────────────────────────────────────────────┘
```

## §3. UPDATE — `UpdateUserUseCase`

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. HTTP Request → UsersController                           │
│    PATCH /users/:id { name? }                               │
│    Headers: If-Match: W/"<current-version>"  (opcional)     │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Application — UpdateUserUseCase.execute(id, input, ctx)  │
│    a. current = userRepositoryPort.findById(id)             │
│       (lança NotFoundException se null)                     │
│    b. if (request.headers['if-match'])                      │
│         guard against version mismatch → 412 Precondition   │
│    c. previousSnapshot = current.toSnapshot()               │
│    d. current.update({ name: input.name }, ctx.userId)      │
│       (domain: valida, version++, atualiza updatedAt/By)    │
│    e. current.addDomainEvent(new UserUpdatedEvent(...))     │
│    f. userRepositoryPort.save(current)                      │
│    g. auditServicePort.record({ operation: 'UPDATE', ... }) │
│    h. eventBusPort.publish(current.pullDomainEvents())      │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Infrastructure — PrismaUserRepository.save(user)         │
│    await prisma.$transaction([                              │
│      prisma.user.update({                                  │
│        where: { id, version: user.version - 1 },           │
│        data: { ...UserMapper.toPrisma(user) }               │
│      }).catch(P2025 → ConcurrencyException),                │
│      prisma.userHistory.create({ data: { ...UPDATE } })     │
│    ])                                                       │
└─────────────────────────────────────────────────────────────┘
```

## §4. SOFT DELETE — `SoftDeleteUserUseCase`

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. HTTP Request → UsersController                           │
│    DELETE /users/:id                                        │
│    Headers: If-Match: W/"<current-version>"  (opcional)     │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Application — SoftDeleteUserUseCase.execute(id, ctx)     │
│    a. current = userRepositoryPort.findById(id)             │
│    b. snapshot = current.toSnapshot()                       │
│    c. current.markDeleted(ctx.userId)                       │
│       (domain: marca version++, deleted_*)                  │
│    d. addDomainEvent(UserDeletedEvent)                      │
│    e. userRepositoryPort.save(current)                      │
│    f. auditServicePort.record({ operation: 'DELETE', ... }) │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Infrastructure — PrismaUserRepository.save(user)         │
│    await prisma.$transaction([                              │
│      prisma.user.delete({ where: { id, version: ... } }),  │
│      prisma.userHistory.create({ operation: 'DELETE' }),    │
│      prisma.userArchive.create({ data: { ... } })           │
│    ])                                                       │
└─────────────────────────────────────────────────────────────┘
```

## §5. RESTORE — `RestoreUserUseCase`

```text
┌─────────────────────────────────────────────────────────────┐
│ 1. HTTP Request → UsersController                           │
│    POST /users/:id/restore { version: N, reason? }          │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Application — RestoreUserUseCase.execute(id, targetVer)  │
│    a. source = auditServicePort.findHistoryByVersion(       │
│         entityId: id, version: targetVer)                   │
│    b. existing = userRepositoryPort.findById(id)            │
│       (se já existe ativa → ConflictException 409)          │
│    c. reconstituted = User.fromSnapshot(source.snapshot)    │
│    d. reconstituted.restore({ restoredFrom: targetVer,      │
│                              restoredBy: ctx.userId })       │
│       → novo version = source.version + 1                  │
│       → id permanece o mesmo                                │
│    e. addDomainEvent(UserRestoredEvent)                     │
│    f. userRepositoryPort.save(reconstituted)                │
│    g. auditServicePort.record({ operation: 'RESTORE', ... })│
│    h. archiveRepositoryPort.remove(entityId)                │
└─────────────────────────┬───────────────────────────────────┘
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Infrastructure                                           │
│    prisma.$transaction([                                    │
│      userHistory.create(snapshot do restore),               │
│      userArchive.delete({ where: { entityId } }),           │
│      user.create ou user.update                             │
│    ])                                                       │
└─────────────────────────────────────────────────────────────┘
```

## §6. Cenários de Erro → HTTP Status

| Cenário | Exceção (domain) | HTTP |
|---------|------------------|------|
| Aggregate não encontrado | `NotFoundException` | 404 |
| Email já existe (UNIQUE) | `AlreadyExistsException` | 409 |
| Versão desatualizada (optimistic locking) | `ConcurrencyException` | 409 |
| If-Match header ausente/inválido | `PreconditionFailedException` | 412 |
| Validação de DTO falha | `ValidationException` | 400 |
| Aggregate inválido (regra de domínio violada) | `DomainException` | 422 |
| Erro interno | `InternalServerErrorException` | 500 |

## §7. Leitura — `GetUserUseCase` e `ListUsersUseCase`

- `GetUserUseCase` → `repository.findById(id)` → retorna `UserOutputDto` ou 404.
- `ListUsersUseCase` → `repository.findAll({ cursor, limit, order })` → paginado cursor-based.
- Ambos não emitem domain events (operação de leitura).
- Audit de leitura é opcional e fica para v2 (audit de acesso).

---

**Próximo:** [`04-contrato-http.md`](./2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md)
