// apps/api/src/modules/profiles/application/profiles.use-cases.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): use cases do BC Profiles.
//
// 3 famílias:
//  - ProfileUseCases       (list, getById, getBySlug, create, update, delete)
//  - AuthorizationUseCases (assign, revoke, listAllPermissions)
//  - UserProfileUseCases   (assignProfile, getMyProfile)
//
// Authorizations DENTRO do aggregate (DDD-puro) — o repo apenas carrega
// a lista do DB e o `Profile` aggregate valida invariantes.

import { Inject, Injectable, Logger } from '@nestjs/common';
import { Profile } from '../domain/profile.aggregate.js';
import { profileId } from '../domain/value-objects/profile-id.vo.js';
import { profileSlug } from '../domain/value-objects/profile-slug.vo.js';
import {
  PROFILE_REPOSITORY_PORT,
  type ProfileRepositoryPort,
} from '../domain/ports/profile-repository.port.js';
import {
  USER_REPOSITORY_PORT,
  type UserRepositoryPort,
} from '../../users/domain/ports/user-repository.port.js';
import { UserProfileCacheService } from '../../../shared/infrastructure/security/user-profile-cache.service.js';
import {
  ProfileNotFoundException,
  ProfileSlugAlreadyInUseException,
  ProfileHasUsersException,
  ProfileSystemProtectedException,
  ProfileAdminProtectedException,
  ProfilePrivilegeEscalationException,
} from '../domain/exceptions/profile.exceptions.js';
import { listAllPermissions } from '../../../shared/auth/permissions-catalog.js';
import { UserNotFoundException } from '../../users/domain/exceptions/user.exceptions.js';
import { UserId } from '../../users/domain/value-objects/user-id.vo.js';
import type { User } from '../../users/domain/user.aggregate.js';

const loggerEscalacao = new Logger('ProfilePrivilegeEscalation');

/**
 * Recusa de escalada: LOGA o motivo e lança.
 *
 * ⚠️ Sem esta linha o motivo não vai para lugar nenhum. A exceção carrega o
 * motivo em `motivo` (e NÃO em `message`, por B5), e o `GlobalExceptionFilter`
 * só loga a partir de 500 — uma escalada é 403, então passava sem rastro.
 * Não dá para logar na própria exceção: `domain/` não importa `@nestjs/common`.
 *
 * Função de arquivo, e não método nas 3 classes: as 7 recusas são a MESMA
 * política, e um método por classe repetiria o mesmo `Logger` três vezes.
 */
function recusaEscalada(motivo: string): never {
  loggerEscalacao.warn(motivo);
  throw new ProfilePrivilegeEscalationException(motivo);
}

/**
 * Identidade do ator autenticado, o mínimo que as travas de escalada
 * precisam: QUEM é e SE é admin. Vem do `req.user` publicado pelo
 * `JwtAuthGuard` (que hidrata `isAdmin` do cache de profile).
 */
export interface AtorAutenticado {
  readonly userId: string;
  /**
   * pt-BR (Fase 3): empresa em que o ato acontece. `null` = rota sem
   * `X-Tenant-Id`.
   *
   * **Obrigatório** (não `?`) para que a Fase 4 não tenha nenhum call site
   * capaz de omitir a empresa em silêncio: hoje ele é lido só como chave de
   * cache, e as travas anti-escalada ainda comparam perfil GLOBAL. ⚠️ Não ler
   * este campo como se a escalada já fosse por empresa — não é, e o perfil
   * efetivo só vem do tenant com `tenant_memberships.profile_id` (Fase 4).
   */
  readonly tenantId: string | null;
  readonly isAdmin: boolean;
}

/**
 * pt-BR (Fase 3): o perfil efetivo do ator numa empresa. Nomeado para que
 * `obterMeuPerfil` e o controller `/me/profile` não repitam a estrutura
 * inline — e para que o segundo veja o contrato que o primeiro devolve.
 */
export interface MeuPerfil {
  profileId: string | null;
  profileSlug: string | null;
  profileName: string | null;
  isAdmin: boolean;
  permissions: string[];
}

export interface CreateProfileInput {
  slug: string;
  name: string;
  description?: string | null;
  initialPermissions?: readonly string[];
}

export interface UpdateProfileInput {
  name: string;
  description?: string | null;
}

