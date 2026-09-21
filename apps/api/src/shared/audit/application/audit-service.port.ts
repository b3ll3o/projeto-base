/**
 * AuditServicePort — interface do port (DDD).
 *
 * Define o contrato que o domínio consome para registrar e consultar
 * auditoria. A implementação concreta (InMemory no teste, Prisma em prod)
 * é resolvida por DI via token AUDIT_SERVICE_PORT.
 *
 * pt-BR: domain não conhece a infraestrutura; este port é o limite.
 */

import type { AuditContext } from '../domain/audit-context.vo.js';

export type AuditOperation = 'INSERT' | 'UPDATE' | 'DELETE' | 'RESTORE';

export interface AuditRecordInput {
  entityName: string;
  entityId: string;
  operation: AuditOperation;
  previousVersion: number | null;
  newVersion: number;
  snapshot: Record<string, unknown>;
  reason?: string | null;
}

export interface HistoryEntry {
  entityId: string;
  version: number;
  previousVersion: number | null;
  operation: AuditOperation;
  snapshot: Record<string, unknown>;
  changedAt: Date;
  changedBy: string | null;
  reason: string | null;
}

export interface ArchiveEntry {
  entityId: string;
  version: number;
  snapshot: Record<string, unknown>;
  deletedAt: Date;
  deletedBy: string | null;
  reason: string | null;
}

export interface ListHistoryInput {
  entityName: string;
  entityId: string;
  cursor?: string | null;
  limit: number;
}

export interface GetHistoryEntryInput {
  entityName: string;
  entityId: string;
  version: number;
}

export interface ArchiveInput {
  entityName: string;
  entityId: string;
  version: number;
  snapshot: Record<string, unknown>;
  reason?: string | null;
  ctx: AuditContext;
}

export interface ListArchiveInput {
  entityName: string;
  cursor?: string | null;
  limit: number;
}

export interface GetArchiveEntryInput {
  entityName: string;
  entityId: string;
}

/**
 * Contrato que o domínio consome.
 * Implementações: InMemoryAuditService (Fase 2), PrismaAuditService (Fase 6).
 */
export interface AuditServicePort {
  record(input: AuditRecordInput, ctx: AuditContext): Promise<void>;

  listHistory(
    input: ListHistoryInput,
  ): Promise<{ entries: HistoryEntry[]; nextCursor: string | null }>;

  getHistoryEntry(input: GetHistoryEntryInput): Promise<HistoryEntry | null>;

  archive(input: ArchiveInput): Promise<void>;

  listArchive(
    input: ListArchiveInput,
  ): Promise<{ entries: ArchiveEntry[]; nextCursor: string | null }>;

  getArchiveEntry(input: GetArchiveEntryInput): Promise<ArchiveEntry | null>;
}
