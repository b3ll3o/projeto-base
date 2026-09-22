import type { User } from '../user.aggregate.js';
import type { UserId } from '../value-objects/user-id.vo.js';
import type { Email } from '../value-objects/email.vo.js';

/**
 * Símbolo/constante para injeção de dependência (NestJS ou outro container).
 * A implementação concreta (InMemoryUserRepository na Fase 4 Wave 4, PrismaUserRepository
 * na Fase 6) é associada a este token no módulo de infraestrutura.
 */
export const USER_REPOSITORY_PORT = Symbol('UserRepositoryPort');

export interface UserListInput {
  cursor?: string | null;
  limit: number;
  includeDeleted?: boolean;
}

export interface UserListResult {
  users: User[];
  nextCursor: string | null;
}

/**
 * Opções para `findById`.
 *
 * - `includeDeleted: true` permite carregar o User mesmo se ele estiver
 *   soft-deleted (deletedAt !== null). Usado por fluxos que precisam
 *   operar sobre soft-deleted (ex: `UserUseCases.restaurar()`).
 * - Default `false`: retorna null se soft-deleted — semântica de
 *   consulta de produção (read APIs).
 */
export interface FindByIdOptions {
  includeDeleted?: boolean;
}

/**
 * Port do repositório de User (DDD/Hexagonal).
 *
 * Contrato de domínio — não conhece a infraestrutura. A implementação concreta
 * fica em infrastructure/persistence/ e é resolvida via DI.
 *
 * Otimismo de versionamento: `save()` exige que o caller informe a `expectedVersion`
 * (a versão que ele leu antes de aplicar mutações). Se o repositório já tiver uma
 * versão diferente para o mesmo aggregateId, lança ConcurrencyException — o caller
 * precisa recarregar, re-aplicar as mutações e tentar de novo (ou abortar).
 */
export interface UserRepositoryPort {
  /**
   * Busca User pelo id. Retorna null se não existir.
   *
   * Por padrão, retorna null se o User estiver soft-deleted (deletedAt !== null) —
   * este é o caminho "consulta de produção". Use `{ includeDeleted: true }`
   * para fluxos que precisam operar sobre soft-deleted (ex: restaurar).
   */
  findById(id: UserId, options?: FindByIdOptions): Promise<User | null>;

  /**
   * Busca User pelo email (já normalizado). Retorna null se não existir.
   * Usado pelo application service para validar unicidade antes de criar.
   */
  findByEmail(email: Email): Promise<User | null>;

  /**
   * Persiste o estado atual do agregado.
   *
   * - INSERT: quando expectedVersion === 0 (agregado novo, ainda não persistido).
   * - UPDATE: quando expectedVersion === aggregate.version() - 1 (estado pré-mutação).
   *
   * Lança ConcurrencyException se a versão atual persistida divergir de expectedVersion.
   */
  save(user: User, expectedVersion: number): Promise<User>;

  /**
   * Lista Users com paginação por cursor (opaca).
   * Por padrão exclui soft-deleted (deletedAt !== null).
   * Inclui soft-deleted quando `includeDeleted: true`.
   */
  list(input: UserListInput): Promise<UserListResult>;
}