export type ProfileSummary = {
  id: string;
  slug: string;
  name: string;
  isAdmin: boolean;
  isSystem: boolean;
  description: string | null;
  permissionCount: number;
};

export type ProfileDetail = ProfileSummary & {
  permissions: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
};

/**
 * pt-BR (#97): `@Injectable()` + `@Inject(TOKEN)` explícito em todo
 * parâmetro que é interface/porta — elas somem em runtime, então sem o
 * token o Nest **não passa `undefined`**: ele LANÇA no boot
 * (`Nest can't resolve dependencies of the ProfileUseCases (?, Symbol(...), ...)`).
 * A falha é loud no start, não silenciosa em runtime — e por isso
 * `profiles.module.spec.ts` sobe o container de verdade. O param
 * `agoraProvider` foi REMOVIDO em vez de virar provider de clock: com
 * `@Injectable()` o Nest tentaria resolver aquele token no boot, e nenhum
 * teste dependia de tempo determinístico.
 */
@Injectable()
export class ProfileUseCases {
  constructor(
    @Inject(PROFILE_REPOSITORY_PORT) private readonly profileRepo: ProfileRepositoryPort,
    @Inject(USER_REPOSITORY_PORT) private readonly userRepo: UserRepositoryPort,
    @Inject(UserProfileCacheService) private readonly cache: UserProfileCacheService,
  ) {}

  async listar(): Promise<ProfileSummary[]> {
    const profiles = await this.profileRepo.list();
    return profiles.map((p) => this.toSummary(p));
  }

  async obterPorId(id: string): Promise<ProfileDetail> {
    const profile = await this.profileRepo.findById(profileId(id));
    if (profile === null) {
      throw new ProfileNotFoundException(id);
    }
    return this.toDetail(profile);
  }

  async obterPorSlug(slug: string): Promise<ProfileDetail> {
    const profile = await this.profileRepo.findBySlug(profileSlug(slug));
    if (profile === null) {
      throw new ProfileNotFoundException(slug);
    }
    return this.toDetail(profile);
  }

  /**
   * pt-BR (#97, A1.3): `initialPermissions` é uma CONCESSÃO, e `POST
   * /admin/profiles` só exige `admin.manage-profiles` — a chave de gerir
   * perfis, não a de conceder permissões. Sem esta trava, o mesmo "cunha um
   * profile vazio, enche do conjunto `admin.*`" que `recusaConcessaoQueNaoTem`
   * descreve passava pela porta de trás do `criar`.
   *
   * Fail-CLOSED: ator que não resolve (soft-deleted) ou sem profile tem
   * conjunto VAZIO — o subconjunto de nada é nada. `ator.isAdmin` escapa no
   * topo, como em todas as travas deste arquivo.
   */
  private async recusaConcessaoInicial(
    input: CreateProfileInput,
    ator: AtorAutenticado,
  ): Promise<void> {
    const chaves = input.initialPermissions ?? [];
    if (ator.isAdmin || chaves.length === 0) {
      return;
    }
    let doAtor: ReadonlySet<string> = new Set();
    const atorUser = await this.userRepo.findById(UserId.create(ator.userId));
    const idDoAtor = atorUser?.profileId() ?? null;
    if (idDoAtor !== null) {
      const meu = await this.profileRepo.findById(profileId(idDoAtor));
      doAtor = new Set(meu?.authorizations().toLista() ?? []);
    }
    for (const chave of chaves) {
      if (!doAtor.has(chave)) {
        recusaEscalada('um ator sem isAdmin não cria um profile com uma permissão que ele não tem');
      }
    }
  }

  async criar(input: CreateProfileInput, ator: AtorAutenticado): Promise<ProfileDetail> {
    // pt-BR (#97, A3): `isAdmin`/`isSystem` saíram de `CreateProfileInput`.
    // A garantia era do controller (um call-site só) — um segundo controller,
    // um endpoint novo ou um seed a reabriam. Aqui a garantia é do TIPO: o
    // campo não existe no contrato e `criar` fixa `false`. Só o
    // seed/migration, que escreve direto no Prisma, cria profile admin.
    //
    // pt-BR (#97, A4): slug malformado NÃO é `ProfileSlugAlreadyInUse` —
    // `ProfileSlug.create` (via `profileSlug()`) lança `UserValidationException`
    // → 400. O 409 fica só para o slug bem formado que já existe.
    const existing = await this.profileRepo.findBySlug(profileSlug(input.slug));
    if (existing !== null) {
      throw new ProfileSlugAlreadyInUseException(input.slug);
    }
    await this.recusaConcessaoInicial(input, ator);
    const profile = Profile.criar({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      initialAuthorizations: input.initialPermissions ?? [],
      agora: new Date(),
    });
    await this.profileRepo.save(profile);
    await this.cache.invalidateAll();
    return this.toDetail(profile);
  }

