# Fase 5 — User Application (Parte 2/5)

> **Continuação** da Fase 5. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-05-user-application.md)
>
> Esta é a parte 2 de 5 da Fase 5. Pule para a próxima parte ao final.

---


export interface CreateUserInput {
  email: string;
  name: string;
}

/**
 * Use case: criar novo User.
 * - Verifica unicidade de email
 * - Persiste User
 * - Registra auditoria (INSERT, version 1)
 * - Retorna DTO de saída
 */
export class CreateUserUseCase {
  constructor(
    private readonly repo: UserRepositoryPort,
    private readonly audit: AuditServicePort,
  ) {}

  async execute(input: CreateUserInput, ctx: AuditContext): Promise<UserOutputDto> {
    const email = Email.create(input.email);
    const name = UserName.create(input.name);

    const existente = await this.repo.findByEmail(email.value);
    if (existente) {
      throw new EmailAlreadyInUseException(email.value);
    }

    const user = User.criar({
      id: UserId.create(),
      email,
      name,
      createdAt: ctx.timestamp,
      createdBy: ctx.actorId ? UserId.create(ctx.actorId) : null,
    });

    await this.repo.save(user);

    await this.audit.record(
      {
        entityName: 'User',
        entityId: user.id.value,
        operation: 'INSERT',
        previousVersion: null,
        newVersion: user.version,
        snapshot: user.snapshot(),
      },
      ctx,
    );

    return UserMapper.toOutput(user);
  }
}
```

- [ ] **Step 3: Rodar + commit**

Run: `pnpm --filter @projeto/api test:unit -- create-user 2>&1 | tail -5`
Expected: 3 passed.

```bash
git add apps/api/src/modules/users/application/use-cases/create-user.use-case.ts apps/api/src/modules/users/application/use-cases/create-user.use-case.spec.ts
git commit -m "feat(users-app): add CreateUserUseCase with audit integration

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 5.7: Use case `UpdateUserUseCase`

**Files:**
- Create: `apps/api/src/modules/users/application/use-cases/update-user.use-case.ts`
- Create: `apps/api/src/modules/users/application/use-cases/update-user.use-case.spec.ts`

- [ ] **Step 1: RED — teste**

```typescript
// apps/api/src/modules/users/application/use-cases/update-user.use-case.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateUserUseCase } from './update-user.use-case.js';
import { InMemoryUserRepository } from '../../infrastructure/persistence/in-memory-user.repository.js';
import { InMemoryAuditService } from '../../../../shared/audit/application/in-memory-audit-service.js';
import { AuditContext } from '../../../../shared/audit/domain/audit-context.vo.js';
import { CreateUserUseCase } from './create-user.use-case.js';
import { ConcurrencyException, UserNotFoundException, UserDeletedException } from '../../domain/exceptions/user.exceptions.js';

describe('UpdateUserUseCase', () => {
  let repo: InMemoryUserRepository;
  let audit: InMemoryAuditService;
  let create: CreateUserUseCase;
  let sut: UpdateUserUseCase;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    audit = new InMemoryAuditService();
    create = new CreateUserUseCase(repo, audit);
    sut = new UpdateUserUseCase(repo, audit);
  });

  const ctx = () =>
    new AuditContext({
      actorId: 'u-1',
      correlationId: 'c-1',
      source: 'http',
      timestamp: new Date('2026-09-21T10:00:00Z'),
    });

  it('atualiza User existente e incrementa versão', async () => {
    const u = await create.execute({ email: 'a@b.com', name: 'Alice' }, ctx());
    const updated = await sut.execute(
      { id: u.id, expectedVersion: 1, name: 'Alice 2' },
      ctx(),
    );
    expect(updated.version).toBe(2);
    expect(updated.name).toBe('Alice 2');
  });

  it('lança ConcurrencyException se If-Match não bate', async () => {
    const u = await create.execute({ email: 'a@b.com', name: 'Alice' }, ctx());
    await expect(
      sut.execute({ id: u.id, expectedVersion: 99, name: 'X' }, ctx()),
    ).rejects.toThrow(ConcurrencyException);
  });

  it('lança UserNotFoundException se id inexistente', async () => {
    await expect(
      sut.execute(
        { id: '0190a8b6-1234-7abc-9def-deadbeefdead', expectedVersion: 1, name: 'X' },
        ctx(),
      ),
    ).rejects.toThrow(UserNotFoundException);
  });

  it('lança UserDeletedException se tentar atualizar soft-deleted', async () => {
    const u = await create.execute({ email: 'a@b.com', name: 'Alice' }, ctx());
    repo['byId'].get(u.id)!.softDelete(new Date(), 'GDPR', null);
    repo['byId'].get(u.id)!.pullEvents();
    await expect(
      sut.execute({ id: u.id, expectedVersion: 1, name: 'X' }, ctx()),
    ).rejects.toThrow(UserDeletedException);
  });

  it('registra auditoria UPDATE com previousVersion', async () => {
    const u = await create.execute({ email: 'a@b.com', name: 'Alice' }, ctx());
    audit.history.length = 0;
    await sut.execute({ id: u.id, expectedVersion: 1, name: 'Alice 2' }, ctx());
    const updateEntry = audit.history[audit.history.length - 1];
    expect(updateEntry.operation).toBe('UPDATE');
    expect(updateEntry.previousVersion).toBe(1);
    expect(updateEntry.version).toBe(2);
  });
});
```

