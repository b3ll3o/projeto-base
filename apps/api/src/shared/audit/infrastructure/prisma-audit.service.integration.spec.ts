// apps/api/src/shared/audit/infrastructure/prisma-audit.service.integration.spec.ts
//
// Testes de integração do PrismaAuditService usando Testcontainers.
//
// - Sobe postgres:16-alpine no beforeAll (container compartilhado via singleFork)
// - Aplica migrations Prisma via `prisma migrate deploy`
// - Trunca tabelas entre testes (cleanDatabase)
// - Cobre o contrato do AuditServicePort:
//   - record() insere em users_history com metadata do ctx
//   - listHistory() filtra por entityId e pagina por cursor (id)
//   - getHistoryEntry() lookup por composite unique (entityId, version)
//   - archive() faz upsert por entityId (substitui version/snapshot/metadata)
//   - listArchive() pagina por cursor (id); getArchiveEntry() lookup por entityId
//
// pt-BR: orderBy `version asc` em users_history é estável porque (entityId,
// version) é unique — não empata. Para archive usamos `deletedAt desc`, e o
// id UUID como tiebreaker implícito. Todos os entityId/actorId são UUIDs v7
// válidos porque as colunas Prisma são `@db.Uuid`.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  setupTestDatabase,
  cleanDatabase,
  type TestContext,
} from '../../../../test/testcontainers-helper.js';
import { PrismaAuditService } from './prisma-audit.service.js';
import { AuditContext } from '../domain/audit-context.vo.js';

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

  const ACTOR_1 = '0190a8b6-aaaa-7bbb-9ccc-000000000001';
  const ACTOR_A = '0190a8b6-aaaa-7bbb-9ccc-00000000000a';
  const ACTOR_B = '0190a8b6-aaaa-7bbb-9ccc-00000000000b';
  const ENTITY_U1 = '0190a8b6-1234-7abc-9def-000000000001';
  const ENTITY_U2 = '0190a8b6-1234-7abc-9def-000000000002';
  const ENTITY_A = '0190a8b6-1234-7abc-9def-00000000000a';
  const ENTITY_B = '0190a8b6-1234-7abc-9def-00000000000b';
  const ENTITY_C = '0190a8b6-1234-7abc-9def-00000000000c';
  const ENTITY_MISSING = '0190a8b6-1234-7abc-9def-0000000000ff';

  const ctxAudit = (actorId: string | null = ACTOR_1): AuditContext =>
    new AuditContext({
      actorId,
      correlationId: 'corr-1',
      source: 'http',
      timestamp: new Date('2026-09-21T10:00:00Z'),
    });

  it('record insere em user_history com metadata do ctx', async () => {
    await svc.record(
      {
        entityName: 'User',
        entityId: ENTITY_U1,
        operation: 'INSERT',
        previousVersion: null,
        newVersion: 1,
        snapshot: { id: ENTITY_U1, email: 'a@b.com' },
      },
      ctxAudit(ACTOR_1),
    );

    const row = await ctx.prisma.userHistory.findFirst({});
    expect(row).not.toBeNull();
    expect(row!.operation).toBe('INSERT');
    expect(row!.version).toBe(1);
    expect(row!.previousVersion).toBeNull();
    expect(row!.changedBy).toBe(ACTOR_1);
    expect(row!.snapshot).toEqual({ id: ENTITY_U1, email: 'a@b.com' });
  });

  it('listHistory filtra por entityId e pagina por cursor', async () => {
    const baseCtx = ctxAudit();
    for (let v = 1; v <= 5; v++) {
      await svc.record(
        {
          entityName: 'User',
          entityId: ENTITY_U1,
          operation: v === 1 ? 'INSERT' : 'UPDATE',
          previousVersion: v === 1 ? null : v - 1,
          newVersion: v,
          snapshot: { id: ENTITY_U1, v },
        },
        baseCtx,
      );
    }
    await svc.record(
      {
        entityName: 'User',
        entityId: ENTITY_U2,
        operation: 'INSERT',
        previousVersion: null,
        newVersion: 1,
        snapshot: { id: ENTITY_U2 },
      },
      baseCtx,
    );

    const page1 = await svc.listHistory({
      entityName: 'User',
      entityId: ENTITY_U1,
      limit: 2,
    });
    expect(page1.entries).toHaveLength(2);
    expect(page1.entries.map((e) => e.version)).toEqual([1, 2]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await svc.listHistory({
      entityName: 'User',
      entityId: ENTITY_U1,
      cursor: page1.nextCursor,
      limit: 2,
    });
    expect(page2.entries.map((e) => e.version)).toEqual([3, 4]);
    expect(page2.nextCursor).not.toBeNull();

    const page3 = await svc.listHistory({
      entityName: 'User',
      entityId: ENTITY_U1,
      cursor: page2.nextCursor,
      limit: 2,
    });
    expect(page3.entries).toHaveLength(1);
    expect(page3.entries[0]?.version).toBe(5);
    expect(page3.nextCursor).toBeNull();
  });

  it('getHistoryEntry retorna entrada específica via composite unique (entityId, version)', async () => {
    await svc.record(
      {
        entityName: 'User',
        entityId: ENTITY_U1,
        operation: 'INSERT',
        previousVersion: null,
        newVersion: 1,
        snapshot: { a: 1 },
      },
      ctxAudit(),
    );

    const found = await svc.getHistoryEntry({
      entityName: 'User',
      entityId: ENTITY_U1,
      version: 1,
    });
    expect(found).not.toBeNull();
    expect(found?.version).toBe(1);
    expect(found?.snapshot).toEqual({ a: 1 });

    const missing = await svc.getHistoryEntry({
      entityName: 'User',
      entityId: ENTITY_U1,
      version: 99,
    });
    expect(missing).toBeNull();
  });

  it('archive insere; segunda chamada faz upsert (substitui)', async () => {
    const ctx1 = ctxAudit(ACTOR_A);
    await svc.archive({
      entityName: 'User',
      entityId: ENTITY_U1,
      version: 4,
      snapshot: { id: ENTITY_U1, v: 4 },
      ctx: ctx1,
    });
    let row = await ctx.prisma.userArchive.findFirst({ where: { entityId: ENTITY_U1 } });
    expect(row).not.toBeNull();
    expect(row!.version).toBe(4);
    expect(row!.deletedBy).toBe(ACTOR_A);
    expect(row!.reason).toBeNull();

    const ctx2 = ctxAudit(ACTOR_B);
    await svc.archive({
      entityName: 'User',
      entityId: ENTITY_U1,
      version: 5,
      snapshot: { id: ENTITY_U1, v: 5 },
      reason: 're-archive after restore',
      ctx: ctx2,
    });
    row = await ctx.prisma.userArchive.findFirst({ where: { entityId: ENTITY_U1 } });
    expect(row!.version).toBe(5);
    expect(row!.deletedBy).toBe(ACTOR_B);
    expect(row!.reason).toBe('re-archive after restore');

    const total = await ctx.prisma.userArchive.count();
    expect(total).toBe(1);
  });

  it('listArchive pagina por cursor; getArchiveEntry retorna null quando ausente', async () => {
    await svc.archive({
      entityName: 'User',
      entityId: ENTITY_A,
      version: 1,
      snapshot: { id: ENTITY_A },
      ctx: ctxAudit(),
    });
    await svc.archive({
      entityName: 'User',
      entityId: ENTITY_B,
      version: 1,
      snapshot: { id: ENTITY_B },
      ctx: ctxAudit(),
    });
    await svc.archive({
      entityName: 'User',
      entityId: ENTITY_C,
      version: 1,
      snapshot: { id: ENTITY_C },
      ctx: ctxAudit(),
    });

    const page1 = await svc.listArchive({ entityName: 'User', limit: 2 });
    expect(page1.entries).toHaveLength(2);
    expect(page1.entries.map((e) => e.entityId)).toEqual([ENTITY_A, ENTITY_B]);
    expect(page1.nextCursor).not.toBeNull();

    const found = await svc.getArchiveEntry({ entityName: 'User', entityId: ENTITY_A });
    expect(found).not.toBeNull();
    expect(found?.entityId).toBe(ENTITY_A);

    const missing = await svc.getArchiveEntry({ entityName: 'User', entityId: ENTITY_MISSING });
    expect(missing).toBeNull();
  });
});
