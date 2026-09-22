import type {
  UserRepositoryPort,
  UserListInput,
  UserListResult,
} from '../../domain/ports/user-repository.port.js';
import { User } from '../../domain/user.aggregate.js';
import type { UserId } from '../../domain/value-objects/user-id.vo.js';
import type { Email } from '../../domain/value-objects/email.vo.js';
import { ConcurrencyException } from '../../domain/exceptions/user.exceptions.js';

/**
 * Implementação InMemory do UserRepositoryPort.
 *
 * Usada em testes unitários e no dev inicial (Fase 4). Será substituída
 * por PrismaUserRepository na Fase 6 (mesmo contrato, persistência real).
 *
 * Estratégia: Map<string, User> indexada por id.value. Para unicidade de
 * email, mantém índice secundário Map<string, string> (email -> id).
 *
 * Concorrência: o caller passa expectedVersion em save(). Se a versão
 * armazenada divergir, lança ConcurrencyException (optimistic locking).
 */
export class InMemoryUserRepository implements UserRepositoryPort {
  private readonly byId = new Map<string, User>();
  private readonly emailIndex = new Map<string, string>(); // email.value -> id.value

  async findById(id: UserId): Promise<User | null> {
    const found = this.byId.get(id.value);
    if (found === undefined) return null;
    return this.clone(found);
  }

  async findByEmail(email: Email): Promise<User | null> {
    const id = this.emailIndex.get(email.value);
    if (id === undefined) return null;
    const found = this.byId.get(id);
    if (found === undefined) return null;
    return this.clone(found);
  }

  /**
   * Hidrata um snapshot defensivo a partir do User armazenado, para evitar
   * que mutações no agregado retornado pelo caller (renomear, alterarEmail,
   * marcarExcluido, ...) afetem diretamente o que está em byId.
   */
  private clone(source: User): User {
    return User.restaurarDePersistencia({
      id: source.id().value,
      nome: source.nome().value,
      email: source.email().value,
      createdAt: source.createdAt(),
      updatedAt: source.updatedAt(),
      version: source.version(),
      deletedAt: source.deletedAt(),
    });
  }

  async save(user: User, expectedVersion: number): Promise<User> {
    // Snapshot defensivo: clonamos o agregado para evitar que mutações
    // posteriores na referência original do caller afetem o que ficou
    // persistido. Sem isso, o optimistic locking quebra (mesma referência
    // compartilhada = versão armazenada muda junto com a do caller).
    const snapshot = User.restaurarDePersistencia({
      id: user.id().value,
      nome: user.nome().value,
      email: user.email().value,
      createdAt: user.createdAt(),
      updatedAt: user.updatedAt(),
      version: user.version(),
      deletedAt: user.deletedAt(),
    });

    const current = this.byId.get(snapshot.id().value);

    if (current === undefined) {
      // INSERT path: só permitido se expectedVersion === 0
      if (expectedVersion !== 0) {
        throw new ConcurrencyException(expectedVersion, null);
      }
      // valida unicidade de email (exceto se for o próprio id, o que aqui é N/A)
      if (this.emailIndex.has(snapshot.email().value)) {
        throw new Error(
          `EmailAlreadyInUse: email '${snapshot.email().value}' já está em uso por outro User`,
        );
      }
      this.byId.set(snapshot.id().value, snapshot);
      this.emailIndex.set(snapshot.email().value, snapshot.id().value);
      return snapshot;
    }

    // UPDATE path: valida versão esperada
    const actualVersion = current.version();
    if (actualVersion !== expectedVersion) {
      throw new ConcurrencyException(expectedVersion, actualVersion);
    }

    // Se email mudou, atualiza índice
    if (current.email().value !== snapshot.email().value) {
      this.emailIndex.delete(current.email().value);
      // verifica se novo email já está em uso por OUTRO user
      const occupier = this.emailIndex.get(snapshot.email().value);
      if (occupier !== undefined && occupier !== snapshot.id().value) {
        // restaura índice antigo antes de propagar erro
        this.emailIndex.set(current.email().value, snapshot.id().value);
        throw new Error(
          `EmailAlreadyInUse: email '${snapshot.email().value}' já está em uso por outro User`,
        );
      }
      this.emailIndex.set(snapshot.email().value, snapshot.id().value);
    }

    this.byId.set(snapshot.id().value, snapshot);
    return snapshot;
  }

  async list(input: UserListInput): Promise<UserListResult> {
    const includeDeleted = input.includeDeleted === true;
    const limit = Math.max(1, Math.min(100, input.limit));
    const all = [...this.byId.values()]
      .filter((u) => includeDeleted || !u.isDeleted())
      .sort((a, b) => a.id().value.localeCompare(b.id().value));

    const startIdx = input.cursor ? Number.parseInt(input.cursor, 10) : 0;
    if (Number.isNaN(startIdx) || startIdx < 0 || startIdx >= all.length) {
      return { users: [], nextCursor: null };
    }
    const slice = all.slice(startIdx, startIdx + limit);
    const nextStart = startIdx + slice.length;
    const nextCursor = nextStart < all.length ? String(nextStart) : null;
    return { users: slice, nextCursor };
  }

  // Helpers para testes

  /** Total de Users armazenados (incluindo soft-deleted). */
  get size(): number {
    return this.byId.size;
  }

  /** Limpa todos os Users (uso em testes). */
  clear(): void {
    this.byId.clear();
    this.emailIndex.clear();
  }
}
