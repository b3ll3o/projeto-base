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
import { AuditCursorInvalidoException } from '../domain/audit.exceptions.js';
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

  /**
   * A trilha de auditoria de UMA entidade — paginada por cursor.
   *
   * ⚠️ pt-BR (2026-11-17): o cursor é o **id da LINHA** (`users_history.id`), e
   * ele é resolvido **dentro da entidade** antes da query. A implementação
   * anterior entregava o cursor ao Prisma como `cursor: { id }`, e o Prisma
   * traduzia isso num subselect:
   *
   * ```sql
   * WHERE entity_id=$1 AND version >= (SELECT version FROM users_history WHERE id=$2)
   * ORDER BY version ASC OFFSET 0        -- ← o subselect NÃO filtra por entidade
   * ```
   *
   * Defeitos na query antiga:
   *
   * 1. **O subselect não filtrava por `entity_id`** — o cursor de OUTRA trilha
   *    não filtrava a Entidade, e o resultado dependia de a versão alheia cair
   *    dentro do range pedido: com a versão alheia ACIMA da pedida, a página
   *    vinha VAZIA; com ela abaixo, vinha uma página ERRADA. MEDIDO 2026-11-17
   *    contra a implementação anterior: o sintoma observado foi a página
   *    VAZIA. As duas saídas são ruins — e a que o banco devolve é o que a
   *    query decide, não o que o chamador pediu.
   * 2. **A ordem era imposta ao leitor** — não havia como pedir a trilha do
   *    mais novo para o mais antigo, que é a ordem de quem lê uma auditoria.
   *
   * ⚠️ E O `LIMIT`: na PRIMEIRA página ele existia (`take: input.limit + 1`),
   * mas no caminho do CURSOR a tradução do Prisma (`cursor: { id }` + `skip`)
   * emitia a query com `OFFSET` e SEM `LIMIT` — e o banco trazia a trilha
   * inteira para a página devolver `limit` linhas. MEDIDO 2026-11-17 no SQL
   * real: a query do cursor antigo era `... ORDER BY "version" ASC OFFSET $3`
   * — sem `LIMIT`. O teste da integração foi reescrito para medir o que
   * MUDOU (o `LIMIT` no caminho do cursor, o filtro por `entity_id` e o range
   * de `version`).
   *
   * A query de agora resolve o cursor (filtrando por `entity_id`) e usa um
   * **range de `version`**:
   *
   * ```sql
   * WHERE entity_id=$1 AND version < $2   -- ← $2 = a versão do cursor, da MESMA entidade
   * ORDER BY version DESC
   * LIMIT $3
   * ```
   *
   * E a ordem é do **input** (`ordem`), com `'asc'` como padrão — a rota do
   * DONO continua igual, e a rota do ADMIN pede `'desc'`.
   */
  async listHistory(
    input: ListHistoryInput,
    tenantId: string | null,
  ): Promise<{ entries: HistoryEntry[]; nextCursor: string | null }> {
    const ordem = input.ordem ?? 'asc';
    return comEscopoDeEmpresa(this.prisma, tenantId, async (tx) => {
      const versaoDoCursor = await this.versaoDoCursor(tx, input);

      const rows = await tx.userHistory.findMany({
        where: {
          entityId: input.entityId,
          ...(versaoDoCursor === null
            ? {}
            : ordem === 'desc'
              ? { version: { lt: versaoDoCursor } }
              : { version: { gt: versaoDoCursor } }),
        },
        take: input.limit + 1,
        orderBy: [{ version: ordem }],
      });
      const hasMore = rows.length > input.limit;
      const page = hasMore ? rows.slice(0, input.limit) : rows;
      const last = page[page.length - 1];
      return {
        entries: page.map((r) => ({
          id: r.id,
          entityId: r.entityId,
          version: r.version,
          previousVersion: r.previousVersion,
          operation: r.operation,
          snapshot: r.snapshot as Record<string, unknown> | null,
          changedAt: r.changedAt,
          changedBy: r.changedBy,
          reason: r.reason,
        })),
        nextCursor: hasMore && last !== undefined ? last.id : null,
      };
    });
  }

  /**
   * A VERSÃO do cursor — e `null` quando não há cursor.
   *
   * ⚠️ A busca filtra por `id` **E** por `entity_id` no próprio banco: um
   * cursor de outra trilha é INVÁLIDO, e a resposta é a mesma de "não
   * existe" — 400, e nada que diga se aquele id existe.
   *
   * ⚠️ E o filtro é do BANCO, e não do JavaScript: a linha de outra trilha
   * não entra no processo (o `findFirst` com os dois filtros não a devolve),
   * e a comparação de uuid do Postgres é sem distinção de caixa — como a do
   * filtro `entity_id` da query principal. A conferência em JS (`linha
   * .entityId !== input.entityId`) comparava STRINGS, e um id em caixa alta
   * (que o `UserId.create` aceita) era recusado aqui e aceito pela query.
   */
  private async versaoDoCursor(
    tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
    input: ListHistoryInput,
  ): Promise<number | null> {
    if (input.cursor === null || input.cursor === undefined || input.cursor === '') return null;
    const linha = await tx.userHistory.findFirst({
      where: { id: input.cursor, entityId: input.entityId },
      select: { version: true },
    });
    if (linha === null) {
      throw new AuditCursorInvalidoException({ entityId: input.entityId, cursor: input.cursor });
    }
    return linha.version;
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
      id: row.id,
      entityId: row.entityId,
      version: row.version,
      previousVersion: row.previousVersion,
      operation: row.operation,
      snapshot: row.snapshot as Record<string, unknown> | null,
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
    const rows = await comEscopoDeEmpresa(this.prisma, tenantId, async (tx) => {
      // ⚠️ O CURSOR É RESOLVIDO AQUI, e não entregue ao Prisma como
      // `cursor: { id }`: o Prisma traduz isso num subselect que, com um id
      // inexistente, morre num erro de cliente do Prisma (500) — e, MEDIDO
      // 2026-11-17 no Postgres 16, a query do cursor antigo saía SEM
      // `LIMIT` (`WHERE deleted_at <= (SELECT deleted_at …) ORDER BY deleted_at
      // DESC OFFSET $2`): o archive inteiro atravessava a rede a cada página.
      // O `AuditCursorInvalidoException` é a mesma resposta da trilha — 400,
      // e sem dizer se aquele id existe.
      //
      // ⚠️ E O RANGE É COMPOSTO (`deletedAt` + `id`): o `deleted_at` NÃO É
      // ÚNICO (duas remoções no mesmo instante empatam), e um empate com o
      // `OFFSET 1` do Prisma pula uma linha ARBITRÁRIA — a mesma classe de
      // defeito que o `cursor` da trilha tinha.
      let depoisDe: { deletedAt: Date; id: string } | undefined;
      if (input.cursor !== null && input.cursor !== undefined && input.cursor !== '') {
        const linha = await tx.userArchive.findFirst({
          where: { id: input.cursor },
          select: { id: true, deletedAt: true },
        });
        if (linha === null) {
          throw new AuditCursorInvalidoException({ entityId: '', cursor: input.cursor });
        }
        depoisDe = { deletedAt: linha.deletedAt, id: linha.id };
      }
      return tx.userArchive.findMany({
        ...(depoisDe !== undefined
          ? {
              where: {
                OR: [
                  { deletedAt: { lt: depoisDe.deletedAt } },
                  { deletedAt: depoisDe.deletedAt, id: { lt: depoisDe.id } },
                ],
              },
            }
          : {}),
        take: input.limit + 1,
        // ⚠️ A ORDEM É COMPOSTA — e o `id` é o desempate: sem ele, duas linhas
        // com o mesmo `deletedAt` trocam de lugar entre uma página e outra.
        orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
      });
    });
    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page[page.length - 1];
    return {
      entries: page.map((r) => ({
        id: r.id,
        entityId: r.entityId,
        version: r.version,
        snapshot: r.snapshot as Record<string, unknown> | null,
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
      id: row.id,
      entityId: row.entityId,
      version: row.version,
      snapshot: row.snapshot as Record<string, unknown> | null,
      deletedAt: row.deletedAt,
      deletedBy: row.deletedBy,
      reason: row.reason,
    };
  }
}
