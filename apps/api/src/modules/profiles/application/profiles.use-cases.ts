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
import {
  TENANT_MEMBERSHIP_REPOSITORY_PORT,
  type TenantMembershipRepositoryPort,
} from '../../tenancy/domain/ports/tenant-membership-repository.port.js';
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
import {
  ehAdministradorDeSistema,
  type AtorAutenticado,
} from '../../../shared/auth/eh-administrador-de-sistema.js';
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
 * pt-BR (Fase 8, 2026-10-17): o perfil é da EMPRESA do ator?
 *
 * A regra original é uma linha e a MEDIÇÃO é que ela não existia: com
 * `provisionarEmpresaPropria` dando `listAllPermissions()` + `isAdmin: true` ao
 * dono (Fase 5), e o catálogo documentando `is_admin` como BYPASS TOTAL do
 * `PermissionsGuard`, TODO dono de empresa passava as 5 rotas de
 * `/admin/profiles` — que não filhavam por empresa. MEDIDO por HTTP antes do
 * conserto: listar, renomear, apagar e injetar permissão em perfil da GLOBEX
 * respondiam 200/201 a partir da ACME.
 *
 * pt-BR (Fase 9): a condição passou a ser `!ehAdministradorDeSistema(ator)`, e a
 * troca não é cosmética. Antes era `ator.tenantId !== null`, que tratava o
 * bucket como se fosse superusuário — e o bucket tem membros não-admin.
 *
 * `ehAdministradorDeSistema` foi para `shared/auth/` (feature-flags D11): o BC
 * de flags precisa da MESMA regra, e duas escritas divergem com o tempo.
 *
 * Função de arquivo como as outras: as duas classes (`ProfileUseCases` e
 * `AuthorizationUseCases`) precisam dela, e um método duplicaria a regra.
 */
function exigePerfilDoEscopo(profile: Profile, ator: AtorAutenticado): void {
  if (!ehAdministradorDeSistema(ator) && profile.tenantId() !== ator.tenantId) {
    recusaEscalada('um ator administra os perfis do próprio bucket; o de SISTEMA exige isAdmin');
  }
}

