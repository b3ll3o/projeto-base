# Fase 5 — User Application (Parte 3/5)

> **Continuação** da Fase 5. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-05-user-application.md)
>
> Esta é a parte 3 de 5 da Fase 5. Pule para a próxima parte ao final.

---

    create = new CreateUserUseCase(repo, audit);
    sut = new GetUserUseCase(repo);
  });

  it('retorna DTO do User', async () => {
    const u = await create.execute(
      { email: 'a@b.com', name: 'Alice' },
      new AuditContext({ actorId: null, correlationId: 'c', source: 'http', timestamp: new Date() }),
    );
    const got = await sut.execute({ id: u.id });
    expect(got.email).toBe('a@b.com');
  });

  it('lança UserNotFoundException', async () => {
    await expect(sut.execute({ id: '00000000-0000-7000-8000-000000000000' })).rejects.toThrow(
      UserNotFoundException,
    );
  });
});
```

- [ ] **Step 2: GREEN — implementar**

```typescript
// apps/api/src/modules/users/application/use-cases/get-user.use-case.ts
import type { UserOutputDto } from '@projeto/shared-types';
import type { UserRepositoryPort } from '../../domain/ports/user-repository.port.js';
import { UserNotFoundException } from '../../domain/exceptions/user.exceptions.js';
import { UserMapper } from '../mappers/user.mapper.js';

export interface GetUserInput {
  id: string;
  includeDeleted?: boolean;
}

export class GetUserUseCase {
  constructor(private readonly repo: UserRepositoryPort) {}

  async execute(input: GetUserInput): Promise<UserOutputDto> {
    const user = await this.repo.findById(input.id, { includeDeleted: input.includeDeleted });
    if (!user) {
      throw new UserNotFoundException(input.id);
    }
    return UserMapper.toOutput(user);
  }
}
```

- [ ] **Step 3: Rodar + commit**

```bash
git add apps/api/src/modules/users/application/use-cases/get-user.use-case.ts apps/api/src/modules/users/application/use-cases/get-user.use-case.spec.ts
git commit -m "feat(users-app): add GetUserUseCase

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 5.9: Use case `ListUsersUseCase`

**Files:**
- Create: `apps/api/src/modules/users/application/use-cases/list-users.use-case.ts`
- Create: `apps/api/src/modules/users/application/use-cases/list-users.use-case.spec.ts`

- [ ] **Step 1: RED — teste**

```typescript
// apps/api/src/modules/users/application/use-cases/list-users.use-case.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ListUsersUseCase } from './list-users.use-case.js';
import { InMemoryUserRepository } from '../../infrastructure/persistence/in-memory-user.repository.js';
import { CreateUserUseCase } from './create-user.use-case.js';
import { InMemoryAuditService } from '../../../../shared/audit/application/in-memory-audit-service.js';
import { AuditContext } from '../../../../shared/audit/domain/audit-context.vo.js';

describe('ListUsersUseCase', () => {
  let repo: InMemoryUserRepository;
  let audit: InMemoryAuditService;
  let create: CreateUserUseCase;
  let sut: ListUsersUseCase;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    audit = new InMemoryAuditService();
    create = new CreateUserUseCase(repo, audit);
    sut = new ListUsersUseCase(repo);
  });

  const ctx = () =>
    new AuditContext({
      actorId: null,
      correlationId: 'c',
      source: 'http',
      timestamp: new Date(),
    });

  it('lista com paginação cursor-based', async () => {
    for (let i = 0; i < 5; i++) {
      await create.execute({ email: `u${i}@b.com`, name: `U${i}` }, ctx());
    }
    const page1 = await sut.execute({ limit: 2 });
    expect(page1.data).toHaveLength(2);
    expect(page1.pagination.nextCursor).not.toBeNull();
    const page2 = await sut.execute({ limit: 2, cursor: page1.pagination.nextCursor ?? undefined });
    expect(page2.data.length).toBeGreaterThan(0);
  });

  it('hasMore=false na última página', async () => {
    await create.execute({ email: 'a@b.com', name: 'A' }, ctx());
    const result = await sut.execute({ limit: 10 });
    expect(result.pagination.hasMore).toBe(false);
  });

  it('exclui soft-deleted por padrão', async () => {
    await create.execute({ email: 'a@b.com', name: 'A' }, ctx());
    await create.execute({ email: 'b@b.com', name: 'B' }, ctx());
    const u1 = (await sut.execute({ limit: 10 })).data[0];
    repo['byId'].get(u1.id)!.softDelete(new Date(), 'GDPR', null);
    repo['byId'].get(u1.id)!.pullEvents();
    const after = await sut.execute({ limit: 10 });
    expect(after.data.find((d) => d.id === u1.id)).toBeUndefined();
  });
});
```

- [ ] **Step 2: GREEN — implementar**

