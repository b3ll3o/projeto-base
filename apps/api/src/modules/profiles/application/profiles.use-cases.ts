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

import { Profile } from '../domain/profile.aggregate.js';
import { profileId } from '../domain/value-objects/profile-id.vo.js';
import { profileSlug } from '../domain/value-objects/profile-slug.vo.js';
import type { ProfileRepositoryPort } from '../domain/ports/profile-repository.port.js';
import type { UserRepositoryPort } from '../../users/domain/ports/user-repository.port.js';
import type { UserProfileCacheService } from '../../../shared/infrastructure/security/user-profile-cache.service.js';
import {
  ProfileNotFoundException,
  ProfileSlugAlreadyInUseException,
  ProfileHasUsersException,
  ProfileSystemProtectedException,
  ProfileAdminProtectedException,
} from '../domain/exceptions/profile.exceptions.js';
import { isValidProfileSlug } from '../domain/value-objects/profile-slug.vo.js';
import { listAllPermissions } from '../../../shared/auth/permissions-catalog.js';
import { UserNotFoundException } from '../../users/domain/exceptions/user.exceptions.js';
import { UserId } from '../../users/domain/value-objects/user-id.vo.js';

export interface CreateProfileInput {
  slug: string;
  name: string;
  isAdmin?: boolean;
  isSystem?: boolean;
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

export class ProfileUseCases {
  constructor(
    private readonly profileRepo: ProfileRepositoryPort,
    private readonly userRepo: UserRepositoryPort,
    private readonly cache: UserProfileCacheService,
    private readonly agoraProvider: () => Date = () => new Date(),
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

  async criar(input: CreateProfileInput): Promise<ProfileDetail> {
    if (!isValidProfileSlug(input.slug)) {
      throw new ProfileSlugAlreadyInUseException(input.slug);
    }
    const existing = await this.profileRepo.findBySlug(profileSlug(input.slug));
    if (existing !== null) {
      throw new ProfileSlugAlreadyInUseException(input.slug);
    }
    const profile = Profile.criar({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      isAdmin: input.isAdmin ?? false,
      isSystem: input.isSystem ?? false,
      initialAuthorizations: input.initialPermissions ?? [],
      agora: this.agoraProvider(),
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
    const agora = this.agoraProvider();
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
    const count = await this.userRepo.countByProfile(profile.id().value);
    if (count > 0) {
      throw new ProfileHasUsersException(profile.slug().value, count);
    }
    const agora = this.agoraProvider();
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

export class AuthorizationUseCases {
  constructor(
    private readonly profileRepo: ProfileRepositoryPort,
    private readonly cache: UserProfileCacheService,
    private readonly agoraProvider: () => Date = () => new Date(),
  ) {}

  async atribuir(profileIdStr: string, permissionKey: string): Promise<ProfileDetail> {
    const profile = await this.profileRepo.findById(profileId(profileIdStr));
    if (profile === null) {
      throw new ProfileNotFoundException(profileIdStr);
    }
    if (profile.isSystem()) {
      throw new ProfileSystemProtectedException(profile.id().value);
    }
    profile.adicionarAutorizacao(permissionKey, this.agoraProvider());
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

  async revogar(profileIdStr: string, permissionKey: string): Promise<ProfileDetail> {
    const profile = await this.profileRepo.findById(profileId(profileIdStr));
    if (profile === null) {
      throw new ProfileNotFoundException(profileIdStr);
    }
    if (profile.isSystem()) {
      throw new ProfileSystemProtectedException(profile.id().value);
    }
    profile.removerAutorizacao(permissionKey, this.agoraProvider());
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

export class UserProfileUseCases {
  constructor(
    private readonly userRepo: UserRepositoryPort,
    private readonly profileRepo: ProfileRepositoryPort,
    private readonly cache: UserProfileCacheService,
  ) {}

  async atribuirProfileAoUser(userId: string, profileIdStr: string | null): Promise<void> {
    if (profileIdStr !== null) {
      const profile = await this.profileRepo.findById(profileId(profileIdStr));
      if (profile === null) {
        throw new ProfileNotFoundException(profileIdStr);
      }
    }
    const user = await this.userRepo.findById(UserId.create(userId));
    if (user === null) {
      throw new UserNotFoundException(userId);
    }
    user.atribuirPerfil(profileIdStr, new Date());
    await this.userRepo.save(user, user.version() - 1);
    await this.cache.invalidateUser(userId);
  }

  async obterMeuPerfil(userId: string): Promise<{
    profileId: string | null;
    profileSlug: string | null;
    profileName: string | null;
    isAdmin: boolean;
    permissions: string[];
  }> {
    const cached = await this.cache.getUserProfileAndPermissions(userId);
    if (cached !== null) {
      return cached;
    }
    const user = await this.userRepo.findById(UserId.create(userId));
    if (user === null) {
      const empty = {
        profileId: null,
        profileSlug: null,
        profileName: null,
        isAdmin: false,
        permissions: [],
      };
      await this.cache.setUserProfileAndPermissions(userId, empty);
      return empty;
    }
    const userProfileId = user.profileId();
    if (userProfileId === null) {
      const empty = {
        profileId: null,
        profileSlug: null,
        profileName: null,
        isAdmin: false,
        permissions: [],
      };
      await this.cache.setUserProfileAndPermissions(userId, empty);
      return empty;
    }
    const profile = await this.profileRepo.findById(profileId(userProfileId));
    if (profile === null) {
      const empty = {
        profileId: null,
        profileSlug: null,
        profileName: null,
        isAdmin: false,
        permissions: [],
      };
      await this.cache.setUserProfileAndPermissions(userId, empty);
      return empty;
    }
    const result = {
      profileId: profile.id().value,
      profileSlug: profile.slug().value,
      profileName: profile.nome().value,
      isAdmin: profile.isAdmin(),
      permissions: profile.authorizations().toLista(),
    };
    await this.cache.setUserProfileAndPermissions(userId, result);
    return result;
  }
}
