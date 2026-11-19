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
// auditoria é genérica.
//
// ⚠️ E A PROJEÇÃO É UMA LISTA, E NÃO UM CAST (MEDIDO 2026-11-17 na revisão
// do PR #171): o cast `as unknown as UserOutputDto` rotulava o JSONB como
// `UserOutputDto` sem que nada na fronteira garantisse a forma. A tabela de
// auditoria é GENÉRICA (`entity_name` não é coluna), e o dia que uma segunda
// entidade for auditada, o snapshot dela sai no wire rotulado como o de uma
// pessoa — com os campos que ela tiver e a de User não tem.
//
// O `id` da LINHA (o cursor) **não** vai para o DTO: ele é o cursor da
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
    snapshot: paraUserOutputDto(entrada.snapshot),
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

/**
 * O SNAPSHOT cru → o `UserOutputDto` — e a PROJEÇÃO é a lista dos campos.
 *
 * ⚠️ O que NÃO está na lista não vai para o wire. É o que fecha o vetor do
 * `entity_name`: o snapshot de outra entidade sai com os campos vazios — e
 * não com os campos dela, rotulados como os de uma pessoa.
 *
 * ⚠️ E a DATA: o snapshot vem do JSONB (string ISO), mas o duplo em memória
 * pode trazer um `Date`. O `String(date)` sairia como "Tue Nov 17 2026 …" —
 * e o `changedAt` do `snapshot` é lido como ISO pela tela.
 */
function paraUserOutputDto(snapshot: Record<string, unknown> | null | undefined): UserOutputDto {
  // ⚠️ O SNAPSHOT PODE SER NULO — e o `jsonb 'null'` passa na coluna NOT
  // NULL (MEDIDO 2026-11-17 na revisão do PR #171). Sem esta guarda, a rota
  // do admin morria com 500 ao ler uma linha assim — e a guarda da tela
  // (`dadoDaVersao`) nunca rodava, porque a API quebrava antes de serializar.
  if (snapshot === null || snapshot === undefined || typeof snapshot !== 'object') {
    return {
      id: '',
      nome: '',
      email: '',
      profileId: null,
      version: 0,
      createdAt: '',
      updatedAt: '',
      deletedAt: null,
      isDeleted: false,
    };
  }
  return {
    id: texto(snapshot.id),
    nome: texto(snapshot.nome),
    email: texto(snapshot.email),
    profileId:
      snapshot.profileId === null || snapshot.profileId === undefined
        ? null
        : texto(snapshot.profileId),
    version: numero(snapshot.version),
    createdAt: dataIso(snapshot.createdAt),
    updatedAt: dataIso(snapshot.updatedAt),
    deletedAt:
      snapshot.deletedAt === null || snapshot.deletedAt === undefined
        ? null
        : dataIso(snapshot.deletedAt),
    isDeleted: snapshot.isDeleted === true,
  };
}

/** O valor textual — e `''` quando não é texto. */
function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : '';
}

/** O valor numérico — e `0` quando não é número. */
function numero(valor: unknown): number {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : 0;
}

/** A data em ISO — e `''` quando não há data. */
function dataIso(valor: unknown): string {
  if (valor instanceof Date) return valor.toISOString();
  return typeof valor === 'string' ? valor : '';
}