  async atualizar(id: string, input: UpdateProfileInput): Promise<ProfileDetail> {
    const profile = await this.profileRepo.findById(profileId(id));
    if (profile === null) {
      throw new ProfileNotFoundException(id);
    }
    if (profile.isSystem()) {
      throw new ProfileSystemProtectedException(profile.id().value);
    }
    if (profile.isAdmin()) {
      throw new ProfileAdminProtectedException(profile.id().value);
    }
    const agora = new Date();
    profile.renomear(input.name, agora);
    profile.alterarDescricao(input.description ?? null, agora);
    await this.profileRepo.save(profile);
    await this.cache.invalidateAll();
    return this.toDetail(profile);
  }

  async deletar(id: string): Promise<void> {
    const profile = await this.profileRepo.findById(profileId(id));
    if (profile === null) {
      throw new ProfileNotFoundException(id);
    }
    if (profile.isSystem()) {
      throw new ProfileSystemProtectedException(profile.id().value);
    }
    // pt-BR (#97, B6): o profile `isAdmin` também é protegido contra exclusão.
    // Antes isso só acontecia por ACIDENTE — com usuários, o contador abaixo
    // barra; sem usuários, não há linha referenciando e a exclusão passava.
    // A invariável não pode depender de raciocínio sobre a FK
    // `User.profileId` (Restrict) que está a dois arquivos dali.
    if (profile.isAdmin()) {
      throw new ProfileAdminProtectedException(profile.id().value);
    }
    const count = await this.userRepo.countByProfile(profile.id().value);
    if (count > 0) {
      throw new ProfileHasUsersException(profile.slug().value, count);
    }
    const agora = new Date();
    profile.deletar(null, agora);
    await this.profileRepo.delete(profile.id());
    await this.cache.invalidateAll();
  }

  toSummary(p: Profile): ProfileSummary {
    return {
      id: p.id().value,
      slug: p.slug().value,
      name: p.nome().value,
      isAdmin: p.isAdmin(),
      isSystem: p.isSystem(),
      description: p.descricao(),
      permissionCount: p.authorizations().count(),
    };
  }

  toDetail(p: Profile): ProfileDetail {
    return {
      ...this.toSummary(p),
      permissions: p.authorizations().toLista(),
      createdAt: p.createdAt().toISOString(),
      updatedAt: p.updatedAt().toISOString(),
      version: p.version(),
    };
  }
}

@Injectable()
export class AuthorizationUseCases {
  constructor(
    @Inject(PROFILE_REPOSITORY_PORT) private readonly profileRepo: ProfileRepositoryPort,
    // Só para resolver o profile de QUEM pediu (trava de auto-concessão).
    @Inject(USER_REPOSITORY_PORT) private readonly userRepo: UserRepositoryPort,
    @Inject(UserProfileCacheService) private readonly cache: UserProfileCacheService,
  ) {}

  /**
   * pt-BR (#97, A6): resolve o ator no banco. `null` = soft-deleted
   * (o repo filtra `deletedAt`) ou id inexistente — o `UserId.create`
   * exige UUID v7 e todos os writes de `users` passam por ele, então
   * `users.id` é v7 por construção (o default `gen_random_uuid()` da
   * migration é só das tabelas novas).
   * shortcut: um id v4 plantado por fora quebra a resolução e devolve 400
   * numa operação admin legítima; quando existir, alinhar `UserId` com o
   * que o banco aceita é PR próprio deste VO.
   */
  private async userDoAtor(ator: AtorAutenticado): Promise<User | null> {
    return this.userRepo.findById(UserId.create(ator.userId));
  }

