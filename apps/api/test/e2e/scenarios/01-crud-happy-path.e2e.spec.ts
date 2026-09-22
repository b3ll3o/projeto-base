// apps/api/test/e2e/scenarios/01-crud-happy-path.e2e.spec.ts
//
// Cenário E2E 01: fluxo CRUD completo sem erros (Fase 9 Task 9.2).
//
// Fluxo coberto:
//  - CREATE → 201 + ETag W/"v1" + body com version=1
//  - GET by id → 200 + mesmo id
//  - LIST paginado → 200 + pelo menos 1 item
//  - UPDATE com If-Match correto → 200 + version=2 + novo ETag
//  - GET by id (atualizado) → confirma name novo

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootstrapE2E, teardownE2E, type E2EContext } from '../test-app.helper.js';

describe('E2E 01: CRUD happy path completo', () => {
  let e2e: E2EContext;

  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });

  afterAll(async () => {
    await teardownE2E(e2e);
  });

  it('CREATE → GET → LIST → UPDATE → GET(updated)', async () => {
    const { app } = e2e;

    // CREATE
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'a@b.com' },
    });
    expect(c.statusCode).toBe(201);
    const created = JSON.parse(c.body) as { id: string; email: string; version: number };
    expect(created.email).toBe('a@b.com');
    expect(created.version).toBe(1);
    expect(c.headers.etag).toBe('W/"v1"');

    // GET
    const g = await app.inject({ method: 'GET', url: `/api/v1/users/${created.id}` });
    expect(g.statusCode).toBe(200);
    const got = JSON.parse(g.body) as { id: string };
    expect(got.id).toBe(created.id);

    // LIST
    const l = await app.inject({ method: 'GET', url: '/api/v1/users?limit=10' });
    expect(l.statusCode).toBe(200);
    const list = JSON.parse(l.body) as { users: unknown[] };
    expect(list.users.length).toBeGreaterThanOrEqual(1);

    // UPDATE (com If-Match correto)
    const u = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${created.id}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: { novoNome: 'Alice 2' },
    });
    expect(u.statusCode).toBe(200);
    const updated = JSON.parse(u.body) as { nome: string; version: number };
    expect(updated.version).toBe(2);
    expect(updated.nome).toBe('Alice 2');
    expect(u.headers.etag).toBe('W/"v2"');

    // GET updated
    const g2 = await app.inject({ method: 'GET', url: `/api/v1/users/${created.id}` });
    expect(g2.statusCode).toBe(200);
    const gotUpdated = JSON.parse(g2.body) as { nome: string };
    expect(gotUpdated.nome).toBe('Alice 2');
  });
});
