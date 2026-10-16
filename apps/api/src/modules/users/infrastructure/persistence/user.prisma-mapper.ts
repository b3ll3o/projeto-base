import { User } from '../../domain/user.aggregate.js';
import { PasswordHash } from '../../domain/value-objects/password-hash.vo.js';
import { UserPersistenceException, correlationIdAtual } from './user-persistence.exceptions.js';

/**
 * Formato da linha do Prisma — coincide com a saída de prisma.user.find*().
 * Mantemos snake_case das colunas como o Prisma entrega (camelCase a partir
 * dos @map) — User.id é PK em camelCase porque não foi mapeado.
 */
export interface UserRow {
  id: string;
  email: string;
  name: string; // coluna 'name' do schema (não 'nome')
  /**
   * Hash argon2id da senha (coluna `password_hash`).
   *
   * ⚠️ Entra aqui e sai daqui. `toDomain` é o ÚNICO caminho pelo qual um
   * hash lido do banco entra no agregado, e `toPersistence` é o único pelo
   * qual ele volta a sair — nenhum outro arquivo deve ler
   * `passwordHash` de uma row do Prisma. Manter o par dentro do mapper é o
   * que impede o hash de ser projetado num `select` de listagem.
   */
  passwordHash: string;
  // pt-BR (#93.1 — RBAC, 2026-10-16): FK para profiles. Null = sem
  // permissões (deny-by-default). Persistido como `profile_id` no DB.
  profileId: string | null;
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
  /**
   * ⚠️ Sai daqui direto para `users.password_hash`. Este é o SEGUNDO
   * momento em que o valor cru do hash é lido em código de produção (o
   * primeiro é o `hasher.hash()`), e por isso a leitura é explícita e
   * nomeada: `.value` no getter `senhaHash()`. Ninguém mais deve ler.
   */
  passwordHash: string;
  // pt-BR (#93.1 — RBAC, 2026-10-16): persistido como `profile_id`.
  profileId: string | null;
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
 * `passwordHash` é o campo que faz este mapper ser o ponto de estrangulamento
 * do hash: a conversion para `PasswordHash` acontece AQUI, e não no
 * repositório nem no use case. Um repositório que chamasse
 * `User.restaurarDePersistencia` direto teria de montar o VO sozinho — e a
 * segunda forma de fazer isso errado (aceitar senha em claro) reabriria aqui.
 *
 * Observação: as colunas `createdBy`/`updatedBy`/`deletedBy` existem no
 * schema mas o agregado ainda não tem hooks de auditoria — persistimos null
 * por enquanto (Fase 6 foca em persistência + lock; auditoria semântica
 * virá em fase posterior se necessário).
 */

/**
 * Converte a coluna `password_hash` no VO `PasswordHash` — o último ponto em
 * que um valor cru lido do banco entra no agregado.
 *
 * ── O `catch` É O A-07, E ELE NÃO É DECORAÇÃO ─────────────────────────────
 *
 * `PasswordHash.create()` lança `UserValidationException`, e o filtro
 * `domain-exception-to-http` traduz essa exceção para **400**. Sem o `catch`,
 * uma linha com `password_hash` corrompida (migration mal aplicada, restore de
 * backup, escrita manual) faria `findByEmail()` — chamado no LOGIN — responder
 * 400 numa falha de infraestrutura. Três coisas erram de uma vez:
 *
 *   1. O status mente sobre onde o defeito está. 400 diz ao cliente que a
 *      requisição é inválida; a requisição é o login mais bem formado possível.
 *      O conserto está no banco, e nenhuma quantidade de reenvio o faz.
 *   2. O alerta não sai. Um 400 é uma NEGAÇÃO de negócio (email em uso,
 *      senha curta) e não sobe alerta de infraestrutura; o registro corrompido
 *      sobrevive a todo retry.
 *   3. O valor bruto vaza. A mensagem original vira o `detail` da resposta
 *      (`GlobalExceptionFilter`: `detail = exception.message`), e a
 *      serialização estrutural da `UserValidationException` carrega `motivo`.
 *
 * Por isso o `catch` não repassa a exceção original: ele a TROCA por uma
 * `UserPersistenceException`, que cai no fall-through de 500 do mesmo filtro e
 * tem mensagem fixa (ver `user-persistence.exceptions.ts`).
 *
 * ⚠️ O `catch` é genérico, e é por isso que é genérico: `UserRow.passwordHash`
 * é `string` no TIPO, mas a coluna do Postgres pode vir `null` (migration sem
 * `NOT NULL`, restore parcial), e o VO recusa isso com "o valor deve ser um
 * texto". Amarrar o `catch` em `UserValidationException` — ou em qualquer tipo
 * específico — cobriria o hash malformado e deixaria o `null` escapar como 400.
 * Qualquer falha de `PasswordHash.create` significa, sem exceção possível, que
 * o DADO persistido viola a invariante — e dado corrompido é infraestrutura,
 * nunca requisição do cliente.
 *
 * ⚠️ O que este `catch` NÃO faz: não registra log, e não guarda a exceção
 * original como `cause`. Ver o bloco de trade-offs em
 * `user-persistence.exceptions.ts`. O que sobra para a investigação é o
 * `correlationId`; o motivo fino (qual regra do VO falhou) é DESCARTADO junto
 * com a exceção, e as regras vivem em `password-hash.vo.ts`.
 */
function hidratarSenhaHash(passwordHash: string): PasswordHash {
  try {
    return PasswordHash.create(passwordHash);
  } catch {
    // O `correlationId` é resolvido AQUI, no ponto do `catch`, e não dentro
    // da exceção: é a mesma expressão do `GlobalExceptionFilter` e do
    // `buildContext` do controller, e é o que permite casar a falha com o
    // trace no OTel. A exceção original é deliberadamente descartada — em seu
    // lugar entra uma de mensagem fixa, que não carrega `row.passwordHash`.
    throw new UserPersistenceException(correlationIdAtual());
  }
}

export const UserPrismaMapper = {
  toDomain(row: UserRow): User {
    return User.restaurarDePersistencia({
      id: row.id,
      nome: row.name, // schema 'name' → domain 'nome'
      email: row.email,
      senhaHash: hidratarSenhaHash(row.passwordHash),
      profileId: row.profileId,
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
      passwordHash: user.senhaHash().value,
      profileId: user.profileId(),
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
