// apps/api/test/e2e/scenarios/05-pagination.e2e.spec.ts
//
// Cenário E2E 05: Cursor pagination + includeDeleted (Fase 9 Task 9.6).
//
// Cobre:
//  - Paginação cursor: cria 5 users, itera com limit=2, percorre TODAS as
//    páginas até hasMore=false, espera ver exatamente 5 ids únicos.
//  - includeDeleted: cria 2 users (um é soft-deletado). Lista normal NÃO
//    inclui o deletado. Lista com ?includeDeleted=true inclui ambos.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  bootstrapE2E,
  teardownE2E,
  cleanE2EDatabase,
  type E2EContext,
} from '../test-app.helper.js';

describe('E2E 05: Cursor pagination + includeDeleted', () => {
  let e2e: E2EContext;

  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });

  afterAll(async () => {
    await teardownE2E(e2e);
  });

  beforeEach(async () => {
    await cleanE2EDatabase(e2e.ctx);
  });

  it('cursor pagination percorre todas as páginas sem duplicar nem perder ids', async () => {
    const { app } = e2e;

    // Cria 5 users
    const createdIds: string[] = [];
    for (let i = 0; i < 5; i++) {
      const c = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        payload: { nome: `P${i}`, email: `p${i}@b.com` },
      });
      createdIds.push((JSON.parse(c.body) as { id: string }).id);
    }

    // Itera com limit=2
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    while (true) {
      const url = cursor
        ? `/api/v1/users?limit=2&cursor=${encodeURIComponent(cursor)}`
        : '/api/v1/users?limit=2';
      const r = await app.inject({ method: 'GET', url });
      expect(r.statusCode).toBe(200);
      const body = JSON.parse(r.body) as {
        users: Array<{ id: string }>;
        nextCursor: string | null;
      };
      for (const u of body.users) seen.add(u.id);
      pages++;
      if (body.nextCursor === null) break;
      cursor = body.nextCursor;
      if (pages > 10) throw new Error('infinite loop guard');
    }

    // Esperado: 5 ids únicos, 3 páginas (2+2+1)
    expect(seen.size).toBe(5);
    for (const id of createdIds) expect(seen.has(id)).toBe(true);
  });

  it('?includeDeleted=true inclui soft-deleted; lista normal oculta', async () => {
    const { app } = e2e;

    // Cria 2 users
    const keep = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Keep', email: 'keep@b.com' },
    });
    const keepId = (JSON.parse(keep.body) as { id: string }).id;

    const rm = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Romeo', email: 'rm@b.com' },
    });
    const rmId = (JSON.parse(rm.body) as { id: string }).id;

    // Soft-delete o segundo
    const d = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${rmId}`,
      headers: { 'if-match': 'W/"v1"' },
    });
    expect(d.statusCode).toBe(204);

    // Lista normal: NÃO vê o deletado
    const normal = await app.inject({ method: 'GET', url: '/api/v1/users?limit=100' });
    expect(normal.statusCode).toBe(200);
    const normalBody = JSON.parse(normal.body) as { users: Array<{ id: string }> };
    expect(normalBody.users.find((u) => u.id === rmId)).toBeUndefined();
    expect(normalBody.users.find((u) => u.id === keepId)).toBeDefined();

    // Lista com includeDeleted=true: vê ambos
    const withDel = await app.inject({
      method: 'GET',
      url: '/api/v1/users?limit=100&includeDeleted=true',
    });
    expect(withDel.statusCode).toBe(200);
    const withDelBody = JSON.parse(withDel.body) as { users: Array<{ id: string }> };
    expect(withDelBody.users.find((u) => u.id === rmId)).toBeDefined();
    expect(withDelBody.users.find((u) => u.id === keepId)).toBeDefined();
  });
});
