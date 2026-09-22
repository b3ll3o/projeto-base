import { describe, it, expect } from 'vitest';
import {
  ApplicationValidationException,
  ApplicationResourceNotFoundException,
  ApplicationConcurrencyException,
  ApplicationResourceDeletedException,
  ApplicationInvalidRestoreException,
  ApplicationEmailAlreadyInUseException,
} from './application.exceptions.js';

describe('application exceptions', () => {
  it('ApplicationValidationException traz field e name', () => {
    const e = new ApplicationValidationException('nome', 'muito curto');
    expect(e.name).toBe('ApplicationValidationException');
    expect(e.field).toBe('nome');
    expect(e.message).toMatch(/nome/);
    expect(e.message).toMatch(/muito curto/);
    expect(e instanceof Error).toBe(true);
  });

  it('ApplicationResourceNotFoundException traz resource e id', () => {
    const e = new ApplicationResourceNotFoundException('User', 'u-1');
    expect(e.name).toBe('ApplicationResourceNotFoundException');
    expect(e.resource).toBe('User');
    expect(e.id).toBe('u-1');
    expect(e.message).toMatch(/User/);
    expect(e.message).toMatch(/u-1/);
  });

  it('ApplicationConcurrencyException aceita actualVersion null', () => {
    const e = new ApplicationConcurrencyException('User', 2, null);
    expect(e.name).toBe('ApplicationConcurrencyException');
    expect(e.expectedVersion).toBe(2);
    expect(e.actualVersion).toBeNull();
    expect(e.message).toMatch(/ausente/);
  });

  it('ApplicationResourceDeletedException', () => {
    const e = new ApplicationResourceDeletedException('User', 'u-1');
    expect(e.name).toBe('ApplicationResourceDeletedException');
    expect(e.message).toMatch(/soft-deleted/);
  });

  it('ApplicationInvalidRestoreException', () => {
    const e = new ApplicationInvalidRestoreException('não há nada para restaurar');
    expect(e.name).toBe('ApplicationInvalidRestoreException');
    expect(e.message).toBe('não há nada para restaurar');
  });

  it('ApplicationEmailAlreadyInUseException', () => {
    const e = new ApplicationEmailAlreadyInUseException('x@y.com');
    expect(e.name).toBe('ApplicationEmailAlreadyInUseException');
    expect(e.email).toBe('x@y.com');
    expect(e.message).toMatch(/x@y\.com/);
  });

  it('todas são Error subclasses reconhecíveis por instanceof', () => {
    expect(new ApplicationValidationException('a', 'b')).toBeInstanceOf(Error);
    expect(new ApplicationResourceNotFoundException('a', 'b')).toBeInstanceOf(Error);
    expect(new ApplicationConcurrencyException('a', 1, 2)).toBeInstanceOf(Error);
    expect(new ApplicationResourceDeletedException('a', 'b')).toBeInstanceOf(Error);
    expect(new ApplicationInvalidRestoreException('x')).toBeInstanceOf(Error);
    expect(new ApplicationEmailAlreadyInUseException('x@y')).toBeInstanceOf(Error);
  });
});
