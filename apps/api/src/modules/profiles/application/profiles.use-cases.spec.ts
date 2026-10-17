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
import type { TenantMembershipRepositoryPort } from '../../tenancy/domain/ports/tenant-membership-repository.port.js';
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

  /**
   * pt-BR (Fase 9 — RLS): os escopos que o use case PEDIU, em ordem.
   *
   * Por que isto existe: o TypeScript aceita uma implementação da porta com
   * MENOS parâmetros que a interface, então um `findById` que ignora o
   * `tenantId` compila, roda e deixa os 779 testes verdes — sem que nada em
   * lugar nenhum afirme que o escopo chega ao repositório. O `findBySlug`
   * acima filtra de propósito (a unicidade é por escopo); o `findById` NÃO
   * filtra, porque na implementação real quem filtra é a policy, e ela aceita
   * tanto a linha da empresa quanto a global — é assim que um ator de empresa
   * veste o perfil de sistema. Aqui ele só REGISTRA.
   */
  readonly escoposPedidos: Array<string | null> = [];

  async findById(
    id: ReturnType<typeof import('../domain/value-objects/profile-id.vo.js').profileId>,
    tenantId: string | null,
  ) {
    this.escoposPedidos.push(tenantId);
    return this.#store.get(id.value) ?? null;
  }
  async findBySlug(
    slug: ReturnType<typeof import('../domain/value-objects/profile-slug.vo.js').profileSlug>,
    tenantId: string | null,
  ) {
    // pt-BR (Fase 8): o escopo é FILTRADO de verdade. Sem isto o fake aceitaria
    // o slug de qualquer empresa e um teste de escalada por slug passaria sem
    // que a regra exista.
    for (const p of this.#store.values()) {
      if (p.slug().value === slug.value && p.tenantId() === tenantId) return p;
    }
    return null;
  }
  async list(tenantId: string | null): Promise<Profile[]> {
    // pt-BR (Fase 8): `null` = sem filtro (admin global), preenchido = só a
    // empresa. Mesma convenção da porta.
    return [...this.#store.values()].filter((p) => tenantId === null || p.tenantId() === tenantId);
  }
  async save(profile: Profile): Promise<Profile> {
    this.#store.set(profile.id().value, profile);
    return profile;
  }
  async delete(
    id: ReturnType<typeof import('../domain/value-objects/profile-id.vo.js').profileId>,
    tenantId: string | null,
  ): Promise<void> {
    this.escoposPedidos.push(tenantId);
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

/**
 * pt-BR (Fase 4 — tenancy): o bucket por empresa, em memória.
 *
 * ⚠️ O `tenantId === null` NÃO devolve `null` aqui — devolve o
 * `users.profile_id`, exatamente como o `PrismaTenantMembershipRepository`.
 * Não é conveniência: os testes de escalada do #97 (acima) semeiam o perfil no
 * usuário e chamam com `tenantId: null`, e um stub que devolvesse `null` deixaria
 * todos eles verdes por vazio — a trava dispararia sempre, por motivo errado.
 * O stub tem de ser fiel ao contrato da porta, ou ele mede o stub.
 *
 * A regra de DONA do perfil (perfil de outra empresa → `null`) NÃO está aqui de
 * propósito: ela é da implementação Prisma e é medida lá e no spec de
 * integração. O que este stub mede é "a use case pede o perfil DA EMPRESA e usa
 * a resposta".
 */
class InMemoryMembershipRepo implements TenantMembershipRepositoryPort {
  /** `${tenantId}:${userId}` → `profileId`. */
  #porEmpresa = new Map<string, string>();
  /** Fase 6: quem é membro, COM ou SEM perfil. */
  readonly #membros = new Set<string>();
  /** helper p/ `deletar`: quantas memberships vestem o perfil. */
  count = 0;
  /**
   * Fase 5: `emitirConvite`authorize por `role === 'owner'`, e o stub não
   * guardava papéis — só perfis. Sem este método o `tsc` reprovava a classe
   * inteira (`TS2420`), que é o modo de falha "spec verde com tsc vermelho":
   * o Vitest não faz typecheck, então os testes passavam e o build quebrava.
   *
   * `#porEmpresa` guarda `profileId`, não `role`; um convite nunca chega
   * aqui, então o valor fixo serve e é explícito.
   */
  findRole(): Promise<string | null> {
    return Promise.resolve('owner');
  }

  constructor(private readonly users: InMemoryUserRepo) {}

  prime(userId: string, tenantId: string, profileId: string): void {
    this.#membros.add(`${tenantId}:${userId}`);
    this.#porEmpresa.set(`${tenantId}:${userId}`, profileId);
  }

  /**
   * Fase 6: membership SEM perfil — o estado em que o convite aceito deixa a
   * pessoa. Precisa existir separada de "não é membro" porque são recusas
   * diferentes na tela, e um stub que confunde as duas mediria o stub.
   */
  semPerfil(userId: string, tenantId: string): void {
    this.#membros.add(`${tenantId}:${userId}`);
  }

  /** Fase 6: o que o `findProfileId` devolveria depois da escrita. */
  atribuirPerfil(userId: string, tenantId: string, profileId: string | null): Promise<boolean> {
    const chave = `${tenantId}:${userId}`;
    if (!this.#membros.has(chave)) {
      return Promise.resolve(false);
    }
    if (profileId === null) {
      this.#porEmpresa.delete(chave);
    } else {
      this.#porEmpresa.set(chave, profileId);
    }
    return Promise.resolve(true);
  }

  async findProfileId(userId: string, tenantId: string | null): Promise<string | null> {
    if (tenantId === null) {
      // ⚠️ Este ramo NÃO checa se o perfil é global — e está correta assim,
      // porque aqui todo perfil é global por construção: `Profile.criar` não
      // conhece `tenantId`, e `perfilDaEmpresa` só o usa para dar slug próprio.
      // O filtro `profile: { is: { tenantId: null } }` do repositório real tem
      // spec próprio em `tenancy-migration.integration.spec.ts`.
      const user = await this.users.findById({ value: userId });
      return user?.profileId() ?? null;
    }
    return this.#porEmpresa.get(`${tenantId}:${userId}`) ?? null;
  }

  async countByProfile(): Promise<number> {
    return this.count;
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
    uc = new ProfileUseCases(repo, users, cache, new InMemoryMembershipRepo(users));
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
      const updated = await uc.atualizar(created.id, { name: 'Novo' }, ATOR_ADMIN);
      expect(updated.name).toBe('Novo');
      expect(updated.version).toBeGreaterThanOrEqual(2);
    });

    it('rejeita atualizar profile não encontrado', async () => {
      await expect(
        uc.atualizar('00000000-0000-0000-0000-000000000000', { name: 'X' }, ATOR_ADMIN),
      ).rejects.toThrow(ProfileNotFoundException);
    });

    it('rejeita atualizar profile isSystem', async () => {
      const p = Profile.criar({ slug: 'admin', name: 'Admin', isSystem: true, agora: T0 });
      repo.prime(p);
      await expect(uc.atualizar(p.id().value, { name: 'X' }, ATOR_ADMIN)).rejects.toThrow(
        ProfileSystemProtectedException,
      );
    });

    it('rejeita atualizar profile isAdmin (mesmo sem isSystem)', async () => {
      const p = Profile.criar({ slug: 'admin', name: 'Admin', isAdmin: true, agora: T0 });
      repo.prime(p);
      await expect(uc.atualizar(p.id().value, { name: 'X' }, ATOR_ADMIN)).rejects.toThrow(
        ProfileAdminProtectedException,
      );
    });
  });

  describe('deletar', () => {
    it('deleta profile comum sem users', async () => {
      const created = await uc.criar({ slug: 'custom', name: 'Custom' }, ATOR_ADMIN);
      users.count = 0;
      await uc.deletar(created.id, ATOR_ADMIN);
      const found = await repo.findById(
        created.id as unknown as ReturnType<
          typeof import('../domain/value-objects/profile-id.vo.js').profileId
        >,
        null,
      );
      expect(found).toBeNull();
    });

    it('rejeita deletar profile com users atribuídos', async () => {
      const created = await uc.criar({ slug: 'custom', name: 'Custom' }, ATOR_ADMIN);
      users.count = 3;
      await expect(uc.deletar(created.id, ATOR_ADMIN)).rejects.toThrow(ProfileHasUsersException);
    });

    it('rejeita deletar profile isSystem', async () => {
      const p = Profile.criar({ slug: 'admin', name: 'Admin', isSystem: true, agora: T0 });
      repo.prime(p);
      users.count = 0;
      await expect(uc.deletar(p.id().value, ATOR_ADMIN)).rejects.toThrow(
        ProfileSystemProtectedException,
      );
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

      await expect(uc.deletar(p.id().value, ATOR_ADMIN)).rejects.toThrow(
        ProfileAdminProtectedException,
      );
    });
  });

  describe('listar/obter', () => {
    it('listar retorna todos', async () => {
      await uc.criar({ slug: 'aaa', name: 'Primeiro' }, ATOR_ADMIN);
      await uc.criar({ slug: 'bbb', name: 'Segundo' }, ATOR_ADMIN);
      const all = await uc.listar(ATOR_ADMIN);
      expect(all).toHaveLength(2);
    });

    it('obterPorId retorna ProfileNotFound se não existe', async () => {
      await expect(
        uc.obterPorId('00000000-0000-0000-0000-000000000000', ATOR_ADMIN),
      ).rejects.toThrow(ProfileNotFoundException);
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
    uc = new AuthorizationUseCases(repo, users, cache, new InMemoryMembershipRepo(users));
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
    uc = new UserProfileUseCases(users, repo, cache, new InMemoryMembershipRepo(users));
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
    uc = new ProfileUseCases(repo, users, cache, new InMemoryMembershipRepo(users));
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
    expect(await repo.findBySlug(profileSlug('root'), ATOR.tenantId)).toBeNull();
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
    const uc = new AuthorizationUseCases(
      repo,
      users,
      new UserProfileCacheService(),
      new InMemoryMembershipRepo(users),
    );
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

// ─── FASE 4: o perfil efetivo é o DA EMPRESA (D4) ───────────────────────────
//
// O que a Fase 3 deixou em aberto, medido: o `tenantId` chegava ao
// `obterMeuPerfil` e virava chave de cache, mas o perfil lido continuava sendo
// `users.profile_id` — GLOBAL. Uma conta em duas empresas vestia o mesmo
// perfil nas duas, e as 4 travas anti-escalação comparavam esse mesmo perfil
// global. Esta é a fase em que a leitura passa a ser por membership.
const ACME = '0190a8b6-0000-4000-8000-0000000000ac';
const GLOBEX = '0190a8b6-0000-4000-8000-0000000000ab';
const ATOR_ACME: AtorAutenticado = { userId: ATOR_ID, tenantId: ACME, isAdmin: false };

describe('Fase 4 — perfil por empresa (D4)', () => {
  let repo: InMemoryProfileRepo;
  let users: InMemoryUserRepo;
  let memberships: InMemoryMembershipRepo;
  let cache: UserProfileCacheService;
  let uc: UserProfileUseCases;

  beforeEach(() => {
    repo = new InMemoryProfileRepo();
    users = new InMemoryUserRepo();
    memberships = new InMemoryMembershipRepo(users);
    cache = new UserProfileCacheService();
    uc = new UserProfileUseCases(users, repo, cache, memberships);
  });

  /** Perfil com slug próprio — dois perfis de empresas diferentes precisam de
   *  slugs diferentes aqui, porque `InMemoryProfileRepo` indexa por valor. */
  function perfilDaEmpresa(
    slug: string,
    permissoes: string[],
    // pt-BR (Fase 8): o padrão é GLOBAL, que é o que os testes da Fase 4
    // queriam. Passar a empresa deixa o alvo no mesmo escopo do ator — sem
    // isso a guarda de escopo (que vem ANTES da de auto-concessão) recusa e o
    // teste mede a regra errada.
    tenantId: string | null = null,
  ): Profile {
    const p = Profile.criar({
      slug,
      name: slug,
      initialAuthorizations: permissoes,
      tenantId,
      agora: new Date(),
    });
    repo.prime(p);
    return p;
  }

  it('a MESMA conta tem perfis DIFERENTES em duas empresas', async () => {
    const daAcme = perfilDaEmpresa('gestor-acme', ['admin.manage-users']);
    const daGlobex = perfilDaEmpresa('leitor-globex', ['users.read']);
    users.prime(userComProfile(ATOR_ID, daAcme.id().value));
    memberships.prime(ATOR_ID, ACME, daAcme.id().value);
    memberships.prime(ATOR_ID, GLOBEX, daGlobex.id().value);

    const naAcme = await uc.obterMeuPerfil(ATOR_ID, ACME);
    const naGlobex = await uc.obterMeuPerfil(ATOR_ID, GLOBEX);

    // Este é o teste que a demanda inteira pede. Com a leitura global (o que a
    // Fase 3 entregou) as duas respostas seriam IGUAIS e ele ficaria verde
    // pela metade — daí as duas metades em vez de uma.
    expect(naAcme.profileSlug).toBe('gestor-acme');
    expect(naGlobex.profileSlug).toBe('leitor-globex');
    expect(naAcme.permissions).toEqual(['admin.manage-users']);
    expect(naGlobex.permissions).toEqual(['users.read']);
    expect(naAcme.isAdmin).toBe(false);
  });

  it('sem header de empresa, resolve o perfil GLOBAL (users.profile_id)', async () => {
    const global = perfilDaEmpresa('viewer', ['users.read']);
    users.prime(userComProfile(ATOR_ID, global.id().value));

    await expect(uc.obterMeuPerfil(ATOR_ID, null)).resolves.toMatchObject({
      profileSlug: 'viewer',
      permissions: ['users.read'],
    });
  });

  it('empresa sem membership resolve SEM perfil nenhum, não o global', async () => {
    // O convite aceito entra como `member` e ainda não tem perfil. O que ele
    // NÃO pode é herdar o perfil global: nasceria com `admin.manage-users`
    // numa empresa onde nunca foi convidado com nada.
    const global = perfilDaEmpresa('admin', ['admin.manage-users']);
    users.prime(userComProfile(ATOR_ID, global.id().value));

    await expect(uc.obterMeuPerfil(ATOR_ID, GLOBEX)).resolves.toMatchObject({
      profileId: null,
      profileSlug: null,
      permissions: [],
      isAdmin: false,
    });
  });

  it('as duas empresas não compartilham o CACHE (trocar não devolve o velho)', async () => {
    const daAcme = perfilDaEmpresa('gestor-acme', ['admin.manage-users']);
    const daGlobex = perfilDaEmpresa('leitor-globex', ['users.read']);
    users.prime(userComProfile(ATOR_ID, daAcme.id().value));
    memberships.prime(ATOR_ID, ACME, daAcme.id().value);
    memberships.prime(ATOR_ID, GLOBEX, daGlobex.id().value);

    await uc.obterMeuPerfil(ATOR_ID, ACME);
    // A segunda chamada NÃO pode ser servida pelo cache da primeira: é a
    // chave `(tenantId, userId)` da Fase 3 segurando, e se a chave voltasse a
    // ser só o usuário este teste leria o slug da Acme e passaria errado.
    await expect(uc.obterMeuPerfil(ATOR_ID, GLOBEX)).resolves.toMatchObject({
      profileSlug: 'leitor-globex',
    });
  });

  it('a trava de auto-concessão compara o perfil DA EMPRESA, não o global', async () => {
    // ⚠️ Global e Acme com AS MESMAS permissões, de propósito. Numa primeira
    // versão deste teste o global era fraco e o da Acme forte: a escalada
    // continuava aparecendo, mas vinda de `recusaConcessaoQueNaoTem` — o teste
    // passava (e a mutação passava) pelo motivo errado, sem provar nada sobre
    // a trava que ele diz medir. Com os dois conjuntos iguais, a única trava
    // que pode disparar é a de auto-concessão.
    const noGlobal = perfilDaEmpresa('forte-global', [
      'admin.manage-authorizations',
      'admin.manage-users',
    ]);
    const naAcme = perfilDaEmpresa('forte-acme', [
      'admin.manage-authorizations',
      'admin.manage-users',
    ]);
    users.prime(userComProfile(ATOR_ID, noGlobal.id().value));
    memberships.prime(ATOR_ID, ACME, naAcme.id().value);

    const auth = new AuthorizationUseCases(repo, users, cache, memberships);
    // Na Acme ele veste o `forte-acme`, e é ele que ele tentaria auto-conceder.
    // Se a trava comparasse `users.profile_id` (o `forte-global`, id distinto),
    // ela não dispararia e `recusaConcessaoQueNaoTem` deixaria passar — a
    // escalada passaria limpa.
    await expect(auth.atribuir(naAcme.id().value, 'admin.manage-users', ATOR_ACME)).rejects.toThrow(
      ProfilePrivilegeEscalationException,
    );
  });

  it('`criar` mede o subconjunto do perfil DA EMPRESA, não o global dele', async () => {
    const noGlobal = perfilDaEmpresa('criador-global', ['admin.manage-users']);
    const naAcme = perfilDaEmpresa('leitor-acme', ['users.read']);
    users.prime(userComProfile(ATOR_ID, noGlobal.id().value));
    memberships.prime(ATOR_ID, ACME, naAcme.id().value);

    const criar = new ProfileUseCases(repo, users, cache, memberships);
    // Na Acme ele é leitor e não pode inventar `admin.manage-users`; no bucket
    // global ele pode. Ler o global abria a escalada por `POST /profiles`.
    await expect(
      criar.criar(
        { slug: 'cunhado', name: 'Cunhado', initialPermissions: ['admin.manage-users'] },
        ATOR_ACME,
      ),
    ).rejects.toThrow(ProfilePrivilegeEscalationException);
  });

  it('atribuir um perfil a alguém mede o subconjunto DA EMPRESA, não o global', async () => {
    const noGlobal = perfilDaEmpresa('poderoso-global', ['users.read', 'users.write']);
    const naAcme = perfilDaEmpresa('leitor-acme', ['users.read']);
    const alvo = perfilDaEmpresa('alvo-completo', ['users.read', 'users.write']);
    users.prime(userComProfile(ATOR_ID, noGlobal.id().value));
    memberships.prime(ATOR_ID, ACME, naAcme.id().value);

    const atribuir = new UserProfileUseCases(users, repo, cache, memberships);
    // `users.write` está no perfil global dele e NÃO no da Acme. Entregar o
    // perfil completo a um terceiro exigiria a posse da chave na empresa em
    // que ele está agindo; ler o global faria a entrega passar.
    await expect(
      atribuir.atribuirProfileAoUser(ALVO_ID, alvo.id().value, ATOR_ACME),
    ).rejects.toThrow(ProfilePrivilegeEscalationException);
  });

  it('a trava de auto-concessão NÃO dispara por causa do perfil GLOBAL dele', async () => {
    const global = perfilDaEmpresa('gestor-global', ['admin.manage-authorizations']);
    const naAcme = perfilDaEmpresa('leitor-acme', ['users.read']);
    // pt-BR (Fase 8): o ALVO é da ACME, e não global. Com alvo global a guarda
    // de escopo recusa — corretamente, porque perfil global é compartilhado
    // por todas as empresas e conceder nele a partir da ACME é a mesma
    // escalada cross-tenant que o e2e 11 bloqueia, só pelo bucket global. Com
    // alvo no escopo, o que sobra para este teste medir é o que ele sempre
    // quis medir: se a auto-concessão lê `users.profile_id` em vez da
    // membership.
    const alvo = perfilDaEmpresa('outro-perfil', [], ACME);
    // O global dele é forte; NA ACME ele é um leitor. Ele vai conceder uma
    // permissão que TEM na Acme a um terceiro perfil — que NÃO é o perfil dele
    // em nenhum dos dois buckets.
    users.prime(userComProfile(ATOR_ID, global.id().value));
    memberships.prime(ATOR_ID, ACME, naAcme.id().value);

    const auth = new AuthorizationUseCases(repo, users, cache, memberships);
    // Se a trava ainda comparasse `users.profile_id`, `global` === profile do
    // ator → falso positivo, e o ator ficava sem poder conceder a chave que
    // ele legitimamente tem na empresa em que está agindo.
    await expect(auth.atribuir(alvo.id().value, 'users.read', ATOR_ACME)).resolves.toBeDefined();
  });
});

describe('Fase 4 — deletar um perfil que uma empresa ainda usa', () => {
  it('devolve ProfileHasUsersException contando a membership, não 500 do banco', async () => {
    const repo = new InMemoryProfileRepo();
    const users = new InMemoryUserRepo();
    const memberships = new InMemoryMembershipRepo(users);
    const uc = new ProfileUseCases(repo, users, new UserProfileCacheService(), memberships);

    const p = Profile.criar({ slug: 'gestor-acme', name: 'Gestor', agora: new Date() });
    repo.prime(p);
    // Nenhum user usa `users.profile_id` → `countByProfile` devolve 0. A
    // membership é a única usuária, e é ela que tem de barrar o delete: sem
    // essa contagem o `ON DELETE RESTRICT` do banco estouraria P2003, que o
    // cliente não sabe ler como "perfil em uso".
    users.count = 0;
    memberships.count = 1;

    await expect(uc.deletar(p.id().value, ATOR_ADMIN)).rejects.toThrow(ProfileHasUsersException);
  });

  it('sem nenhum uso, apaga (o count somado não vira trava permanente)', async () => {
    const repo = new InMemoryProfileRepo();
    const users = new InMemoryUserRepo();
    const memberships = new InMemoryMembershipRepo(users);
    const uc = new ProfileUseCases(repo, users, new UserProfileCacheService(), memberships);

    const p = Profile.criar({ slug: 'gestor-acme', name: 'Gestor', agora: new Date() });
    repo.prime(p);
    users.count = 0;
    memberships.count = 0;

    await expect(uc.deletar(p.id().value, ATOR_ADMIN)).resolves.toBeUndefined();
    await expect(repo.findById(p.id(), null)).resolves.toBeNull();
  });
});

// pt-BR (Fase 6 — tenancy): a ESCRITA do perfil por empresa. A leitura existe
// desde a Fase 4 e está verificada; o que faltava era o caminho que a
// alimenta. Sem isto, uma empresa recém-aberta tem um membro com perfil — o
// dono — e todo mundo que entra por convite fica com zero permissões sem
// nenhum caminho para sair disso.
describe('Fase 6 — atribuir perfil POR EMPRESA', () => {
  let repo: InMemoryProfileRepo;
  let users: InMemoryUserRepo;
  let memberships: InMemoryMembershipRepo;
  let cache: UserProfileCacheService;
  let uc: UserProfileUseCases;

  /** Perfil DONO de uma empresa — o caminho que `POST /admin/profiles` não
   *  alcança (todo perfil criado por HTTP é global), então a fixture monta
   *  pela hidratação, que é onde o `tenantId` entra. */
  let seq = 0;
  function perfilDe(tenantId: string | null, perm: string[], isAdmin = false): Profile {
    // `ProfileId` exige UUID e `ProfileSlug` exige <= 40 chars — os dois
    // limites valem, e um id derivado do `tenantId` estourava o primeiro
    // deles dentro do `restaurarDePersistencia`, ou seja, antes de o teste
    // chegar ao comportamento. Sequência curta resolve os dois.
    seq += 1;
    const p = Profile.restaurarDePersistencia({
      id: `0190a8b6-0000-4000-8000-${String(seq).padStart(12, '0')}`,
      slug: `p-${tenantId === null ? 'global' : tenantId.slice(-4)}-${seq}${isAdmin ? 'a' : 'n'}`,
      name: 'Perfil',
      description: null,
      isAdmin,
      isSystem: isAdmin,
      tenantId,
      authorizations: perm,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      version: 1,
    });
    repo.prime(p);
    return p;
  }

  /** Ator com `admin.manage-users` na ACME, que é quem a rota exige. */
  function atorDaAcme(): AtorAutenticado {
    return { userId: ATOR_ID, tenantId: ACME, isAdmin: false };
  }

  beforeEach(() => {
    repo = new InMemoryProfileRepo();
    users = new InMemoryUserRepo();
    memberships = new InMemoryMembershipRepo(users);
    cache = new UserProfileCacheService();
    uc = new UserProfileUseCases(users, repo, cache, memberships);
  });

  it('o perfil dado dentro da empresa é o que a PRÓXIMA leitura devolve', async () => {
    const gestor = perfilDe(ACME, ['users.read']);
    const doAtor = perfilDe(ACME, ['admin.manage-users', 'users.read']);
    users.prime(userComProfile(ATOR_ID, null));
    users.prime(userComProfile(ALVO_ID, null));
    memberships.prime(ATOR_ID, ACME, doAtor.id().value);
    memberships.semPerfil(ALVO_ID, ACME);

    await uc.atribuirProfileAoUser(ALVO_ID, gestor.id().value, atorDaAcme());

    await expect(uc.obterMeuPerfil(ALVO_ID, ACME)).resolves.toMatchObject({
      profileSlug: gestor.slug().value,
      permissions: ['users.read'],
    });
  });

  it('atribuir na empresa NÃO escreve a coluna GLOBAL (users.profile_id)', async () => {
    const global = perfilDe(null, ['users.read']);
    const gestor = perfilDe(ACME, ['admin.manage-users']);
    users.prime(userComProfile(ATOR_ID, global.id().value));
    users.prime(userComProfile(ALVO_ID, global.id().value));
    memberships.prime(ATOR_ID, ACME, gestor.id().value);
    memberships.semPerfil(ALVO_ID, ACME);

    await uc.atribuirProfileAoUser(ALVO_ID, gestor.id().value, atorDaAcme());

    // O global do alvo não pode ter mudado: ele é o bucket "sem empresa", e a
    // rota com header é a da empresa.
    await expect(uc.obterMeuPerfil(ALVO_ID, null)).resolves.toMatchObject({
      profileId: global.id().value,
    });
  });

  it('atribuir na ACME não muda o que a GLOBEX lê da MESMA conta', async () => {
    const gestor = perfilDe(ACME, ['admin.manage-users']);
    const daGlobex = perfilDe(GLOBEX, ['users.read']);
    users.prime(userComProfile(ATOR_ID, null));
    users.prime(userComProfile(ALVO_ID, null));
    memberships.prime(ATOR_ID, ACME, gestor.id().value);
    memberships.prime(ALVO_ID, GLOBEX, daGlobex.id().value);
    memberships.semPerfil(ALVO_ID, ACME);

    await uc.atribuirProfileAoUser(ALVO_ID, gestor.id().value, atorDaAcme());

    await expect(uc.obterMeuPerfil(ALVO_ID, GLOBEX)).resolves.toMatchObject({
      profileId: daGlobex.id().value,
      permissions: ['users.read'],
    });
  });

  it('R1: perfil de OUTRA empresa é recusado', async () => {
    const doAtor = perfilDe(ACME, ['admin.manage-users']);
    const alheio = perfilDe(GLOBEX, ['users.read']);
    users.prime(userComProfile(ATOR_ID, null));
    users.prime(userComProfile(ALVO_ID, null));
    memberships.prime(ATOR_ID, ACME, doAtor.id().value);
    memberships.semPerfil(ALVO_ID, ACME);

    // ⚠️ O ator é `isAdmin: true` DE PROPÓSITO. Com ator comum, R3 (subset,
    // do #97) já recusa `users.read` — o teste ficaria verde com a R1
    // deletada. MEDIDO: deletar a R1 com ator comum não derruba nada.
    await expect(
      uc.atribuirProfileAoUser(ALVO_ID, alheio.id().value, { ...atorDaAcme(), isAdmin: true }),
    ).rejects.toThrow(ProfilePrivilegeEscalationException);
  });

  it('R2: perfil admin GLOBAL é recusado para ator com empresa (viraria bypass em qualquer empresa)', async () => {
    const doAtor = perfilDe(ACME, ['admin.manage-users']);
    const adminGlobal = perfilDe(null, [], true);
    users.prime(userComProfile(ATOR_ID, null));
    users.prime(userComProfile(ALVO_ID, null));
    memberships.prime(ATOR_ID, ACME, doAtor.id().value);
    memberships.semPerfil(ALVO_ID, ACME);

    // ⚠️ `isAdmin: true` pelo mesmo motivo da R1: a trava pré-existente
    // `profile.isAdmin() && !ator.isAdmin` já recusaria com ator comum, e a
    // R2 ficaria sem dente. O que a R2 segura é o ADMIN GLOBALvestindo
    // alguém — ele pode, mas só com perfil DAQUELA empresa.
    await expect(
      uc.atribuirProfileAoUser(ALVO_ID, adminGlobal.id().value, { ...atorDaAcme(), isAdmin: true }),
    ).rejects.toThrow(ProfilePrivilegeEscalationException);
  });

  it('R3: ator sem a permissão não veste ninguém com perfil que a excede', async () => {
    const doAtor = perfilDe(ACME, ['admin.manage-users']);
    const perigoso = perfilDe(ACME, ['users.delete']);
    users.prime(userComProfile(ATOR_ID, null));
    users.prime(userComProfile(ALVO_ID, null));
    memberships.prime(ATOR_ID, ACME, doAtor.id().value);
    memberships.semPerfil(ALVO_ID, ACME);

    await expect(
      uc.atribuirProfileAoUser(ALVO_ID, perigoso.id().value, atorDaAcme()),
    ).rejects.toThrow(ProfilePrivilegeEscalationException);
  });

  it('R4: remover o perfil de um alvo que é admin NA EMPRESA exige admin (o lockout de B4, no bucket certo)', async () => {
    const doAtor = perfilDe(ACME, ['admin.manage-users']);
    const adminDaEmpresa = perfilDe(ACME, ['admin.manage-users'], true);
    users.prime(userComProfile(ATOR_ID, null));
    users.prime(userComProfile(ALVO_ID, null));
    memberships.prime(ATOR_ID, ACME, doAtor.id().value);
    memberships.prime(ALVO_ID, ACME, adminDaEmpresa.id().value);

    await expect(uc.atribuirProfileAoUser(ALVO_ID, null, atorDaAcme())).rejects.toThrow(
      ProfilePrivilegeEscalationException,
    );
  });

  it('R5: ninguém tira o próprio perfil na empresa — e hoje não há como readmitir owner', async () => {
    const adminDaEmpresa = perfilDe(ACME, ['admin.manage-users'], true);
    users.prime(userComProfile(ATOR_ID, null));
    memberships.prime(ATOR_ID, ACME, adminDaEmpresa.id().value);

    await expect(
      uc.atribuirProfileAoUser(ATOR_ID, null, { ...atorDaAcme(), isAdmin: true }),
    ).rejects.toThrow(ProfilePrivilegeEscalationException);
  });

  it('R5 vale nas DUAS direções: vestir outro perfil em si mesmo também é recusado', async () => {
    const adminDaEmpresa = perfilDe(ACME, ['admin.manage-users'], true);
    const gestor = perfilDe(ACME, ['users.read']);
    users.prime(userComProfile(ATOR_ID, null));
    memberships.prime(ATOR_ID, ACME, adminDaEmpresa.id().value);

    // Rebaixar-se para um perfil sem admin é o MESMO lockout pelo outro lado:
    // R3 permite (é subconjunto), mas não há rota que devolva o admin.
    await expect(
      uc.atribuirProfileAoUser(ATOR_ID, gestor.id().value, { ...atorDaAcme(), isAdmin: true }),
    ).rejects.toThrow(ProfilePrivilegeEscalationException);
    await expect(memberships.findProfileId(ATOR_ID, ACME)).resolves.toBe(adminDaEmpresa.id().value);
  });

  it('alvo que não é membro da empresa é recusado, não 200 à toa', async () => {
    const doAtor = perfilDe(ACME, ['admin.manage-users']);
    const gestor = perfilDe(ACME, ['users.read']);
    users.prime(userComProfile(ATOR_ID, null));
    users.prime(userComProfile(ALVO_ID, null));
    memberships.prime(ATOR_ID, ACME, doAtor.id().value);
    // ALVO_ID sem `semPerfil`: não é membro da ACME.

    // ⚠️ `isAdmin: true` é o que FAZ este teste medir a trava de membership.
    // Com `isAdmin: false`, o R3 (subset, do #97) recusa primeiro — `users.read`
    // não está nas permissões do ator — e o teste passava com a guarda do fake
    // apagada. MEDIDO 2026-10-17: removendo `#membros.has(chave)` do
    // `InMemoryMembershipRepo`, este teste seguia verde.
    await expect(
      uc.atribuirProfileAoUser(ALVO_ID, gestor.id().value, {
        ...atorDaAcme(),
        isAdmin: true,
      }),
    ).rejects.toThrow(ProfilePrivilegeEscalationException);
  });

  it('bucket GLOBAL (sem header) continua escrevendo users.profile_id — o #97 não regride', async () => {
    // `users.read` no perfil do ator por necessity: R3 (subset, do #97) recusa
    // um ator sem a permissão a vesti-la em alguém, e essa recusa não é o que
    // este teste quer medir — o alvo é o bucket global continuar gravando
    // `users.profile_id`.
    const doAtor = perfilDe(null, ['admin.manage-users', 'users.read']);
    const gestor = perfilDe(null, ['users.read']);
    users.prime(userComProfile(ATOR_ID, doAtor.id().value));
    users.prime(userComProfile(ALVO_ID, null));

    await uc.atribuirProfileAoUser(ALVO_ID, gestor.id().value, {
      userId: ATOR_ID,
      tenantId: null,
      isAdmin: false,
    });

    await expect(uc.obterMeuPerfil(ALVO_ID, null)).resolves.toMatchObject({
      profileId: gestor.id().value,
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fase 9 — o bucket de SISTEMA tem DONO: ele é o bucket, não o superusuário.
//
// O que este bloco existe para travar, em uma frase: `tenantId === null` é o
// bucket dos perfis de SISTEMA, e não um "vejo tudo". A Fase 8 escreveu
// `exigePerfilDoEscopo` como `ator.tenantId !== null && …`, e esse `!== null`
// tratava o bucket como se ele fosse o admin — mas quem dá o bypass total é o
// `isAdmin`, não o bucket. MEDIDO 2026-10-17 contra Postgres real: um perfil
// global NÃO-admin com `admin.manage-*` (dado legado pré-tenancy, exatamente o
// cenário que o bucket global da Fase 4 existe para suportar) listava,
// renomeava, apagava e injetava permissão em perfil de empresa vizinha sem
// `X-Tenant-Id` — e vestia perfil de empresa em conta alheia, o que além de
// escalar deixava o alvo SEM PERFIL nenhum, porque `findProfileId(_, null)` só
// aceita `tenant_id IS NULL`.
//
// O counterpart que não pode regredir: o admin de SISTEMA (`tenantId === null`
// E `isAdmin`) continua vendo tudo. Sem isso o seed volta a ser a única porta de
// administração, que é a dependência que a Fase 5 removeu de propósito.
// ─────────────────────────────────────────────────────────────────────────────

describe('Fase 9 — o bucket de SISTEMA administra só o bucket de SISTEMA', () => {
  let repo: InMemoryProfileRepo;
  let users: InMemoryUserRepo;
  let memberships: InMemoryMembershipRepo;
  let cache: UserProfileCacheService;
  let perfis: ProfileUseCases;
  let auths: AuthorizationUseCases;
  let uc: UserProfileUseCases;

  let seq = 0;
  /** Mesma hidratação do bloco da Fase 6: é por ela que `tenantId` entra. */
  function perfilDe(tenantId: string | null, perm: string[], isAdmin = false): Profile {
    seq += 1;
    const p = Profile.restaurarDePersistencia({
      id: `0190a8b6-0000-4000-9000-${String(seq).padStart(12, '0')}`,
      slug: `s-${tenantId === null ? 'global' : tenantId.slice(-4)}-${seq}`,
      name: 'Perfil',
      description: null,
      isAdmin,
      isSystem: isAdmin,
      tenantId,
      authorizations: perm,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      version: 1,
    });
    repo.prime(p);
    return p;
  }

  /**
   * O atacante do achado: conta do bucket de sistema, `isAdmin === false`, mas
   * com as chaves de `admin.manage-*`. É o perfil que o `PermissionsGuard`
   * aceita — e é por isso que a defesa não pode morar nele.
   */
  const LEGADO = ['admin.manage-profiles', 'admin.manage-users', 'admin.manage-authorizations'];
  function atorDoSistema(isAdmin = false): AtorAutenticado {
    return { userId: ATOR_ID, tenantId: null, isAdmin };
  }

  /**
   * Permissões de um alvo DENTRO do subconjunto das do atacante.
   *
   * Isto não é arbitrário: é o que separa o defeito do achado de uma trava que
   * já existe. A trava de SUBCONJUNTO do #97 recusa `ator sem manage-X` de
   * vestir um perfil com `X`. Se o alvo tivesse permissão que o atacante não
   * tem, o teste passaria por essa trava e a de DONA continuaria sem dente
   * nenhuma — um spec verde pelo motivo errado. Com o alvo dentro do
   * subconjunto, a única regra que pode recusar é a de DONA.
   */
  const ALVO_DENTRO = ['admin.manage-profiles'];

  /** O perfil que o `beforeEach` dá ao ator — ele também entra nas listas. */
  let doAtor: Profile;

  /** O que sobrou no ALVO depois da tentativa — a leitura que decide lockout. */
  async function perfilDoAlvo(): Promise<string | null> {
    const alvo = await users.findById(UserId.create(ALVO_ID));
    return alvo?.profileId() ?? null;
  }

  beforeEach(() => {
    repo = new InMemoryProfileRepo();
    users = new InMemoryUserRepo();
    memberships = new InMemoryMembershipRepo(users);
    cache = new UserProfileCacheService();
    perfis = new ProfileUseCases(repo, users, cache, memberships);
    auths = new AuthorizationUseCases(repo, users, cache, memberships);
    uc = new UserProfileUseCases(users, repo, cache, memberships);
    // O ator PRECISA estar ligado ao perfil que o dá as permissões: sem isto
    // `permissoesDoAtor` resolve `null` e é a trava de subconjunto que recusa,
    // não a de DONA — e o teste mede a trava errada.
    doAtor = perfilDe(null, LEGADO);
    users.prime(userComProfile(ATOR_ID, doAtor.id().value));
  });

  describe('as 5 rotas que exigem perfil do escopo', () => {
    it('obterPorId de um perfil DE EMPRESA é recusado', async () => {
      const alheio = perfilDe(GLOBEX, ['users.read']);

      await expect(perfis.obterPorId(alheio.id().value, atorDoSistema())).rejects.toThrow(
        ProfilePrivilegeEscalationException,
      );
    });

    it('atualizar (renomear) um perfil DE EMPRESA é recusado e não escreve', async () => {
      const alheio = perfilDe(GLOBEX, ['users.read']);

      await expect(
        perfis.atualizar(alheio.id().value, { name: 'renomeado' }, atorDoSistema()),
      ).rejects.toThrow(ProfilePrivilegeEscalationException);

      // A recusa tem que ter deixado o agregado intacto — um `save` que
      // rodasse antes da guarda deixaria o nome trocado apesar da recusa.
      const depois = await repo.findById(alheio.id(), null);
      expect(depois?.nome().value).toBe('Perfil');
    });

    it('deletar um perfil DE EMPRESA é recusado', async () => {
      const alheio = perfilDe(GLOBEX, ['users.read']);

      await expect(perfis.deletar(alheio.id().value, atorDoSistema())).rejects.toThrow(
        ProfilePrivilegeEscalationException,
      );

      expect(await repo.findById(alheio.id(), null)).not.toBeNull();
    });

    it('injetar permissão em perfil DE EMPRESA é recusado', async () => {
      const alheio = perfilDe(GLOBEX, ALVO_DENTRO);

      await expect(
        auths.atribuir(alheio.id().value, 'admin.manage-users', atorDoSistema()),
      ).rejects.toThrow(ProfilePrivilegeEscalationException);

      const depois = await repo.findById(alheio.id(), null);
      expect(depois?.authorizations().toLista()).toEqual(ALVO_DENTRO);
    });

    it('revogar permissão de perfil DE EMPRESA é recusado', async () => {
      const alheio = perfilDe(GLOBEX, [...ALVO_DENTRO, 'admin.manage-users']);

      await expect(
        auths.revogar(alheio.id().value, 'admin.manage-users', atorDoSistema()),
      ).rejects.toThrow(ProfilePrivilegeEscalationException);

      const depois = await repo.findById(alheio.id(), null);
      expect(depois?.authorizations().toLista()).toEqual([...ALVO_DENTRO, 'admin.manage-users']);
    });
  });

  describe('listar', () => {
    it('o bucket de SISTEMA não-admin enxerga só os perfis DE SISTEMA', async () => {
      // `doAtor` entra na lista: ele é um perfil de SISTEMA, e a regra não é
      // "some com os meus", é "some com os de EMPRESA".
      const outro = perfilDe(null, ['users.read']);
      perfilDe(ACME, ['users.read']);
      perfilDe(GLOBEX, ['users.read']);

      const listados = await perfis.listar(atorDoSistema());

      expect(listados.map((p) => p.slug).sort()).toEqual(
        [doAtor.slug().value, outro.slug().value].sort(),
      );
    });

    it('o admin de SISTEMA continua vendo tudo — o seed não pode regredir', async () => {
      const daAcme = perfilDe(ACME, ['users.read']);
      const daGlobex = perfilDe(GLOBEX, ['users.read']);

      const listados = await perfis.listar(atorDoSistema(true));

      expect(listados.map((p) => p.slug).sort()).toEqual(
        [doAtor.slug().value, daAcme.slug().value, daGlobex.slug().value].sort(),
      );
    });
  });

  describe('vestir perfil alheio (o caminho do lockout administrativo)', () => {
    it('o bucket de SISTEMA não-admin NÃO veste perfil DE EMPRESA em ninguém', async () => {
      const alheio = perfilDe(GLOBEX, ALVO_DENTRO);
      users.prime(userComProfile(ALVO_ID, null));

      await expect(
        uc.atribuirProfileAoUser(ALVO_ID, alheio.id().value, atorDoSistema()),
      ).rejects.toThrow(ProfilePrivilegeEscalationException);

      // O ALVO é a razão de o caso existir: `findProfileId(ALVO, null)` só
      // aceita `tenant_id IS NULL`, então vestir perfil de empresa deixa o
      // admin global do alvo com NENHUM perfil — lockout de toda a parte
      // administrativa, sem que nenhuma resposta tenha sido de escalada.
      expect(await perfilDoAlvo()).toBeNull();
    });

    it('o admin de SISTEMA ainda veste perfil de empresa (o seed não regride)', async () => {
      const daGlobex = perfilDe(GLOBEX, ['users.read']);
      users.prime(userComProfile(ALVO_ID, null));

      await uc.atribuirProfileAoUser(ALVO_ID, daGlobex.id().value, atorDoSistema(true));

      expect(await perfilDoAlvo()).toBe(daGlobex.id().value);
    });

    it('vestir perfil DE SISTEMA continua valendo dentro do bucket de SISTEMA', async () => {
      // Este é o caminho que o teste "o #97 não regride" (lá em cima) mede:
      // bucket global ↔ perfil global tem de continuar funcionando.
      const gestor = perfilDe(null, ALVO_DENTRO);
      users.prime(userComProfile(ALVO_ID, null));

      await uc.atribuirProfileAoUser(ALVO_ID, gestor.id().value, atorDoSistema());

      expect(await perfilDoAlvo()).toBe(gestor.id().value);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fase 9 — RLS: o use case tem de REPASSAR a empresa da sessão.
//
// A porta exige `tenantId` em `findById`/`delete`, e o TypeScript aceita uma
// implementação com menos parâmetros — o que significa que um use case que
// esquecesse de repassar passaria a porta, compilaria e deixaria a suíte
// inteira verde. O único jeito de isso ser VISÍVEL é o duplo registrar o que
// recebeu, e um teste afirmar o registro.
//
// O que este bloco prova: o escopo QUE CHEGA é o da sessão (`ator.tenantId`
// nas rotas por ator, o `tenantId` do argumento em `obterMeuPerfil`). O que
// ele NÃO prova — e o repositório tem a sua metade — é que a policy aceita
// aquele escopo. Isso é medido contra Postgres em `prisma-rls.integration.spec.ts`.
// ─────────────────────────────────────────────────────────────────────────────
describe('Fase 9 — o use case repassa o escopo da sessão ao repositório', () => {
  let repo: InMemoryProfileRepo;
  let users: InMemoryUserRepo;
  let perfis: ProfileUseCases;

  beforeEach(() => {
    repo = new InMemoryProfileRepo();
    users = new InMemoryUserRepo();
    const memberships = new InMemoryMembershipRepo(users);
    perfis = new ProfileUseCases(repo, users, new UserProfileCacheService(), memberships);
  });

  it('obterPorId pede a EMPRESA do ator, não a empresa do perfil nem a global', async () => {
    const daAcme = Profile.criar({
      slug: 'gestor-acme',
      name: 'Gestor',
      tenantId: ACME,
      agora: new Date(),
    });
    repo.prime(daAcme);

    await perfis.obterPorId(daAcme.id().value, ATOR_ACME);

    // Sem esta linha, um `findById(profileId(id))` voltaria a compilar — o
    // TypeScript não reclama de menos argumentos — e a empresa leria a linha
    // com o escopo de sistema, que é o bucket que a policy de escrita proíbe.
    expect(repo.escoposPedidos).toEqual([ACME]);
  });

  it('obterPorId no bucket de SISTEMA pede o bucket de SISTEMA', async () => {
    const global = Profile.criar({ slug: 'admin', name: 'Administrador', agora: new Date() });
    repo.prime(global);

    await perfis.obterPorId(global.id().value, ATOR_ADMIN);

    expect(repo.escoposPedidos).toEqual([null]);
  });

  it('obterMeuPerfil repassa o tenantId do ARGUMENTO, não o de algum ator', async () => {
    // É o que o `PermissionsGuard` chama (`obterMeuPerfil(user.sub,
    // user.tenantId)`), e é o caminho que faz a conta mesma ler dois perfis
    // diferentes conforme a empresa do header.
    const daAcme = Profile.criar({
      slug: 'gestor-acme',
      name: 'Gestor',
      tenantId: ACME,
      initialAuthorizations: ['users.read'],
      agora: new Date(),
    });
    repo.prime(daAcme);

    const memberships = new InMemoryMembershipRepo(users);
    memberships.prime(ATOR_ID, ACME, daAcme.id().value);
    const uc = new UserProfileUseCases(users, repo, new UserProfileCacheService(), memberships);

    await uc.obterMeuPerfil(ATOR_ID, ACME);

    expect(repo.escoposPedidos).toEqual([ACME]);
  });

  it('deletar abre o escopo da empresa que apaga — a escrita também é filtrada', async () => {
    const daAcme = Profile.criar({
      slug: 'gestor-acme',
      name: 'Gestor',
      tenantId: ACME,
      agora: new Date(),
    });
    repo.prime(daAcme);

    await perfis.deletar(daAcme.id().value, ATOR_ACME);

    // DOIS escopos, e é o esperado: `deletar` lê (para conferir DONA e as
    // proteções de `isSystem`/`isAdmin`) e só depois apaga. O que este teste
    // segura é que nenhum dos dois é o de sistema — a assertion mais frouxa
    // (`toContain(ACME)`) passaria se a segunda virasse `'*'`.
    expect(repo.escoposPedidos).toEqual([ACME, ACME]);
  });
});
