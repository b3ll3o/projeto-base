# Fase 6 — User Infra Persistence (Parte 3/4)

> **Continuação** da Fase 6. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-06-user-infra-persistence.md)
>
> Esta é a parte 3 de 4 da Fase 6. Pule para a próxima parte ao final.

---

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!row || row.deletedAt !== null) return null;
    return UserPrismaMapper.toDomain(row);
  }

  async updateWithLock(
    user: User,
    expectedVersion: number,
  ): Promise<void> {
    const row = UserPrismaMapper.toPersistence(user);
    const updated = await this.prisma.user.updateMany({
      where: { id: user.id.value, version: expectedVersion },
      data: { ...row, version: expectedVersion + 1 },
    });
    if (updated.count === 0) {
      const actual = await this.prisma.user.findUnique({
        where: { id: user.id.value },
      });
      throw new ConcurrencyException(expectedVersion, actual?.version ?? null);
    }
  }

  async list(input: { cursor?: string; limit: number; includeDeleted?: boolean }): Promise<{
    users: User[];
    nextCursor: string | null;
  }> {
    const where = input.includeDeleted ? {} : { deletedAt: null };
    const cursor = input.cursor ? { id: input.cursor } : undefined;
    const rows = await this.prisma.user.findMany({
      where,
      ...(cursor ? { cursor, skip: 1 } : {}),
      take: input.limit + 1,
      orderBy: { createdAt: 'desc' },
    });
    const hasMore = rows.length > input.limit;
    const data = hasMore ? rows.slice(0, input.limit) : rows;
    return {
      users: data.map((r) => UserPrismaMapper.toDomain(r)),
      nextCursor: hasMore ? data[data.length - 1].id : null,
    };
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const updated = await this.prisma.user.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: expectedVersion + 1 },
    });
    if (updated.count === 0) {
      const actual = await this.prisma.user.findUnique({ where: { id } });
      if (!actual) throw new UserNotFoundException(id);
      throw new ConcurrencyException(expectedVersion, actual.version);
    }
  }

  async restore(id: string, expectedVersion: number): Promise<User> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    if (!row) throw new UserNotFoundException(id);
    if (row.version !== expectedVersion) {
      throw new ConcurrencyException(expectedVersion, row.version);
    }
    const updated = await this.prisma.user.updateMany({
      where: { id, version: expectedVersion, deletedAt: { not: null } },
      data: { deletedAt: null, version: expectedVersion + 1 },
    });
    if (updated.count === 0) {
      throw new ConcurrencyException(expectedVersion, row.version);
    }
    const refreshed = await this.prisma.user.findUnique({ where: { id } });
    return UserPrismaMapper.toDomain(refreshed!);
  }
}
```

- [ ] **Step 5: Configurar vitest integration**

```typescript
// apps/api/vitest.config.ts — adicionar
test: {
  // ...
  projects: [
    {
      test: {
        name: 'unit',
        include: ['src/**/*.spec.ts'],
        exclude: ['src/**/*.integration.spec.ts', 'src/**/*.testcontainers.spec.ts'],
      },
    },
    {
      test: {
        name: 'integration',
        include: ['src/**/*.integration.spec.ts', 'src/**/*.testcontainers.spec.ts'],
        testTimeout: 60_000,
        hookTimeout: 60_000,
        pool: 'forks',
        poolOptions: { forks: { singleFork: true } },
      },
    },
  ],
}
```

- [ ] **Step 6: Renomear arquivo de teste para `.integration.spec.ts`**

```bash
mv apps/api/src/modules/users/infrastructure/persistence/prisma-user.repository.spec.ts \
   apps/api/src/modules/users/infrastructure/persistence/prisma-user.repository.integration.spec.ts
```

- [ ] **Step 7: Rodar + commit**

Run: `pnpm --filter @projeto/api test:integration -- prisma-user 2>&1 | tail -10`
Expected: 3 passed.

```bash
git add apps/api/src/modules/users/infrastructure/persistence/prisma-user.repository.ts apps/api/src/modules/users/infrastructure/persistence/prisma-user.repository.integration.spec.ts apps/api/test apps/api/vitest.config.ts
git commit -m "feat(users-infra): add PrismaUserRepository with optimistic locking (Testcontainers)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 6.7: PrismaAuditService (implementação real do AuditServicePort)

**Files:**
- Create: `apps/api/src/shared/audit/infrastructure/prisma-audit.service.ts`
- Create: `apps/api/src/shared/audit/infrastructure/prisma-audit.service.integration.spec.ts`

