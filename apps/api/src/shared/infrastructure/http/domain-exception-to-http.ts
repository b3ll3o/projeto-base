// apps/api/src/shared/infrastructure/http/domain-exception-to-http.ts
//
// Mapeia exceções de DOMÍNIO (puras — sem dependência de NestJS) para o
// triplo { status, code, title } que vira o payload RFC 7807.
//
// pt-BR: o mapper é uma função PURA — recebe um Error, devolve um objeto.
// Não lança, não loga, não instancia nada. Facilita testes unitários
// (sem mock de NestJS) e mantém o GlobalExceptionFilter fino.
//
// Mapeamento atual (alinhado com a Fase 6 — optimistic lock = 412, não 409):
//   UserNotFound / AuditHistoryNotFound  → 404 NOT_FOUND
//   UserDeleted / AuditArchiveNotFound   → 410 GONE
//   EmailAlreadyInUse                    → 409 CONFLICT
//   ConcurrencyException                 → 412 PRECONDITION_FAILED
//   InvalidRestore                       → 422 UNPROCESSABLE_ENTITY
//   * (default)                          → 500 INTERNAL_SERVER_ERROR

import { HttpStatus } from '@nestjs/common';
import {
  UserNotFoundException,
  EmailAlreadyInUseException,
  ConcurrencyException,
  UserDeletedException,
  InvalidRestoreException,
} from '../../../modules/users/domain/exceptions/user.exceptions.js';
import {
  AuditHistoryNotFoundException,
  AuditArchiveNotFoundException,
} from '../../audit/domain/audit.exceptions.js';

export interface HttpErrorMapping {
  readonly status: number;
  readonly code: string;
  readonly title: string;
}

export function mapDomainExceptionToHttp(err: unknown): HttpErrorMapping {
  if (err instanceof UserNotFoundException) {
    return {
      status: HttpStatus.NOT_FOUND,
      code: 'USER_NOT_FOUND',
      title: 'Usuário não encontrado',
    };
  }
  if (err instanceof AuditHistoryNotFoundException) {
    return {
      status: HttpStatus.NOT_FOUND,
      code: 'HISTORY_NOT_FOUND',
      title: 'Histórico não encontrado',
    };
  }
  if (err instanceof AuditArchiveNotFoundException) {
    return { status: HttpStatus.GONE, code: 'ARCHIVE_NOT_FOUND', title: 'Arquivo não encontrado' };
  }
  if (err instanceof EmailAlreadyInUseException) {
    return { status: HttpStatus.CONFLICT, code: 'EMAIL_IN_USE', title: 'Email já em uso' };
  }
  if (err instanceof ConcurrencyException) {
    return {
      status: HttpStatus.PRECONDITION_FAILED,
      code: 'CONCURRENCY_CONFLICT',
      title: 'Conflito de versão',
    };
  }
  if (err instanceof UserDeletedException) {
    return { status: HttpStatus.GONE, code: 'USER_DELETED', title: 'Usuário deletado' };
  }
  if (err instanceof InvalidRestoreException) {
    return {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      code: 'INVALID_RESTORE',
      title: 'Restauração inválida',
    };
  }
  return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: 'INTERNAL', title: 'Erro interno' };
}
