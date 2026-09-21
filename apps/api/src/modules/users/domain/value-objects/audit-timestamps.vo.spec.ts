import { describe, it, expect } from 'vitest';
import { AuditTimestamps } from './audit-timestamps.vo.js';

describe('AuditTimestamps', () => {
  const t0 = new Date('2026-09-21T10:00:00Z');
  const t1 = new Date('2026-09-21T11:00:00Z');

  it('inicial() para entidades novas: createdAt === updatedAt', () => {
    const ts = AuditTimestamps.inicial(t0);
    expect(ts.createdAt).toBe(t0);
    expect(ts.updatedAt).toBe(t0);
    expect(ts.createdAt).toBe(ts.updatedAt);
  });

  it('marcarAtualizado preserva createdAt', () => {
    const ts = AuditTimestamps.inicial(t0);
    const novo = ts.marcarAtualizado(t1);
    expect(novo.createdAt).toBe(t0);
    expect(novo.updatedAt).toBe(t1);
  });

  it('rejeita updatedAt < createdAt', () => {
    const ts = AuditTimestamps.inicial(t0);
    expect(() => ts.marcarAtualizado(new Date('2026-09-21T09:00:00Z'))).toThrow(/updatedAt/);
  });

  it('congelado', () => {
    expect(Object.isFrozen(AuditTimestamps.inicial(t0))).toBe(true);
  });

  it('imutabilidade: novo objeto retornado', () => {
    const ts = AuditTimestamps.inicial(t0);
    const novo = ts.marcarAtualizado(t1);
    expect(novo).not.toBe(ts);
  });
});
