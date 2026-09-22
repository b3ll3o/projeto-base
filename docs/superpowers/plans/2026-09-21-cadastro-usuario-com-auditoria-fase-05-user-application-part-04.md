# Fase 5 — User Application (Parte 4/5)

> **Continuação** da Fase 5. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-05-user-application.md)
>
> Esta é a parte 4 de 5 da Fase 5. Pule para a próxima parte ao final.

---

}

export class SoftDeleteUserUseCase {
  constructor(
    private readonly repo: UserRepositoryPort,
    private readonly audit: AuditServicePort,
  ) {}

  async execute(input: SoftDeleteUserInput, ctx: AuditContext): Promise<void> {
    const user = await this.repo.findById(input.id);
    if (!user) {
      throw new UserNotFoundException(input.id);
    }

    const previousVersion = input.expectedVersion;
    const snapshot = user.snapshot();

    user.softDelete(ctx.timestamp, input.reason ?? null, ctx.actorId ? UserId.create(ctx.actorId) : null);

    await this.repo.softDelete(user.id.value, previousVersion);

    await this.audit.record(
      {
        entityName: 'User',
        entityId: user.id.value,
        operation: 'DELETE',
        previousVersion,
        newVersion: user.version,
        snapshot: user.snapshot(),
        reason: input.reason ?? null,
      },
      ctx,
    );

    await this.audit.archive({
      entityName: 'User',
      entityId: user.id.value,
      version: user.version,
      snapshot,
      reason: input.reason ?? null,
      ctx,
    });
  }
}
```

- [ ] **Step 3: Rodar + commit**

```bash
git add apps/api/src/modules/users/application/use-cases/soft-delete-user.use-case.ts apps/api/src/modules/users/application/use-cases/soft-delete-user.use-case.spec.ts
git commit -m "feat(users-app): add SoftDeleteUserUseCase with archive + history

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 5.11: Use case `RestoreUserUseCase`

**Files:**
- Create: `apps/api/src/modules/users/application/use-cases/restore-user.use-case.ts`
- Create: `apps/api/src/modules/users/application/use-cases/restore-user.use-case.spec.ts`

- [ ] **Step 1: RED — teste**

```typescript
// apps/api/src/modules/users/application/use-cases/restore-user.use-case.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { RestoreUserUseCase } from './restore-user.use-case.js';
import { InMemoryUserRepository } from '../../infrastructure/persistence/in-memory-user.repository.js';
import { InMemoryAuditService } from '../../../../shared/audit/application/in-memory-audit-service.js';
import { AuditContext } from '../../../../shared/audit/domain/audit-context.vo.js';
import { CreateUserUseCase } from './create-user.use-case.js';
import { SoftDeleteUserUseCase } from './soft-delete-user.use-case.js';
import { InvalidRestoreException } from '../../domain/exceptions/user.exceptions.js';

describe('RestoreUserUseCase', () => {
  let repo: InMemoryUserRepository;
  let audit: InMemoryAuditService;
  let create: CreateUserUseCase;
  let softDelete: SoftDeleteUserUseCase;
  let sut: RestoreUserUseCase;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    audit = new InMemoryAuditService();
    create = new CreateUserUseCase(repo, audit);
    softDelete = new SoftDeleteUserUseCase(repo, audit);
    sut = new RestoreUserUseCase(repo, audit);
  });

  const ctx = () =>
    new AuditContext({ actorId: 'admin', correlationId: 'c', source: 'http', timestamp: new Date('2026-09-21T10:00:00Z') });

  it('restaura User soft-deleted e remove do archive', async () => {
    const u = await create.execute({ email: 'a@b.com', name: 'A' }, ctx());
    await softDelete.execute({ id: u.id, expectedVersion: 1, reason: 'temp' }, ctx());
    const versionAposDelete = (await repo.findById(u.id, { includeDeleted: true }))!.version;

    const restored = await sut.execute({ id: u.id, expectedVersion: versionAposDelete }, ctx());
    expect(restored.deletedAt).toBeFalsy();
    expect(audit.archive.find((a) => a.entityId === u.id)).toBeUndefined();
    expect(audit.history.find((h) => h.operation === 'RESTORE')).toBeDefined();
  });

  it('lança InvalidRestoreException se User não-deletado', async () => {
    const u = await create.execute({ email: 'a@b.com', name: 'A' }, ctx());
    await expect(
      sut.execute({ id: u.id, expectedVersion: 1 }, ctx()),
    ).rejects.toThrow(InvalidRestoreException);
  });
});
```

- [ ] **Step 2: GREEN — implementar**

