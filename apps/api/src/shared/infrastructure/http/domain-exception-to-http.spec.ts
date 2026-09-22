// apps/api/src/shared/infrastructure/http/domain-exception-to-http.spec.ts
import { describe, it, expect } from 'vitest';
import { HttpStatus } from '@nestjs/common';
import { mapDomainExceptionToHttp } from './domain-exception-to-http.js';
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

describe('mapDomainExceptionToHttp', () => {
  it('UserNotFound → 404 USER_NOT_FOUND', () => {
    const m = mapDomainExceptionToHttp(new UserNotFoundException('x'));
    expect(m.status).toBe(HttpStatus.NOT_FOUND);
    expect(m.code).toBe('USER_NOT_FOUND');
  });

  it('AuditHistoryNotFound → 404 HISTORY_NOT_FOUND', () => {
    const m = mapDomainExceptionToHttp(
      new AuditHistoryNotFoundException({ entityName: 'User', entityId: 'x', version: 1 }),
    );
    expect(m.status).toBe(HttpStatus.NOT_FOUND);
    expect(m.code).toBe('HISTORY_NOT_FOUND');
  });

  it('AuditArchiveNotFound → 410 ARCHIVE_NOT_FOUND', () => {
    const m = mapDomainExceptionToHttp(
      new AuditArchiveNotFoundException({ entityName: 'User', entityId: 'x' }),
    );
    expect(m.status).toBe(HttpStatus.GONE);
    expect(m.code).toBe('ARCHIVE_NOT_FOUND');
  });

  it('EmailAlreadyInUse → 409 EMAIL_IN_USE', () => {
    const m = mapDomainExceptionToHttp(new EmailAlreadyInUseException('a@b.com'));
    expect(m.status).toBe(HttpStatus.CONFLICT);
    expect(m.code).toBe('EMAIL_IN_USE');
  });

  it('Concurrency → 412 CONCURRENCY_CONFLICT (optimistic lock, NÃO 409)', () => {
    const m = mapDomainExceptionToHttp(new ConcurrencyException(3, 5));
    expect(m.status).toBe(HttpStatus.PRECONDITION_FAILED);
    expect(m.status).not.toBe(HttpStatus.CONFLICT);
    expect(m.code).toBe('CONCURRENCY_CONFLICT');
  });

  it('UserDeleted → 410 USER_DELETED', () => {
    const m = mapDomainExceptionToHttp(new UserDeletedException('x'));
    expect(m.status).toBe(HttpStatus.GONE);
    expect(m.code).toBe('USER_DELETED');
  });

  it('InvalidRestore → 422 INVALID_RESTORE', () => {
    const m = mapDomainExceptionToHttp(new InvalidRestoreException('msg'));
    expect(m.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(m.code).toBe('INVALID_RESTORE');
  });

  it('Error genérico → 500 INTERNAL', () => {
    const m = mapDomainExceptionToHttp(new Error('bug'));
    expect(m.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(m.code).toBe('INTERNAL');
  });

  it('Não-Error (string) → 500 INTERNAL', () => {
    const m = mapDomainExceptionToHttp('boom');
    expect(m.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(m.code).toBe('INTERNAL');
  });
});
