import { User } from '../../domain/user.aggregate.js';

/**
 * Formato da linha do Prisma — coincide com a saída de prisma.user.find*().
 * Mantemos snake_case das colunas como o Prisma entrega (camelCase a partir
 * dos @map) — User.id é PK em camelCase porque não foi mapeado.
 */
export interface UserRow {
  id: string;
  email: string;
  name: string; // coluna 'name' do schema (não 'nome')
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

export interface UserPersistenceRow {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

/**
 * Mapper entre linhas Prisma e o aggregate User.
 *
 * - `toDomain` hidrata o agregado via `User.restaurarDePersistencia` (que NÃO
 *   emite eventos — eventos históricos foram emitidos no momento original).
 * - `toPersistence` lê os getters públicos do agregado (que devolvem VOs
 *   primitivos) e converte para o shape aceito pelo `prisma.user.create/update`.
 *
 * Observação: as colunas `createdBy`/`updatedBy`/`deletedBy` existem no
 * schema mas o agregado ainda não tem hooks de auditoria — persistimos null
 * por enquanto (Fase 6 foca em persistência + lock; auditoria semântica
 * virá em fase posterior se necessário).
 */
export const UserPrismaMapper = {
  toDomain(row: UserRow): User {
    return User.restaurarDePersistencia({
      id: row.id,
      nome: row.name, // schema 'name' → domain 'nome'
      email: row.email,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      version: row.version,
      deletedAt: row.deletedAt,
    });
  },

  toPersistence(user: User): UserPersistenceRow {
    return {
      id: user.id().value,
      email: user.email().value,
      name: user.nome().value,
      createdAt: user.createdAt(),
      updatedAt: user.updatedAt(),
      createdBy: null,
      updatedBy: null,
      deletedAt: user.deletedAt(),
      deletedBy: null,
      version: user.version(),
    };
  },
};