  /**
   * pt-BR (#97, A6): fail-CLOSED do ator. Um ator que não resolve no banco
   * (`atorUser === null` — soft-deleted, idunknowndo) tem o pedido RECUSADO.
   * Com `?.` o "não sei quem eu sou" virava "não sou eu" e a trava não
   * disparava — o pedido mais privilegiado do sistema passava porque o
   * ATOR sumiu do banco.
   *
   * Fatorado de `recusaAutoConcessao` em #97/B3 porque `revogar` também
   * precisa desta metade e NÃO pode levar a outra.
   */
  private exigeAtorConhecido(ator: AtorAutenticado, atorUser: User | null): void {
    if (ator.isAdmin) {
      return;
    }
    if (atorUser === null) {
      recusaEscalada(
        'o ator não resolve no banco; a operação é negada por não se poder provar quem ele é',
      );
    }
  }

  /**
   * pt-BR (#97, A6): recusa auto-concessão. Um ator com
   * `admin.manage-authorizations` que concede `admin.manage-users` ao
   * PRÓPRIO profile se promove a root sem nunca tocar no profile `admin`.
   * Só `isAdmin` escapa — é o único que já tem o bypass.
   *
   * ⚠️ Só para operation que AUMENTA poder. `revogar` NÃO passa por aqui
   * (#97/B3): remover permissão nunca é escalada, e aplicando a mesma trava
   * ao `revogar` o ator ficava TRANCADO com uma concessão indevida que só
   * outro admin poderia desfazer.
   */
  private async recusaAutoConcessao(
    ator: AtorAutenticado,
    atorUser: User | null,
    profileIdAlvo: string,
  ): Promise<void> {
    this.exigeAtorConhecido(ator, atorUser);
    if (ator.isAdmin || atorUser === null) {
      return;
    }
    if (atorUser.profileId() === profileIdAlvo) {
      recusaEscalada('um ator sem isAdmin não altera as permissões do próprio profile');
    }
  }

  /**
   * pt-BR (#97, A1.1): `admin.manage-authorizations` autoriza o ator a mexer
   * nas permissões de QUALQUER profile; não autoriza a inventar permissão.
   * Sem esta trava o ator cunha um profile vazio, enche-o do conjunto
   * `admin.*` completo e se dá esse profile — o `isAdmin` (bypass) continua
   * barrado, todo o resto não.
   *
   * O subconjunto NÃO considera o bypass de `isAdmin` como permissão
   * concreta: quem é admin tem TODAS as permissões pelo próprio guard, logo
   * comparar as dele com uma lista seria vacuamente verdadeiro. `isAdmin`
   * escapa no topo, como em todas as travas deste arquivo.
   *
   * Fail-CLOSED: ator sem profile, ou com profile que não carregou esta
   * chave, NÃO tem a chave. `revogar` não passa por aqui — remover
   * privilégio nunca é escalada, e exigir posse da chave bloquearia a
   * limpeza de uma permissão que o ator não tinha.
   */
  private async recusaConcessaoQueNaoTem(
    ator: AtorAutenticado,
    atorUser: User | null,
    permissionKey: string,
  ): Promise<void> {
    if (ator.isAdmin) {
      return;
    }
    let tem = false;
    const idDoAtor = atorUser?.profileId() ?? null;
    if (idDoAtor !== null) {
      const meu = await this.profileRepo.findById(profileId(idDoAtor));
      tem = meu?.authorizations().tem(permissionKey) === true;
    }
    if (!tem) {
      recusaEscalada(
        'um ator sem isAdmin não concede a nenhum profile uma permissão que ele não tem',
      );
    }
  }

  async atribuir(
    profileIdStr: string,
    permissionKey: string,
    ator: AtorAutenticado,
  ): Promise<ProfileDetail> {
    const profile = await this.profileRepo.findById(profileId(profileIdStr));
    if (profile === null) {
      throw new ProfileNotFoundException(profileIdStr);
    }
    if (profile.isSystem()) {
      throw new ProfileSystemProtectedException(profile.id().value);
    }
    const atorUser = await this.userDoAtor(ator);
    await this.recusaAutoConcessao(ator, atorUser, profile.id().value);
    await this.recusaConcessaoQueNaoTem(ator, atorUser, permissionKey);
    profile.adicionarAutorizacao(permissionKey, new Date());
    await this.profileRepo.save(profile);
    await this.cache.invalidateAll();
    return {
      id: profile.id().value,
      slug: profile.slug().value,
      name: profile.nome().value,
      isAdmin: profile.isAdmin(),
      isSystem: profile.isSystem(),
      description: profile.descricao(),
      permissionCount: profile.authorizations().count(),
      permissions: profile.authorizations().toLista(),
      createdAt: profile.createdAt().toISOString(),
      updatedAt: profile.updatedAt().toISOString(),
      version: profile.version(),
    };
  }

