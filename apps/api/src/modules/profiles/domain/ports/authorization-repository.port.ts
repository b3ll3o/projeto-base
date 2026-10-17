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
  /**
   * pt-BR (Fase 9 — RLS): `tenantId` é o ESCOPO DA SESSÃO, o mesmo `null` de
   * `ProfileRepositoryPort.findById` — `null` = bucket de SISTEMA, preenchido =
   * aquela empresa. Ele NÃO vai para o `where`: `authorizations` não tem
   * `tenant_id`, e quem decide a dona é a policy, que a resolve atravessando
   * `profiles`.
   *
   * ⚠️ MEDIDO 2026-10-17: hoje NENHUM consumidor injeta esta porta — ela está
   * registrada no `ProfilesModule` e é instanciável, mas nenhuma use case a
   * recebe. O parâmetro entra mesmo assim porque o registro no DI é o que torna
   * o próximo consumidor a UMA LINHA de distância, e o descuido de quem não
   * abre o escopo seria silencioso: `authorizations` tem policy, então a sessão
   * sem `app.tenant_id` volta com ZERO linhas — o sintoma é "as permissões do
   * perfil sumiram", não um erro.
   */
  listByProfile(profileId: ProfileId, tenantId: string | null): Promise<Authorization[]>;
  countByProfile(profileId: ProfileId, tenantId: string | null): Promise<number>;
  upsert(input: {
    profileId: ProfileId;
    key: AuthorizationKey;
    agora: Date;
    tenantId: string | null;
  }): Promise<Authorization>;
  delete(input: {
    profileId: ProfileId;
    key: AuthorizationKey;
    tenantId: string | null;
  }): Promise<void>;
}

/**
 * Token estável do port. Nest resolve o provider por este símbolo — não
 * pela interface (apagada em runtime, e `tsx` não emite
 * `design:paramtypes`).
 */
export const AUTHORIZATION_REPOSITORY_PORT = Symbol('AuthorizationRepositoryPort');
