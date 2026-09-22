import { describe, it, expect } from 'vitest';
import { AuditContext, AuditSource } from './audit-context.vo.js';

const validTimestamp = new Date('2026-09-21T10:00:00.000Z');
const validProps = {
  actorId: 'user-123',
  correlationId: 'corr-abc',
  source: 'http' as AuditSource,
  timestamp: validTimestamp,
};

describe('AuditContext VO', () => {
  it('cria contexto válido com todos os campos', () => {
    const ctx = new AuditContext(validProps);
    expect(ctx.actorId).toBe('user-123');
    expect(ctx.correlationId).toBe('corr-abc');
    expect(ctx.source).toBe('http');
    expect(ctx.timestamp).toBe(validTimestamp);
  });

  it('aceita actorId=null (operação de sistema)', () => {
    const ctx = new AuditContext({ ...validProps, actorId: null });
    expect(ctx.actorId).toBeNull();
  });

  it('rejeita correlationId vazio ou só whitespace', () => {
    expect(() => new AuditContext({ ...validProps, correlationId: '' })).toThrow(/correlationId/);
    expect(() => new AuditContext({ ...validProps, correlationId: '   ' })).toThrow(
      /correlationId/,
    );
  });

  it('rejeita source fora do enum válido', () => {
    expect(
      () => new AuditContext({ ...validProps, source: 'graphql' as unknown as AuditSource }),
    ).toThrow(/source inválido/);
  });

  it('rejeita timestamp inválido', () => {
    expect(() => new AuditContext({ ...validProps, timestamp: new Date('invalid') })).toThrow(
      /timestamp/,
    );
  });

  it('é imutável (Object.isFrozen)', () => {
    const ctx = new AuditContext(validProps);
    expect(Object.isFrozen(ctx)).toBe(true);
  });

  it('AuditContext.system() cria contexto de sistema com actorId=null e source=job', () => {
    const ctx = AuditContext.system('corr-sys');
    expect(ctx.actorId).toBeNull();
    expect(ctx.source).toBe('job');
    expect(ctx.correlationId).toBe('corr-sys');
    expect(ctx.timestamp).toBeInstanceOf(Date);
  });

  it('AuditContext.system() aceita timestamp customizado', () => {
    const ts = new Date('2026-01-01T00:00:00.000Z');
    const ctx = AuditContext.system('corr-1', ts);
    expect(ctx.timestamp).toBe(ts);
  });

  it('toJSON serializa timestamp como ISO string', () => {
    const ctx = new AuditContext(validProps);
    const json = ctx.toJSON();
    expect(json.timestamp).toBe('2026-09-21T10:00:00.000Z');
    expect(json.actorId).toBe('user-123');
  });
});
