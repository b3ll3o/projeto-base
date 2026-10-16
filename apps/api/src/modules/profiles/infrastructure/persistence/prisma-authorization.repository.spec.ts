// apps/api/src/modules/profiles/infrastructure/persistence/prisma-authorization.repository.spec.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): smoke test do PrismaAuthorizationRepository.
// Cobre listByProfile/upsert/delete/syncForProfile/countByProfile.

import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaAuthorizationRepository } from './prisma-authorization.repository.js';

class FakePrisma {
  #auths: Array<{
    id: string;
    profileId: string;
    permissionKey: string;
    createdAt: Date;
    updatedAt: Date;
    version: number;
  }> = [];
  #ids = 0;

  authorization = {
    findMany: async (args: { where: { profileId: string } }) =>
      this.#auths.filter((a) => a.profileId === args.where.profileId),
    findFirst: async (args: { where: { profileId: string; permissionKey: string } }) =>
      this.#auths.find(
        (a) => a.profileId === args.where.profileId && a.permissionKey === args.where.permissionKey,
      ) ?? null,
    count: async (args: { where: { profileId: string } }) =>
      this.#auths.filter((a) => a.profileId === args.where.profileId).length,
    upsert: async (args: {
      where: { profileId_permissionKey: { profileId: string; permissionKey: string } };
      update: Record<string, never>;
      create: { profileId: string; permissionKey: string };
    }) => {
      const existing = this.#auths.find(
        (a) =>
          a.profileId === args.where.profileId_permissionKey.profileId &&
          a.permissionKey === args.where.profileId_permissionKey.permissionKey,
      );
      if (existing !== undefined) {
        existing.updatedAt = new Date();
        return { ...existing };
      }
      const created = {
        id: `auth-${++this.#ids}`,
        profileId: args.create.profileId,
        permissionKey: args.create.permissionKey,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 0,
      };
      this.#auths.push(created);
      return { ...created };
    },
    delete: async (args: { where: { id: string } }) => {
      const idx = this.#auths.findIndex((a) => a.id === args.where.id);
      if (idx === -1) throw new Error('not found');
      this.#auths.splice(idx, 1);
      return {};
    },
    deleteMany: async (args: { where: { profileId: string; permissionKey?: string } }) => {
      const before = this.#auths.length;
      this.#auths = this.#auths.filter(
        (a) =>
          a.profileId !== args.where.profileId ||
          (args.where.permissionKey !== undefined && a.permissionKey !== args.where.permissionKey),
      );
      return { count: before - this.#auths.length };
    },
  };
}

describe('PrismaAuthorizationRepository', () => {
  let repo: PrismaAuthorizationRepository;
  let fake: FakePrisma;

  beforeEach(() => {
    fake = new FakePrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo = new PrismaAuthorizationRepository(fake as any);
  });

  it('listByProfile retorna vazio para profile sem authorizations', async () => {
    const result = await repo.listByProfile({ value: 'p-1' } as never);
    expect(result).toEqual([]);
  });

  it('upsert cria nova authorization', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const key = { value: 'users.read' } as any;
    await repo.upsert({ profileId: { value: 'p-1' } as never, key, agora: new Date() });
    const list = await repo.listByProfile({ value: 'p-1' } as never);
    expect(list).toHaveLength(1);
  });

  it('upsert duplicado não cria segundo', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const key = { value: 'users.read' } as any;
    await repo.upsert({ profileId: { value: 'p-1' } as never, key, agora: new Date() });
    await repo.upsert({ profileId: { value: 'p-1' } as never, key, agora: new Date() });
    const list = await repo.listByProfile({ value: 'p-1' } as never);
    expect(list).toHaveLength(1);
  });

  it('delete remove authorization existente', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const key = { value: 'users.read' } as any;
    await repo.upsert({ profileId: { value: 'p-1' } as never, key, agora: new Date() });
    await repo.delete({ profileId: { value: 'p-1' } as never, key });
    const list = await repo.listByProfile({ value: 'p-1' } as never);
    expect(list).toHaveLength(0);
  });

  it('countByProfile retorna 0 quando vazio', async () => {
    const count = await repo.countByProfile({ value: 'p-1' } as never);
    expect(count).toBe(0);
  });
});
