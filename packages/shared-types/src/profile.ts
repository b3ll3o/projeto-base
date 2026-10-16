// packages/shared-types/src/profile.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): tipos compartilhados de Profile +
// Authorization. Fonte da verdade: apps/api/src/modules/profiles/.
//
// Wire format espelhado (mesma regra do user.ts): o que a API serializa,
// não o que o modelo de domínio tem. Os nomes de campo em camelCase
// vêm do `class-transformer`/`JSON.stringify` (NÃO do `@@map` do Prisma,
// que é para o DB).

import type { UUID, ISODateString } from './user.js';

/** Permission key canônica (subset do `permissions-catalog.ts`). */
export type PermissionKey =
  | 'users.read'
  | 'users.write'
  | 'users.delete'
  | 'admin.manage-profiles'
  | 'admin.manage-authorizations'
  | 'admin.manage-users'
  | 'audits.read';

/** Saída canônica de um perfil. */
export interface ProfileOutputDto {
  id: UUID;
  slug: string;
  name: string;
  description: string | null;
  isAdmin: boolean;
  isSystem: boolean;
  version: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Saída canônica de uma autorização (perfil TEM permissão). */
export interface AuthorizationOutputDto {
  id: UUID;
  profileId: UUID;
  permissionKey: PermissionKey;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

/** Resposta de `GET /api/v1/me/profile`. */
export interface MeProfileDto {
  userId: UUID;
  profile: ProfileOutputDto | null;
  permissions: readonly PermissionKey[];
  isAdmin: boolean;
}

/** Input para `POST /api/v1/admin/profiles`. */
export interface CreateProfileInputDto {
  slug: string;
  name: string;
  description?: string;
  isAdmin?: boolean;
}

/** Input para `PATCH /api/v1/admin/profiles/:slug`. */
export interface UpdateProfileInputDto {
  name?: string;
  description?: string;
  isAdmin?: boolean;
}

/** Input para `PUT /api/v1/admin/profiles/:slug/authorizations`. */
export interface SyncAuthorizationsInputDto {
  permissionKeys: readonly PermissionKey[];
}

/** Input para `PUT /api/v1/admin/users/:id/profile`. */
export interface AssignProfileInputDto {
  profileId: UUID;
}
