// apps/api/src/shared/infrastructure/http/domain-exception-to-http.spec.ts
import { describe, it, expect } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { mapExceptionToHttp } from './domain-exception-to-http.js';
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
import {
  ApplicationValidationException,
  ApplicationResourceNotFoundException,
  ApplicationConcurrencyException,
  ApplicationResourceDeletedException,
  ApplicationInvalidRestoreException,
  ApplicationEmailAlreadyInUseException,
} from '../../../modules/users/application/exceptions/application.exceptions.js';

describe('mapExceptionToHttp (domain layer)', () => {
  it('UserNotFound → 404 USER_NOT_FOUND', () => {
    const m = mapExceptionToHttp(new UserNotFoundException('x'));
    expect(m.status).toBe(HttpStatus.NOT_FOUND);
    expect(m.code).toBe('USER_NOT_FOUND');
  });

  it('AuditHistoryNotFound → 404 HISTORY_NOT_FOUND', () => {
    const m = mapExceptionToHttp(
      new AuditHistoryNotFoundException({ entityName: 'User', entityId: 'x', version: 1 }),
    );
    expect(m.status).toBe(HttpStatus.NOT_FOUND);
    expect(m.code).toBe('HISTORY_NOT_FOUND');
  });

  it('AuditArchiveNotFound → 410 ARCHIVE_NOT_FOUND', () => {
    const m = mapExceptionToHttp(
      new AuditArchiveNotFoundException({ entityName: 'User', entityId: 'x' }),
    );
    expect(m.status).toBe(HttpStatus.GONE);
    expect(m.code).toBe('ARCHIVE_NOT_FOUND');
  });

  it('EmailAlreadyInUse → 409 EMAIL_IN_USE', () => {
    const m = mapExceptionToHttp(new EmailAlreadyInUseException('a@b.com'));
    expect(m.status).toBe(HttpStatus.CONFLICT);
    expect(m.code).toBe('EMAIL_IN_USE');
  });

  it('Concurrency → 412 CONCURRENCY_CONFLICT (optimistic lock, NÃO 409)', () => {
    const m = mapExceptionToHttp(new ConcurrencyException(3, 5));
    expect(m.status).toBe(HttpStatus.PRECONDITION_FAILED);
    expect(m.status).not.toBe(HttpStatus.CONFLICT);
    expect(m.code).toBe('CONCURRENCY_CONFLICT');
  });

  it('UserDeleted → 410 USER_DELETED', () => {
    const m = mapExceptionToHttp(new UserDeletedException('x'));
    expect(m.status).toBe(HttpStatus.GONE);
    expect(m.code).toBe('USER_DELETED');
  });

  it('InvalidRestore → 422 INVALID_RESTORE', () => {
    const m = mapExceptionToHttp(new InvalidRestoreException('msg'));
    expect(m.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(m.code).toBe('INVALID_RESTORE');
  });
});

describe('mapExceptionToHttp (application layer)', () => {
  it('ApplicationResourceNotFoundException → 404 USER_NOT_FOUND', () => {
    const m = mapExceptionToHttp(new ApplicationResourceNotFoundException('User', 'u-1'));
    expect(m.status).toBe(HttpStatus.NOT_FOUND);
    expect(m.code).toBe('USER_NOT_FOUND');
  });

  it('ApplicationResourceDeletedException → 410 USER_DELETED', () => {
    const m = mapExceptionToHttp(new ApplicationResourceDeletedException('User', 'u-1'));
    expect(m.status).toBe(HttpStatus.GONE);
    expect(m.code).toBe('USER_DELETED');
  });

  it('ApplicationInvalidRestoreException → 422 INVALID_RESTORE', () => {
    const m = mapExceptionToHttp(new ApplicationInvalidRestoreException('msg'));
    expect(m.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(m.code).toBe('INVALID_RESTORE');
  });

  it('ApplicationEmailAlreadyInUseException → 409 EMAIL_IN_USE', () => {
    const m = mapExceptionToHttp(new ApplicationEmailAlreadyInUseException('a@b.com'));
    expect(m.status).toBe(HttpStatus.CONFLICT);
    expect(m.code).toBe('EMAIL_IN_USE');
  });

  it('ApplicationConcurrencyException → 412 CONCURRENCY_CONFLICT (NOT 409)', () => {
    const m = mapExceptionToHttp(new ApplicationConcurrencyException('User', 3, 5));
    expect(m.status).toBe(HttpStatus.PRECONDITION_FAILED);
    expect(m.status).not.toBe(HttpStatus.CONFLICT);
    expect(m.code).toBe('CONCURRENCY_CONFLICT');
  });

  it('ApplicationValidationException → 400 VALIDATION_ERROR (no domain equivalent)', () => {
    const m = mapExceptionToHttp(new ApplicationValidationException('name', 'empty string'));
    expect(m.status).toBe(HttpStatus.BAD_REQUEST);
    expect(m.code).toBe('VALIDATION_ERROR');
  });
});

describe('mapExceptionToHttp (regression)', () => {
  it('Error genérico → 500 INTERNAL (fall-through preservado após adicionar application cases)', () => {
    const m = mapExceptionToHttp(new Error('bug'));
    expect(m.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(m.code).toBe('INTERNAL');
  });

  it('Não-Error (string) → 500 INTERNAL (fall-through preservado)', () => {
    const m = mapExceptionToHttp('boom');
    expect(m.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(m.code).toBe('INTERNAL');
  });
});