- [ ] **Step 2: GREEN — implementar**

```typescript
// apps/api/src/modules/users/application/use-cases/update-user.use-case.ts
import type { UserOutputDto } from '@projeto/shared-types';
import type { UserRepositoryPort } from '../../domain/ports/user-repository.port.js';
import type { AuditServicePort } from '../../../../shared/audit/application/audit-service.port.js';
import type { AuditContext } from '../../../../shared/audit/domain/audit-context.vo.js';
import { Email } from '../../domain/value-objects/email.vo.js';
import { UserName } from '../../domain/value-objects/user-name.vo.js';
import { UserNotFoundException } from '../../domain/exceptions/user.exceptions.js';
import { UserMapper } from '../mappers/user.mapper.js';

export interface UpdateUserInput {
  id: string;
  expectedVersion: number;
  email?: string;
  name?: string;
}

export class UpdateUserUseCase {
  constructor(
    private readonly repo: UserRepositoryPort,
    private readonly audit: AuditServicePort,
  ) {}

  async execute(input: UpdateUserInput, ctx: AuditContext): Promise<UserOutputDto> {
    const user = await this.repo.findById(input.id);
    if (!user) {
      throw new UserNotFoundException(input.id);
    }

    const previousVersion = user.version;
    const previousSnapshot = user.snapshot();

    user.atualizar(
      {
        email: input.email ? Email.create(input.email) : undefined,
        name: input.name ? UserName.create(input.name) : undefined,
      },
      ctx.timestamp,
      () => user,
    );

    await this.repo.updateWithLock(user, previousVersion, { includeDeleted: false });

    await this.audit.record(
      {
        entityName: 'User',
        entityId: user.id.value,
        operation: 'UPDATE',
        previousVersion,
        newVersion: user.version,
        snapshot: user.snapshot(),
      },
      ctx,
    );
    // O snapshot anterior permanece em history.previousVersion entries.

    return UserMapper.toOutput(user);
  }
}
```

- [ ] **Step 3: Rodar + commit**

Run: `pnpm --filter @projeto/api test:unit -- update-user 2>&1 | tail -5`
Expected: 5 passed.

```bash
git add apps/api/src/modules/users/application/use-cases/update-user.use-case.ts apps/api/src/modules/users/application/use-cases/update-user.use-case.spec.ts
git commit -m "feat(users-app): add UpdateUserUseCase with optimistic locking

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 5.8: Use case `GetUserUseCase`

**Files:**
- Create: `apps/api/src/modules/users/application/use-cases/get-user.use-case.ts`
- Create: `apps/api/src/modules/users/application/use-cases/get-user.use-case.spec.ts`

- [ ] **Step 1: RED — teste**

```typescript
// apps/api/src/modules/users/application/use-cases/get-user.use-case.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GetUserUseCase } from './get-user.use-case.js';
import { InMemoryUserRepository } from '../../infrastructure/persistence/in-memory-user.repository.js';
import { CreateUserUseCase } from './create-user.use-case.js';
import { InMemoryAuditService } from '../../../../shared/audit/application/in-memory-audit-service.js';
import { AuditContext } from '../../../../shared/audit/domain/audit-context.vo.js';
import { UserNotFoundException } from '../../domain/exceptions/user.exceptions.js';

describe('GetUserUseCase', () => {
  let repo: InMemoryUserRepository;
  let audit: InMemoryAuditService;
  let create: CreateUserUseCase;
  let sut: GetUserUseCase;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    audit = new InMemoryAuditService();