- [ ] **Step 1: RED — teste de integração**

```typescript
// apps/api/src/shared/audit/infrastructure/prisma-audit.service.integration.spec.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDatabase, cleanDatabase, type TestContext } from '../../../../test/testcontainers-helper.js';
import { PrismaAuditService } from './prisma-audit.service.js';
import { AuditContext } from '../domain/audit-context.vo.js';
import { AuditHistoryNotFoundException } from '../domain/audit.exceptions.js';

describe('PrismaAuditService (Testcontainers)', () => {
  let ctx: TestContext;
  let svc: PrismaAuditService;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
  });
  afterAll(async () => {
    await ctx.stop();
  });
  beforeEach(async () => {
    await cleanDatabase(ctx.prisma);
    svc = new PrismaAuditService(ctx.prisma);
  });

  const ctxAudit = () =>
    new AuditContext({
      actorId: 'u-1',
      correlationId: 'corr',
      source: 'http',
      timestamp: new Date('2026-09-21T10:00:00Z'),
    });

  it('record insere em user_history', async () => {
    await svc.record(
      {
        entityName: 'User',
        entityId: '0190a8b6-1234-7abc-9def-000000000001',
        operation: 'INSERT',
        previousVersion: null,
        newVersion: 1,
        snapshot: { id: 'x' },
      },
      ctxAudit(),
    );
    const row = await ctx.prisma.userHistory.findFirst({});
    expect(row?.operation).toBe('INSERT');
    expect(row?.version).toBe(1);
  });

  it('archive insere em user_archive', async () => {
    await svc.archive({
      entityName: 'User',
      entityId: '0190a8b6-1234-7abc-9def-000000000002',
      version: 3,
      snapshot: { deleted: true },
      ctx: ctxAudit(),
    });
    const row = await ctx.prisma.userArchive.findFirst({});
    expect(row?.version).toBe(3);
  });

  it('getHistoryEntry retorna entrada específica', async () => {
    await svc.record(
      {
        entityName: 'User',
        entityId: 'e1',
        operation: 'INSERT',
        previousVersion: null,
        newVersion: 1,
        snapshot: { a: 1 },
      },
      ctxAudit(),
    );
    const entry = await svc.getHistoryEntry({
      entityName: 'User',
      entityId: 'e1',
      version: 1,
    });
    expect(entry?.snapshot).toEqual({ a: 1 });
  });
});
```

- [ ] **Step 2: Implementar `PrismaAuditService`**

```typescript
// apps/api/src/shared/audit/infrastructure/prisma-audit.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaClient, AuditOperation as PrismaAuditOp } from '@prisma/client';
import type {
  AuditOperation,
  AuditRecordInput,
  AuditServicePort,
} from '../application/audit-service.port.js';
import type { AuditContext } from '../domain/audit-context.vo.js';

const OP_MAP: Record<AuditOperation, PrismaAuditOp> = {
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  RESTORE: 'RESTORE',
};

const REVERSE_OP_MAP: Record<PrismaAuditOp, AuditOperation> = {
  INSERT: 'INSERT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  RESTORE: 'RESTORE',
};

@Injectable()
export class PrismaAuditService implements AuditServicePort {
  constructor(private readonly prisma: PrismaClient) {}

  async record(input: AuditRecordInput, ctx: AuditContext): Promise<void> {
    await this.prisma.userHistory.create({
      data: {
        entityId: input.entityId,
        version: input.newVersion,
        previousVersion: input.previousVersion,
        operation: OP_MAP[input.operation],
        snapshot: input.snapshot as any,
        changedAt: ctx.timestamp,
        changedBy: ctx.actorId,
        reason: input.reason ?? null,
      },
    });
  }

  async listHistory(input: { entityName: string; entityId: string; cursor?: string; limit: number }) {
    const cursor = input.cursor ? { id: input.cursor } : undefined;
    const rows = await this.prisma.userHistory.findMany({
      where: { entityId: input.entityId },
      ...(cursor ? { cursor, skip: 1 } : {}),
      take: input.limit + 1,
      orderBy: [{ version: 'desc' }],
    });
    const hasMore = rows.length > input.limit;
    const data = hasMore ? rows.slice(0, input.limit) : rows;
    return {
      entries: data.map((r) => ({
        version: r.version,
        previousVersion: r.previousVersion,
        snapshot: r.snapshot as Record<string, unknown>,
        operation: REVERSE_OP_MAP[r.operation],
        changedAt: r.changedAt,
        changedBy: r.changedBy,
        reason: r.reason,