  async revogar(
    profileIdStr: string,
    permissionKey: string,
    ator: AtorAutenticado,
  ): Promise<ProfileDetail> {
    const profile = await this.profileRepo.findById(profileId(profileIdStr));
    if (profile === null) {
      throw new ProfileNotFoundException(profileIdStr);
    }
    if (profile.isSystem()) {
      throw new ProfileSystemProtectedException(profile.id().value);
    }
    // pt-BR (#97, B3): fail-CLOSED sim, auto-concessão NÃO. Remover
    // permissão não amplia poder de ninguém — pelo contrário — e aplicar a
    // trava de auto-alteração aqui trancava o ator dentro de um profile
    // com concessão indevida. Vide o comentário de `recusaAutoConcessao`.
    const atorUser = await this.userDoAtor(ator);
    this.exigeAtorConhecido(ator, atorUser);
    profile.removerAutorizacao(permissionKey, new Date());
    await this.profileRepo.save(profile);
    await this.cache.invalidateAll();
    return {
      id: profile.id().value,
      slug: profile.slug().value,
      name: profile.nome().value,
      isAdmin: profile.isAdmin(),
      isSystem: profile.isSystem(),
      description: profile.descricao(),
      permissionCount: profile.authorizations().count(),
      permissions: profile.authorizations().toLista(),
      createdAt: profile.createdAt().toISOString(),
      updatedAt: profile.updatedAt().toISOString(),
      version: profile.version(),
    };
  }

  async listarPermissoes(): Promise<string[]> {
    return listAllPermissions();
  }
}

@Injectable()
export class UserProfileUseCases {
  constructor(
    @Inject(USER_REPOSITORY_PORT) private readonly userRepo: UserRepositoryPort,
    @Inject(PROFILE_REPOSITORY_PORT) private readonly profileRepo: ProfileRepositoryPort,
    @Inject(UserProfileCacheService) private readonly cache: UserProfileCacheService,
  ) {}

  /**
   * pt-BR (#97, A1.2): as permission keys que o ATOR tem de fato.
   * Fail-CLOSED — ator que não resolve (soft-deleted) ou sem profile devolve
   * conjunto vazio, porque o subconjunto de nada é nada.
   */
  private async permissoesDoAtor(ator: AtorAutenticado): Promise<ReadonlySet<string>> {
    const user = await this.userRepo.findById(UserId.create(ator.userId));
    const idDoAtor = user?.profileId() ?? null;
    if (idDoAtor === null) {
      return new Set();
    }
    const perfil = await this.profileRepo.findById(profileId(idDoAtor));
    return new Set(perfil?.authorizations().toLista() ?? []);
  }

