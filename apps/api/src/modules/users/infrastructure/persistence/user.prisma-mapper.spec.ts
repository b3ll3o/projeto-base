import { describe, it, expect } from 'vitest';
import { UserPrismaMapper } from './user.prisma-mapper.js';
import { User } from '../../domain/user.aggregate.js';
import { UserId } from '../../domain/value-objects/user-id.vo.js';

describe('UserPrismaMapper', () => {
  it('toDomain converte Prisma row em User aggregate (com normalização de email)', () => {
    const user = UserPrismaMapper.toDomain({
      id: '0190a8b6-1234-7abc-9def-000000000001',
      email: 'Alice@Example.com',
      name: 'Alice',
      createdAt: new Date('2026-09-21T10:00:00Z'),
      updatedAt: new Date('2026-09-21T10:00:00Z'),
      createdBy: null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
      version: 1,
    });

    expect(user).toBeInstanceOf(User);
    expect(user.id().value).toBe('0190a8b6-1234-7abc-9def-000000000001');
    expect(user.email().value).toBe('alice@example.com'); // VO normaliza lowercase
    expect(user.nome().value).toBe('Alice');
    expect(user.version()).toBe(1);
    expect(user.deletedAt()).toBeNull();
  });

  it('toDomain preserva deletedAt e version quando presentes', () => {
    const user = UserPrismaMapper.toDomain({
      id: '0190a8b6-1234-7abc-9def-000000000003',
      email: 'bob@example.com',
      name: 'Bob',
      createdAt: new Date('2026-09-21T10:00:00Z'),
      updatedAt: new Date('2026-09-21T11:00:00Z'),
      createdBy: null,
      updatedBy: null,
      deletedAt: new Date('2026-09-21T12:00:00Z'),
      deletedBy: null,
      version: 4,
    });

    expect(user.deletedAt()).toBeInstanceOf(Date);
    expect(user.version()).toBe(4);
  });

  it('toPersistence converte User em Prisma row (email normalizado pelo VO)', () => {
    const u = User.criar({
      id: '0190a8b6-1234-7abc-9def-000000000002',
      nome: 'Ana',
      email: 'a@b.com',
      agora: new Date('2026-09-21T10:00:00Z'),
    });

    const row = UserPrismaMapper.toPersistence(u);
    expect(row.id).toBe('0190a8b6-1234-7abc-9def-000000000002');
    expect(row.email).toBe('a@b.com');
    expect(row.name).toBe('Ana');
    expect(row.version).toBe(1);
    expect(row.deletedAt).toBeNull();
    expect(row.createdBy).toBeNull();
  });

  it('roundtrip: toPersistence(toDomain(row)) preserva campos essenciais', () => {
    const row: Parameters<typeof UserPrismaMapper.toDomain>[0] = {
      id: UserId.create().value,
      email: 'Carla@Example.com',
      name: 'Carla',
      createdAt: new Date('2026-09-21T10:00:00Z'),
      updatedAt: new Date('2026-09-21T11:30:00Z'),
      createdBy: null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
      version: 7,
    };

    const user = UserPrismaMapper.toDomain(row);
    const back = UserPrismaMapper.toPersistence(user);

    expect(back.id).toBe(row.id);
    expect(back.email).toBe('carla@example.com');
    expect(back.name).toBe('Carla');
    expect(back.version).toBe(7);
    expect(back.deletedAt).toBeNull();
  });
});
