import { describe, it, expect } from 'vitest';
import {
  AuditHistoryNotFoundException,
  AuditArchiveNotFoundException,
} from './audit.exceptions.js';

describe('AuditHistoryNotFoundException', () => {
  it('é instance de Error e da própria classe', () => {
    const e = new AuditHistoryNotFoundException({ entityName: 'User', entityId: 'u1', version: 3 });
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(AuditHistoryNotFoundException);
  });

  it('expõe entityName, entityId e version como readonly', () => {
    const e = new AuditHistoryNotFoundException({ entityName: 'User', entityId: 'u1', version: 3 });
    expect(e.entityName).toBe('User');
    expect(e.entityId).toBe('u1');
    expect(e.version).toBe(3);
  });

  it('define name para discriminação pelo HTTP filter', () => {
    const e = new AuditHistoryNotFoundException({ entityName: 'User', entityId: 'u1', version: 3 });
    expect(e.name).toBe('AuditHistoryNotFoundException');
  });

  it('message em pt-BR contém entityName, entityId e version', () => {
    const e = new AuditHistoryNotFoundException({ entityName: 'User', entityId: 'u1', version: 3 });
    expect(e.message).toContain('User');
    expect(e.message).toContain('u1');
    expect(e.message).toContain('3');
    expect(e.message).toMatch(/não encontrada/);
  });

  it('rejeita entityName vazio', () => {
    expect(
      () => new AuditHistoryNotFoundException({ entityName: '', entityId: 'u1', version: 3 }),
    ).toThrow(TypeError);
  });

  it('rejeita version < 1', () => {
    expect(
      () => new AuditHistoryNotFoundException({ entityName: 'User', entityId: 'u1', version: 0 }),
    ).toThrow(TypeError);
  });
});

describe('AuditArchiveNotFoundException', () => {
  it('é instance de Error e da própria classe', () => {
    const e = new AuditArchiveNotFoundException({ entityName: 'User', entityId: 'u1' });
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(AuditArchiveNotFoundException);
  });

  it('expõe entityName e entityId como readonly', () => {
    const e = new AuditArchiveNotFoundException({ entityName: 'User', entityId: 'u1' });
    expect(e.entityName).toBe('User');
    expect(e.entityId).toBe('u1');
  });

  it('define name para discriminação pelo HTTP filter', () => {
    const e = new AuditArchiveNotFoundException({ entityName: 'User', entityId: 'u1' });
    expect(e.name).toBe('AuditArchiveNotFoundException');
  });

  it('message em pt-BR contém entityName e entityId', () => {
    const e = new AuditArchiveNotFoundException({ entityName: 'User', entityId: 'u1' });
    expect(e.message).toContain('User');
    expect(e.message).toContain('u1');
    expect(e.message).toMatch(/não encontrad/);
  });

  it('rejeita entityId vazio', () => {
    expect(() => new AuditArchiveNotFoundException({ entityName: 'User', entityId: '' })).toThrow(
      TypeError,
    );
  });
});