  /**
   * pt-BR (#97): o ator entra como parâmetro porque `admin.manage-users`
   * sozinho não pode promover ninguém a root. Atribuir a si mesmo o profile
   * `isAdmin` é a escalada mais barata que existe: um clique e o ator vira
   * bypass total. Quem não é admin não atribui profile admin a ninguém.
   */
  async atribuirProfileAoUser(
    userId: string,
    profileIdStr: string | null,
    ator: AtorAutenticado,
  ): Promise<void> {
    if (profileIdStr !== null) {
      const profile = await this.profileRepo.findById(profileId(profileIdStr));
      if (profile === null) {
        throw new ProfileNotFoundException(profileIdStr);
      }
      if (profile.isAdmin() && !ator.isAdmin) {
        recusaEscalada('só um ator com isAdmin pode atribuir um profile admin');
      }
      // pt-BR (#97, A1.2): o subconjunto vale para QUALQUER alvo, não só para
      // si mesmo. MEDIDO 2026-10-16 (revisão de segurança do PR #97, achado
      // B1): restringir a `userId === ator.userId` deixava a escalada aberta
      // por DELEGAÇÃO — e `POST /users` é `@Public()`, então o "outro usuário"
      // não é terceiro confiável, é uma conta que o próprio ator acabou de
      // criar e cuja senha ele conhece. Cadeia medida: criar profile com
      // `initialPermissions` que o ator não tem → atribuir a esse boneco →
      // logar como boneco. Auto-atribuição é só o caso particular, já
      // coberto pela regra geral.
      //
      // O subconjunto NÃO considera o bypass de `isAdmin` como permissão
      // concreta (admin tem todas pelo guard; comparar seria vacuamente
      // verdadeiro) — `isAdmin` escapa no topo, como nas demais travas.
      if (!ator.isAdmin) {
        const minhas = await this.permissoesDoAtor(ator);
        const fora = profile
          .authorizations()
          .toLista()
          .filter((k) => !minhas.has(k));
        if (fora.length > 0) {
          recusaEscalada(
            'um ator sem isAdmin não atribui a ninguém um profile com permissões que ele não tem',
          );
        }
      }
    }
    const user = await this.userRepo.findById(UserId.create(userId));
    if (user === null) {
      throw new UserNotFoundException(userId);
    }
    // pt-BR (#97, achado B4): com `profileId === null` o bloco de autorização
    // acima INTEIRO é pulado — nenhuma checagem roda. MEDIDO: um ator não-admin
    // com `admin.manage-users` desligava assim o profile `isAdmin` do root,
    // que é o único com bypass: lockout de toda a parte admin. Não é escalada
    // (desligar nunca concede), mas é a mesma classe de B1 — a regra morava
    // dentro de um `if` que o chamador controla. Desligar profile comum segue
    // livre para quem tem `admin.manage-users`.
    if (profileIdStr === null && !ator.isAdmin) {
      const atualId = user.profileId();
      const atual = atualId === null ? null : await this.profileRepo.findById(profileId(atualId));
      if (atual?.isAdmin() === true) {
        recusaEscalada('só um ator com isAdmin remove de um usuário o profile admin');
      }
    }
    user.atribuirPerfil(profileIdStr, new Date());
    await this.userRepo.save(user, user.version() - 1);
    await this.cache.invalidateUser(userId);
  }

  /** pt-BR (Fase 3): grava e devolve, para os quatro caminhos de saída
   *  compartilharem uma linha em vez de repetir o par `set` + `return`. */
  private async cachear<T extends MeuPerfil>(
    tenantId: string | null,
    userId: string,
    v: T,
  ): Promise<T> {
    await this.cache.setUserProfileAndPermissions(tenantId, userId, v);
    return v;
  }

  /**
   * pt-BR (Fase 3 — tenancy, 2026-10-16): `tenantId` é a empresa da
   * requisição (header `X-Tenant-Id`) e é a **chave** do cache desde já — a
   * mesma conta em duas empresas não pode ler o perfil da outra.
   *
   * ⚠️ O `tenantId` ainda NÃO resolve o perfil: a leitura continua em
   * `user.profileId()`, que é coluna global. O elo por empresa
   * (`tenant_memberships.profile_id`) é a Fase 4. Aqui o tenant é aceito e
   * cacheado certo; o que ele resolve por tenant chega junto.
   */
  async obterMeuPerfil(userId: string, tenantId: string | null): Promise<MeuPerfil> {
    const cached = await this.cache.getUserProfileAndPermissions(tenantId, userId);
    if (cached !== null) {
      return cached;
    }
    const denied: MeuPerfil = {
      profileId: null,
      profileSlug: null,
      profileName: null,
      isAdmin: false,
      permissions: [],
    };
    const user = await this.userRepo.findById(UserId.create(userId));
    if (user === null) {
      return this.cachear(tenantId, userId, denied);
    }
    const userProfileId = user.profileId();
    if (userProfileId === null) {
      return this.cachear(tenantId, userId, denied);
    }
    const profile = await this.profileRepo.findById(profileId(userProfileId));
    if (profile === null) {
      return this.cachear(tenantId, userId, denied);
    }
    return this.cachear(tenantId, userId, {
      profileId: profile.id().value,
      profileSlug: profile.slug().value,
      profileName: profile.nome().value,
      isAdmin: profile.isAdmin(),
      permissions: profile.authorizations().toLista(),
    });
  }
}