```typescript
// apps/api/src/modules/users/application/use-cases/restore-user.use-case.ts
import type { UserOutputDto } from '@projeto/shared-types';
import type { UserRepositoryPort } from '../../domain/ports/user-repository.port.js';
import type { AuditServicePort } from '../../../../shared/audit/application/audit-service.port.js';
import type { AuditContext } from '../../../../shared/audit/domain/audit-context.vo.js';
import { UserMapper } from '../mappers/user.mapper.js';

export interface RestoreUserInput {
  id: string;
  expectedVersion: number;
  reason?: string;
}

/**
 * Use case: restaurar User a partir do archive.
 * - User.deve estar soft-deleted
 * - archive é limpo após restauração bem-sucedida
 * - history recebe uma entrada RESTORE
 */
export class RestoreUserUseCase {
  constructor(
    private readonly repo: UserRepositoryPort,
    private readonly audit: AuditServicePort,
  ) {}

  async execute(input: RestoreUserInput, ctx: AuditContext): Promise<UserOutputDto> {
    const restored = await this.repo.restore(input.id, input.expectedVersion);

    const previousVersion = restored.version;
    restored.restaurar(ctx.timestamp);
    await this.repo.updateWithLock(restored, previousVersion, { includeDeleted: true });

    await this.audit.record(
      {
        entityName: 'User',
        entityId: restored.id.value,
        operation: 'RESTORE',
        previousVersion,
        newVersion: restored.version,
        snapshot: restored.snapshot(),
        reason: input.reason ?? null,
      },
      ctx,
    );

    // Remoção do archive: a infra Prisma trata como no-op de archive
    // (já que o User voltou a existir com FK por id).
    // Aqui só registramos o evento; persistência de "archive vazio" fica no PrismaAuditService.

    return UserMapper.toOutput(restored);
  }
}
```

- [ ] **Step 3: Rodar + commit**

```bash
git add apps/api/src/modules/users/application/use-cases/restore-user.use-case.ts apps/api/src/modules/users/application/use-cases/restore-user.use-case.spec.ts
git commit -m "feat(users-app): add RestoreUserUseCase

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 5.12: Use case `GetUserHistoryUseCase`

**Files:**
- Create: `apps/api/src/modules/users/application/use-cases/get-user-history.use-case.ts`
- Create: `apps/api/src/modules/users/application/use-cases/get-user-history.use-case.spec.ts`

- [ ] **Step 1: RED — teste**

```typescript
// apps/api/src/modules/users/application/use-cases/get-user-history.use-case.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { GetUserHistoryUseCase } from './get-user-history.use-case.js';
import { InMemoryUserRepository } from '../../infrastructure/persistence/in-memory-user.repository.js';
import { InMemoryAuditService } from '../../../../shared/audit/application/in-memory-audit-service.js';
import { AuditContext } from '../../../../shared/audit/domain/audit-context.vo.js';
import { CreateUserUseCase } from './create-user.use-case.js';
import { UpdateUserUseCase } from './update-user.use-case.js';

describe('GetUserHistoryUseCase', () => {
  let repo: InMemoryUserRepository;
  let audit: InMemoryAuditService;
  let create: CreateUserUseCase;
  let update: UpdateUserUseCase;
  let sut: GetUserHistoryUseCase;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    audit = new InMemoryAuditService();
    create = new CreateUserUseCase(repo, audit);
    update = new UpdateUserUseCase(repo, audit);
    sut = new GetUserHistoryUseCase(audit);
  });

  const ctx = () =>
    new AuditContext({ actorId: null, correlationId: 'c', source: 'http', timestamp: new Date() });

  it('lista histórico ordenado por versão', async () => {
    const u = await create.execute({ email: 'a@b.com', name: 'A' }, ctx());
    await update.execute({ id: u.id, expectedVersion: 1, name: 'B' }, ctx());
    await update.execute({ id: u.id, expectedVersion: 2, name: 'C' }, ctx());

    const hist = await sut.execute({ entityId: u.id, limit: 10 });
    expect(hist.entries).toHaveLength(3);
    expect(hist.entries[0].version).toBe(1);
    expect(hist.entries[1].version).toBe(2);
    expect(hist.entries[2].version).toBe(3);
    expect(hist.entries[2].operation).toBe('UPDATE');
  });
});
```

- [ ] **Step 2: GREEN — implementar**

```typescript
// apps/api/src/modules/users/application/use-cases/get-user-history.use-case.ts
import type { AuditServicePort } from '../../../../shared/audit/application/audit-service.port.js';

export interface GetUserHistoryInput {
  entityId: string;
  cursor?: string;
  limit: number;
}

export interface HistoryEntry {
  version: number;
  previousVersion: number | null;
  snapshot: Record<string, unknown>;
  operation: string;
  changedAt: Date;
  changedBy: string | null;
  reason: string | null;
}

export interface GetUserHistoryResult {
  entries: HistoryEntry[];
  nextCursor: string | null;
}

export class GetUserHistoryUseCase {
  constructor(private readonly audit: AuditServicePort) {}

  async execute(input: GetUserHistoryInput): Promise<GetUserHistoryResult> {
    const clampedLimit = Math.min(Math.max(input.limit, 1), 100);
    const result = await this.audit.listHistory({
      entityName: 'User',
      entityId: input.entityId,
      cursor: input.cursor,
      limit: clampedLimit,
