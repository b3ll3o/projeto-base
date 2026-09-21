/**
 * Tipos compartilhados do módulo de usuários (Fase 1 — foundation).
 * Sem dependências runtime — usado em apps/api e (futuramente) apps/web.
 *
 * pt-BR: tipos primitivos compartilhados entre API e Web.
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
  email: string;
  name: string;
  version: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  createdBy: UUID | null;
  updatedBy: UUID | null;
  deletedAt: ISODateString | null;
  deletedBy: UUID | null;
}

/** Entrada para criação de usuário (POST /users). */
export interface CreateUserInputDto {
  email: string;
  name: string;
}

/** Entrada para atualização parcial de usuário (PATCH /users/:id). */
export interface UpdateUserInputDto {
  email?: string;
  name?: string;
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

/** Resposta paginada cursor-based (comum em GET /users, GET /users/:id/history). */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
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
