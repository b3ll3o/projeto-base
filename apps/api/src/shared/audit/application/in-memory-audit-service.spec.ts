import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryAuditService } from './in-memory-audit-service.js';
import { AuditContext } from '../domain/audit-context.vo.js';
import type {
  ArchiveInput,
  AuditRecordInput,
  GetArchiveEntryInput,
  GetHistoryEntryInput,
  ListArchiveInput,
  ListHistoryInput,
} from './audit-service.port.js';

const makeCtx = (actorId: string | null = 'actor-1') =>
  new AuditContext({
    actorId,
    correlationId: 'corr-1',
    source: 'http',
    timestamp: new Date('2026-09-21T10:00:00.000Z'),
  });

describe('InMemoryAuditService', () => {
  let svc: InMemoryAuditService;
  const PAGE_SIZE = 2;

  beforeEach(() => {
    svc = new InMemoryAuditService();
  });

  it('record() adiciona entrada ao history com metadados do ctx', async () => {
    const input: AuditRecordInput = {
      entityName: 'User',
      entityId: 'u1',
      operation: 'INSERT',
      previousVersion: null,
      newVersion: 1,
      snapshot: { id: 'u1', email: 'a@b.com' },
    };
    await svc.record(input, makeCtx('actor-42'));
    expect(svc.history).toHaveLength(1);
    expect(svc.history[0]).toMatchObject({
      entityId: 'u1',
      version: 1,
      previousVersion: null,
      operation: 'INSERT',
      changedBy: 'actor-42',
      reason: null,
    });
    expect(svc.history[0]!.snapshot).toEqual({ id: 'u1', email: 'a@b.com' });
  });

  it('listHistory() filtra por entityId e pagina por cursor', async () => {
    const ctx = makeCtx();
    for (let v = 1; v <= 5; v++) {
      await svc.record(
        {
          entityName: 'User',
          entityId: 'u1',
          operation: v === 1 ? 'INSERT' : 'UPDATE',
          previousVersion: v === 1 ? null : v - 1,
          newVersion: v,
          snapshot: { id: 'u1', v },
        },
        ctx,
      );
    }
    await svc.record(
      {
        entityName: 'User',
        entityId: 'u2',
        operation: 'INSERT',
        previousVersion: null,
        newVersion: 1,
        snapshot: { id: 'u2' },
      },
      ctx,
    );

    const page1 = await svc.listHistory({
      entityName: 'User',
      entityId: 'u1',
      limit: PAGE_SIZE,
    } satisfies ListHistoryInput);
    expect(page1.entries).toHaveLength(2);
    expect(page1.entries.map((e) => e.version)).toEqual([1, 2]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await svc.listHistory({
      entityName: 'User',
      entityId: 'u1',
      cursor: page1.nextCursor,
      limit: PAGE_SIZE,
    } satisfies ListHistoryInput);
    expect(page2.entries.map((e) => e.version)).toEqual([3, 4]);
    expect(page2.nextCursor).not.toBeNull();

    const page3 = await svc.listHistory({
      entityName: 'User',
      entityId: 'u1',
      cursor: page2.nextCursor,
      limit: PAGE_SIZE,
    } satisfies ListHistoryInput);
    expect(page3.entries.map((e) => e.version)).toEqual([5]);
    expect(page3.nextCursor).toBeNull();
  });

  it('archive() insere; segunda chamada faz upsert (substitui)', async () => {
    const ctx = makeCtx('actor-A');
    const input1: ArchiveInput = {
      entityName: 'User',
      entityId: 'u1',
      version: 4,
      snapshot: { id: 'u1', v: 4 },
      ctx,
    };
    await svc.archive(input1);
    expect(svc.archives).toHaveLength(1);
    expect(svc.archives[0]).toMatchObject({
      entityId: 'u1',
      version: 4,
      deletedBy: 'actor-A',
      reason: null,
    });

    const ctx2 = makeCtx('actor-B');
    const input2: ArchiveInput = {
      entityName: 'User',
      entityId: 'u1',
      version: 4,
      snapshot: { id: 'u1', v: 4 },
      reason: 'duplicate-archive',
      ctx: ctx2,
    };
    await svc.archive(input2);
    expect(svc.archives).toHaveLength(1);
    expect(svc.archives[0]).toMatchObject({
      deletedBy: 'actor-B',
      reason: 'duplicate-archive',
    });
  });

  it('getHistoryEntry() retorna null quando (entityId, version) não existe', async () => {
    const ctx = makeCtx();
    await svc.record(
      {
        entityName: 'User',
        entityId: 'u1',
        operation: 'INSERT',
        previousVersion: null,
        newVersion: 1,
        snapshot: { id: 'u1' },
      },
      ctx,
    );
    const found = await svc.getHistoryEntry({
      entityName: 'User',
      entityId: 'u1',
      version: 1,
    } satisfies GetHistoryEntryInput);
    expect(found).not.toBeNull();
    expect(found?.version).toBe(1);

    const missing = await svc.getHistoryEntry({
      entityName: 'User',
      entityId: 'u1',
      version: 99,
    } satisfies GetHistoryEntryInput);
    expect(missing).toBeNull();

    const wrongEntity = await svc.getHistoryEntry({
      entityName: 'User',
      entityId: 'uX',
      version: 1,
    } satisfies GetHistoryEntryInput);
    expect(wrongEntity).toBeNull();
  });

  it('listArchive() pagina por cursor; getArchiveEntry() retorna null quando ausente', async () => {
    const ctx = makeCtx();
    for (const id of ['a', 'b', 'c']) {
      await svc.archive({
        entityName: 'User',
        entityId: id,
        version: 1,
        snapshot: { id },
        ctx,
      } satisfies ArchiveInput);
    }
    const page1 = await svc.listArchive({
      entityName: 'User',
      limit: PAGE_SIZE,
    } satisfies ListArchiveInput);
    expect(page1.entries).toHaveLength(2);
    expect(page1.entries.map((e) => e.entityId)).toEqual(['a', 'b']);
    expect(page1.nextCursor).not.toBeNull();

    const found = await svc.getArchiveEntry({
      entityName: 'User',
      entityId: 'a',
    } satisfies GetArchiveEntryInput);
    expect(found).not.toBeNull();

    const missing = await svc.getArchiveEntry({
      entityName: 'User',
      entityId: 'zzz',
    } satisfies GetArchiveEntryInput);
    expect(missing).toBeNull();
  });

  it('listHistory() retorna entries=[] e nextCursor=null quando entityId não existe', async () => {
    const ctx = makeCtx();
    await svc.record(
      {
        entityName: 'User',
        entityId: 'u1',
        operation: 'INSERT',
        previousVersion: null,
        newVersion: 1,
        snapshot: { id: 'u1' },
      },
      ctx,
    );
    const page = await svc.listHistory({
      entityName: 'User',
      entityId: 'noSuchUser',
      limit: PAGE_SIZE,
    } satisfies ListHistoryInput);
    expect(page.entries).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it('archive() substitui APENAS o entityId correspondente (não afeta outros)', async () => {
    const ctx = makeCtx();
    await svc.archive({
      entityName: 'User',
      entityId: 'u1',
      version: 1,
      snapshot: { id: 'u1' },
      ctx,
    } satisfies ArchiveInput);
    await svc.archive({
      entityName: 'User',
      entityId: 'u2',
      version: 1,
      snapshot: { id: 'u2' },
      ctx,
    } satisfies ArchiveInput);
    expect(svc.archives.map((a) => a.entityId)).toEqual(['u1', 'u2']);

    // Re-archive u1 with different ctx — should only replace u1
    await svc.archive({
      entityName: 'User',
      entityId: 'u1',
      version: 2,
      snapshot: { id: 'u1', v: 2 },
      ctx: makeCtx('actor-X'),
    } satisfies ArchiveInput);
    expect(svc.archives).toHaveLength(2);
    expect(svc.archives.map((a) => a.entityId)).toEqual(['u1', 'u2']);
    expect(svc.archives.find((a) => a.entityId === 'u1')?.deletedBy).toBe('actor-X');
  });
});
