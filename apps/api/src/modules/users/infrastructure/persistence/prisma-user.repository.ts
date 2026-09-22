// apps/api/src/modules/users/infrastructure/persistence/prisma-user.repository.ts
//
// Implementação Prisma do UserRepositoryPort (Fase 6).
//
// - save(user, expectedVersion): faz INSERT (expectedVersion=0) ou UPDATE
//   com `updateMany WHERE version=expected` para optimistic locking. Em
//   falha, recarrega a versão atual e relança ConcurrencyException.
// - findById/findByEmail: filtram soft-deleted por padrão (retornam null).
// - list: cursor opaco (id do último item), respeita includeDeleted.
//
// pt-BR: o agregado devolvido pelo repositório é um snapshot via
// `User.restaurarDePersistencia` — mutações no agregado retornado NÃO
// afetam o que está no banco (analogia com o clone() do InMemoryUserRepository).
// O `User.criar` é chamado pelos use-cases; aqui só persistimos.

import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type {
  UserRepositoryPort,
  UserListInput,
  UserListResult,
} from '../../domain/ports/user-repository.port.js';
import type { User } from '../../domain/user.aggregate.js';
import type { UserId } from '../../domain/value-objects/user-id.vo.js';
import type { Email } from '../../domain/value-objects/email.vo.js';
import { ConcurrencyException } from '../../domain/exceptions/user.exceptions.js';
import { UserPrismaMapper, type UserRow } from './user.prisma-mapper.js';

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Persiste o agregado respeitando optimistic locking.
   *
   * - INSERT (criar novo): só permitido se expectedVersion === 0 e a row
   *   ainda não existe.
   * - UPDATE (mutação): faz `updateMany WHERE id=? AND version=expectedVersion`.
   *   Se `count === 0`, recarrega a versão atual e lança ConcurrencyException
   *   com a divergência observada.
   *
   * Devolve o agregado persistido (snapshot via User.restaurarDePersistencia).
   */
  async save(user: User, expectedVersion: number): Promise<User> {
    const row = UserPrismaMapper.toPersistence(user);
    const id = user.id().value;

    // INSERT path: row ainda não existe no banco.
    // Usamos `create` direto; se já existir (race), o Prisma lança P2002 /
    // P2025 que tratamos como ConcurrencyException(expected=0, actual=null|1).
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (existing === null) {
      if (expectedVersion !== 0) {
        // Caller disse que esperava versão N>0 mas o agregado sumiu.
        throw new ConcurrencyException(expectedVersion, null);
      }
      try {
        await this.prisma.user.create({ data: row });
      } catch (e) {
        // Possível race: outro processo inseriu entre o findUnique e o create.
        // Recarrega para distinguir 0 vs duplicado.
        const actual = await this.prisma.user.findUnique({ where: { id } });
        throw new ConcurrencyException(expectedVersion, actual?.version ?? null);
      }
      return this.loadSnapshot(id);
    }

    // UPDATE path: aplica lock otimista via WHERE version=expected.
    const updated = await this.prisma.user.updateMany({
      where: { id, version: expectedVersion },
      data: {
        email: row.email,
        name: row.name,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy,
        deletedAt: row.deletedAt,
        deletedBy: row.deletedBy,
        // Não incrementamos version manualmente — confiamos no mutator que já
        // bumped no agregado; só persistimos o estado final.
        version: row.version,
      },
    });

    if (updated.count === 0) {
      const actual = await this.prisma.user.findUnique({ where: { id } });
      throw new ConcurrencyException(expectedVersion, actual?.version ?? null);
    }

    return this.loadSnapshot(id);
  }

  /**
   * findById com filtro de soft-delete: retorna null se deletedAt != null.
   */
  async findById(id: UserId): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id: id.value } });
    if (row === null) return null;
    if (row.deletedAt !== null) return null;
    return UserPrismaMapper.toDomain(row);
  }

  /**
   * findByEmail: o VO já normaliza para lowercase. Filtra soft-deleted.
   */
  async findByEmail(email: Email): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { email: email.value } });
    if (row === null) return null;
    if (row.deletedAt !== null) return null;
    return UserPrismaMapper.toDomain(row);
  }

  /**
   * Lista com cursor opaco (id do último item) e includeDeleted opcional.
   * Ordena por createdAt desc para casar com o índice do schema; usa id como
   * tie-breaker determinístico via ordem do id.
   */
  async list(input: UserListInput): Promise<UserListResult> {
    const includeDeleted = input.includeDeleted === true;
    const where = includeDeleted ? {} : { deletedAt: null };

    // Cursor opaco = id da última row da página anterior; pegamos `take=limit+1`
    // para detectar se há próxima página sem count(*) custoso.
    const cursor = input.cursor ? { id: input.cursor } : undefined;
    const rows = await this.prisma.user.findMany({
      where,
      ...(cursor ? { cursor, skip: 1 } : {}),
      take: input.limit + 1,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });

    const hasMore = rows.length > input.limit;
    const page = hasMore ? rows.slice(0, input.limit) : rows;
    const last = page[page.length - 1];
    return {
      users: page.map((r: UserRow) => UserPrismaMapper.toDomain(r)),
      nextCursor: hasMore && last !== undefined ? last.id : null,
    };
  }

  /**
   * Snapshot defensivo do agregado (recupera fresh do banco para evitar
   * que mutações no agregado devolvido pelo caller afetem o que está
   * persistido). Espelha o `clone()` do InMemoryUserRepository.
   */
  private async loadSnapshot(id: string): Promise<User> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    if (row === null) {
      // Em teoria inalcançável: só chamamos após persistir. Se acontecer,
      // propaga como ConcurrencyException(expectedVersion=?, actual=null).
      throw new ConcurrencyException(-1, null);
    }
    return UserPrismaMapper.toDomain(row);
  }
}
