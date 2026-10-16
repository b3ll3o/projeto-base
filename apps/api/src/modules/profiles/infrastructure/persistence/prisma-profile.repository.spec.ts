// apps/api/src/modules/profiles/infrastructure/persistence/prisma-profile.repository.spec.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): testes do PrismaProfileRepository.
//
// pt-BR (#97): o fake desta arquivo foi REESCRITO. Ele espelhava uma API
// que o repositório não chamava — tinha `profile.update` (o repo chama
// `updateMany`) e não tinha `authorization` nem `$transaction` — então o
// path de UPDATE tinha ZERO cobertura e o `deleteMany` inválido no path de
// CREATE não tinha onde aparecer. Um fake que não é a API real produz
// verde sobre código que quebraria em produção.

import { describe, it, expect, beforeEach } from 'vitest';
import { PrismaProfileRepository } from './prisma-profile.repository.js';
import { Profile } from '../../domain/profile.aggregate.js';
import { ConcurrencyException } from '../../domain/exceptions/profile.exceptions.js';

type ProfileRow = {
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
};

class FakePrisma {
  #profiles: ProfileRow[] = [];
  #authIds = 0;
  /** nº de transações abertas — a asserção de atomicidade olha aqui. */
  transacoesAbertas = 0;
  /** última chamada de `profile.create`, para as asserções de shape. */
  ultimaCreate: { data: Record<string, unknown> } | null = null;
  /** força o próximo `authorization.createMany` a falhar (teste de rollback) */
  falharCreateMany = false;

