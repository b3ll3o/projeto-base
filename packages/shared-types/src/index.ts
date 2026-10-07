/**
 * Re-exporta todos os tipos públicos do pacote.
 * Importadores usam: import type { UserOutputDto } from '@projeto/shared-types';
 */
export type {
  UUID,
  ISODateString,
  UserOutputDto,
  CreateUserInputDto,
  UpdateUserInputDto,
  RestoreUserInputDto,
  AuditOperationType,
  UserHistoryEntryDto,
  UserArchiveEntryDto,
  UsersPageDto,
  UserHistoryPageDto,
  ProblemDetailsDto,
  ProblemDetailsError,
} from './user.js';
