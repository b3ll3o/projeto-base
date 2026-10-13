import { describe, it, expect } from 'vitest';
import { User } from '../../domain/user.aggregate.js';
import { toUserOutput, toUserIdFromOutput } from './user.output.js';
import { HASH_REAL as HASH } from '../../../../../test/fakes/fake-password-hasher.js';
import { PasswordHash } from '../../domain/value-objects/password-hash.vo.js';

const T0 = new Date('2026-09-21T10:00:00Z');

describe('toUserOutput()', () => {
  it('serializa User como DTO com ISO strings', () => {
    const u = User.criar({
      id: '0190a8b6-1234-7abc-9def-000000000001',
      nome: 'João',
      email: 'joao@example.com',
      agora: T0,
      senhaHash: PasswordHash.create(HASH),
    });
    const dto = toUserOutput(u);
    expect(dto).toEqual({
      id: '0190a8b6-1234-7abc-9def-000000000001',
      nome: 'João',
      email: 'joao@example.com',
      createdAt: T0.toISOString(),
      updatedAt: T0.toISOString(),
      version: 1,
      deletedAt: null,
      isDeleted: false,
    });
  });

  // ── SEGUNDA BARREIRA: o hash não sai por aqui ─────────────────────────────
  //
  // `toUserOutput` alimenta a resposta HTTP, o `users_history.snapshot` e o
  // `users_archive.snapshot`. A PRIMEIRA barreira é o `PasswordHash.toString()`
  // devolver `[redacted]`; esta é a segunda — `toUserOutput` não chamar
  // `.value`. São independentes de propósito (ver o cabeçalho do VO): a
  // segunda quebra no dia em que alguém acrescenta um campo "só para
  // depurar", a primeira quebra no dia em que alguém loga o agregado inteiro.
  //
  // O `toEqual` acima já barra o caminho feliz — mas ele passaria se um
  // `senhaHash: undefined` fosse acrescentado (o `toEqual` ignora chaves
  // `undefined`). O `JSON.stringify` abaixo é o que pega esse caso: serializar
  // é o que o HTTP e o snapshot JSONB fazem.
  it('NÃO serializa o hash em nenhuma forma (nem como undefined)', () => {
    const u = User.criar({
      nome: 'João',
      email: 'joao@example.com',
      agora: T0,
      senhaHash: PasswordHash.create(HASH),
    });
    const dto = toUserOutput(u);

    expect(Object.keys(dto)).not.toContain('senhaHash');
    expect(Object.keys(dto)).not.toContain('passwordHash');
    expect(JSON.stringify(dto)).not.toContain(HASH);
    expect(JSON.stringify(dto)).not.toContain('$argon2id$');
  });

  it('serializa soft-deleted com deletedAt ISO string', () => {
    const u = User.criar({
      nome: 'João',
      email: 'joao@example.com',
      agora: T0,
      senhaHash: PasswordHash.create(HASH),
    });
    u.pullEvents();
    u.marcarExcluido('motivo', new Date('2026-09-21T11:00:00Z'));
    const dto = toUserOutput(u);
    expect(dto.isDeleted).toBe(true);
    expect(dto.deletedAt).toBe('2026-09-21T11:00:00.000Z');
    expect(dto.version).toBe(2);
  });

  it('toUserIdFromOutput reconverte id corretamente', () => {
    const u = User.criar({
      nome: 'João',
      email: 'joao@example.com',
      agora: T0,
      senhaHash: PasswordHash.create(HASH),
    });
    const dto = toUserOutput(u);
    const id = toUserIdFromOutput(dto);
    expect(id.value).toBe(dto.id);
    expect(id.equals(u.id())).toBe(true);
  });
});
