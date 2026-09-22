import { describe, it, expect } from 'vitest';
import { User } from '../../domain/user.aggregate.js';
import { toUserOutput, toUserIdFromOutput } from './user.output.js';

const T0 = new Date('2026-09-21T10:00:00Z');

describe('toUserOutput()', () => {
  it('serializa User como DTO com ISO strings', () => {
    const u = User.criar({
      id: '0190a8b6-1234-7abc-9def-000000000001',
      nome: 'João',
      email: 'joao@example.com',
      agora: T0,
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

  it('serializa soft-deleted com deletedAt ISO string', () => {
    const u = User.criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
    u.pullEvents();
    u.marcarExcluido('motivo', new Date('2026-09-21T11:00:00Z'));
    const dto = toUserOutput(u);
    expect(dto.isDeleted).toBe(true);
    expect(dto.deletedAt).toBe('2026-09-21T11:00:00.000Z');
    expect(dto.version).toBe(2);
  });

  it('toUserIdFromOutput reconverte id corretamente', () => {
    const u = User.criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
    const dto = toUserOutput(u);
    const id = toUserIdFromOutput(dto);
    expect(id.value).toBe(dto.id);
    expect(id.equals(u.id())).toBe(true);
  });
});
