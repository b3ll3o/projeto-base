// apps/api/src/modules/profiles/infrastructure/persistence/prisma-profile.repository.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): implementação Prisma do
// ProfileRepositoryPort. Cada operação carrega também as
// Authorizations em transação para o agregado vir completo.

import { Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { Profile } from '../../domain/profile.aggregate.js';
import type { ProfileRepositoryPort } from '../../domain/ports/profile-repository.port.js';
import { profileId as makeProfileId } from '../../domain/value-objects/profile-id.vo.js';
import { profileSlug as makeProfileSlug } from '../../domain/value-objects/profile-slug.vo.js';
import { profileName as makeProfileName } from '../../domain/value-objects/profile-name.vo.js';
import { authorizationKey } from '../../domain/value-objects/authorization-key.vo.js';
import { ConcurrencyException } from '../../domain/exceptions/profile.exceptions.js';

@Injectable()
export class PrismaProfileRepository implements ProfileRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: ReturnType<typeof makeProfileId>): Promise<Profile | null> {
    const row = await this.prisma.profile.findUnique({
      where: { id: id.value },
      include: { authorizations: { select: { permissionKey: true } } },
    });
    if (row === null) {
      return null;
    }
    return this.toDomain(row, row.authorizations.map((a) => a.permissionKey));
  }

  async findBySlug(slug: ReturnType<typeof makeProfileSlug>): Promise<Profile | null> {
    const row = await this.prisma.profile.findUnique({
      where: { slug: slug.value },
      include: { authorizations: { select: { permissionKey: true } } },
    });
    if (row === null) {
      return null;
    }
    return this.toDomain(row, row.authorizations.map((a) => a.permissionKey));
  }

  async list(): Promise<Profile[]> {
    const rows = await this.prisma.profile.findMany({
      orderBy: { createdAt: 'desc' },
      include: { authorizations: { select: { permissionKey: true } } },
    });
    return rows.map((r) => this.toDomain(r, r.authorizations.map((a) => a.permissionKey)));
  }

  async save(profile: Profile): Promise<Profile> {
    const id = profile.id().value;
    const expectedVersion = profile.version() - 1;
    const data = {
      slug: profile.slug().value,
      name: profile.nome().value,
      description: profile.descricao(),
      isAdmin: profile.isAdmin(),
      isSystem: profile.isSystem(),
      authorizations: {
        deleteMany: {},
        create: profile.authorizations().toLista().map((k) => ({ permissionKey: k })),
      },
    };

    const isNew = expectedVersion === 0;
    if (isNew) {
      const created = await this.prisma.profile.create({
        data: { id, ...data },
        include: { authorizations: { select: { permissionKey: true } } },
      });
      return this.toDomain(
        created,
        created.authorizations.map((a) => a.permissionKey),
      );
    }

    const updated = await this.prisma.profile.updateMany({
      where: { id, version: expectedVersion },
      data: {
        slug: data.slug,
        name: data.name,
        description: data.description,
        isAdmin: data.isAdmin,
        version: profile.version(),
      },
    });
    if (updated.count === 0) {
      throw new ConcurrencyException('Profile', expectedVersion, -1);
    }
    // Re-sync authorizations na transação implícita do save.
    await this.prisma.authorization.deleteMany({ where: { profileId: id } });
    if (profile.authorizations().toLista().length > 0) {
      await this.prisma.authorization.createMany({
        data: profile.authorizations().toLista().map((k) => ({
          profileId: id,
          permissionKey: k,
        })),
      });
    }
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
      updatedAt: row.createdAt, // sem updatedAt no model
      version: row.version,
    });
  }
}
