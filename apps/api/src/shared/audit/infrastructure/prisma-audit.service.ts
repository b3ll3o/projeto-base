// apps/api/src/shared/audit/infrastructure/prisma-audit.service.ts
//
// Implementação Prisma do AuditServicePort (Fase 6).
//
// - record(): insere uma linha em users_history por mutação do agregado.
// - listHistory() / getHistoryEntry(): leitura paginada por cursor (id) + leitura
//   por (entityId, version).
// - archive(): upsert em users_archive — re-arquivar substitui version/snapshot
//   e metadata (deletedAt/deletedBy/reason).
// - listArchive() / getArchiveEntry(): leitura paginada por cursor (id) + lookup
//   por entityId (PK funcional única do archive).
//
// pt-BR: Schema do Prisma tem o enum `AuditOperation` que espelha 1:1 o tipo
// do domínio — sem necessidade de mapping. Snapshots são JSONB; usamos cast
// `Prisma.InputJsonValue` na escrita para satisfazer o tipo do client, e
// `Record<string, unknown>` na leitura (assimetria intencional no IO boundary).

import { Inject, Injectable } from '@nestjs/common';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service.js';
import type { AuditContext } from '../domain/audit-context.vo.js';
import type {
  ArchiveEntry,
  ArchiveInput,
  AuditRecordInput,
  AuditServicePort,
  GetArchiveEntryInput,
  GetHistoryEntryInput,
  HistoryEntry,
  ListArchiveInput,
  ListHistoryInput,
} from '../application/audit-service.port.js';

@Injectable()
export class PrismaAuditService implements AuditServicePort {
  /**
   * pt-BR: mesmo motivo do `PrismaUserRepository` — `@Inject(PrismaService)`
   * explícito para resolver o param tipado como `PrismaClient` (a classe
   * concreta registrada no container é `PrismaService`, subclasse de
   * `PrismaClient`).
   */
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  async record(input: AuditRecordInput, ctx: AuditContext): Promise<void> {
    await this.prisma.userHistory.create({
      data: {
        entityId: input.entityId,
        version: input.newVersion,
        previousVersion: input.previousVersion,
        operation: input.operation,
        snapshot: input.snapshot as Prisma.InputJsonValue,
        changedAt: ctx.timestamp,
        changedBy: ctx.actorId,
        reason: input.reason ?? null,
      },
    });
  }

  async listHistory(
    input: ListHistoryInput,
  ): Promise<{ entries: HistoryEntry[]; nextCursor: string | null }> {
    const cursor = input.cursor ? { id: input.cursor } : undefined;
    const rows = await this.prisma.userHistory.findMany({
      where: { entityId: input.entityId },
      ...(cursor ? { cursor, skip: 1 } : {}),
      take: input.limit + 1,
      orderBy: [{ version: 'asc' }],
    });
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page[page.length - 1];
    return {
      entries: page.map((r) => ({
        entityId: r.entityId,
        version: r.version,
        previousVersion: r.previousVersion,
        operation: r.operation,
        snapshot: r.snapshot as Record<string, unknown>,
        changedAt: r.changedAt,
        changedBy: r.changedBy,
        reason: r.reason,
      })),
      nextCursor: hasMore && last !== undefined ? last.id : null,
    };
  }

  async getHistoryEntry(input: GetHistoryEntryInput): Promise<HistoryEntry | null> {
    const row = await this.prisma.userHistory.findUnique({
      where: {
        entityId_version: { entityId: input.entityId, version: input.version },
      },
    });
    if (!row) return null;
    return {
      entityId: row.entityId,
      version: row.version,
      previousVersion: row.previousVersion,
      operation: row.operation,
      snapshot: row.snapshot as Record<string, unknown>,
      changedAt: row.changedAt,
      changedBy: row.changedBy,
      reason: row.reason,
    };
  }

  async archive(input: ArchiveInput): Promise<void> {
    await this.prisma.userArchive.upsert({
      where: { entityId: input.entityId },
      create: {
        entityId: input.entityId,
        version: input.version,
        snapshot: input.snapshot as Prisma.InputJsonValue,
        deletedAt: input.ctx.timestamp,
        deletedBy: input.ctx.actorId,
        reason: input.reason ?? null,
      },
      update: {
        version: input.version,
        snapshot: input.snapshot as Prisma.InputJsonValue,
        deletedAt: input.ctx.timestamp,
        deletedBy: input.ctx.actorId,
        reason: input.reason ?? null,
      },
    });
  }

  async listArchive(
    input: ListArchiveInput,
  ): Promise<{ entries: ArchiveEntry[]; nextCursor: string | null }> {
    const cursor = input.cursor ? { id: input.cursor } : undefined;
    const rows = await this.prisma.userArchive.findMany({
      ...(cursor ? { cursor, skip: 1 } : {}),
      take: input.limit + 1,
      orderBy: [{ deletedAt: 'desc' }],
    });
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page[page.length - 1];
    return {
      entries: page.map((r) => ({
        entityId: r.entityId,
        version: r.version,
        snapshot: r.snapshot as Record<string, unknown>,
        deletedAt: r.deletedAt,
        deletedBy: r.deletedBy,
        reason: r.reason,
      })),
      nextCursor: hasMore && last !== undefined ? last.id : null,
    };
  }

  async getArchiveEntry(input: GetArchiveEntryInput): Promise<ArchiveEntry | null> {
    const row = await this.prisma.userArchive.findUnique({
      where: { entityId: input.entityId },
    });
    if (!row) return null;
    return {
      entityId: row.entityId,
      version: row.version,
      snapshot: row.snapshot as Record<string, unknown>,
      deletedAt: row.deletedAt,
      deletedBy: row.deletedBy,
      reason: row.reason,
    };
  }
}
