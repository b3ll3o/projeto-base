// apps/api/src/modules/profiles/infrastructure/persistence/prisma-profile.repository.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): implementação Prisma do
// ProfileRepositoryPort. Cada operação carrega também as
// Authorizations em transação para o agregado vir completo.

import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service.js';
import { Profile } from '../../domain/profile.aggregate.js';
import type { ProfileRepositoryPort } from '../../domain/ports/profile-repository.port.js';
import { profileId as makeProfileId } from '../../domain/value-objects/profile-id.vo.js';
import { profileSlug as makeProfileSlug } from '../../domain/value-objects/profile-slug.vo.js';
import { ConcurrencyException } from '../../domain/exceptions/profile.exceptions.js';

@Injectable()
export class PrismaProfileRepository implements ProfileRepositoryPort {
  /**
   * pt-BR: `@Inject(PrismaService)` explícito porque o parâmetro é tipado
   * como `PrismaClient` (interface material, apagada em runtime pelo TS).
   * Sem o token o Nest LANÇA no boot (`Nest can't resolve dependencies
   * of the PrismaProfileRepository (?)`) — não passa `undefined`.
   */
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  async findById(id: ReturnType<typeof makeProfileId>): Promise<Profile | null> {
    const row = await this.prisma.profile.findUnique({
      where: { id: id.value },
      include: { authorizations: { select: { permissionKey: true } } },
    });
    if (row === null) {
      return null;
    }
    return this.toDomain(
      row,
      row.authorizations.map((a) => a.permissionKey),
    );
  }

  async findBySlug(slug: ReturnType<typeof makeProfileSlug>): Promise<Profile | null> {
    // pt-BR (Fase 2 — tenancy, 2026-10-16): `slug` deixou de ser `@unique` — a
    // D3 exige que duas empresas tenham ambas um perfil "manager", então a
    // unicidade passou para dois índices PARCIAIS em SQL (migration
    // `20261017000000_...`), que o Prisma não sabe expressar em `findUnique`.
    //
    // Quem chama: `obterPorSlug` (`profiles.use-cases.ts:129`, hoje sem rota
    // HTTP) e a checagem de slug duplicado do `criar` (`:179`, que é o
    // `POST /admin/profiles`). NÃO é o `PermissionsGuard` nem o
    // `UserProfileCacheService` — o guard resolve perfil por `findById`, via
    // `users.profile_id`.
    //
    // Por que filtrar `tenantId: null` é o certo AGORA (e não um
    // "deny-by-default" conveniente): `Profile.criar` não tem `tenantId`, então
    // toda escrita da aplicação é global por construção, e
    // `profiles_slug_global_uniq` garante exatamente o mesmo par que este
    // código consulta. Código e índice estão coerentes por construção, não por
    // sorte.
    //
    // curto por natureza: na Fase 4 este método passa a receber o tenant e a
    // checagem de duplicado em `:179` precisa do mesmo escopo de empresa.
    const row = await this.prisma.profile.findFirst({
      where: { slug: slug.value, tenantId: null },
      include: { authorizations: { select: { permissionKey: true } } },
    });
    if (row === null) {
      return null;
    }
    return this.toDomain(
      row,
      row.authorizations.map((a) => a.permissionKey),
    );
  }

  async list(): Promise<Profile[]> {
    const rows = await this.prisma.profile.findMany({
      orderBy: { createdAt: 'desc' },
      include: { authorizations: { select: { permissionKey: true } } },
    });
    return rows.map((r) =>
      this.toDomain(
        r,
        r.authorizations.map((a) => a.permissionKey),
      ),
    );
  }

  async save(profile: Profile): Promise<Profile> {
    const id = profile.id().value;
    // pt-BR (#97): âncora do optimistic lock é a versão em que o agregado
    // foi CARREGADO, não `version() - 1` — um save pode ter vários mutators
    // atrás (atualizar = renomear + alterarDescricao).
    const expectedVersion = profile.loadedVersion();
    const keys = profile.authorizations().toLista();
    const data = {
      slug: profile.slug().value,
      name: profile.nome().value,
      description: profile.descricao(),
      isAdmin: profile.isAdmin(),
      isSystem: profile.isSystem(),
    };

    const isNew = expectedVersion === 0;
    if (isNew) {
      const created = await this.prisma.profile.create({
        // pt-BR (#97): o nested-write de CREATE aceita só `create` /
        // `createMany` / `connectOrCreate` / `connect` — `deleteMany`
        // pertence ao tipo do UPDATE. Mandá-lo aqui dá
        // `PrismaClientValidationError` em runtime.
        data: {
          id,
          ...data,
          authorizations: { create: keys.map((k) => ({ permissionKey: k })) },
        },
        include: { authorizations: { select: { permissionKey: true } } },
      });
      return this.toDomain(
        created,
        created.authorizations.map((a) => a.permissionKey),
      );
    }

    // pt-BR (#97): as três escritas vão na MESMA `$transaction`. Sem ela,
    // um `createMany` que falha deixa o profile com a version incrementada
    // e ZERO permissões — o aggregate em memória e o banco divergem.
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.profile.updateMany({
        where: { id, version: expectedVersion },
        data: { ...data, version: profile.version() },
      });
      if (updated.count === 0) {
        throw new ConcurrencyException('Profile', expectedVersion, -1);
      }
      await tx.authorization.deleteMany({ where: { profileId: id } });
      if (keys.length > 0) {
        await tx.authorization.createMany({
          data: keys.map((k) => ({ profileId: id, permissionKey: k })),
        });
      }
    });
    return profile;
  }

  async delete(id: ReturnType<typeof makeProfileId>): Promise<void> {
    await this.prisma.profile.delete({ where: { id: id.value } });
  }

  private toDomain(
    row: {
      id: string;
      slug: string;
      name: string;
      description: string | null;
      isAdmin: boolean;
      isSystem: boolean;
      createdAt: Date;
      updatedAt: Date;
      version: number;
    },
    authKeys: string[],
  ): Profile {
    return Profile.restaurarDePersistencia({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      isAdmin: row.isAdmin,
      isSystem: row.isSystem,
      authorizations: authKeys,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version,
    });
  }
}
