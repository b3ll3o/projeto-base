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
import { comEscopoDeEmpresa } from '../../infrastructure/prisma/escopo.js';
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

  // pt-BR (Fase 10+, 2026-10-17) — POR QUE TODO MÉTODO ABRE ESCOPO AGORA.
  //
  // `users_history.entity_id` e `users_archive.entity_id` são o **uuid do
  // usuário**, e as duas tabelas passaram a ter RLS resolvida por
  // `usuario_no_escopo(entity_id)` (migration `20261020000002`). Sem escopo
  // aberto, `escopo_atual()` é `NULL` e `usuario_no_escopo` é FALSE para todo
  // mundo — o serviço inteiro viraria "zero linhas" silenciosamente, que é o
  // modo de falha que a §4.1 da migration `20261020000000` já descreveu.
  //
  // O escopo das DUAS escritas vem do `AuditContext` e o das TRÊS leituras vem
  // do parâmetro: é o mesmo valor nos dois caminhos, vindo de fontes diferentes
  // só porque uma já carregava o contexto e a outra não.

  //
  // ⚠️ #118: o escopo de sistema (`tenantId === null`) deixou de ser uma
  // simples tradução para `'*'`. A policy da tabela de auditoria exige
  // `current_user = 'app_system'`, e a sessão de RUNTIME não satisfaz isso —
  // ela enxerga ZERO linhas. MEDIDO: o teste "a sessão de SISTEMA continua
  // enxergando as duas" caía com 0 entradas onde esperava 2.
  //
  // A correção é a mesma do resto do #118: o escopo de sistema ABRE NA
  // CREDENCIAL DE SISTEMA, e o escopo de empresa continua na de runtime.
  // E o chamador NÃO escolhe a credencial — ela vem do ambiente.
  //
  // ⚠️ Por que o helper é `comEscopoDeEmpresa` e não um método daqui: ele é o
  // DONO da regra ("`tenantId` nulo é o bucket de SISTEMA, e o bucket de
  // SISTEMA é a CREDENCIAL de sistema"), o mesmo que os repositórios de
  // usuário, perfil, membership e autorização já usam. Este arquivo tinha uma
  // cópia PRÓPRIA do helper, e a cópia foi aplicada em QUATRO dos SEIS
  // métodos: `listHistory` e `archive` ficaram na tradução, e o
  // administrador do sistema perdia o histórico (vazio, em silêncio) e não
  // conseguia arquivar ninguém (500, `42501`) — DEPOIS do soft-delete já ter
  // sido gravado. MEDIDO no Postgres 16 real.

  async record(input: AuditRecordInput, ctx: AuditContext): Promise<void> {
    await comEscopoDeEmpresa(this.prisma, ctx.tenantId, (tx) =>
      tx.userHistory.create({
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
      }),
    );
  }

  async listHistory(
    input: ListHistoryInput,
    tenantId: string | null,
  ): Promise<{ entries: HistoryEntry[]; nextCursor: string | null }> {
    const cursor = input.cursor ? { id: input.cursor } : undefined;
    const rows = await comEscopoDeEmpresa(this.prisma, tenantId, (tx) =>
      tx.userHistory.findMany({
        where: { entityId: input.entityId },
        ...(cursor ? { cursor, skip: 1 } : {}),
        take: input.limit + 1,
        orderBy: [{ version: 'asc' }],
      }),
    );
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

  async getHistoryEntry(
    input: GetHistoryEntryInput,
    tenantId: string | null,
  ): Promise<HistoryEntry | null> {
    const row = await comEscopoDeEmpresa(this.prisma, tenantId, (tx) =>
      tx.userHistory.findUnique({
        where: {
          entityId_version: { entityId: input.entityId, version: input.version },
        },
      }),
    );
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
    await comEscopoDeEmpresa(this.prisma, input.ctx.tenantId, (tx) =>
      tx.userArchive.upsert({
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
      }),
    );
  }

  async listArchive(
    input: ListArchiveInput,
    tenantId: string | null,
  ): Promise<{ entries: ArchiveEntry[]; nextCursor: string | null }> {
    const cursor = input.cursor ? { id: input.cursor } : undefined;
    const rows = await comEscopoDeEmpresa(this.prisma, tenantId, (tx) =>
      tx.userArchive.findMany({
        ...(cursor ? { cursor, skip: 1 } : {}),
        take: input.limit + 1,
        orderBy: [{ deletedAt: 'desc' }],
      }),
    );
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

  async getArchiveEntry(
    input: GetArchiveEntryInput,
    tenantId: string | null,
  ): Promise<ArchiveEntry | null> {
    const row = await comEscopoDeEmpresa(this.prisma, tenantId, (tx) =>
      tx.userArchive.findUnique({
        where: { entityId: input.entityId },
      }),
    );
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
