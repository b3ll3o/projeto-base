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

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger } from '@nestjs/common';
import {
  ProfileUseCases,
  AuthorizationUseCases,
  UserProfileUseCases,
  type AtorAutenticado,
} from './profiles.use-cases.js';
import { Profile } from '../domain/profile.aggregate.js';
import { profileSlug } from '../domain/value-objects/profile-slug.vo.js';
import type { ProfileRepositoryPort } from '../domain/ports/profile-repository.port.js';
import type { UserRepositoryPort } from '../../users/domain/ports/user-repository.port.js';
import { UserProfileCacheService } from '../../../shared/infrastructure/security/user-profile-cache.service.js';
import {
  ProfileNotFoundException,
  ProfileSlugAlreadyInUseException,
  ProfileSystemProtectedException,
  ProfileAdminProtectedException,
  ProfileHasUsersException,
  ProfilePrivilegeEscalationException,
} from '../domain/exceptions/profile.exceptions.js';
import { InvalidPermissionKeyException } from '../domain/value-objects/authorization-key.vo.js';
import { UserValidationException } from '../../users/domain/exceptions/user.exceptions.js';
import { User } from '../../users/domain/user.aggregate.js';
import { PasswordHash } from '../../users/domain/value-objects/password-hash.vo.js';
import { UserId } from '../../users/domain/value-objects/user-id.vo.js';

class InMemoryProfileRepo implements ProfileRepositoryPort {
  #store: Map<string, Profile> = new Map();

