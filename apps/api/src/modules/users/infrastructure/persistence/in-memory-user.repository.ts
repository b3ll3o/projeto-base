import {
  limitarPage,
  type UserRepositoryPort,
  type UserListInput,
  type UserListResult,
  type FindByIdOptions,
} from '../../domain/ports/user-repository.port.js';
import { User } from '../../domain/user.aggregate.js';
import type { UserId } from '../../domain/value-objects/user-id.vo.js';
import type { Email } from '../../domain/value-objects/email.vo.js';
import {
  ConcurrencyException,
  EmailAlreadyInUseException,
} from '../../domain/exceptions/user.exceptions.js';

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

  async findById(
    id: UserId,
    _tenantId: string | null,
    options?: FindByIdOptions,
  ): Promise<User | null> {
    const found = this.byId.get(id.value);
    if (found === undefined) return null;
    if (!options?.includeDeleted && found.isDeleted()) return null;
    return this.clone(found);
  }

  async findByEmail(email: Email, _tenantId: string | null): Promise<User | null> {
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
   *
   * O `senhaHash` atravessa o VO, não a string: `source.senhaHash()` já é um
   * `PasswordHash` e `restaurarDePersistencia` espera um. Copiar o VO é o
   * que mantém a invariante "o agregado sempre tem um hash válido" também
   * no repositório em memória — um `source.senhaHash().value` seguido de
   * `PasswordHash.create(...)` revalidaria um valor que já passou pelo VO.
   */
  private clone(source: User): User {
    return User.restaurarDePersistencia({
      id: source.id().value,
      nome: source.nome().value,
      email: source.email().value,
      senhaHash: source.senhaHash(),
      profileId: null,
      createdAt: source.createdAt(),
      updatedAt: source.updatedAt(),
      version: source.version(),
      deletedAt: source.deletedAt(),
    });
  }

  async save(user: User, expectedVersion: number, _tenantId: string | null): Promise<User> {
    // Snapshot defensivo: clonamos o agregado para evitar que mutações
    // posteriores na referência original do caller afetem o que ficou
    // persistido. Sem isso, o optimistic locking quebra (mesma referência
    // compartilhada = versão armazenada muda junto com a do caller).
    const snapshot = User.restaurarDePersistencia({
      id: user.id().value,
      nome: user.nome().value,
      email: user.email().value,
      senhaHash: user.senhaHash(),
      profileId: null,
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
        throw new EmailAlreadyInUseException(snapshot.email().value);
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
        throw new EmailAlreadyInUseException(snapshot.email().value);
      }
      this.emailIndex.set(snapshot.email().value, snapshot.id().value);
    }

    this.byId.set(snapshot.id().value, snapshot);
    return snapshot;
  }

  // pt-BR (2ª revisão, achado 7) Este repositório PASSA a devolver o mapa.
  //
  // A versão anterior dizia "o in-memory não tem `tenant_memberships`, então não
  // produz mapa — e isso é honesto". Não era: `User.profileId()` está no
  // agregado, e o bucket global do Prisma lê `users.profile_id` — a MESMA
  // coluna. O que o in-memory não tem é `tenant_memberships`, que só importa no
  // ramo COM tenant.
  //
  // A consequência de não devolver era pior que a de devolver errado: em
  // `tenantId === null` o Prisma devolve `null` para quem não tem perfil, e o
  // in-memory devolvia AUSENTE. Qualquer spec que subisse o controller real
  // sobre o in-memory veria a chave omitida, e a produção veria `null` — o
  // contrato de três estados que o achado 1 mandou remover voltava entre teste
  // e produção.
  async list(input: UserListInput, tenantId: string | null): Promise<UserListResult> {
    const includeDeleted = input.includeDeleted === true;
    // #124: o clamp agora vem do PORT — as duas implementações concordam.
    const limit = limitarPage(input.limit);
    const all = [...this.byId.values()]
      .filter((u) => includeDeleted || !u.isDeleted())
      // Espelha o `where.id` do repositório Prisma: o recorte vem do
      // controller e vale para qualquer backend, senão o in-memory mente sobre
      // o que a rota devolve.
      .filter((u) => !input.somenteUsuarioId || u.id().value === input.somenteUsuarioId)
      .sort((a, b) => a.id().value.localeCompare(b.id().value));

    const startIdx = input.cursor ? Number.parseInt(input.cursor, 10) : 0;
    if (Number.isNaN(startIdx) || startIdx < 0 || startIdx >= all.length) {
      return { users: [], nextCursor: null };
    }
    const slice = all.slice(startIdx, startIdx + limit);
    const nextStart = startIdx + slice.length;
    const nextCursor = nextStart < all.length ? String(nextStart) : null;

    // ⚠️ (achado 7) O ramo COM tenant segue sem mapa — aqui não existe
    // `tenant_memberships`, e inventar `null` seria afirmar que ninguém tem
    // perfil numa empresa, que é um estado que este repositório não observa.
    // A divergência com o Prisma fica explícita no port, que já diz que a
    // projeção do bucket de empresa depende do adapter.
    const comMapa =
      tenantId === null ? new Map(slice.map((u) => [u.id().value, u.profileId()])) : undefined;

    return {
      users: slice,
      nextCursor,
      ...(comMapa !== undefined ? { perfilEfetivo: comMapa } : {}),
    };
  }

  /**
   * pt-BR (#93.1 — RBAC, 2026-10-16): stub para satisfazer o port.
   * Não conta profileId no in-memory porque o `User.restaurarDePersistencia`
   * ignora o campo `profileId` (sempre null no clone). A semântica
   * "user com profile" no in-memory é zero até o caller atribuir via use case.
   */
  async countByProfile(_profileId: string, _tenantId: string | null): Promise<number> {
    return 0;
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
