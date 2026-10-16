// apps/api/src/modules/profiles/infrastructure/persistence/prisma-profile.repository.spec.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): smoke test do PrismaProfileRepository
// cobrindo a maior parte do código (linhas 1-79 estavam a 0%).
// Usa um fake PrismaClient em memória (findMany/findUnique/create/update/delete
// + transaction stub).

import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaProfileRepository } from './prisma-profile.repository.js';
import { Profile } from '../../domain/profile.aggregate.js';

class FakePrisma {
  #profiles: Array<{
    id: string;
    slug: string;
    name: string;
    isAdmin: boolean;
    isSystem: boolean;
    description: string | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
    authorizations: Array<{ id: string; permissionKey: string }>;
  }> = [];
  #authIds = 0;

  profile = {
    findUnique: async (args: { where: { id?: string; slug?: string } }) => {
      const found = this.#profiles.find(
        (p) =>
          (args.where.id !== undefined && p.id === args.where.id) ||
          (args.where.slug !== undefined && p.slug === args.where.slug),
      );
      if (found === undefined) return null;
      return { ...found };
    },
    findMany: async () => this.#profiles.map((p) => ({ ...p })),
    create: async (args: {
      data: {
        id: string;
        slug: string;
        name: string;
        isAdmin: boolean;
        isSystem: boolean;
        description: string | null;
        version: number;
        authorizations: { create: Array<{ permissionKey: string }> };
      };
    }) => {
      const created = {
        id: args.data.id,
        slug: args.data.slug,
        name: args.data.name,
        isAdmin: args.data.isAdmin,
        isSystem: args.data.isSystem,
        description: args.data.description,
        version: args.data.version,
        createdAt: new Date(),
        updatedAt: new Date(),
        authorizations: args.data.authorizations.create.map((a) => ({
          id: `auth-${++this.#authIds}`,
          permissionKey: a.permissionKey,
        })),
      };
      this.#profiles.push(created);
      return { ...created };
    },
    update: async (args: {
      where: { id: string };
      data: { name?: string; description?: string | null; version: number };
    }) => {
      const idx = this.#profiles.findIndex((p) => p.id === args.where.id);
      if (idx === -1) throw new Error('not found');
      const existing = this.#profiles[idx] as unknown as {
        name: string;
        description: string | null;
        version: number;
        updatedAt: Date;
      };
      if (existing.version !== args.data.version - 1 && args.data.version !== undefined) {
        const err = new Error('version mismatch') as Error & { code: string };
        err.code = 'P2025';
        throw err;
      }
      if (args.data.name !== undefined) existing.name = args.data.name;
      if (args.data.description !== undefined) existing.description = args.data.description;
      existing.version = args.data.version;
      existing.updatedAt = new Date();
      return { ...this.#profiles[idx] };
    },
    delete: async (args: { where: { id: string } }) => {
      const idx = this.#profiles.findIndex((p) => p.id === args.where.id);
      if (idx === -1) throw new Error('not found');
      this.#profiles.splice(idx, 1);
      return {};
    },
  };

  async $transaction<T>(fn: (tx: FakePrisma) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

describe('PrismaProfileRepository', () => {
  let repo: PrismaProfileRepository;
  let fake: FakePrisma;

  beforeEach(() => {
    fake = new FakePrisma();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo = new PrismaProfileRepository(fake as any);
  });

  it('save persiste profile novo + suas authorizations', async () => {
    const p = Profile.criar({ slug: 'admin', name: 'Administrador', agora: new Date() });
    await repo.save(p);
    const found = await repo.findById(p.id());
    expect(found).not.toBeNull();
    expect(found?.slug().value).toBe('admin');
  });

  it('findById retorna null para id inexistente', async () => {
    const result = await repo.findById({
      value: '00000000-0000-0000-0000-000000000000',
    } as never);
    expect(result).toBeNull();
  });

  it('list retorna todos os profiles', async () => {
    const p1 = Profile.criar({ slug: 'aaa', name: 'Aaa Name', agora: new Date() });
    const p2 = Profile.criar({ slug: 'bbb', name: 'Bbb Name', agora: new Date() });
    await repo.save(p1);
    await repo.save(p2);
    const list = await repo.list();
    expect(list).toHaveLength(2);
  });

  it('findBySlug encontra por slug', async () => {
    const p = Profile.criar({ slug: 'meu-slug', name: 'Meu Nome', agora: new Date() });
    await repo.save(p);
    const found = await repo.findBySlug({ value: 'meu-slug' } as never);
    expect(found).not.toBeNull();
  });

  it('delete remove o profile', async () => {
    const p = Profile.criar({ slug: 'tmp', name: 'Temp Name', agora: new Date() });
    await repo.save(p);
    await repo.delete(p.id());
    const found = await repo.findById(p.id());
    expect(found).toBeNull();
  });
});
