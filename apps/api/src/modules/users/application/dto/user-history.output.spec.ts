// apps/api/src/modules/users/application/dto/user-history.output.spec.ts
//
// O mapeamento da TRILHA para o DTO do wire — e ele é o CONTRATO das DUAS
// rotas (a do DONO e a do ADMIN do SISTEMA).
//
// ⚠️ O que este spec fecha:
//
//   - o `changedAt` vira ISO — e o `Date` do banco virava string só no
//     `toISOString`. Um `changedAt` que chegasse como string estouraria
//     `toISOString is not a function` → 500, e nenhum teste caía (no e2e da
//     API o `JSON.stringify(Date)` produz a mesma ISO; no web a fixture já
//     traz string);
//   - o `id` da LINHA (o cursor) NÃO vai para o DTO — é a razão de o
//     mapeamento existir (o cursor viaja no envelope);
//   - o `snapshot` é PROJETADO, e não rotulado por cast: um snapshot com
//     campos a mais (a de outra entidade auditada) não pode vazar esses
//     campos no wire.

import { describe, it, expect } from 'vitest';
import { toUserHistoryEntryDto, toUserHistoryPageDto } from './user-history.output.js';
import type { HistoryEntry } from '../../../../shared/audit/application/audit-service.port.js';

const SNAPSHOT = {
  id: '0190a8b6-1234-7abc-9def-000000000001',
  nome: 'Nome Da Pessoa',
  email: 'pessoa@exemplo.dev',
  profileId: null,
  version: 3,
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-02T12:30:00.000Z',
  deletedAt: null,
  isDeleted: false,
};

function entrada(extra: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: '0190a8b6-1234-7abc-9def-00000000aaaa',
    entityId: '0190a8b6-1234-7abc-9def-000000000001',
    version: 3,
    previousVersion: 2,
    operation: 'UPDATE',
    snapshot: { ...SNAPSHOT },
    changedAt: new Date('2026-11-02T12:30:00.000Z'),
    changedBy: '0190a8b6-1234-7abc-9def-000000000002',
    reason: null,
    ...extra,
  };
}

describe('toUserHistoryEntryDto — o mapeamento da trilha para o wire', () => {
  it('o `changedAt` sai em ISO — e o `Date` do banco é o que vira string', () => {
    const dto = toUserHistoryEntryDto(entrada());

    expect(dto.changedAt).toBe('2026-11-02T12:30:00.000Z');
    expect(typeof dto.changedAt).toBe('string');
  });

  it('o `id` da LINHA (o cursor) NÃO vai para o DTO — ele viaja no envelope', () => {
    const dto = toUserHistoryEntryDto(entrada());

    expect(Object.keys(dto)).not.toContain('id');
    expect(dto.entityId).toBe('0190a8b6-1234-7abc-9def-000000000001');
  });

  it('o `snapshot` é PROJETADO: um campo a mais não vaza no wire', () => {
    const dto = toUserHistoryEntryDto(
      entrada({ snapshot: { ...SNAPSHOT, segredoDaOutraEntidade: 'nao deve vazar' } }),
    );

    expect(dto.snapshot).not.toHaveProperty('segredoDaOutraEntidade');
    // E os campos que a pessoa tem continuam lá.
    expect(dto.snapshot.nome).toBe('Nome Da Pessoa');
    expect(dto.snapshot.email).toBe('pessoa@exemplo.dev');
  });

  it('um campo AUSENTE no snapshot sai VAZIO — e a tela sabe que é "não veio"', () => {
    const dto = toUserHistoryEntryDto(
      entrada({ snapshot: { ...SNAPSHOT, nome: undefined, email: undefined } as never }),
    );

    // ⚠️ A projeção não pode devolver `undefined` (o DTO diz `string`) — e
    // não devolve nada inventado: o campo vai vazio, e quem consome sabe
    // que um nome vazio não é um nome possível (o `UserName` exige 2..100
    // caracteres).
    expect(dto.snapshot.nome).toBe('');
    expect(dto.snapshot.email).toBe('');
  });

  it('um snapshot com a DATA como `Date` sai em ISO — e não em texto de locale', () => {
    const dto = toUserHistoryEntryDto(
      entrada({
        snapshot: { ...SNAPSHOT, createdAt: new Date('2026-11-01T10:00:00.000Z') },
      }),
    );

    expect(dto.snapshot.createdAt).toBe('2026-11-01T10:00:00.000Z');
  });

  it('o `isDeleted` é BOOLEANO — e não a string "true"', () => {
    const dto = toUserHistoryEntryDto(
      entrada({ snapshot: { ...SNAPSHOT, isDeleted: 'true' as unknown as boolean } }),
    );

    expect(dto.snapshot.isDeleted).toBe(false);
  });

  it('o envelope leva as entradas e o cursor', () => {
    const pagina = toUserHistoryPageDto({ entries: [entrada()], nextCursor: 'cursor-1' });

    expect(pagina.entries).toHaveLength(1);
    expect(pagina.nextCursor).toBe('cursor-1');
  });
});
