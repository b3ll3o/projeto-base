# 05b — Exemplos de Testes (snippets canônicos)

> Documento: parte do design [`2026-09-21-cadastro-usuario-com-auditoria-design.md`](./2026-09-21-cadastro-usuario-com-auditoria-design.md)
> **Ver também:** [`05-estrategia-testes.md`](./2026-09-21-cadastro-usuario-com-auditoria-05-estrategia-testes.md) (regras + matriz)

## §1. Testes Unitários de Domínio (Puro, Sem Mocks)

Rodam em milissegundos, **zero dependências externas**. Não usam NestJS, Prisma, mocks de framework.

```typescript
// users/domain/entities/user.aggregate.spec.ts
describe('User aggregate', () => {
  describe('create()', () => {
    it('should create with version 1 when valid input', () => {
      const user = User.create({
        email: Email.of('leo@example.com'),
        name: Name.of('Leo'),
        createdBy: UserId.of('admin-id'),
      });
      expect(user.version.value).toBe(1);
      expect(user.email.value).toBe('leo@example.com');
    });

    it('should throw DomainException when email is invalid', () => {
      expect(() => User.create({
        email: Email.of('invalid'),
        name: Name.of('Leo'),
        createdBy: UserId.of('admin-id'),
      })).toThrow(DomainException);
    });
  });

  describe('update()', () => {
    it('should increment version and update updatedAt', () => {
      const user = User.create({...});
      const newDate = new Date('2026-09-21T19:00:00Z');
      user.update({ name: Name.of('Leo Updated') }, UserId.of('admin-id'), newDate);
      expect(user.version.value).toBe(2);
      expect(user.updatedAt).toEqual(newDate);
    });
  });

  describe('markDeleted()', () => {
    it('should increment version and add UserDeletedEvent', () => {
      const user = User.create({...});
      user.markDeleted(UserId.of('admin-id'));
      expect(user.version.value).toBe(2);
      const events = user.pullDomainEvents();
      expect(events[0]).toBeInstanceOf(UserDeletedEvent);
    });
  });
});
```

## §2. Testes de Value Objects (Invariantes)

```typescript
// users/domain/value-objects/email.vo.spec.ts
describe('Email value object', () => {
  it.each([['leo@example.com']])('should accept valid email %s', (input) => {
    expect(() => Email.of(input)).not.toThrow();
  });

  it.each([['invalid'], ['@example.com']])('should reject %s', (input) => {
    expect(() => Email.of(input)).toThrow(InvalidEmailException);
  });

  it('should normalize to lowercase', () => {
    const email = Email.of('LEO@Example.com');
    expect(email.value).toBe('leo@example.com');
  });

  it('should be immutable', () => {
    const email = Email.of('leo@example.com');
    expect(() => { (email as any).value = 'hacked'; }).toThrow();
  });
});
```

## §3. Testes de Use Cases (Application com Mocks de Ports)

```typescript
// users/application/use-cases/update-user.use-case.spec.ts
describe('UpdateUserUseCase', () => {
  let sut: UpdateUserUseCase;
  let userRepo: jest.Mocked<UserRepositoryPort>;
  let auditService: jest.Mocked<AuditServicePort>;
  let eventBus: jest.Mocked<EventBusPort>;

  beforeEach(() => {
    userRepo = { findById: jest.fn(), save: jest.fn() } as any;
    auditService = { record: jest.fn() } as any;
    eventBus = { publish: jest.fn() } as any;
    sut = new UpdateUserUseCase(userRepo, auditService, eventBus);
  });

  it('should throw NotFoundException when user does not exist', async () => {
    userRepo.findById.mockResolvedValue(null);
    await expect(sut.execute('01j9z', { name: 'X' }, ctx))
      .rejects.toThrow(NotFoundException);
    expect(userRepo.save).not.toHaveBeenCalled();
  });

  it('should increment version, save, audit and publish event when valid', async () => {
    const user = User.create({...});
    userRepo.findById.mockResolvedValue(user);
    userRepo.save.mockResolvedValue(undefined);

    const result = await sut.execute('01j9z', { name: 'Updated' }, ctx);

    expect(user.version.value).toBe(2);
    expect(userRepo.save).toHaveBeenCalledWith(user);
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'UPDATE', version: 2, previousVersion: 1,
    }));
    expect(eventBus.publish).toHaveBeenCalled();
    expect(result.version).toBe(2);
  });
});
```

## §4. Testes de Integração com Testcontainers

```typescript
// users/infrastructure/persistence/prisma/user.prisma.repository.spec.ts
describe('PrismaUserRepository (integration)', () => {
  let postgres: StartedPostgreSqlContainer;
  let prisma: PrismaClient;
  let sut: PrismaUserRepository;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:16-alpine').start();
    prisma = new PrismaClient({ datasourceUrl: postgres.getConnectionString() });
    await runMigrations(prisma);
    sut = new PrismaUserRepository(prisma);
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await postgres.stop();
  });

  it('should throw ConcurrencyException when version mismatch on update', async () => {
    const user = User.create({...});
    await sut.save(user);
    user.update({ name: Name.of('V2') }, UserId.of('admin'));

    await prisma.user.update({
      where: { id: user.id.value },
      data: { version: 99 },
    });

    await expect(sut.save(user)).rejects.toThrow(ConcurrencyException);
  });

  it('should record history snapshot on update', async () => {
    const user = User.create({...});
    await sut.save(user);

    user.update({ name: Name.of('V2') }, UserId.of('admin'));
    await sut.save(user);

    const lastHistory = await prisma.userHistory.findFirst({
      where: { entityId: user.id.value, version: 2 },
    });
    expect(lastHistory?.operation).toBe('UPDATE');
    expect((lastHistory?.snapshot as any).name).toBe('Leo'); // snapshot ANTERIOR
  });
});
```

## §5. Testes E2E (HTTP Ponta-a-Ponta)

```typescript
// users/test/users.e2e-spec.ts
describe('Users API (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedPostgreSqlContainer;

  beforeAll(async () => {
    postgres = await new PostgreSqlContainer('postgres:16-alpine').start();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(testPrisma(postgres))
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  it('POST /users → 201 + audit INSERT', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ email: 'leo@example.com', name: 'Leo' })
      .expect(201);

    expect(response.body).toMatchObject({ email: 'leo@example.com', version: 1 });

    const history = await request(app.getHttpServer())
      .get(`/api/v1/users/${response.body.id}/history`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);
    expect(history.body.data[0].operation).toBe('INSERT');
  });

  it('DELETE + restore workflow', async () => {
    const created = await createUser({ email: 'b@b.com', name: 'B' });
    await updateUser(created.id, { name: 'B2' });

    await request(app.getHttpServer())
      .delete(`/api/v1/users/${created.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(204);

    const restored = await request(app.getHttpServer())
      .post(`/api/v1/users/${created.id}/restore`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ version: 1 })
      .expect(201);

    expect(restored.body.name).toBe('B');       // restaurou v1
    expect(restored.body.version).toBe(3);      // nova versão
  });
});
```

---

**Voltar:** [`05-estrategia-testes.md`](./2026-09-21-cadastro-usuario-com-auditoria-05-estrategia-testes.md)
