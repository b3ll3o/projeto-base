// apps/api/src/modules/profiles/infrastructure/persistence/prisma-authorization.repository.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): implementação Prisma para
// `AuthorizationRepositoryPort`. NOTA: o schema atual (e o migration)
// NÃO tem `deletedAt` em authorizations — apenas `id/profileId/
// permissionKey/createdAt`. Se a versão sem soft-delete for a
// definitiva, `delete` aqui é hard-delete e `upsert` é puro upsert.
// Para o escopo da task #93.1, o port oferece soft-delete como
// contrato futuro mas o repo atual reflete o schema real.

import { Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import type { AuthorizationRepositoryPort } from '../../domain/ports/authorization-repository.port.js';
import type { ProfileId } from '../../domain/value-objects/profile-id.vo.js';
import type { AuthorizationKey } from '../../domain/value-objects/authorization-key.vo.js';
import { Authorization } from '../../domain/authorization.entity.js';

@Injectable()
export class PrismaAuthorizationRepository implements AuthorizationRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async listByProfile(profileId: ProfileId): Promise<Authorization[]> {
    const rows = await this.prisma.authorization.findMany({
      where: { profileId: profileId.value },
      orderBy: { permissionKey: 'asc' },
    });
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

  async countByProfile(profileId: ProfileId): Promise<number> {
    return this.prisma.authorization.count({
      where: { profileId: profileId.value },
    });
  }

  async upsert(input: {
    profileId: ProfileId;
    key: AuthorizationKey;
    agora: Date;
  }): Promise<Authorization> {
    const row = await this.prisma.authorization.upsert({
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
    });
    return Authorization.restore({
      id: row.id,
      profileId: input.profileId,
      key: input.key,
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
    });
  }

  async delete(input: { profileId: ProfileId; key: AuthorizationKey }): Promise<void> {
    await this.prisma.authorization.deleteMany({
      where: {
        profileId: input.profileId.value,
        permissionKey: input.key.value,
      },
    });
  }
}