```typescript
// apps/api/src/modules/users/application/use-cases/list-users.use-case.ts
import type { PaginatedResponse, UserOutputDto } from '@projeto/shared-types';
import type { UserRepositoryPort } from '../../domain/ports/user-repository.port.js';
import { UserMapper } from '../mappers/user.mapper.js';

export interface ListUsersInput {
  cursor?: string;
  limit: number;
  includeDeleted?: boolean;
}

export class ListUsersUseCase {
  constructor(private readonly repo: UserRepositoryPort) {}

  async execute(input: ListUsersInput): Promise<PaginatedResponse<UserOutputDto>> {
    const clampedLimit = Math.min(Math.max(input.limit, 1), 100);
    const result = await this.repo.list({
      cursor: input.cursor,
      limit: clampedLimit,
      includeDeleted: input.includeDeleted,
    });
    return {
      data: result.users.map(UserMapper.toOutput),
      pagination: {
        nextCursor: result.nextCursor,
        hasMore: result.nextCursor !== null,
      },
    };
  }
}
```

- [ ] **Step 3: Rodar + commit**

```bash
git add apps/api/src/modules/users/application/use-cases/list-users.use-case.ts apps/api/src/modules/users/application/use-cases/list-users.use-case.spec.ts
git commit -m "feat(users-app): add ListUsersUseCase with cursor pagination

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 5.10: Use case `SoftDeleteUserUseCase`

**Files:**
- Create: `apps/api/src/modules/users/application/use-cases/soft-delete-user.use-case.ts`
- Create: `apps/api/src/modules/users/application/use-cases/soft-delete-user.use-case.spec.ts`

- [ ] **Step 1: RED — teste**

```typescript
// apps/api/src/modules/users/application/use-cases/soft-delete-user.use-case.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { SoftDeleteUserUseCase } from './soft-delete-user.use-case.js';
import { InMemoryUserRepository } from '../../infrastructure/persistence/in-memory-user.repository.js';
import { InMemoryAuditService } from '../../../../shared/audit/application/in-memory-audit-service.js';
import { AuditContext } from '../../../../shared/audit/domain/audit-context.vo.js';
import { CreateUserUseCase } from './create-user.use-case.js';
import { UserNotFoundException, UserDeletedException, ConcurrencyException } from '../../domain/exceptions/user.exceptions.js';

describe('SoftDeleteUserUseCase', () => {
  let repo: InMemoryUserRepository;
  let audit: InMemoryAuditService;
  let create: CreateUserUseCase;
  let sut: SoftDeleteUserUseCase;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    audit = new InMemoryAuditService();
    create = new CreateUserUseCase(repo, audit);
    sut = new SoftDeleteUserUseCase(repo, audit);
  });

  const ctx = () =>
    new AuditContext({ actorId: 'admin', correlationId: 'c', source: 'http', timestamp: new Date('2026-09-21T10:00:00Z') });

  it('soft-deleta User e arquiva snapshot', async () => {
    const u = await create.execute({ email: 'a@b.com', name: 'A' }, ctx());
    await sut.execute({ id: u.id, expectedVersion: 1, reason: 'GDPR' }, ctx());

    const found = await repo.findById(u.id);
    expect(found).toBeNull(); // não aparece em queries normais
    const found2 = await repo.findById(u.id, { includeDeleted: true });
    expect(found2?.deletedAt).toBeInstanceOf(Date);

    expect(audit.archive).toHaveLength(1);
    expect(audit.archive[0].reason).toBe('GDPR');
    expect(audit.history.find((h) => h.operation === 'DELETE')).toBeDefined();
  });

  it('lança UserDeletedException em duplo delete', async () => {
    const u = await create.execute({ email: 'a@b.com', name: 'A' }, ctx());
    await sut.execute({ id: u.id, expectedVersion: 1, reason: 'X' }, ctx());
    await expect(
      sut.execute({ id: u.id, expectedVersion: 2, reason: 'Y' }, ctx()),
    ).rejects.toThrow();
  });

  it('lança UserNotFoundException', async () => {
    await expect(
      sut.execute(
        { id: '00000000-0000-7000-8000-000000000000', expectedVersion: 1 },
        ctx(),
      ),
    ).rejects.toThrow(UserNotFoundException);
  });

  it('lança ConcurrencyException em version mismatch', async () => {
    const u = await create.execute({ email: 'a@b.com', name: 'A' }, ctx());
    await expect(
      sut.execute({ id: u.id, expectedVersion: 99 }, ctx()),
    ).rejects.toThrow(ConcurrencyException);
  });
});
```

- [ ] **Step 2: GREEN — implementar**

```typescript
// apps/api/src/modules/users/application/use-cases/soft-delete-user.use-case.ts
import type { UserRepositoryPort } from '../../domain/ports/user-repository.port.js';
import type { AuditServicePort } from '../../../../shared/audit/application/audit-service.port.js';
import type { AuditContext } from '../../../../shared/audit/domain/audit-context.vo.js';
import { UserId } from '../../domain/value-objects/user-id.vo.js';
import { UserNotFoundException } from '../../domain/exceptions/user.exceptions.js';

export interface SoftDeleteUserInput {
  id: string;
  expectedVersion: number;
  reason?: string;
