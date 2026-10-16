// apps/api/src/modules/profiles/domain/ports/authorization-repository.port.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): contrato de domínio para o
// repositório de Authorization. Não conhece Prisma — a implementação
// fica em infrastructure/persistence/prisma-authorization.repository.ts.
//
// Operações:
//  - listByProfile: usado no GET /api/v1/admin/profiles/:id
//  - countByProfile: usado no GET /api/v1/admin/profiles (resumo)
//  - upsert: idempotente (assign da mesma key 2x = 1 row)
//  - delete: idempotente (revoke de key inexistente = noop)

import type { ProfileId } from '../value-objects/profile-id.vo.js';
import type { AuthorizationKey } from '../value-objects/authorization-key.vo.js';
import type { Authorization } from '../authorization.entity.js';

export interface AuthorizationRepositoryPort {
  listByProfile(profileId: ProfileId): Promise<Authorization[]>;
  countByProfile(profileId: ProfileId): Promise<number>;
  upsert(input: {
    profileId: ProfileId;
    key: AuthorizationKey;
    agora: Date;
  }): Promise<Authorization>;
  delete(input: { profileId: ProfileId; key: AuthorizationKey }): Promise<void>;
}

/**
 * Token estável do port. Nest resolve o provider por este símbolo — não
 * pela interface (apagada em runtime, e `tsx` não emite
 * `design:paramtypes`).
 */
export const AUTHORIZATION_REPOSITORY_PORT = Symbol('AuthorizationRepositoryPort');
