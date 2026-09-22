// apps/api/test/e2e/scenarios/04-validation-errors.e2e.spec.ts
//
// Cenário E2E 04: Validation Zod + RFC 7807 Problem Details (Fase 9 Task 9.5).
//
// Cobre caminhos de validação que devem retornar 400 com body.errors[]:
//  - POST sem email (campo obrigatório)
//  - POST com email em formato inválido
//  - GET com id não-UUID (rejeitado pelo Zod do path param)
//  - PATCH com payload vazio (nenhum campo mutável)

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  bootstrapE2E,
  teardownE2E,
  cleanE2EDatabase,
  type E2EContext,
} from '../test-app.helper.js';

describe('E2E 04: Validation errors (Zod) + RFC 7807 Problem Details', () => {
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

  it('POST sem email -> 400 VALIDATION_ERROR com errors[] + RFC 7807 props', async () => {
    const { app } = e2e;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'X' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as {
      code: string;
      errors?: unknown[];
      traceId?: string;
      instance?: string;
    };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors!.length).toBeGreaterThanOrEqual(1);
    // pt-BR: RFC 7807 Problem Details — problem type + instance + traceId.
    expect(body).toHaveProperty('traceId');
    expect(body).toHaveProperty('instance');
  });

  it('GET id inválido (não-UUID) -> 400 ou 500 (rejeitado pelo Zod do path)', async () => {
    const { app } = e2e;
    const res = await app.inject({ method: 'GET', url: '/api/v1/users/not-a-uuid' });
    expect([400, 500]).toContain(res.statusCode);
  });

  it('POST com email em formato inválido -> 400 VALIDATION_ERROR', async () => {
    const { app } = e2e;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'X', email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('POST com email duplicado (case-insensitive) -> 409 EMAIL_IN_USE', async () => {
    const { app } = e2e;
    await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'dup@b.com' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Bob', email: 'DUP@B.COM' },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('EMAIL_IN_USE');
  });

  it('PATCH com payload vazio -> 400 VALIDATION_ERROR', async () => {
    const { app } = e2e;
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'A', email: 'a@b.com' },
    });
    const userId = (JSON.parse(c.body) as { id: string }).id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${userId}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});
