/**
 * Tipos compartilhados do módulo de usuários (Fase 1 — foundation).
 * Sem dependências runtime — usado em apps/api e (futuramente) apps/web.
 *
 * pt-BR: tipos primitivos compartilhados entre API e Web.
 *
 * ALINHAMENTO COM A API (2026-10-06): estes tipos descrevem o que a API
 * **realmente serializa**, medido contra `POST /api/v1/users` e
 * `GET /api/v1/users` em execução. Antes desta correção os tipos divergiam
 * da API em três pontos (`name` vs `nome`, `{data,pagination}` vs
 * `{users,nextCursor}`, e campos `createdBy/updatedBy/deletedBy` que a API
 * nunca emite), o que quebrava silenciosamente o frontend: TypeScript
 * aceitava `u.name`/`data.data` que chegavam `undefined` em runtime.
 *
 * Regra para manter: um tipo aqui é cópia do wire format, não do modelo de
 * domínio. Se a API não manda o campo, o tipo não tem o campo.
 * Fonte da verdade: `apps/api/src/modules/users/application/dto/`.
 */

// Primitivos ---------------------------------------------------------------

/** UUID v7 (string) — RFC 4122 / RFC 9562 */
export type UUID = string;

/** Timestamp serializado em ISO 8601 (UTC, sufixo Z) */
export type ISODateString = string;

// Domínio: User ----------------------------------------------------------

/** Saída canônica de um usuário (read model exposto pela API). */
export interface UserOutputDto {
  id: UUID;
  /** pt-BR: a API usa `nome`, não `name`. Espelha `User.nome` do domínio. */
  nome: string;
  email: string;
  /**
   * pt-BR (#97): perfil atribuído ao usuário. `null` = sem perfil
   * (deny-by-default). Espelha `UserOutput.profileId` de
   * `apps/api/src/modules/users/application/dto/user.output.ts` (linha 15),
   * que a API serializa — o web lia isto através de um cast que mascarava
   * exatamente esta divergência.
   */
  profileId: UUID | null;
  /**
   * pt-BR (#106, 2026-10-18): perfil EFETIVO no tenant do escopo pedido, lido de
   * `tenant_memberships.profile_id` — a mesma coluna que a autorização lê.
   *
   * `profileId` acima é o perfil GLOBAL da conta (`users.profile_id`), e é
   * `null` para toda conta criada pelo produto. Usá-lo na tela `/admin/users`
   * fazia a coluna dizer "sem perfil" para quem tem, sempre.
   *
   * ⚠️ pt-BR (achado 1) `null` = sem perfil. Ausente = a listagem não pediu a
   * projeção. O contrato de três estados foi removido: no bucket global não
   * havia dado que sustentasse "não pertence a esta empresa".
   */
  perfilEfetivoNoEscopo?: UUID | null;
  version: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  /** Soft-delete: preenchido quando `isDeleted` é `true`. */
  deletedAt: ISODateString | null;
  isDeleted: boolean;
}

/**
 * Entrada para criação de usuário (POST /users).
 *
 * `senha` é a SENHA EM CLARO — é o único tipo deste arquivo que carrega um
 * segredo. Ela NÃO volta: `UserOutputDto` (acima) não tem o campo, e é por
 * isso que o tipo é seguro ter em dois lugares: o que entra tem a senha, o
 * que sai não. Um consumidor de `UserOutputDto` que precisasse do hash teria
 * de ir a outro endpoint — e esse endpoint não existe.
 */
export interface CreateUserInputDto {
  nome: string;
  email: string;
  /** Senha em claro, 8..72 (limites de `password-hash.vo.ts`). */
  senha: string;
}

/**
 * Entrada para atualização de usuário (PATCH /users/:id).
 * O endpoint é rename-only e exige o header `If-Match: W/"v<n>"` para
 * optimistic locking — o header não cabe num tipo de body.
 */
export interface UpdateUserInputDto {
  novoNome: string;
}

/** Entrada para restauração de usuário soft-deletado (POST /users/:id/restore). */
export interface RestoreUserInputDto {
  expectedVersion: number;
  reason?: string;
}

// Auditoria -------------------------------------------------------------

export type AuditOperationType = 'INSERT' | 'UPDATE' | 'DELETE' | 'RESTORE';

/** Entrada de histórico de um usuário (read model de users_history). */
export interface UserHistoryEntryDto {
  entityId: UUID;
  version: number;
  previousVersion: number | null;
  operation: AuditOperationType;
  snapshot: UserOutputDto;
  changedAt: ISODateString;
  changedBy: UUID | null;
  reason: string | null;
}

/** Entrada de arquivo de um usuário (read model de users_archive). */
export interface UserArchiveEntryDto {
  entityId: UUID;
  version: number;
  snapshot: UserOutputDto;
  deletedAt: ISODateString;
  deletedBy: UUID | null;
  reason: string | null;
}

// Respostas HTTP --------------------------------------------------------

/**
 * Resposta paginada cursor-based de `GET /users`.
 *
 * A API não embrulha em `{data, pagination}`: serializa a lista em
 * `users` e o cursor em `nextCursor` (`ListUsersOutput`). `hasMore` não
 * existe no wire — quem tem mais páginas é quem tem `nextCursor !== null`.
 */
export interface UsersPageDto {
  users: UserOutputDto[];
  nextCursor: string | null;
}

/**
 * Resposta paginada cursor-based de `GET /users/:id/history`.
 *
 * pt-BR (2026-10-06): faltava o ENVELOPE. Só existia `UserHistoryEntryDto`, a
 * entrada — e um consumidor que fizesse `r.entries` receberia `undefined`,
 * que é exatamente o modo de falha que o cabeçalho deste arquivo diz estar
 * corrigindo (o `{data, pagination}` inventado que esvaziou a listagem).
 * Medido no serviço real: `prisma-audit.service.ts` `listHistory` devolve
 * `{ entries, nextCursor }` — mesmo formato de `UsersPageDto`, com `entries`
 * no lugar de `users`.
 */
export interface UserHistoryPageDto {
  entries: UserHistoryEntryDto[];
  nextCursor: string | null;
}

// RFC 7807 Problem Details ----------------------------------------------

/** Campo de erro por validação (Zod ou class-validator). */
export interface ProblemDetailsError {
  field: string;
  message: string;
  code: string;
}

/** Resposta padrão de erro conforme RFC 7807 + extensão interna. */
export interface ProblemDetailsDto {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  traceId: string;
  errors?: ProblemDetailsError[];
}
