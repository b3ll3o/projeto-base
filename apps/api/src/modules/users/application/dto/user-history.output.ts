// apps/api/src/modules/users/application/dto/user-history.output.ts
//
// O mapeamento da TRILHA DE AUDITORIA para o DTO do wire.
//
// pt-BR (2026-11-17): existiam DUAS formas de entregar a mesma trilha — a
// rota do DONO devolvia o port CRU (`Promise<unknown>`) e a rota do ADMIN
// devolvia o DTO mapeado. O wire coincidia hoje, mas só uma das duas passava
// pelo mapeamento: quando o mapeamento ganhasse um campo, a rota do dono
// ficaria sem ele — e as DUAS surfaces do mesmo dado divergiriam sozinhas.
//
// ⚠️ O `snapshot` é o `toUserOutput` da pessoa (`user-use-cases.ts` grava
// esse formato), e o port o declara como `Record<string, unknown>` porque a
// auditoria é genérica. O cast aqui é FIEL — e é o ÚNICO lugar onde ele
// acontece.
//
// ⚠️ O `id` da LINHA (o cursor) **não** vai para o DTO: ele é o cursor da
// paginação, e o cursor viaja no ENVELOPE (`nextCursor`). Ele fica no port
// porque a leitura precisa dele — e porque o duplo em memória precisa dele
// para devolver um cursor que a API aceite.

import type { UserHistoryEntryDto, UserHistoryPageDto, UserOutputDto } from '@projeto/shared-types';
import type { HistoryEntry } from '../../../../shared/audit/application/audit-service.port.js';

/** Uma entrada da trilha → o DTO do wire. */
export function toUserHistoryEntryDto(entrada: HistoryEntry): UserHistoryEntryDto {
  return {
    entityId: entrada.entityId,
    version: entrada.version,
    previousVersion: entrada.previousVersion,
    operation: entrada.operation,
    snapshot: entrada.snapshot as unknown as UserOutputDto,
    changedAt: entrada.changedAt.toISOString(),
    changedBy: entrada.changedBy,
    reason: entrada.reason,
  };
}

/** A página da trilha → o envelope do wire. */
export function toUserHistoryPageDto(pagina: {
  entries: HistoryEntry[];
  nextCursor: string | null;
}): UserHistoryPageDto {
  return {
    entries: pagina.entries.map(toUserHistoryEntryDto),
    nextCursor: pagina.nextCursor,
  };
}