  profile = {
    findUnique: async (args: { where: { id?: string; slug?: string } }) => {
      const found = this.#profiles.find(
        (p) =>
          (args.where.id !== undefined && p.id === args.where.id) ||
          (args.where.slug !== undefined && p.slug === args.where.slug),
      );
      return found === undefined ? null : { ...found };
    },
    findMany: async () => this.#profiles.map((p) => ({ ...p })),
    create: async (args: { data: Record<string, unknown> }) => {
      this.ultimaCreate = args;
      const nested = args.data['authorizations'] as
        { create?: Array<{ permissionKey: string }>; deleteMany?: unknown } | undefined;
      // Reproduz o `PrismaClientValidationError` do Prisma 6: no tipo
      // `AuthorizationCreateNestedManyWithoutProfileInput` NÃO existe
      // `deleteMany` (ele só existe no tipo de UPDATE).
      if (nested !== undefined && nested.deleteMany !== undefined) {
        throw Object.assign(
          new Error(
            'Unknown argument `deleteMany`. Did you mean to use `create`? (create.authorizations.deleteMany)',
          ),
          { name: 'PrismaClientValidationError' },
        );
      }
      const row: ProfileRow = {
        id: args.data['id'] as string,
        slug: args.data['slug'] as string,
        name: args.data['name'] as string,
        isAdmin: args.data['isAdmin'] as boolean,
        isSystem: args.data['isSystem'] as boolean,
        description: args.data['description'] as string | null,
        version: 1,
        createdAt: new Date('2026-01-01T00:00:00Z'),
        updatedAt: new Date('2026-01-01T00:00:00Z'),
        authorizations: (nested?.create ?? []).map((a) => ({
          id: `auth-${++this.#authIds}`,
          permissionKey: a.permissionKey,
        })),
      };
      this.#profiles.push(row);
      return { ...row };
    },
    updateMany: async (args: {
      where: { id: string; version: number };
      data: {
        slug: string;
        name: string;
        description: string | null;
        isAdmin: boolean;
        isSystem: boolean;
        version: number;
      };
    }) => {
      const row = this.#profiles.find((p) => p.id === args.where.id);
      if (row === undefined || row.version !== args.where.version) {
        return { count: 0 };
      }
      row.slug = args.data.slug;
      row.name = args.data.name;
      row.description = args.data.description;
      row.isAdmin = args.data.isAdmin;
      row.isSystem = args.data.isSystem;
      row.version = args.data.version;
      row.updatedAt = new Date('2026-02-02T00:00:00Z');
      return { count: 1 };
    },
    delete: async (args: { where: { id: string } }) => {
      const idx = this.#profiles.findIndex((p) => p.id === args.where.id);
      if (idx === -1) throw new Error('not found');
      this.#profiles.splice(idx, 1);
      return {};
    },
  };

  authorization = {
    deleteMany: async (args: { where: { profileId: string } }) => {
      const before = this.#profiles.length;
      for (const row of this.#profiles) {
        if (row.id === args.where.profileId) {
          row.authorizations = [];
        }
      }
      return { count: before };
    },
    createMany: async (args: { data: Array<{ profileId: string; permissionKey: string }> }) => {
      if (this.falharCreateMany) {
        throw new Error('createMany falhou');
      }
      for (const d of args.data) {
        const row = this.#profiles.find((p) => p.id === d.profileId);
        row?.authorizations.push({ id: `auth-${++this.#authIds}`, permissionKey: d.permissionKey });
      }
      return { count: args.data.length };
    },
  };

  async $transaction<T>(fn: (tx: FakePrisma) => Promise<T>): Promise<T> {
    this.transacoesAbertas += 1;
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

  /** Recarrega do "banco" — é o que todo use case faz antes de mutar. */
  async function reler(id: ReturnType<Profile['id']>): Promise<Profile> {
    const p = await repo.findById(id);
    if (p === null) {
      throw new Error('profile não encontrado no fake');
    }
    return p;
  }

  it('save persiste profile novo + suas authorizations', async () => {
    const p = Profile.criar({ slug: 'admin', name: 'Administrador', agora: new Date() });
    await repo.save(p);
    const found = await repo.findById(p.id());
    expect(found).not.toBeNull();
    expect(found?.slug().value).toBe('admin');
  });

  // ─── B2: `deleteMany` no path de CREATE era PrismaClientValidationError ───

  it('save (CREATE) não manda `deleteMany` no nested-write de authorizations', async () => {
    const p = Profile.criar({
      slug: 'viewer',
      name: 'Visualizador',
      initialAuthorizations: ['users.read'],
      agora: new Date(),
    });

    // Se `deleteMany` voltar para o CREATE, o fake lança — que é o que o
    // Prisma 6.19.3 fazia com `PrismaClientValidationError`.
    await expect(repo.save(p)).resolves.not.toThrow();

    const nested = fake.ultimaCreate?.data['authorizations'] as Record<string, unknown>;
    expect(Object.keys(nested)).toEqual(['create']);
    expect(nested['deleteMany']).toBeUndefined();
  });

  // ─── B2: path de UPDATE (antes com ZERO cobertura) ────────────────────────
  //
  // `save()` NÃO recarrega o agregado: ele devolve a mesma instância, cujo
  // `loadedVersion` continua 0 depois do CREATE. Todo update em produção
  // passa por `findById` antes (`atualizar`, `atribuir`, `revogar`), então
  // os testes daqui recarregam também — é o formato real, e é o que dá ao
  // optimistic lock a versão certa para comparar.

  it('save (UPDATE) re-sincroniza as authorizations do perfil', async () => {
    const p = Profile.criar({
      slug: 'editor',
      name: 'Editor',
      initialAuthorizations: ['users.read'],
      agora: new Date(),
    });
    await repo.save(p);

    const carregado = await reler(p.id());
    carregado.renomear('Editor Chefe', new Date());
    carregado.adicionarAutorizacao('users.write', new Date());
    await repo.save(carregado);

    const found = await repo.findById(p.id());
    expect(found?.nome().value).toBe('Editor Chefe');
    expect(found?.authorizations().toLista()).toEqual(['users.read', 'users.write']);
    expect(found?.version()).toBe(3);
  });

  // Regressão: `atualizar()` faz DOIS mutators antes do save. Com
  // `expectedVersion = version() - 1` o `where` exigia versão 3 numa linha
  // que estava na 1 → `count: 0` → ConcurrencyException em TODO update.
  it('save (UPDATE) aceita mais de um mutator antes do save (o caso do `atualizar`)', async () => {
    const p = Profile.criar({ slug: 'custom', name: 'Nome Velho', agora: new Date() });
    await repo.save(p);

    const carregado = await reler(p.id());
    carregado.renomear('Nome Novo', new Date());
    carregado.alterarDescricao('descrição nova', new Date());
    await repo.save(carregado);

    const found = await repo.findById(p.id());
    expect(found?.nome().value).toBe('Nome Novo');
    expect(found?.descricao()).toBe('descrição nova');
    expect(found?.version()).toBe(3);
  });

  it('save (UPDATE) roda as três escritas dentro de $transaction', async () => {
    const p = Profile.criar({ slug: 'editor', name: 'Editor', agora: new Date() });
    await repo.save(p);
    expect(fake.transacoesAbertas).toBe(0);

    const carregado = await reler(p.id());
    carregado.renomear('Outro Nome', new Date());
    await repo.save(carregado);

    // Fora da `$transaction` o `createMany` que falha deixa o profile com
    // a version incrementada e ZERO permissões — o agregado em memória e o
    // banco divergem para sempre. A transação é o que fecha isso.
    expect(fake.transacoesAbertas).toBe(1);
  });

  it('save (UPDATE) propaga a falha do createMany (não engole a permissão perdida)', async () => {
    const p = Profile.criar({
      slug: 'editor',
      name: 'Editor',
      initialAuthorizations: ['users.read'],
      agora: new Date(),
    });
    await repo.save(p);

    const carregado = await reler(p.id());
    carregado.renomear('Editado', new Date());
    carregado.adicionarAutorizacao('users.write', new Date());
    fake.falharCreateMany = true;

    await expect(repo.save(carregado)).rejects.toThrow('createMany falhou');
  });

  it('save (UPDATE) com version divergente lança ConcurrencyException sem tocar em authorizations', async () => {
    const p = Profile.criar({
      slug: 'editor',
      name: 'Editor',
      initialAuthorizations: ['users.read'],
      agora: new Date(),
    });
    await repo.save(p);

    // Simula outro escritor: um agregado re-hidratado de uma leitura antiga
    // (versão 4), enquanto o banco está na 1 que este teste gravou.
    const p2 = Profile.restaurarDePersistencia({
      id: p.id().value,
      slug: p.slug().value,
      name: p.nome().value,
      description: null,
      isAdmin: false,
      isSystem: false,
      authorizations: p.authorizations().toLista(),
      createdAt: p.createdAt(),
      updatedAt: p.updatedAt(),
      version: 4,
    });

    await expect(repo.save(p2)).rejects.toThrow(ConcurrencyException);
    const found = await repo.findById(p.id());
    expect(found?.authorizations().toLista()).toEqual(['users.read']);
  });

  it('toDomain usa `row.updatedAt` (não createdAt) — o model tem updatedAt', async () => {
    const p = Profile.criar({ slug: 'editor', name: 'Editor', agora: new Date() });
    await repo.save(p);
    const carregado = await reler(p.id());
    carregado.renomear('Renomeado', new Date());
    await repo.save(carregado);

    const found = await repo.findById(p.id());
    expect(found?.createdAt().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(found?.updatedAt().toISOString()).toBe('2026-02-02T00:00:00.000Z');
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