export type { AtorAutenticado } from '../../../shared/auth/eh-administrador-de-sistema.js';

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
    @Inject(TENANT_MEMBERSHIP_REPOSITORY_PORT)
    private readonly memberships: TenantMembershipRepositoryPort,
  ) {}

  async listar(ator: AtorAutenticado): Promise<ProfileSummary[]> {
    // pt-BR (Fase 8): o filtro é o da EMPRESA do ator.
    //
    // pt-BR (Fase 9): `list(null)` no repositório é a lista INTEIRA — é a nota
    // de sentido oposto da porta — e quem pode pedir a inteira é o admin de
    // SISTEMA. Um ator do bucket de sistema que não é admin recebe só os
    // perfis de sistema. Não é cosmético: `GET /admin/profiles` no bucket de
    // sistema entregava o UUID dos perfis das DUAS empresas, e o UUID é o passo
    // 1 de qualquer escalada que passe depois por uma rota que não cheque
    // DONA.
    const profiles = await this.profileRepo.list(ator.tenantId);
    const visiveis = ehAdministradorDeSistema(ator)
      ? profiles
      : profiles.filter((p) => p.tenantId() === ator.tenantId);
    return visiveis.map((p) => this.toSummary(p));
  }

  async obterPorId(id: string, ator: AtorAutenticado): Promise<ProfileDetail> {
    const profile = await this.profileRepo.findById(profileId(id), ator.tenantId);
    if (profile === null) {
      throw new ProfileNotFoundException(id);
    }
    exigePerfilDoEscopo(profile, ator);
    return this.toDetail(profile);
  }

  async obterPorSlug(slug: string, ator: AtorAutenticado): Promise<ProfileDetail> {
    const profile = await this.profileRepo.findBySlug(profileSlug(slug), ator.tenantId);
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
    // pt-BR (Fase 4): o subconjunto é o do perfil que o ator veste NA EMPRESA
    // em que está agindo, não o global — comparar o global deixaria a trava
    // medindo o perfil errado em toda chamada com `X-Tenant-Id`.
    const idDoAtor = await this.memberships.findProfileId(ator.userId, ator.tenantId);
    if (idDoAtor !== null) {
      const meu = await this.profileRepo.findById(profileId(idDoAtor), ator.tenantId);
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
    // campo não existe no contrato e `criar` fixa `false`. Só quem escreve
    // direto no Prisma cria profile admin: o seed, a migration e o
    // onboarding da empresa (`prisma-tenant-onboarding.repository.ts:342-353`).
    //
    // pt-BR (#97, A4): slug malformado NÃO é `ProfileSlugAlreadyInUse` —
    // `ProfileSlug.create` (via `profileSlug()`) lança `UserValidationException`
    // → 400. O 409 fica só para o slug bem formado que já existe.
    const existing = await this.profileRepo.findBySlug(profileSlug(input.slug), ator.tenantId);
    if (existing !== null) {
      throw new ProfileSlugAlreadyInUseException(input.slug);
    }
    await this.recusaConcessaoInicial(input, ator);
    const profile = Profile.criar({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      initialAuthorizations: input.initialPermissions ?? [],
      // pt-BR (Fase 8): o perfil nasce da EMPRESA do ator. Antes desta fase
      // este campo não era repassado e todo `POST /admin/profiles` fabricava um
      // perfil GLOBAL — inclusive quando o ator é o dono de uma empresa
      // cliente, que é quem pode chegar aqui.
      tenantId: ator.tenantId,
      agora: new Date(),
    });
    await this.profileRepo.save(profile);
    await this.cache.invalidateAll();
    return this.toDetail(profile);
  }

  async atualizar(
    id: string,
    input: UpdateProfileInput,
    ator: AtorAutenticado,
  ): Promise<ProfileDetail> {
    const profile = await this.profileRepo.findById(profileId(id), ator.tenantId);
    if (profile === null) {
      throw new ProfileNotFoundException(id);
    }
    exigePerfilDoEscopo(profile, ator);
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

  async deletar(id: string, ator: AtorAutenticado): Promise<void> {
    const profile = await this.profileRepo.findById(profileId(id), ator.tenantId);
    if (profile === null) {
      throw new ProfileNotFoundException(id);
    }
    exigePerfilDoEscopo(profile, ator);
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
    // pt-BR (Fase 4): as DUAS contagens, porque `users.profile_id` (bucket
    // global) e `tenant_memberships.profile_id` (por empresa) são dois
    // lugares distintos onde o mesmo perfil pode estar em uso. Somar só o
    // primeiro deixaria a trava passar e o `ON DELETE RESTRICT` do banco
    // estourar P2003 — 500 no lugar de 409.
    // `null` = bucket de SISTEMA, e aqui é o escopo CORRETO: a pergunta é
    // "este perfil está em uso por alguém, em qualquer lugar?", não "na minha
    // empresa". Sob escopo de empresa a RLS de `users` cortaria o `count` e a
    // trava passaria, e o `ON DELETE RESTICT` do banco estouraria P2003 — 500
    // no lugar do 409 que estas duas linhas existem para dar.
    const count =
      (await this.userRepo.countByProfile(profile.id().value, null)) +
      (await this.memberships.countByProfile(profile.id().value));
    if (count > 0) {
      throw new ProfileHasUsersException(profile.slug().value, count);
    }
    const agora = new Date();
    profile.deletar(null, agora);
    await this.profileRepo.delete(profile.id(), ator.tenantId);
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
    @Inject(TENANT_MEMBERSHIP_REPOSITORY_PORT)
    private readonly memberships: TenantMembershipRepositoryPort,
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
    return this.userRepo.findById(UserId.create(ator.userId), ator.tenantId);
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
    // pt-BR (Fase 4): "o próprio profile" é o que o ator veste NA EMPRESA em
    // que está agindo. Comparar `users.profile_id` faria a trava disparar por
    // um perfil de outra empresa (falso positivo, prendendo o ator sem motivo)
    // e NÃO disparar quando o perfil da empresa é o global (escalada aberta).
    const idDoAtor = await this.memberships.findProfileId(ator.userId, ator.tenantId);
    if (idDoAtor === profileIdAlvo) {
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
    // pt-BR (Fase 4): mesma troca de escopo de `recusaAutoConcessao` — a
    // posse da chave é a do perfil NA EMPRESA, não a do global.
    const idDoAtor = await this.memberships.findProfileId(ator.userId, ator.tenantId);
    if (idDoAtor !== null) {
      const meu = await this.profileRepo.findById(profileId(idDoAtor), ator.tenantId);
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
    const profile = await this.profileRepo.findById(profileId(profileIdStr), ator.tenantId);
    if (profile === null) {
      throw new ProfileNotFoundException(profileIdStr);
    }
    exigePerfilDoEscopo(profile, ator);
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
    const profile = await this.profileRepo.findById(profileId(profileIdStr), ator.tenantId);
    if (profile === null) {
      throw new ProfileNotFoundException(profileIdStr);
    }
    exigePerfilDoEscopo(profile, ator);
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
    @Inject(TENANT_MEMBERSHIP_REPOSITORY_PORT)
    private readonly memberships: TenantMembershipRepositoryPort,
  ) {}

  /**
   * pt-BR (#97, A1.2): as permission keys que o ATOR tem de fato.
   * Fail-CLOSED — ator que não resolve (soft-deleted) ou sem profile devolve
   * conjunto vazio, porque o subconjunto de nada é nada.
   *
   * pt-BR (Fase 4): o perfil é o DA EMPRESA (`ator.tenantId`), com o global
   * como bucket de quem não mandou `X-Tenant-Id`.
   */
  private async permissoesDoAtor(ator: AtorAutenticado): Promise<ReadonlySet<string>> {
    const idDoAtor = await this.memberships.findProfileId(ator.userId, ator.tenantId);
    if (idDoAtor === null) {
      return new Set();
    }
    const perfil = await this.profileRepo.findById(profileId(idDoAtor), ator.tenantId);
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
    // pt-BR (Fase 6 — tenancy) R5: dentro da empresa, ninguém altera o PRÓPRIO
    // perfil — nem para vestir outro, nem para tirar o que tem. O motivo é a
    // irreversibilidade: `emitirConvite` grava `role: 'member'` fixo, então
    // não existe rota que devolva `gerente` a ninguém. Uma empresa de gerente único
    // que se rebaixasse ficaria sem administrador e sem caminho de volta.
    // Custa a pessoa se ajustar sozinha; o preço alternativo é o lockout.
    //
    // A regra mora AQUI, antes do `profileIdStr`, e não dentro dele: a remoção
    // (`null`) é justamente o caso perigoso, e era o que escapava quando a
    // trava vivia no ramo do perfil. Fora da empresa (`tenantId === null`) não
    // se aplica — sem header não há empresa para ficar sem dono.
    //
    // ⚠️ MEDIDO 2026-10-17: a comparação NÃO normalizava, e o `UUID_RE` do
    // `UserId` tem a flag `/i` — então um `PUT /admin/users/0190A8B6-…-EM-MAIÚSCULAS/
    // profile` passava na validação do VO, o Postgres resolvia o id sem diferenciar
    // caixa, e só este `===` negava: o R5 inteiro era burlável mandando o próprio
    // id em caixa alta. Mesmo defeito e mesma correção de `exigirPropriedade`
    // (`user-ownership.policy.ts:60`), que foi consertado por MEDIDO em 2026-10-15
    // e não chegou aqui.
    if (ator.tenantId !== null && userId?.toLowerCase() === ator.userId.toLowerCase()) {
      recusaEscalada('ninguém altera o próprio perfil dentro da empresa');
    }
    if (profileIdStr !== null) {
      const profile = await this.profileRepo.findById(profileId(profileIdStr), ator.tenantId);
      if (profile === null) {
        throw new ProfileNotFoundException(profileIdStr);
      }
      // pt-BR (Fase 6 — tenancy): três travas que só existem no caminho da
      // EMPRESA, e as três são sobre a DONA do perfil — um campo que o
      // agregado não carregava até esta fase.
      //
      // pt-BR (Fase 9): a condição era `ator.tenantId !== null`, o que pulava
      // R1/R2 no bucket de SISTEMA e deixava a DONA sem trava nenhuma nesse
      // caminho — as travas de baixo (escalada e subconjunto) não cobrem DONA.
      // MEDIDO: vestindo um perfil DE EMPRESA a partir do bucket de sistema, o
      // `users.profile_id` do alvo deixava de apontar para o admin global e
      // passava a apontar para um perfil que `findProfileId(alvo, null)` nunca
      // resolve — o alvo perdia toda a parte administrativa, e a resposta era
      // sucesso. Agora a condição é a mesma de `exigePerfilDoEscopo`: o bloco
      // roda para todo mundo, menos o admin de SISTEMA.
      if (!ehAdministradorDeSistema(ator)) {
        // R1: o mesmo conjunto que `findProfileId` aceita na LEITURA. Perfil
        // alheio concederia as permissões da empresa vizinha.
        const dono = profile.tenantId();
        if (dono !== null && dono !== ator.tenantId) {
          recusaEscalada('um perfil de outra empresa não é vestível aqui');
        }
        // R2: `isAdmin` global em membership de empresa é bypass TOTAL — o
        // `PermissionsGuard` aceita em QUALQUER empresa, inclusive numa em
        // que a pessoa nunca entrou. Por isso o admin tem de ser DA empresa.
        if (profile.isAdmin() && dono !== ator.tenantId) {
          recusaEscalada('só se veste perfil admin o da própria empresa');
        }
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
    const user = await this.userRepo.findById(UserId.create(userId), ator.tenantId);
    if (user === null) {
      throw new UserNotFoundException(userId);
    }

    // pt-BR (Fase 6): aqui a rota bifurca no BUCKET. Com `X-Tenant-Id` a
    // escrita vai para a membership — a mesma linha que `findProfileId` lê,
    // que é o que faltava para "perfil diferente em cada empresa" ter efeito.
    // Sem header, o bucket global (`users.profile_id`) é o de sempre.
    if (ator.tenantId !== null) {
      // pt-BR: R4 é o lockout de B4 no bucket CERTO. A leitura abaixo é o
      // perfil do alvo NA EMPRESA; ler `user.profileId()` protegeria a coluna
      // que esta rota não altera, e devolveria 403 por um motivo que o
      // chamador não consegue reproduzir.
      //
      // ⚠️ MEDIDO 2026-10-17: a condição-raiz era `profileIdStr === null`, e é
      // o `=== null` que abria o buraco — com um `profileId` NÃO nulo, nenhuma
      // checagem olhava o perfil ATUAL do alvo, e as travas que sobram (R1/R2,
      // subconjunto) medem o perfil NOVO. Cenário: dono `alice` (`isAdmin`) e
      // membro `carlos` com um perfil `p-gestor` sem `isAdmin` e dentro do
      // subconjunto do próprio `carlos`. `PUT /admin/users/<alice>/profile` com
      // o id de `p-gestor` passa em todas as travas e rebaixa a dona — 200, e a
      // ACME fica sem administrador sem caminho de volta. A forma "desligar"
      // (B4) e a forma "trocar por um menor" são o mesmo defeito com o `if`
      // estreitado demais.
      if (!ator.isAdmin) {
        const atualId = await this.memberships.findProfileId(userId, ator.tenantId);
        const atual =
          atualId === null
            ? null
            : await this.profileRepo.findById(profileId(atualId), ator.tenantId);
        if (atual?.isAdmin() === true) {
          recusaEscalada('só um ator com isAdmin retira de um membro o profile admin da empresa');
        }
      }
      const gravado = await this.memberships.atribuirPerfil(userId, ator.tenantId, profileIdStr);
      // `false` = a pessoa não é membro, ou o perfil é de outra empresa. Os
      // dois casos NÃO são distinguidos para o chamador (expor qual deles é
      // entregaria a existência de um perfil alheio), e ambos são 403.
      if (!gravado) {
        recusaEscalada('a atribuição sai da empresa e por isso é recusada');
      }
      await this.cache.invalidateUser(userId);
      return;
    }
    // pt-BR (#97, achado B4): com `profileId === null` o bloco de autorização
    // acima INTEIRO é pulado — nenhuma checagem roda. MEDIDO: um ator não-admin
    // com `admin.manage-users` desligava assim o profile `isAdmin` do root,
    // que é o único com bypass: lockout de toda a parte admin. Não é escalada
    // (desligar nunca concede), mas é a mesma classe de B1 — a regra morava
    // dentro de um `if` que o chamador controla. Desligar profile comum segue
    // livre para quem tem `admin.manage-users`.
    //
    // pt-BR (Fase 4): a leitura abaixo é `user.profileId()` e NÃO o perfil da
    // empresa, DE PROPÓSITO — a escrita logo mais abaixo
    // (`user.atribuirPerfil`) é na coluna global. Trocar só a checagem
    // deixaria trava e escrita medindo coisas diferentes, e a trava protegeria
    // algo que esta rota não altera. Atribuir perfil POR EMPRESA é escrita
    // nova, e é da Fase 6.
    //
    // MEDIDO 2026-10-17: mesma correção do ramo da EMPRESA acima, e pela mesma
    // razão — o `profileIdStr === null` estreitava a regra demais e deixava
    // passar a troca por um perfil MENOR, que é a mesma lockout com outro verbo.
    if (!ator.isAdmin) {
      const atualId = user.profileId();
      const atual =
        atualId === null
          ? null
          : await this.profileRepo.findById(profileId(atualId), ator.tenantId);
      if (atual?.isAdmin() === true) {
        recusaEscalada('só um ator com isAdmin retira de um usuário o profile admin');
      }
    }
    user.atribuirPerfil(profileIdStr, new Date());
    // `ator.tenantId` e `null` NESTE ponto — o caminho com header gravou a
    // membership e voltou na linha acima. Passar o valor do ator em vez de um
    // `null` fixo é o que mantém a coisa honesta se alguém mexer no `return`.
    //
    // ⚠️ O que NÃO fecha a escalada aqui é a RLS, e este texto já dizia que
    // fechava. `null` vira o escopo de SISTEMA (`'*'`), e `perfil_do_escopo`
    // (`migration.sql` da Fase 10) tem `escopo_atual() = '*'` como PRIMEIRO
    // disjunto: sob `'*'` ela aceita qualquer `profile_id`. A policy é inerte
    // neste caminho. Quem fecha é o `recusaEscalada` acima (R1/R2) — que
    // confere o `isAdmin` do perfil ATUAL, e só nele.
    //
    // A distinção importa porque "o banco cobre" e "a aplicação cobre" pedem
    // consertos diferentes: quem apagar R1/R2 acreditando na policy abre a
    // escalada sem nem perceber que mexeu na única defesa que existe.
    // #123: era `user.version() - 1` — a SUPOSTA de que a versão atual é
    // sempre a pré-mutação mais 1. A suposição quebra no caso idempotente:
    // `atribuirPerfil()` com o MESMO profileId retorna sem bumpar a
    // versão, e `version() - 1` ficava UM ABAIXO da versão persistida — o
    // `where: { version }` não casava nenhuma linha e a reatribuição
    // idempotente respondia 412.
    //
    // `loadedVersion()` é a versão lida do banco, que é o que o optimistic
    // lock compara — o mesmo mecanismo que o `Profile` já usava.
    await this.userRepo.save(user, user.loadedVersion(), ator.tenantId);
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
   * pt-BR (Fase 4 — tenancy, 2026-10-16): `tenantId` é a empresa da requisição
   * (header `X-Tenant-Id`) e é a **chave** do cache (Fase 3) **e a chave da
   * leitura** (Fase 4): o perfil vem de `tenant_memberships.profile_id`, então a
   * mesma conta em duas empresas lê dois perfis diferentes.
   *
   * `tenantId === null` cai no bucket GLOBAL (`users.profile_id`) — o dos
   * perfis de sistema do seed (D3). Sem empresa não há como saber qual perfil o
   * usuário veste, e adivinhar o global daria `isAdmin` a quem mandou a
   * requisição sem header.
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
    const profileIdDoAtor = await this.memberships.findProfileId(userId, tenantId);
    if (profileIdDoAtor === null) {
      return this.cachear(tenantId, userId, denied);
    }
    const profile = await this.profileRepo.findById(profileId(profileIdDoAtor), tenantId);
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
