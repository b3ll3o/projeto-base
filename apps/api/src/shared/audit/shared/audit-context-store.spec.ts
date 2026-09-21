import { describe, it, expect } from 'vitest';
import { AuditContext } from '../domain/audit-context.vo.js';
import { AuditContextStore, AuditContextMissingError } from './audit-context-store.js';

const makeCtx = (id: string) =>
  new AuditContext({
    actorId: `actor-${id}`,
    correlationId: `corr-${id}`,
    source: 'http',
    // Offset em ms baseado em id para garantir Date válido para qualquer id string
    timestamp: new Date(Date.UTC(2026, 8, 21, 10, 0, 0) + id.charCodeAt(0) * 1000),
  });

describe('AuditContextStore', () => {
  it('get() dentro de run() retorna o ctx atual', () => {
    const ctx = makeCtx('1');
    AuditContextStore.run(ctx, () => {
      const got = AuditContextStore.get();
      expect(got.actorId).toBe('actor-1');
      expect(got.correlationId).toBe('corr-1');
    });
  });

  it('get() fora de run() lança AuditContextMissingError', () => {
    expect(() => AuditContextStore.get()).toThrow(/AuditContext/);
    expect(() => AuditContextStore.get()).toThrow(AuditContextMissingError);
  });

  it('tryGet() fora de run() retorna undefined (sem throw)', () => {
    expect(AuditContextStore.tryGet()).toBeUndefined();
  });

  it('tryGet() dentro de run() retorna o ctx', () => {
    const ctx = makeCtx('2');
    AuditContextStore.run(ctx, () => {
      expect(AuditContextStore.tryGet()).toBe(ctx);
    });
  });

  it('ctxs não vazam entre runs paralelos', async () => {
    // ALS isola por stack frame async, não por timing — microtask (Promise.resolve)
    // é suficiente para forçar continuação no event loop e validar isolamento.
    const a = makeCtx('A');
    const b = makeCtx('B');

    const taskA = AuditContextStore.run(a, async () => {
      await Promise.resolve();
      return AuditContextStore.get().actorId;
    });

    const taskB = AuditContextStore.run(b, async () => {
      await Promise.resolve();
      return AuditContextStore.get().actorId;
    });

    const [resA, resB] = await Promise.all([taskA, taskB]);
    expect(resA).toBe('actor-A');
    expect(resB).toBe('actor-B');
  });

  it('run() aceita função async e retorna o resultado da função', async () => {
    const ctx = makeCtx('X');
    const result = await AuditContextStore.run(ctx, async () => {
      const got = AuditContextStore.get();
      return got.actorId + ':async';
    });
    expect(result).toBe('actor-X:async');
  });

  it('run() propaga erro lançado em função sync', () => {
    const ctx = makeCtx('sync-throw');
    expect(() =>
      AuditContextStore.run(ctx, () => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
  });

  it('run() propaga rejeição de Promise retornada por função async', async () => {
    const ctx = makeCtx('async-reject');
    await expect(
      AuditContextStore.run(ctx, async () => {
        throw new Error('boom-async');
      }),
    ).rejects.toThrow('boom-async');
  });

  it('nested run() shadowa o ctx externo', () => {
    const outer = makeCtx('outer');
    const inner = makeCtx('inner');
    AuditContextStore.run(outer, () => {
      expect(AuditContextStore.get()).toBe(outer);
      AuditContextStore.run(inner, () => {
        expect(AuditContextStore.get()).toBe(inner);
      });
      expect(AuditContextStore.get()).toBe(outer);
    });
  });
});
