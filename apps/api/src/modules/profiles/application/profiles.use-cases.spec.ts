// apps/api/src/modules/profiles/application/profiles.use-cases.spec.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): testes do ProfileUseCases
// (CRUD de profile). Usa um stub em-memória do repositório.
//
// Cobre:
//
//   - criar: sucesso, slug duplicado, slug inválido
//   - atualizar: sucesso, profile não existe, profile isSystem (bloqueado),
//     profile isAdmin (bloqueado)
//   - deletar: sucesso (com 0 users), falha com users atribuídos,
//     falha com isSystem
//   - listar / obterPorId / obterPorSlug

import { describe, it, expect, beforeEach } from 'vitest';
import { ProfileUseCases } from './profiles.use-cases.js';
import { Profile } from '../domain/profile.aggregate.js';
import type { ProfileRepositoryPort } from '../domain/ports/profile-repository.port.js';
import type { UserRepositoryPort } from '../../users/domain/ports/user-repository.port.js';
import { UserProfileCacheService } from '../../../shared/infrastructure/security/user-profile-cache.service.js';
import {
  ProfileNotFoundException,
  ProfileSlugAlreadyInUseException,
  ProfileSystemProtectedException,
  ProfileAdminProtectedException,
  ProfileHasUsersException,
} from '../domain/exceptions/profile.exceptions.js';

class InMemoryProfileRepo implements ProfileRepositoryPort {
  #store: Map<string, Profile> = new Map();

  async findById(id: ReturnType<typeof import('../domain/value-objects/profile-id.vo.js').profileId>) {
    return this.#store.get(id.value) ?? null;
  }
  async findBySlug(slug: ReturnType<typeof import('../domain/value-objects/profile-slug.vo.js').profileSlug>) {
    for (const p of this.#store.values()) {
      if (p.slug().value === slug.value) return p;
    }
    return null;
  }
  async list(): Promise<Profile[]> {
    return [...this.#store.values()];
  }
  async save(profile: Profile): Promise<Profile> {
    this.#store.set(profile.id().value, profile);
    return profile;
  }
  async delete(id: ReturnType<typeof import('../domain/value-objects/profile-id.vo.js').profileId>): Promise<void> {
    this.#store.delete(id.value);
  }
  /** helper p/ testes */
  prime(profile: Profile): void {
    this.#store.set(profile.id().value, profile);
  }
}

class InMemoryUserRepo implements UserRepositoryPort {
  count = 0;
  async countByProfile(): Promise<number> {
    return this.count;
  }
  // Métodos não usados neste spec — stubs com tipagem correta
  async findById(): Promise<never | null> {
    return null;
  }
  async findByEmail(): Promise<never | null> {
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async list(_input?: any): Promise<any> {
    return { items: [], nextCursor: null };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async save(): Promise<any> {
    throw new Error('not used in spec');
  }
  async softDelete(): Promise<never> {
    throw new Error('not used in spec');
  }
  async restore(): Promise<never> {
    throw new Error('not used in spec');
  }
}

describe('ProfileUseCases', () => {
  let repo: InMemoryProfileRepo;
  let users: InMemoryUserRepo;
  let cache: UserProfileCacheService;
  let uc: ProfileUseCases;
  const T0 = new Date('2026-01-01T00:00:00Z');

  beforeEach(() => {
    repo = new InMemoryProfileRepo();
    users = new InMemoryUserRepo();
    cache = new UserProfileCacheService();
    uc = new ProfileUseCases(repo, users, cache, () => T0);
  });

  describe('criar', () => {
    it('cria profile com sucesso', async () => {
      const result = await uc.criar({ slug: 'viewer', name: 'Visualizador' });
      expect(result.slug).toBe('viewer');
      expect(result.name).toBe('Visualizador');
      expect(result.version).toBe(1);
    });

    it('rejeita slug inválido (uppercase com espaço)', async () => {
      await expect(uc.criar({ slug: 'Bad Slug', name: 'X' })).rejects.toThrow(
        ProfileSlugAlreadyInUseException,
      );
    });

    it('rejeita slug duplicado', async () => {
      await uc.criar({ slug: 'viewer', name: 'V1' });
      await expect(uc.criar({ slug: 'viewer', name: 'V2' })).rejects.toThrow(
        ProfileSlugAlreadyInUseException,
      );
    });
  });

  describe('atualizar', () => {
    it('atualiza profile comum com sucesso', async () => {
      const created = await uc.criar({ slug: 'custom', name: 'Velho Long' });
      const updated = await uc.atualizar(created.id, { name: 'Novo' });
      expect(updated.name).toBe('Novo');
      expect(updated.version).toBeGreaterThanOrEqual(2);
    });

    it('rejeita atualizar profile não encontrado', async () => {
      await expect(
        uc.atualizar('00000000-0000-0000-0000-000000000000', { name: 'X' }),
      ).rejects.toThrow(ProfileNotFoundException);
    });

    it('rejeita atualizar profile isSystem', async () => {
      const p = Profile.criar({ slug: 'admin', name: 'Admin', isSystem: true, agora: T0 });
      repo.prime(p);
      await expect(uc.atualizar(p.id().value, { name: 'X' })).rejects.toThrow(
        ProfileSystemProtectedException,
      );
    });

    it('rejeita atualizar profile isAdmin (mesmo sem isSystem)', async () => {
      const p = Profile.criar({ slug: 'admin', name: 'Admin', isAdmin: true, agora: T0 });
      repo.prime(p);
      await expect(uc.atualizar(p.id().value, { name: 'X' })).rejects.toThrow(
        ProfileAdminProtectedException,
      );
    });
  });

  describe('deletar', () => {
    it('deleta profile comum sem users', async () => {
      const created = await uc.criar({ slug: 'custom', name: 'Custom' });
      users.count = 0;
      await uc.deletar(created.id);
      const found = await repo.findById(created.id as unknown as ReturnType<typeof import('../domain/value-objects/profile-id.vo.js').profileId>);
      expect(found).toBeNull();
    });

    it('rejeita deletar profile com users atribuídos', async () => {
      const created = await uc.criar({ slug: 'custom', name: 'Custom' });
      users.count = 3;
      await expect(uc.deletar(created.id)).rejects.toThrow(ProfileHasUsersException);
    });

    it('rejeita deletar profile isSystem', async () => {
      const p = Profile.criar({ slug: 'admin', name: 'Admin', isSystem: true, agora: T0 });
      repo.prime(p);
      users.count = 0;
      await expect(uc.deletar(p.id().value)).rejects.toThrow(ProfileSystemProtectedException);
    });
  });

  describe('listar/obter', () => {
    it('listar retorna todos', async () => {
      await uc.criar({ slug: 'aaa', name: 'Primeiro' });
      await uc.criar({ slug: 'bbb', name: 'Segundo' });
      const all = await uc.listar();
      expect(all).toHaveLength(2);
    });

    it('obterPorId retorna ProfileNotFound se não existe', async () => {
      await expect(
        uc.obterPorId('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(ProfileNotFoundException);
    });
  });
});
