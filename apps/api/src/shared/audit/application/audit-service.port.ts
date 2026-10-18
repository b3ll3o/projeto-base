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
 *
 * pt-BR (Fase 10+, 2026-10-17) — o escopo de tenant das LEITURAS:
 * `tenantId` é o segundo argumento das três leituras, e é `string | null`
 * porque `null` é o bucket de SISTEMA, não "sem escopo". As DUAS escritas não
 * o recebem: elas já carregam `AuditContext`, que passou a ter `tenantId`
 * (ver `AuditContextProps`) — e é justamente por isso que o escopo é o mesmo
 * dado do ator, e não um argumento que pode divergir dele.
 *
 * Por que as leituras precisaram e antes não: `users_history.entity_id` é o
 * uuid do usuário, então ler histórico cross-tenant é o que entregava o
 * material da escalada descrita na §3 da migration `20261020000001`.
 */
export interface AuditServicePort {
  record(input: AuditRecordInput, ctx: AuditContext): Promise<void>;

  listHistory(
    input: ListHistoryInput,
    tenantId: string | null,
  ): Promise<{ entries: HistoryEntry[]; nextCursor: string | null }>;

  getHistoryEntry(
    input: GetHistoryEntryInput,
    tenantId: string | null,
  ): Promise<HistoryEntry | null>;

  archive(input: ArchiveInput): Promise<void>;

  listArchive(
    input: ListArchiveInput,
    tenantId: string | null,
  ): Promise<{ entries: ArchiveEntry[]; nextCursor: string | null }>;

  getArchiveEntry(
    input: GetArchiveEntryInput,
    tenantId: string | null,
  ): Promise<ArchiveEntry | null>;
}
