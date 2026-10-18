// apps/api/src/modules/profiles/infrastructure/persistence/profile.prisma-mapper.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): converte entre rows Prisma e o
// agregado Profile. Mesmo padrão do UserPrismaMapper.

import { Profile } from '../../domain/profile.aggregate.js';
import {
  ConcurrencyException,
  ProfileSlugAlreadyInUseException,
} from '../../domain/exceptions/profile.exceptions.js';

export interface ProfileRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isAdmin: boolean;
  isSystem: boolean;
  /** pt-BR (Fase 6): a empresa dona. `null` = perfil global (D3). */
  tenantId: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface ProfileAuthRow {
  profileId: string;
  permissionKey: string;
}

export interface ProfileFullRow extends ProfileRow {
  authorizations: ProfileAuthRow[];
}

export const ProfilePrismaMapper = {
  toDomain(row: ProfileFullRow): Profile {
    return Profile.restaurarDePersistencia({
      id: row.id,
      slug: row.slug,
      name: row.name,
      description: row.description,
      isAdmin: row.isAdmin,
      isSystem: row.isSystem,
      tenantId: row.tenantId,
      authorizations: row.authorizations.map((a) => a.permissionKey),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version,
    });
  },

  /**
   * Converte o agregado em dados para create (INSERT). NÃO inclui
   * `version` — ele é gerado pelo default do schema (1) na primeira
   * inserção.
   */
  toCreateInput(p: Profile): {
    id: string;
    slug: string;
    name: string;
    description: string | null;
    isAdmin: boolean;
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
    authorizations: string[];
  } {
    return {
      id: p.id().value,
      slug: p.slug().value,
      name: p.nome().value,
      description: p.descricao(),
      isAdmin: p.isAdmin(),
      isSystem: p.isSystem(),
      createdAt: p.createdAt(),
      updatedAt: p.updatedAt(),
      authorizations: p.authorizations().toLista(),
    };
  },

  /**
   * Converte o agregado em dados para updateMany (UPDATE). Sempre
   * inclui `version` (a versão que vai ser gravada).
   */
  toUpdateInput(p: Profile): {
    name: string;
    description: string | null;
    isAdmin: boolean;
    updatedAt: Date;
    version: number;
    authorizations: string[];
  } {
    return {
      name: p.nome().value,
      description: p.descricao(),
      isAdmin: p.isAdmin(),
      updatedAt: p.updatedAt(),
      version: p.version(),
      authorizations: p.authorizations().toLista(),
    };
  },
};

/**
 * Traduz erros do Prisma para exceções de domínio.
 */
export function traduzirFalhaDeUnicidade(
  erro: unknown,
  contexto: { slug: string; expectedVersion: number; esperavaLinhaAusente: boolean },
  atualRow: { id: string; version: number } | null,
): unknown {
  if (contexto.esperavaLinhaAusente && atualRow !== null) {
    return new ConcurrencyException('Profile', contexto.expectedVersion, atualRow.version);
  }
  if (
    erro !== null &&
    typeof erro === 'object' &&
    'code' in erro &&
    (erro as { code: string }).code === 'P2002'
  ) {
    return new ProfileSlugAlreadyInUseException(contexto.slug);
  }
  return erro;
}
