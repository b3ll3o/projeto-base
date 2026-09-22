// apps/api/test/e2e/scenarios/03-concurrency.e2e.spec.ts
//
// Cenário E2E 03: Optimistic Locking via If-Match + RFC 7232 (Fase 9 Task 9.4).
//
// Cobre 3 caminhos de erro de concorrência:
//  - PATCH com If-Match v1 quando servidor já está em v2 → 412 CONCURRENCY_CONFLICT
//  - DELETE com If-Match v99 (sem update prévio) → 412 CONCURRENCY_CONFLICT
//  - PATCH sem header If-Match → 400 IF_MATCH_REQUIRED
//
// Cada teste usa beforeEach para isolar — usa o helper com cleanup opcional.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  bootstrapE2E,
  teardownE2E,
  cleanE2EDatabase,
  type E2EContext,
} from '../test-app.helper.js';

describe('E2E 03: Optimistic Locking + If-Match header enforcement', () => {
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

  it('PATCH com If-Match desatualizado -> 412 CONCURRENCY_CONFLICT', async () => {
    const { app } = e2e;
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Concur', email: 'concur@b.com' },
    });
    const userId = (JSON.parse(c.body) as { id: string }).id;

    // Cliente A: atualiza para v2
    const a = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${userId}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: { novoNome: 'A wins' },
    });
    expect(a.statusCode).toBe(200);

    // Cliente B: ainda com If-Match v1, tenta atualizar
    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${userId}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: { novoNome: 'B tries' },
    });
    expect(stale.statusCode).toBe(412);
    const body = JSON.parse(stale.body) as { code: string };
    expect(body.code).toBe('CONCURRENCY_CONFLICT');
  });

  it('DELETE com If-Match errado -> 412 CONCURRENCY_CONFLICT', async () => {
    const { app } = e2e;
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Delta', email: 'd@b.com' },
    });
    const userId = (JSON.parse(c.body) as { id: string }).id;

    const wrong = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${userId}`,
      headers: { 'if-match': 'W/"v99"' },
    });
    expect(wrong.statusCode).toBe(412);
    const body = JSON.parse(wrong.body) as { code: string };
    expect(body.code).toBe('CONCURRENCY_CONFLICT');
  });

  it('PATCH sem If-Match -> 400 IF_MATCH_REQUIRED', async () => {
    const { app } = e2e;
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'N', email: 'noheader@b.com' },
    });
    const userId = (JSON.parse(c.body) as { id: string }).id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${userId}`,
      payload: { novoNome: 'X' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('IF_MATCH_REQUIRED');
  });
});
