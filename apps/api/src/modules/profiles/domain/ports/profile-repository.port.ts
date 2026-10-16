// apps/api/src/modules/profiles/domain/ports/profile-repository.port.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): contrato de domínio para o
// repositório de Profile. Não conhece Prisma — a implementação fica
// em infrastructure/persistence/.
//
// Profile não tem soft-delete (config de admin, não dado de negócio).
// O repositório implementa hard delete. As Authorizations ficam
// DENTRO do agregado e são salvas em transação junto com o profile.

import type { Profile } from '../profile.aggregate.js';
import type { ProfileId } from '../value-objects/profile-id.vo.js';
import type { ProfileSlug } from '../value-objects/profile-slug.vo.js';

export const PROFILE_REPOSITORY_PORT = Symbol('ProfileRepositoryPort');

export interface ProfileRepositoryPort {
  findById(id: ProfileId): Promise<Profile | null>;
  findBySlug(slug: ProfileSlug): Promise<Profile | null>;
  list(): Promise<Profile[]>;
  save(profile: Profile): Promise<Profile>;
  delete(id: ProfileId): Promise<void>;
}
