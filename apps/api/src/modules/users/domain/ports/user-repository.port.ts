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
  /**
   * pt-BR (2026-10-17): restringe o resultado a UM usuário. O controller de
   * `GET /users` preenche quando o ator não tem `users.read` e não tem empresa
   * — sem isto o bucket `'*'` devolve a base inteira. Não é autorização: quem
   * decide é o controller, e o repositório só obedece.
   */
  somenteUsuarioId?: string | null;
}

export interface UserListResult {
  users: User[];
  nextCursor: string | null;
  /**
   * pt-BR (#106, 2026-10-18): perfil EFETIVO de cada usuário no escopo pedido,
   * indexado por `userId`.
   *
   * Com `tenantId`, vem da `tenant_memberships.profile_id` — a mesma coluna que a
   * autorização lê. Sem `tenantId`, vem de `users.profile_id`, que é a coluna
   * que `findProfileId` e a escrita usam no bucket global. A bifurcação não é
   * escolha: as três concordarem é o que impede a tela de discordar da escrita.
   *
   * O agregado NÃO é reescrito com este valor: `User.profileId` é o perfil da
   * conta, e a conta não pertence a uma empresa. Isto é projeção de leitura.
   *
   * ⚠️ pt-BR (achado 1) **TODO `userId` da página está no mapa.** `null` = sem
   * perfil. Map AUSENTE = a projeção não foi pedida (`list()` sem
   * `comPerfilEfetivo`), ou o id não veio da página.
   *
   * Este contrato JÁ FOI de três estados (ausente = "não pertence", `null` =
   * "pertence sem perfil") e foi REMOVIDO: no bucket global todo usuário da
   * página pertence por definição, então "não pertence" não tinha dado que o
   * sustentasse, e o filtro que tentava produzir esse dado (`profile: { is:
   * { tenantId: null } }`) excluía justamente as contas criadas pelo produto.
   */
  perfilEfetivo?: ReadonlyMap<string, string | null>;
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
/**
 * ── `tenantId` em TODOS os métodos (Fase 10, 2026-10-17) ──────────────────────
 * `users` não tem `tenant_id`: o vínculo com a empresa é a `tenant_memberships`,
 * e a RLS o resolve por `EXISTS` (ver `20261020000001_rls_isolation_users`).
 * Sem este parâmetro a sessão não sabe que empresa está falando, e a policy
 * falha fechada — a leitura devolve vazio e a escrita estoura.
 *
 * `null` é o bucket de SISTEMA (`escopoDoTenant(null)` → `'*'`), e é o correto
 * para quem fala ANTES de existir empresa: `POST /users`, o `findByEmail` do
 * login e o refresh. Não é "sem restrição nenhuma" — é a empresa de todos, o
 * bucket que o admin global do seed usa.
 *
 * É TRADUÇÃO, não autorização: passar `null` onde se queria uma empresa abre o
 * bucket de sistema. Quem valida se o ator pode ler a linha que quer continua
 * sendo a query e a guarda de aplicação.
 */
export interface UserRepositoryPort {
  /**
   * Busca User pelo id. Retorna null se não existir.
   *
   * Por padrão, retorna null se o User estiver soft-deleted (deletedAt !== null) —
   * este é o caminho "consulta de produção". Use `{ includeDeleted: true }`
   * para fluxos que precisam operar sobre soft-deleted (ex: restaurar).
   */
  findById(id: UserId, tenantId: string | null, options?: FindByIdOptions): Promise<User | null>;

  /**
   * Busca User pelo email (já normalizado). Retorna null se não existir.
   * Usado pelo application service para validar unicidade antes de criar.
   */
  findByEmail(email: Email, tenantId: string | null): Promise<User | null>;

  /**
   * Persiste o estado atual do agregado.
   *
   * - INSERT: quando expectedVersion === 0 (agregado novo, ainda não persistido).
   * - UPDATE: quando expectedVersion === aggregate.version() - 1 (estado pré-mutação).
   *
   * Lança ConcurrencyException se a versão atual persistida divergir de expectedVersion.
   */
  save(user: User, expectedVersion: number, tenantId: string | null): Promise<User>;

  /**
   * Lista Users com paginação por cursor (opaca).
   * Por padrão exclui soft-deleted (deletedAt !== null).
   * Inclui soft-deleted quando `includeDeleted: true`.
   */
  /**
   * pt-BR (achado 10): `opcoes.comPerfilEfetivo` decide se a projeção de perfil
   * é paga. `false` (default) não abre a transação extra — `GET /users` tem
   * chamadores que não renderizam o campo.
   */
  list(
    input: UserListInput,
    tenantId: string | null,
    opcoes?: { comPerfilEfetivo?: boolean },
  ): Promise<UserListResult>;

  /**
   * pt-BR (#93.1 — RBAC, 2026-10-16): conta quantos users têm o
   * `profileId` atribuído. Usado por ProfileUseCases.deletar() para
   * garantir que um profile em uso não pode ser deletado (409).
   */
  countByProfile(profileId: string, tenantId: string | null): Promise<number>;
}
