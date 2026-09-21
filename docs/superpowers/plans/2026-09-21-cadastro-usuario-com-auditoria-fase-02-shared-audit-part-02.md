# Fase 2 — Shared Audit (Parte 2/3)

> **Continuação** da Fase 2. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-02-shared-audit.md)
>
> Esta é a parte 2 de 3 da Fase 2. Pule para a próxima parte ao final.

---

    operation: AuditOperation;
    changedAt: Date;
    changedBy: string | null;
    reason: string | null;
  } | null>;

  /** Marca uma entidade como deletada (soft delete) com snapshot. */
  archive(input: {
    entityName: string;
    entityId: string;
    version: number;
    snapshot: Record<string, unknown>;
    reason?: string | null;
    ctx: AuditContext;
  }): Promise<void>;

  /** Lista entidades no archive (lixeira viva). */
  listArchive(input: {
    entityName: string;
    cursor?: string;
    limit: number;
  }): Promise<{
    entries: Array<{
      entityId: string;
      version: number;
      snapshot: Record<string, unknown>;
      deletedAt: Date;
      deletedBy: string | null;
      reason: string | null;
    }>;
    nextCursor: string | null;
  }>;

  /** Busca entrada do archive por entityId. */
  getArchiveEntry(input: {
    entityName: string;
    entityId: string;
  }): Promise<{
    entityId: string;
    version: number;
    snapshot: Record<string, unknown>;
    deletedAt: Date;
    deletedBy: string | null;
    reason: string | null;
  } | null>;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/shared/audit/application/audit-service.port.ts
git commit -m "feat(shared-audit): define AuditServicePort interface (DDD port)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 2.5: Mock do port para uso em testes unitários

**Files:**
- Create: `apps/api/src/shared/audit/application/in-memory-audit-service.ts`

- [ ] **Step 1: Criar implementação in-memory**

```typescript
// apps/api/src/shared/audit/application/in-memory-audit-service.ts
import {
  AuditOperation,
  AuditRecordInput,
  AuditServicePort,
} from './audit-service.port.js';
import { AuditContext } from '../domain/audit-context.vo.js';

/**
 * Implementação in-memory do AuditServicePort para testes unitários.
 * Armazena tudo em arrays; sem persistência.
 */
export class InMemoryAuditService implements AuditServicePort {
  public readonly history: Array<{
    entityName: string;
    entityId: string;
    version: number;
    previousVersion: number | null;
    operation: AuditOperation;
    snapshot: Record<string, unknown>;
    changedAt: Date;
    changedBy: string | null;
    reason: string | null;
  }> = [];

  public readonly archive: Array<{
    entityName: string;
    entityId: string;
    version: number;
    snapshot: Record<string, unknown>;
    deletedAt: Date;
    deletedBy: string | null;
    reason: string | null;
  }> = [];

  async record(input: AuditRecordInput, ctx: AuditContext): Promise<void> {
    this.history.push({
      entityName: input.entityName,
      entityId: input.entityId,
      version: input.newVersion,
      previousVersion: input.previousVersion,
      operation: input.operation,
      snapshot: input.snapshot,
      changedAt: ctx.timestamp,
      changedBy: ctx.actorId,
      reason: input.reason ?? null,
    });
  }

  async listHistory(input: {
    entityName: string;
    entityId: string;
    cursor?: string;
    limit: number;
  }) {
    const filtered = this.history.filter(
      (h) => h.entityName === input.entityName && h.entityId === input.entityId,
    );
    const start = input.cursor ? Number(input.cursor) : 0;
    const slice = filtered.slice(start, start + input.limit);
    const next = start + input.limit < filtered.length ? String(start + input.limit) : null;
    return { entries: slice, nextCursor: next };
  }

  async getHistoryEntry(input: { entityName: string; entityId: string; version: number }) {
    return (
      this.history.find(
        (h) =>
          h.entityName === input.entityName &&
          h.entityId === input.entityId &&
          h.version === input.version,
      ) ?? null
    );
  }

  async archive(input: {
    entityName: string;
    entityId: string;
    version: number;
    snapshot: Record<string, unknown>;
    reason?: string | null;
    ctx: AuditContext;
  }): Promise<void> {
    this.archive.push({
      entityName: input.entityName,
      entityId: input.entityId,
      version: input.version,
      snapshot: input.snapshot,
      deletedAt: input.ctx.timestamp,
      deletedBy: input.ctx.actorId,
      reason: input.reason ?? null,
    });
  }

  async listArchive(input: { entityName: string; cursor?: string; limit: number }) {
    const filtered = this.archive.filter((a) => a.entityName === input.entityName);
    const start = input.cursor ? Number(input.cursor) : 0;
    const slice = filtered.slice(start, start + input.limit);
    const next = start + input.limit < filtered.length ? String(start + input.limit) : null;
    return { entries: slice, nextCursor: next };
  }

  async getArchiveEntry(input: { entityName: string; entityId: string }) {
    return (
      this.archive.find(
        (a) => a.entityName === input.entityName && a.entityId === input.entityId,
      ) ?? null
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/shared/audit/application/in-memory-audit-service.ts
git commit -m "test(shared-audit): add InMemoryAuditService for unit tests

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 2.6: Teste unitário do InMemoryAuditService

**Files:**
- Create: `apps/api/src/shared/audit/application/in-memory-audit-service.spec.ts`

- [ ] **Step 1: Criar teste**

```typescript
// apps/api/src/shared/audit/application/in-memory-audit-service.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAuditService } from './in-memory-audit-service.js';
import { AuditContext } from '../domain/audit-context.vo.js';

describe('InMemoryAuditService', () => {
  let svc: InMemoryAuditService;
  let ctx: AuditContext;

  beforeEach(() => {
    svc = new InMemoryAuditService();
    ctx = new AuditContext({
      actorId: 'u-1',
      correlationId: 'c-1',
      source: 'http',
      timestamp: new Date('2026-09-21T10:00:00Z'),
    });
  });

  it('record adiciona entrada ao history', async () => {
    await svc.record(
      {
        entityName: 'User',
        entityId: 'u-99',
        operation: 'INSERT',
        previousVersion: null,
        newVersion: 1,
        snapshot: { id: 'u-99', email: 'a@b.com' },
      },
      ctx,
    );
    expect(svc.history).toHaveLength(1);
    expect(svc.history[0].version).toBe(1);
    expect(svc.history[0].operation).toBe('INSERT');
  });

  it('listHistory filtra por entityName + entityId', async () => {
    await svc.record(
      {
        entityName: 'User',
        entityId: 'u-1',
        operation: 'INSERT',
        previousVersion: null,
        newVersion: 1,
        snapshot: {},
      },
      ctx,
    );
    await svc.record(
      {
        entityName: 'Product',
        entityId: 'p-1',
        operation: 'INSERT',
        previousVersion: null,
        newVersion: 1,
        snapshot: {},
      },
      ctx,
    );
    const result = await svc.listHistory({ entityName: 'User', entityId: 'u-1', limit: 10 });
    expect(result.entries).toHaveLength(1);
  });
