/**
 * InMemoryAuditService — implementação in-memory do AuditServicePort.
 *
 * Usado em testes unitários de use cases (Fase 5+). Não thread-safe.
 * Armazena history + archive como arrays simples; cursor = offset numérico
 * stringificado.
 *
 * pt-BR: substituir por PrismaAuditService em produção via DI binding.
 */

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
} from './audit-service.port.js';

export class InMemoryAuditService implements AuditServicePort {
  public readonly history: HistoryEntry[] = [];
  public readonly archives: ArchiveEntry[] = [];

  async record(input: AuditRecordInput, ctx: AuditContext): Promise<void> {
    const entry: HistoryEntry = {
      entityId: input.entityId,
      version: input.newVersion,
      previousVersion: input.previousVersion,
      operation: input.operation,
      snapshot: input.snapshot,
      changedAt: ctx.timestamp,
      changedBy: ctx.actorId,
      reason: input.reason ?? null,
    };
    this.history.push(entry);
  }

  async listHistory(
    input: ListHistoryInput,
  ): Promise<{ entries: HistoryEntry[]; nextCursor: string | null }> {
    const filtered = this.history.filter((e) => e.entityId === input.entityId);
    const offset = input.cursor ? Number(input.cursor) : 0;
    const limit = Math.max(1, input.limit);
    const page = filtered.slice(offset, offset + limit);
    const nextOffset = offset + limit;
    const nextCursor = nextOffset < filtered.length ? String(nextOffset) : null;
    return { entries: page, nextCursor };
  }

  async getHistoryEntry(input: GetHistoryEntryInput): Promise<HistoryEntry | null> {
    return (
      this.history.find((e) => e.entityId === input.entityId && e.version === input.version) ?? null
    );
  }

  async archive(input: ArchiveInput): Promise<void> {
    // upsert by entityId (only one archive per entity)
    const existingIdx = this.archives.findIndex((e) => e.entityId === input.entityId);
    const entry: ArchiveEntry = {
      entityId: input.entityId,
      version: input.version,
      snapshot: input.snapshot,
      deletedAt: input.ctx.timestamp,
      deletedBy: input.ctx.actorId,
      reason: input.reason ?? null,
    };
    if (existingIdx >= 0) {
      this.archives[existingIdx] = entry;
    } else {
      this.archives.push(entry);
    }
  }

  async listArchive(
    input: ListArchiveInput,
  ): Promise<{ entries: ArchiveEntry[]; nextCursor: string | null }> {
    const offset = input.cursor ? Number(input.cursor) : 0;
    const limit = Math.max(1, input.limit);
    const page = this.archives.slice(offset, offset + limit);
    const nextOffset = offset + limit;
    const nextCursor = nextOffset < this.archives.length ? String(nextOffset) : null;
    return { entries: page, nextCursor };
  }

  async getArchiveEntry(input: GetArchiveEntryInput): Promise<ArchiveEntry | null> {
    return this.archives.find((e) => e.entityId === input.entityId) ?? null;
  }
}
