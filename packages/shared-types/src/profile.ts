// packages/shared-types/src/profile.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): tipos compartilhados de Profile +
// Authorization. Fonte da verdade: apps/api/src/modules/profiles/.
//
// Wire format espelhado (mesma regra do user.ts): o que a API serializa,
// não o que o modelo de domínio tem. Os nomes de campo em camelCase
// vêm do `class-transformer`/`JSON.stringify` (NÃO do `@@map` do Prisma,
// que é para o DB).
//
// pt-BR (#97): este arquivo deixou de ser uma PALPITE e passou a ser o
// espelho das formas reais. `ProfileSummary`/`ProfileDetail` reproduzem
// `profiles.use-cases.ts:63-78` e `MeProfileDto` reproduz o retorno de
// `me-profile.controller.ts`. Os tipos que não tinham rota por trás
// (`AuthorizationOutputDto`, `SyncAuthorizationsInputDto`, `ProfileOutputDto`)
// foram REMOVIDOS em vez de corrigidos: a API nunca devolveu um objeto de
// autorização — permissões são `string[]` — e nunca teve PUT de sync.
//
// O `:id` de toda rota é **UUID**, não slug. Nenhuma rota aceita slug; as
// páginas web recebem slug na URL e resolvem via `lib/perfil.ts`.

import type { UUID, ISODateString } from './user.js';

/** Item de `GET /api/v1/admin/profiles`. */
export type ProfileSummary = {
  id: UUID;
  slug: string;
  name: string;
  isAdmin: boolean;
  isSystem: boolean;
  description: string | null;
  permissionCount: number;
};

/** Item de `GET|POST|PATCH /api/v1/admin/profiles/:id` e das rotas de autorização. */
export type ProfileDetail = ProfileSummary & {
  permissions: string[];
  createdAt: ISODateString;
  updatedAt: ISODateString;
  version: number;
};

/**
 * Resposta de `GET /api/v1/me/profile`.
 *
 * pt-BR (#97): os campos são `profileId`/`profileSlug`/`profileName` — não
 * existe `userId` nem um objeto `profile` aninhado. Ler `profile.name` aqui
 * devolvia `undefined` em silêncio, e o rodapé do Sidebar mostrava
 * "Sem perfil" para todo mundo.
 */
export interface MeProfileDto {
  profileId: UUID | null;
  profileSlug: string | null;
  profileName: string | null;
  isAdmin: boolean;
  permissions: readonly string[];
}

/**
 * Input de `POST /api/v1/admin/profiles`.
 *
 * pt-BR (#97): sem `isAdmin`. A API ignora o campo de propósito — um ator com
 * `admin.manage-profiles` criaria profile de bypass total — e as flags vêm
 * só do seed.
 */
export interface CreateProfileInputDto {
  slug: string;
  name: string;
  description?: string;
  initialPermissions?: readonly string[];
}

/** Input de `PATCH /api/v1/admin/profiles/:id` — `name` é obrigatório. */
export interface UpdateProfileInputDto {
  name: string;
  description?: string;
}

/**
 * Input de `PUT /api/v1/admin/users/:id/profile`.
 *
 * pt-BR (#97): `profileId` anulável — `null` LIMPA o perfil do usuário. É o
 * mesmo PUT; não existe DELETE para isso.
 */
export interface AssignProfileInputDto {
  profileId: UUID | null;
}
