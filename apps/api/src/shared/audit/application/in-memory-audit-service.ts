/**
 * InMemoryAuditService — implementação in-memory do AuditServicePort.
 *
 * Usado em testes unitários de use cases (Fase 5+). Não thread-safe.
 * Armazena history + archive como arrays simples.
 *
 * pt-BR (2026-11-17): o cursor da trilha é o **id da LINHA** — o mesmo que a
 * produção devolve (`users_history.id`) — e o `HistoryEntry` passou a carregá-lo
 * para que o duplo pudesse devolvê-lo. Antes, o duplo usava um **offset
 * numérico** (`"20"`), que a API recusa com 400 (`PaginacaoQuerySchema` exige
 * uuid): o contrato era cumprido só pela implementação de produção, e um
 * teste feito contra o duplo não media o contrato. O `archive` continua com
 * offset — o archive não é paginado por cursor na API.
 *
 * pt-BR: substituir por PrismaAuditService em produção via DI binding.
 */

import { randomUUID } from 'node:crypto';
import type { AuditContext } from '../domain/audit-context.vo.js';
import { AuditCursorInvalidoException } from '../domain/audit.exceptions.js';
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
      id: randomUUID(),
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

  // pt-BR (Fase 10+, 2026-10-17): as quatro leituras recebem `tenantId` para
  // casar com `AuditServicePort`, mas o duplo NÃO filtra por empresa. Ele não
  // tem como: `HistoryEntry`/`ArchiveEntry` não carregam `tenantId`, e
  // inventar um filtro aqui exigiria um `tenantId` sintético nas entradas — que
  // é contrato de domínio novo, não fiação. O filtro que vale é a policy; o
  // `PrismaAuditService` é quem o executa. Mesma lacuna já registrada para
  // `InMemoryUserRepository.list(input, _tenantId)`.
  //
  // ⚠️ O cursor é o **id da linha**, e ele é resolvido **dentro da entidade** —
  // o mesmo contrato do `PrismaAuditService`, para que um teste feito contra o
  // duplo meça o mesmo contrato que a produção cumpre.
  async listHistory(
    input: ListHistoryInput,
    _tenantId: string | null,
  ): Promise<{ entries: HistoryEntry[]; nextCursor: string | null }> {
    const ordem = input.ordem ?? 'asc';
    const filtradas = this.history.filter((e) => e.entityId === input.entityId);
    const ordenadas = [...filtradas].sort((a, b) =>
      ordem === 'desc' ? b.version - a.version : a.version - b.version,
    );

    let restantes = ordenadas;
    if (input.cursor !== null && input.cursor !== undefined && input.cursor !== '') {
      const indice = ordenadas.findIndex((e) => e.id === input.cursor);
      if (indice < 0) {
        throw new AuditCursorInvalidoException({ entityId: input.entityId, cursor: input.cursor });
      }
      restantes = ordenadas.slice(indice + 1);
    }

    const limit = Math.max(1, input.limit);
    const page = restantes.slice(0, limit);
    const last = page[page.length - 1];
    return {
      entries: page,
      nextCursor: restantes.length > limit && last !== undefined ? last.id : null,
    };
  }

  async getHistoryEntry(
    input: GetHistoryEntryInput,
    _tenantId: string | null,
  ): Promise<HistoryEntry | null> {
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
    _tenantId: string | null,
  ): Promise<{ entries: ArchiveEntry[]; nextCursor: string | null }> {
    const offset = input.cursor ? Number(input.cursor) : 0;
    const limit = Math.max(1, input.limit);
    const page = this.archives.slice(offset, offset + limit);
    const nextOffset = offset + limit;
    const nextCursor = nextOffset < this.archives.length ? String(nextOffset) : null;
    return { entries: page, nextCursor };
  }

  async getArchiveEntry(
    input: GetArchiveEntryInput,
    _tenantId: string | null,
  ): Promise<ArchiveEntry | null> {
    return this.archives.find((e) => e.entityId === input.entityId) ?? null;
  }
}
