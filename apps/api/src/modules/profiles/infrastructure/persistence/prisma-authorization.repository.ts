// apps/api/src/modules/profiles/infrastructure/persistence/prisma-authorization.repository.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): implementação Prisma para
// `AuthorizationRepositoryPort`. NOTA: o schema atual (e o migration)
// NÃO tem `deletedAt` em authorizations — apenas `id/profileId/
// permissionKey/createdAt`. Se a versão sem soft-delete for a
// definitiva, `delete` aqui é hard-delete e `upsert` é puro upsert.
// Para o escopo da task #93.1, o port oferece soft-delete como
// contrato futuro mas o repo atual reflete o schema real.

import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service.js';
import type { AuthorizationRepositoryPort } from '../../domain/ports/authorization-repository.port.js';
import type { ProfileId } from '../../domain/value-objects/profile-id.vo.js';
import type { AuthorizationKey } from '../../domain/value-objects/authorization-key.vo.js';
import { Authorization } from '../../domain/authorization.entity.js';
import { comEscopo, escopoDoTenant } from '../../../../shared/infrastructure/prisma/escopo.js';

@Injectable()
export class PrismaAuthorizationRepository implements AuthorizationRepositoryPort {
  /** pt-BR: `@Inject(PrismaService)` explícito — `PrismaClient` é interface
   * material e some em runtime (mesmo motivo do PrismaProfileRepository). */
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  async listByProfile(profileId: ProfileId, tenantId: string | null): Promise<Authorization[]> {
    // pt-BR (Fase 9 — RLS): `authorizations` não tem `tenant_id`; a policy
    // (`authorizations_leitura`) atravessa `profiles` para resolver a dona, e
    // ela só existe para quem tem `app.tenant_id` posto. Sem escopo a
    // consulta volta vazia — o sintoma seria "as permissões do perfil
    // sumiram", não um erro.
    const rows = await comEscopo(this.prisma, escopoDoTenant(tenantId), (tx) =>
      tx.authorization.findMany({
        where: { profileId: profileId.value },
        orderBy: { permissionKey: 'asc' },
      }),
    );
    return rows.map((r) =>
      Authorization.restore({
        id: r.id,
        profileId,
        key: r.permissionKey as unknown as AuthorizationKey,
        createdAt: r.createdAt,
        updatedAt: r.createdAt,
      }),
    );
  }

  async countByProfile(profileId: ProfileId, tenantId: string | null): Promise<number> {
    return comEscopo(this.prisma, escopoDoTenant(tenantId), (tx) =>
      tx.authorization.count({
        where: { profileId: profileId.value },
      }),
    );
  }

  async upsert(input: {
    profileId: ProfileId;
    key: AuthorizationKey;
    agora: Date;
    tenantId: string | null;
  }): Promise<Authorization> {
    const row = await comEscopo(this.prisma, escopoDoTenant(input.tenantId), (tx) =>
      tx.authorization.upsert({
        where: {
          profileId_permissionKey: {
            profileId: input.profileId.value,
            permissionKey: input.key.value,
          },
        },
        create: {
          profileId: input.profileId.value,
          permissionKey: input.key.value,
        },
        update: {},
      }),
    );
    return Authorization.restore({
      id: row.id,
      profileId: input.profileId,
      key: input.key,
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
    });
  }

  async delete(input: {
    profileId: ProfileId;
    key: AuthorizationKey;
    tenantId: string | null;
  }): Promise<void> {
    await comEscopo(this.prisma, escopoDoTenant(input.tenantId), (tx) =>
      tx.authorization.deleteMany({
        where: {
          profileId: input.profileId.value,
          permissionKey: input.key.value,
        },
      }),
    );
  }
}