  async findById(
    id: ReturnType<typeof import('../domain/value-objects/profile-id.vo.js').profileId>,
  ) {
    return this.#store.get(id.value) ?? null;
  }
  async findBySlug(
    slug: ReturnType<typeof import('../domain/value-objects/profile-slug.vo.js').profileSlug>,
  ) {
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
  async delete(
    id: ReturnType<typeof import('../domain/value-objects/profile-id.vo.js').profileId>,
  ): Promise<void> {
    this.#store.delete(id.value);
  }
  /** helper p/ testes */
  prime(profile: Profile): void {
    this.#store.set(profile.id().value, profile);
  }
}

class InMemoryUserRepo implements UserRepositoryPort {
  count = 0;
  #store: Map<string, User> = new Map();
  /** helper p/ testes: popula um user com profileId (ator das travas de escalada) */
  prime(user: User): void {
    this.#store.set(user.id().value, user);
  }
  async countByProfile(): Promise<number> {
    return this.count;
  }
  async findById(id: { value: string }): Promise<User | null> {
    return this.#store.get(id.value) ?? null;
  }
  async findByEmail(): Promise<never | null> {
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async list(_input?: any): Promise<any> {
    return { items: [], nextCursor: null };
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async save(user: User, _expectedVersion: number): Promise<any> {
    this.#store.set(user.id().value, user);
    return user;
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
    uc = new ProfileUseCases(repo, users, cache);
  });

  describe('criar', () => {
    it('cria profile com sucesso', async () => {
      const result = await uc.criar({ slug: 'viewer', name: 'Visualizador' }, ATOR_ADMIN);
      expect(result.slug).toBe('viewer');
      expect(result.name).toBe('Visualizador');
      expect(result.version).toBe(1);
    });

    // pt-BR (#97, A4): `ProfileSlugAlreadyInUseException` mentia nome E status
    // — um `POST {"slug":"Bad Slug"}` respondia 409 PROFILE_SLUG_IN_USE, que
    // é "esse slug já existe". É erro de VALIDAÇÃO: 400.
    it('rejeita slug inválido (uppercase com espaço) como erro de validação', async () => {
      await expect(uc.criar({ slug: 'Bad Slug', name: 'X' }, ATOR_ADMIN)).rejects.toThrow(
        UserValidationException,
      );
    });

    it('rejeita slug duplicado', async () => {
      await uc.criar({ slug: 'viewer', name: 'V1' }, ATOR_ADMIN);
      await expect(uc.criar({ slug: 'viewer', name: 'V2' }, ATOR_ADMIN)).rejects.toThrow(
        ProfileSlugAlreadyInUseException,
      );
    });
  });

  describe('atualizar', () => {
    it('atualiza profile comum com sucesso', async () => {
      const created = await uc.criar({ slug: 'custom', name: 'Velho Long' }, ATOR_ADMIN);
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
      const created = await uc.criar({ slug: 'custom', name: 'Custom' }, ATOR_ADMIN);
      users.count = 0;
      await uc.deletar(created.id);
      const found = await repo.findById(
        created.id as unknown as ReturnType<
          typeof import('../domain/value-objects/profile-id.vo.js').profileId
        >,
      );
      expect(found).toBeNull();
    });

    it('rejeita deletar profile com users atribuídos', async () => {
      const created = await uc.criar({ slug: 'custom', name: 'Custom' }, ATOR_ADMIN);
      users.count = 3;
      await expect(uc.deletar(created.id)).rejects.toThrow(ProfileHasUsersException);
    });

    it('rejeita deletar profile isSystem', async () => {
      const p = Profile.criar({ slug: 'admin', name: 'Admin', isSystem: true, agora: T0 });
      repo.prime(p);
      users.count = 0;
      await expect(uc.deletar(p.id().value)).rejects.toThrow(ProfileSystemProtectedException);
    });

    // pt-BR (#97, B6): `deletar` protegia `isSystem` e não `isAdmin`.
    // Hoje o profile admin SÓ é protegido por acidente: se tem usuários, o
    // contador de `ProfileHasUsersException` barra; se não tem, a FK
    // `User.profileId` (onDelete: Restrict) não impede nada porque não há
    // linha referenciando. A invariável depende de raciocínio sobre a FK
    // que está a dois arquivos dali — e a próxima pessoa que lê `deletar`
    // não tem como vê-lo daqui.
    it('rejeita deletar profile isAdmin, mesmo sem users (B6)', async () => {
      const p = Profile.criar({ slug: 'root', name: 'Root', isAdmin: true, agora: T0 });
      repo.prime(p);
      users.count = 0;

      await expect(uc.deletar(p.id().value)).rejects.toThrow(ProfileAdminProtectedException);
    });
  });

  describe('listar/obter', () => {
    it('listar retorna todos', async () => {
      await uc.criar({ slug: 'aaa', name: 'Primeiro' }, ATOR_ADMIN);
      await uc.criar({ slug: 'bbb', name: 'Segundo' }, ATOR_ADMIN);
      const all = await uc.listar();
      expect(all).toHaveLength(2);
    });

    it('obterPorId retorna ProfileNotFound se não existe', async () => {
      await expect(uc.obterPorId('00000000-0000-0000-0000-000000000000')).rejects.toThrow(
        ProfileNotFoundException,
      );
    });
  });

  describe('catálogo de permissões (#97)', () => {
    it('rejeita initialPermissions com chave fora do catálogo', async () => {
      await expect(
        uc.criar(
          {
            slug: 'suspenso',
            name: 'Suspenso',
            initialPermissions: ['chave-inexistente'],
          },
          ATOR_ADMIN,
        ),
      ).rejects.toThrow(InvalidPermissionKeyException);
    });

    it('aceita initialPermissions com chave catalogada', async () => {
      const created = await uc.criar(
        {
          slug: 'com-permissao',
          name: 'Com Permissão',
          initialPermissions: ['users.read'],
        },
        ATOR_ADMIN,
      );
      expect(created.permissions).toEqual(['users.read']);
    });
  });

  // ─── A3: a garantia é do TIPO, não do call-site ───────────────────────────
  //
  // `isAdmin`/`isSystem` saíram de `CreateProfileInput`. O controller já não
  // os repassava, mas isso era uma promessa de UM call-site: um segundo
  // controller ou um seed novo reabriam o bypass. Aqui o campo nem existe
  // no contrato, e o teste prova que mesmo chegando em runtime (o tipo não
  // filtra nada) o profile nasce sem as flags.

  describe('criar — isAdmin/isSystem são seed-only (#97)', () => {
    it('ignora isAdmin=true que chegue em runtime', async () => {
      const created = await uc.criar(
        {
          slug: 'sneaky',
          name: 'Sneaky',
          isAdmin: true,
        } as never,
        ATOR_ADMIN,
      );

      expect(created.isAdmin).toBe(false);
    });

    it('ignora isSystem=true que chegue em runtime', async () => {
      const created = await uc.criar(
        {
          slug: 'sneaky-sistema',
          name: 'Sneaky Sistema',
          isSystem: true,
        } as never,
        ATOR_ADMIN,
      );

      expect(created.isSystem).toBe(false);
    });
  });
});

// ─── ESCALADA DE PRIVILÉGIO (#97) ────────────────────────────────────────────
//
// As duas travas fecham caminhos que a `PermissionsGuard` sozinha não
// fecha: ela verifica a PERMISSÃO do endpoint, não o OBJETO que a
// permissão alcança. `admin.manage-users` permite atribuir profile — mas
// não a si mesmo o profile `isAdmin`, que é bypass total.

const ATOR_ID = '0190a8b6-1234-7abc-9def-0000000000a1';
const ROOT_ID = '0190a8b6-1234-7abc-9def-0000000000b1';
const ALVO_ID = '0190a8b6-1234-7abc-9def-0000000000c1';
const ATOR: AtorAutenticado = { userId: ATOR_ID, tenantId: null, isAdmin: false };
const ATOR_ADMIN: AtorAutenticado = { userId: ROOT_ID, tenantId: null, isAdmin: true };

/**
 * User com profile, para ser o ator das travas. `id` precisa ser UUID v7
 * — `UserId.create()` recusa qualquer outra coisa.
 */
function userComProfile(id: string, profileId: string | null): User {
  return User.criar({
    id,
    nome: 'Ator Ativo',
    email: `ator-${id}@exemplo.com`,
    senhaHash: PasswordHash.create(
      '$argon2id$v=19$m=65536,p=4,t=3$c2FsdGZhdG8xMjM0NTY$ZGlnZXN0ZmFkc2g',
    ),
    profileId,
    agora: new Date('2026-01-01T00:00:00Z'),
  });
}

describe('AuthorizationUseCases — auto-concessão (#97)', () => {
  let repo: InMemoryProfileRepo;
  let users: InMemoryUserRepo;
  let cache: UserProfileCacheService;
  let uc: AuthorizationUseCases;

  beforeEach(() => {
    repo = new InMemoryProfileRepo();
    users = new InMemoryUserRepo();
    cache = new UserProfileCacheService();
    uc = new AuthorizationUseCases(repo, users, cache);
  });

  it('recusa ator sem isAdmin conceder permissão ao PRÓPRIO profile', async () => {
    const meu = Profile.criar({ slug: 'meu-perfil', name: 'Meu Perfil', agora: new Date() });
    repo.prime(meu);
    users.prime(userComProfile(ATOR_ID, meu.id().value));

    await expect(uc.atribuir(meu.id().value, 'admin.manage-users', ATOR)).rejects.toThrow(
      ProfilePrivilegeEscalationException,
    );
  });

  // pt-BR (#97, B3): este teste ANTES afirmava o contrário — "recusa ator sem
  // isAdmin revogar do PRÓPRIO profile" — e foi ele que segurava o lockout.
  //
  // O critério da casa está escrito no método vizinho (`recusaConcessaoQueNaoTem`)
  // e é explícito: "remover privilégio nunca é escalada". Auto-concessão existe
  // para barrar AUTO-Promoção (o ator se dá uma chave a si mesmo). Aplicá-la a
  // `revogar` inverte o efeito: se um admin concedeu `users.delete` por engano a
  // um não-admin, esse usuário FICA TRANCADO — a única rota de saída dele seria
  // pedir a outro admin. Remover permissão não amplia poder de ninguém.
  it('permite ator sem isAdmin revogar do PRÓPRIO profile (B3: revogar nunca é escalada)', async () => {
    const meu = Profile.criar({
      slug: 'meu-perfil',
      name: 'Meu Perfil',
      initialAuthorizations: ['users.read'],
      agora: new Date(),
    });
    repo.prime(meu);
    users.prime(userComProfile(ATOR_ID, meu.id().value));

    const detail = await uc.revogar(meu.id().value, 'users.read', ATOR);
    // O estado tem que mudar: um "passa" que não revogasse nada seria verde
    // aqui e o usuário continuaria trancado em produção.
    expect(detail.permissions).not.toContain('users.read');
  });

  // pt-BR (#97): o antigo "permite ator sem isAdmin mexer em OUTRO profile"
  // foi removido — o ator de lá não tinha profile nenhum e mesmo assim
  // concedia `users.read`. Quem não tem nenhuma permissão não concede
  // nenhuma; o caso legítimo é o de baixo (ator COM a chave).

  it('permite ator isAdmin mexer no PRÓPRIO profile', async () => {
    const meu = Profile.criar({ slug: 'root-perfil', name: 'Root', agora: new Date() });
    repo.prime(meu);
    users.prime(userComProfile(ROOT_ID, meu.id().value));

    const detail = await uc.atribuir(meu.id().value, 'users.read', ATOR_ADMIN);
    expect(detail.permissions).toContain('users.read');
  });

  // ─── A6: ator que não resolve é fail-CLOSED ──────────────────────────────
  //
  // `userRepo.findById` devolve `null` para ator soft-deleted (o repo
  // filtra `deletedAt`). Com `?.` o "não sei quem eu sou" virava "não sou
  // eu" e as travas não disparavam — o pedido mais privilegiado do
  // sistema passava porque o ATOR sumiu do banco.

  it('ator que não resolve no banco é fail-closed em atribuir', async () => {
    const outro = Profile.criar({ slug: 'outro-perfil', name: 'Outro', agora: new Date() });
    repo.prime(outro);

    await expect(
      uc.atribuir(outro.id().value, 'users.read', {
        tenantId: null,
        userId: '0190a8b6-1234-7abc-9def-0000000000d1',
        isAdmin: false,
      }),
    ).rejects.toThrow(ProfilePrivilegeEscalationException);
  });

  it('ator que não resolve no banco é fail-closed em revogar', async () => {
    const outro = Profile.criar({
      slug: 'outro-perfil',
      name: 'Outro',
      initialAuthorizations: ['users.read'],
      agora: new Date(),
    });
    repo.prime(outro);

    await expect(
      uc.revogar(outro.id().value, 'users.read', {
        tenantId: null,
        userId: '0190a8b6-1234-7abc-9def-0000000000d1',
        isAdmin: false,
      }),
    ).rejects.toThrow(ProfilePrivilegeEscalationException);
  });

  // ─── A1.1: não se concede o que não se tem ─────────────────────────────────
  //
  // `admin.manage-authorizations` diz que o ator pode mexer em
  // PERMISSIONS de qualquer profile; não diz que ele pode inventar
  // permissões. Sem esta trava o ator cunha o profile `R` com o
  // conjunto `admin.*` completo e depois se dá o `R`.

  it('recusa ator sem a permissão conceder a OUTRO profile uma chave que ele não tem', async () => {
    const meu = Profile.criar({
      slug: 'meu-perfil',
      name: 'Meu Perfil',
      initialAuthorizations: ['admin.manage-authorizations'],
      agora: new Date(),
    });
    const alvo = Profile.criar({ slug: 'alvo', name: 'Alvo', agora: new Date() });
    repo.prime(meu);
    repo.prime(alvo);
    users.prime(userComProfile(ATOR_ID, meu.id().value));

    await expect(uc.atribuir(alvo.id().value, 'admin.manage-users', ATOR)).rejects.toThrow(
      ProfilePrivilegeEscalationException,
    );
  });

  it('permite ator sem isAdmin conceder a OUTRO profile uma chave que ele TEM', async () => {
    const meu = Profile.criar({
      slug: 'meu-perfil',
      name: 'Meu Perfil',
      initialAuthorizations: ['admin.manage-authorizations', 'users.read', 'users.write'],
      agora: new Date(),
    });
    const alvo = Profile.criar({ slug: 'alvo', name: 'Alvo', agora: new Date() });
    repo.prime(meu);
    repo.prime(alvo);
    users.prime(userComProfile(ATOR_ID, meu.id().value));

    const detail = await uc.atribuir(alvo.id().value, 'users.read', ATOR);
    expect(detail.permissions).toContain('users.read');
  });

  it('ator sem profile nenhum não concede nada (deny-by-default)', async () => {
    const alvo = Profile.criar({ slug: 'alvo', name: 'Alvo', agora: new Date() });
    repo.prime(alvo);
    users.prime(userComProfile(ATOR_ID, null));

    await expect(uc.atribuir(alvo.id().value, 'users.read', ATOR)).rejects.toThrow(
      ProfilePrivilegeEscalationException,
    );
  });

  it('ator isAdmin ignora a trava de subconjunto (bypass total, igual ao guard)', async () => {
    const meu = Profile.criar({ slug: 'root-perfil', name: 'Root', agora: new Date() });
    const alvo = Profile.criar({ slug: 'alvo', name: 'Alvo', agora: new Date() });
    repo.prime(meu);
    repo.prime(alvo);
    users.prime(userComProfile(ROOT_ID, meu.id().value));

    const detail = await uc.atribuir(alvo.id().value, 'admin.manage-users', ATOR_ADMIN);
    expect(detail.permissions).toContain('admin.manage-users');
  });
});

describe('UserProfileUseCases — atribuir profile admin (#97)', () => {
  let repo: InMemoryProfileRepo;
  let users: InMemoryUserRepo;
  let cache: UserProfileCacheService;
  let uc: UserProfileUseCases;

  beforeEach(() => {
    repo = new InMemoryProfileRepo();
    users = new InMemoryUserRepo();
    cache = new UserProfileCacheService();
    uc = new UserProfileUseCases(users, repo, cache);
  });

  it('recusa ator sem isAdmin atribuir profile admin a si mesmo', async () => {
    const admin = Profile.criar({
      slug: 'admin',
      name: 'Administrador',
      isAdmin: true,
      agora: new Date(),
    });
    repo.prime(admin);
    users.prime(userComProfile(ATOR_ID, null));

    await expect(uc.atribuirProfileAoUser(ATOR_ID, admin.id().value, ATOR)).rejects.toThrow(
      ProfilePrivilegeEscalationException,
    );
  });

  it('recusa ator sem isAdmin atribuir profile admin a OUTRO usuário', async () => {
    const admin = Profile.criar({
      slug: 'admin',
      name: 'Administrador',
      isAdmin: true,
      agora: new Date(),
    });
    repo.prime(admin);
    users.prime(userComProfile(ALVO_ID, null));

    await expect(uc.atribuirProfileAoUser(ALVO_ID, admin.id().value, ATOR)).rejects.toThrow(
      ProfilePrivilegeEscalationException,
    );
  });

  it('permite ator isAdmin atribuir profile admin', async () => {
    const admin = Profile.criar({
      slug: 'admin',
      name: 'Administrador',
      isAdmin: true,
      agora: new Date(),
    });
    repo.prime(admin);
    users.prime(userComProfile(ALVO_ID, null));

    await expect(
      uc.atribuirProfileAoUser(ALVO_ID, admin.id().value, ATOR_ADMIN),
    ).resolves.toBeUndefined();
    // Comportamento, não `toBeDefined`: o id do profile tem de estar no
    // user, senão o `atribuirPerfil` não rodou.
    const salvo = await users.findById(UserId.create(ALVO_ID));
    expect(salvo?.profileId()).toBe(admin.id().value);
  });

  it('permite ator sem isAdmin atribuir profile comum', async () => {
    const comum = Profile.criar({ slug: 'viewer', name: 'Visualizador', agora: new Date() });
    repo.prime(comum);
    users.prime(userComProfile(ALVO_ID, null));

    await expect(
      uc.atribuirProfileAoUser(ALVO_ID, comum.id().value, ATOR),
    ).resolves.toBeUndefined();
  });

  // ─── A1.2: auto-atribuição só de subconjunto ─────────────────────────────
  //
  // Fecha um caminho que a A1.1 não pega: um profile JÁ EXISTENTE (criado
  // por um admin) que carrega permissões que o ator não tem. Não precisa
  // cunha nada — basta um PUT em si mesmo para ganhar o que o profile tem.

  it('recusa auto-atribuição de um profile cujas permissões o ator não tem', async () => {
    const meu = Profile.criar({
      slug: 'meu-perfil',
      name: 'Meu Perfil',
      initialAuthorizations: ['admin.manage-users', 'users.read'],
      agora: new Date(),
    });
    const doAdmin = Profile.criar({
      slug: 'super-poderes',
      name: 'Super Poderes',
      initialAuthorizations: ['admin.manage-users', 'users.delete', 'audits.read'],
      agora: new Date(),
    });
    repo.prime(meu);
    repo.prime(doAdmin);
    users.prime(userComProfile(ATOR_ID, meu.id().value));

    await expect(uc.atribuirProfileAoUser(ATOR_ID, doAdmin.id().value, ATOR)).rejects.toThrow(
      ProfilePrivilegeEscalationException,
    );
    const intacto = await users.findById(UserId.create(ATOR_ID));
    expect(intacto?.profileId()).toBe(meu.id().value);
  });

  it('auto-atribuição de subconjunto é liberada (não trava o fluxo legítimo)', async () => {
    const meu = Profile.criar({
      slug: 'meu-perfil',
      name: 'Meu Perfil',
      initialAuthorizations: ['admin.manage-users', 'users.read', 'users.write'],
      agora: new Date(),
    });
    const sub = Profile.criar({
      slug: 'sem-mais-que-o-autorizado',
      name: 'Subconjunto',
      initialAuthorizations: ['admin.manage-users'],
      agora: new Date(),
    });
    repo.prime(meu);
    repo.prime(sub);
    users.prime(userComProfile(ATOR_ID, meu.id().value));

    await uc.atribuirProfileAoUser(ATOR_ID, sub.id().value, ATOR);
    const salvo = await users.findById(UserId.create(ATOR_ID));
    expect(salvo?.profileId()).toBe(sub.id().value);
  });

  it('auto-atribuição por ator que não resolve é fail-closed', async () => {
    const sub = Profile.criar({
      slug: 'vazio-permissoes',
      name: 'Vazio',
      initialAuthorizations: ['users.read'],
      agora: new Date(),
    });
    repo.prime(sub);
    users.prime(userComProfile(ALVO_ID, null));

    await expect(
      uc.atribuirProfileAoUser('0190a8b6-1234-7abc-9def-0000000000d1', sub.id().value, {
        tenantId: null,
        userId: '0190a8b6-1234-7abc-9def-0000000000d1',
        isAdmin: false,
      }),
    ).rejects.toThrow(ProfilePrivilegeEscalationException);
  });

  // pt-BR (#97, achado B1): o alvo NÃO pode ser o ator. Antes disto o subconjunto
  // só era exigido na auto-atribuição, e como `POST /users` é `@Public()` o
  // "outro usuário" não é terceiro confiável — é um boneco que o próprio ator
  // cria e autentica. Atribuir a ele um profile mais largo que o do ator era a
  // escalada completa, por delegação.
  it('atribuir a OUTRO usuário profile mais largo que o do ator é recusado (B1)', async () => {
    const meu = Profile.criar({
      slug: 'meu-perfil',
      name: 'Meu Perfil',
      initialAuthorizations: ['admin.manage-users'],
      agora: new Date(),
    });
    const amplo = Profile.criar({
      slug: 'amplo',
      name: 'Amplo',
      initialAuthorizations: ['admin.manage-users', 'users.delete', 'audits.read'],
      agora: new Date(),
    });
    repo.prime(meu);
    repo.prime(amplo);
    users.prime(userComProfile(ATOR_ID, meu.id().value));
    users.prime(userComProfile(ALVO_ID, null));

    await expect(uc.atribuirProfileAoUser(ALVO_ID, amplo.id().value, ATOR)).rejects.toThrow(
      ProfilePrivilegeEscalationException,
    );
    // O boneco não pode ter ficado com o profile: um 403 que gravou seria
    // verde aqui e uma escalada viva.
    const salvo = await users.findById(UserId.create(ALVO_ID));
    expect(salvo?.profileId()).toBeNull();
  });

  it('delegar a OUTRO usuário um SUBCONJUNTO do que o ator tem continua passando', async () => {
    // O par LIBERDADE do teste acima. Sem ele, um guard que recusasse TODA
    // atribuição a terceiros também ficaria verde nos dois.
    const meu = Profile.criar({
      slug: 'meu-perfil',
      name: 'Meu Perfil',
      initialAuthorizations: ['admin.manage-users', 'users.read'],
      agora: new Date(),
    });
    const sub = Profile.criar({
      slug: 'sub',
      name: 'Sub',
      initialAuthorizations: ['users.read'],
      agora: new Date(),
    });
    repo.prime(meu);
    repo.prime(sub);
    users.prime(userComProfile(ATOR_ID, meu.id().value));
    users.prime(userComProfile(ALVO_ID, null));

    await expect(uc.atribuirProfileAoUser(ALVO_ID, sub.id().value, ATOR)).resolves.toBeUndefined();
    const salvo = await users.findById(UserId.create(ALVO_ID));
    expect(salvo?.profileId()).toBe(sub.id().value);
  });

  it('limpar o profile comum (null) nunca é escalada', async () => {
    // Profile REAL (id válido): o `profileId` guardado é FK com Restrict, então
    // um id que não existe é estado impossível — e o fixture antigo `'p-1'`
    // quebrava no `ProfileId.create` da checagem B4.
    const comum = Profile.criar({
      slug: 'comum',
      name: 'Comum',
      initialAuthorizations: ['users.read'],
      agora: new Date(),
    });
    repo.prime(comum);
    users.prime(userComProfile(ALVO_ID, comum.id().value));

    await expect(uc.atribuirProfileAoUser(ALVO_ID, null, ATOR)).resolves.toBeUndefined();
    const salvo = await users.findById(UserId.create(ALVO_ID));
    expect(salvo?.profileId()).toBeNull();
  });

  it('desligar o profile ADMIN de um usuário é recusado a ator não-admin (B4)', async () => {
    // Com `profileId === null` o bloco de autorização é pulado inteiro, então
    // um ator não-admin com `admin.manage-users` trancava o sistema: o root é
    // o único com bypass. MEDIDO pelo achado B4 da revisão de segurança.
    const admin = Profile.criar({
      slug: 'admin',
      name: 'Administrador',
      isAdmin: true,
      agora: new Date(),
    });
    repo.prime(admin);
    users.prime(userComProfile(ALVO_ID, admin.id().value));

    await expect(uc.atribuirProfileAoUser(ALVO_ID, null, ATOR)).rejects.toThrow(
      ProfilePrivilegeEscalationException,
    );
    const salvo = await users.findById(UserId.create(ALVO_ID));
    expect(salvo?.profileId()).toBe(admin.id().value);
  });

  it('desligar o profile admin é permitido a ator isAdmin', async () => {
    const admin = Profile.criar({
      slug: 'admin',
      name: 'Administrador',
      isAdmin: true,
      agora: new Date(),
    });
    repo.prime(admin);
    users.prime(userComProfile(ALVO_ID, admin.id().value));

    await expect(
      uc.atribuirProfileAoUser(ALVO_ID, null, { userId: ATOR_ID, tenantId: null, isAdmin: true }),
    ).resolves.toBeUndefined();
  });
});

// ─── A1.3: `criar` com permissão inicial é uma CONCESSÃO ───────────────────
//
// `POST /admin/profiles` exige `admin.manage-profiles` — a chave de GERIR
// perfis, não a de conceder permissões. A1.1 fecha o caminho pelo
// `atribuir`, mas o `criar` aceita `initialPermissions` e não tinha trava
// nenhuma: um ator com SÓ `admin.manage-profiles` postava
// `{"slug":"root","name":"root","initialPermissions":["admin.manage-users"]}`
// e ficava com um profile que `atribuir` jamais deixaria existir — o mesmo
// "cunha um profile vazio, enche do conjunto `admin.*`" que o comentário de
// `recusaConcessaoQueNaoTem` descreve, só que pela porta de trás.
describe('ProfileUseCases — `criar` com permissão inicial é concessão (#97/A1.3)', () => {
  let repo: InMemoryProfileRepo;
  let users: InMemoryUserRepo;
  let cache: UserProfileCacheService;
  let uc: ProfileUseCases;

  beforeEach(() => {
    repo = new InMemoryProfileRepo();
    users = new InMemoryUserRepo();
    cache = new UserProfileCacheService();
    uc = new ProfileUseCases(repo, users, cache);
  });

  it('recusa criar com uma permissão que o ator não tem', async () => {
    const meu = Profile.criar({
      slug: 'meu-perfil',
      name: 'Meu Perfil',
      initialAuthorizations: ['admin.manage-profiles'],
      agora: new Date(),
    });
    repo.prime(meu);
    users.prime(userComProfile(ATOR_ID, meu.id().value));

    await expect(
      uc.criar({ slug: 'root', name: 'Root', initialPermissions: ['admin.manage-users'] }, ATOR),
    ).rejects.toThrow(ProfilePrivilegeEscalationException);

    // E nada foi criado: um 403 que deixa o profile no banco é uma escalada
    // que o próximo `listar` entrega.
    expect(await repo.findBySlug(profileSlug('root'))).toBeNull();
  });

  it('permite criar com uma permissão que o ator TEM (subconjunto)', async () => {
    const meu = Profile.criar({
      slug: 'meu-perfil',
      name: 'Meu Perfil',
      initialAuthorizations: ['admin.manage-profiles', 'users.read'],
      agora: new Date(),
    });
    repo.prime(meu);
    users.prime(userComProfile(ATOR_ID, meu.id().value));

    const criado = await uc.criar(
      { slug: 'leitor', name: 'Leitor', initialPermissions: ['users.read'] },
      ATOR,
    );
    expect(criado.permissions).toEqual(['users.read']);
  });

  it('ator isAdmin cria com qualquer permissão (o bypass é total)', async () => {
    const criado = await uc.criar(
      { slug: 'root', name: 'Root', initialPermissions: ['admin.manage-users'] },
      ATOR_ADMIN,
    );
    expect(criado.permissions).toEqual(['admin.manage-users']);
  });

  // Fail-CLOSED, igual a `recusaConcessaoQueNaoTem`: ator que não resolve no
  // banco (soft-deleted) tem conjunto VAZIO de permissões — então qualquer
  // `initialPermissions` é recusa. Sem este teste, trocar `findById` por um
  // `?.` silencioso devolveria um conjunto `undefined` que passa em tudo.
  it('recusa quando o ator não resolve no banco (soft-deleted)', async () => {
    await expect(
      uc.criar({ slug: 'root', name: 'Root', initialPermissions: ['users.read'] }, ATOR),
    ).rejects.toThrow(ProfilePrivilegeEscalationException);
  });
});

/**
 * pt-BR (#97): o `motivo` da escalada é um campo que NENHUM log lia — a
 * exceção não pode logar (`domain/` não importa `@nestjs/common`, e o hook
 * `stack-code-reviewer` bloqueia), e o `GlobalExceptionFilter` só loga a
 * partir de 500, então um 403 de escalada passava sem rastro nenhum.
 *
 * Este teste existe para a LINHA não virar código morto: se alguém trocar
 * `recusaEscalada` por um `throw new ProfilePrivilegeEscalationException(...)`
 * "só para simplifier", ele fica vermelho.
 */
describe('escalada recusada deixa rastro no log (#97)', () => {
  it('loga o motivo ao recusar', async () => {
    const repo = new InMemoryProfileRepo();
    const users = new InMemoryUserRepo();
    const uc = new AuthorizationUseCases(repo, users, new UserProfileCacheService());
    const meu = Profile.criar({
      slug: 'meu-perfil',
      name: 'Meu Perfil',
      initialAuthorizations: ['admin.manage-authorizations'],
      agora: new Date(),
    });
    repo.prime(meu);
    users.prime(userComProfile(ATOR_ID, meu.id().value));

    const aviso = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    try {
      await expect(uc.atribuir(meu.id().value, 'admin.manage-users', ATOR)).rejects.toThrow(
        ProfilePrivilegeEscalationException,
      );

      expect(aviso).toHaveBeenCalledTimes(1);
      // O motivo em texto, e não só "algo foi recusado": é o motivo que diz
      // QUAL das 7 ramificações disparou.
      expect(String(aviso.mock.calls[0]?.[0])).toContain('próprio profile');
    } finally {
      aviso.mockRestore();
    }
  });
});
