// apps/api/test/e2e/users.e2e.spec.ts
//
// Testes E2E ponta-a-ponta do UsersController (Fase 7 Task 7.7).
//
// Stack:
//  - NestJS 11 + FastifyAdapter (mesmo adapter de produção)
//  - Testcontainers (postgres:16-alpine) — PrismaClient REAL, sem mocks
//  - GlobalExceptionFilter + ZodValidationPipe(z.any()) replicando
//    main.ts:19-23, então os erros chegam no formato RFC 7807 Problem Details
//
// pt-BR:
//  - Estes testes SOBEM o AppModule inteiro (controllers, PrismaModule,
//    AuditInfraModule, UsersModule, etc.) e batem nas rotas via
//    `app.inject(...)` — o adapter Fastify expõe `.inject` para testes
//    sem precisar subir uma porta TCP. É equivalente ao supertest mas
//    sem o overhead de abrir socket.
//  - Coverage: são testes de integração ponta-a-ponta, NÃO entram no
//    gate de 80% do projeto `unit` (já estão fora do `src/**`). O
//    `coverage.exclude` de vitest.config.ts foi estendido com
//    `**/test/e2e/**` para garantir.
//  - TDD: este arquivo foi escrito ANTES da configuração do projeto
//    `e2e` em vitest.workspace.ts (ver Task 7.7 do plano).

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { z } from 'zod';
import { setupTestDatabase, cleanDatabase, type TestContext } from '../testcontainers-helper.js';
import { AppModule } from '../../src/app.module.js';
import { GlobalExceptionFilter } from '../../src/shared/infrastructure/http/global-exception.filter.js';
import { ZodValidationPipe } from '../../src/shared/infrastructure/http/zod-validation.pipe.js';

describe('Users E2E (Supertest + Testcontainers)', () => {
  let app: NestFastifyApplication;
  let ctx: TestContext;

  beforeAll(async () => {
    // pt-BR: container Postgres compartilhado via singleFork.
    // setupTestDatabase aplica migrations Prisma via `prisma migrate deploy`
    // e injeta DATABASE_URL no process.env (PrismaService pega de lá).
    ctx = await setupTestDatabase();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

    // pt-BR: replica o wiring de main.ts:19-23.
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(new ZodValidationPipe(z.any()));

    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await ctx.stop();
  });

  beforeEach(async () => {
    await cleanDatabase(ctx.prisma);
  });

  // ───────────────────────── POST /users ─────────────────────────

  it('POST /api/v1/users cria usuário e retorna ETag W/"v1"', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'a@b.com' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { nome: string; email: string; version: number };
    expect(body.nome).toBe('Alice');
    expect(body.email).toBe('a@b.com');
    expect(body.version).toBe(1);
    // pt-BR: Fastify normaliza headers para lowercase; assert etag igual a W/"v1".
    expect(res.headers.etag).toBe('W/"v1"');
  });

  it('POST /api/v1/users duplicado (case-insensitive) -> 409 EMAIL_IN_USE', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'a@b.com' },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice 2', email: 'A@B.COM' },
    });

    expect(second.statusCode).toBe(409);
    const body = JSON.parse(second.body) as { code: string };
    expect(body.code).toBe('EMAIL_IN_USE');
  });

  it('POST /api/v1/users com payload inválido -> 400 VALIDATION_ERROR', async () => {
    // pt-BR: email vazio viola `z.string().email()`.
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: '' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { code: string; errors?: unknown[] };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.errors)).toBe(true);
  });

  // ───────────────────────── GET /users ──────────────────────────

  it('GET /api/v1/users lista paginado (limit=2 retorna 2 itens + nextCursor)', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        payload: { nome: `User ${i}`, email: `u${i}@b.com` },
      });
      expect(r.statusCode).toBe(201);
    }

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/users?limit=2',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { users: unknown[]; nextCursor: string | null };
    expect(body.users).toHaveLength(2);
    expect(body.nextCursor).not.toBeNull();
  });

  // ───────────────────────── PATCH /users/:id ───────────────────

  it('PATCH /api/v1/users/:id sem If-Match -> 400 IF_MATCH_REQUIRED', async () => {
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'a@b.com' },
    });
    const id = (JSON.parse(c.body) as { id: string }).id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${id}`,
      payload: { novoNome: 'Alice 2' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('IF_MATCH_REQUIRED');
  });

  it('PATCH /api/v1/users/:id com If-Match correto atualiza e bump version', async () => {
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'a@b.com' },
    });
    const id = (JSON.parse(c.body) as { id: string }).id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${id}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: { novoNome: 'Alice 2' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { nome: string; version: number };
    expect(body.nome).toBe('Alice 2');
    expect(body.version).toBe(2);
    expect(res.headers.etag).toBe('W/"v2"');
  });

  it('PATCH /api/v1/users/:id com If-Match errado -> 412 CONCURRENCY_CONFLICT', async () => {
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'a@b.com' },
    });
    const id = (JSON.parse(c.body) as { id: string }).id;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${id}`,
      headers: { 'if-match': 'W/"v999"' },
      payload: { novoNome: 'Alice 2' },
    });

    expect(res.statusCode).toBe(412);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('CONCURRENCY_CONFLICT');
  });

  // ───────────────────────── DELETE /users/:id ──────────────────

  it('DELETE /api/v1/users/:id soft-deleta; GET subsequente -> 404', async () => {
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'a@b.com' },
    });
    const id = (JSON.parse(c.body) as { id: string }).id;

    const d = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${id}`,
      headers: { 'if-match': 'W/"v1"' },
    });
    expect(d.statusCode).toBe(204);

    const g = await app.inject({ method: 'GET', url: `/api/v1/users/${id}` });
    expect(g.statusCode).toBe(404);
  });

  // ───────────────────────── POST /users/:id/restore ────────────

  it('POST /api/v1/users/:id/restore ressuscita soft-deleted; version incrementa para 3', async () => {
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'a@b.com' },
    });
    const id = (JSON.parse(c.body) as { id: string }).id;

    // v1 -> soft-delete -> v2
    const d = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${id}`,
      headers: { 'if-match': 'W/"v1"' },
    });
    expect(d.statusCode).toBe(204);

    // restore usando If-Match v2 -> v3
    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${id}/restore`,
      headers: { 'if-match': 'W/"v2"' },
    });
    expect(r.statusCode).toBe(201);
    const body = JSON.parse(r.body) as { version: number; isDeleted: boolean };
    expect(body.version).toBe(3);
    expect(body.isDeleted).toBe(false);
  });

  // ───────────────────────── GET /users/:id/history ─────────────

  it('GET /api/v1/users/:id/history retorna versões (INSERT + UPDATE >= 2)', async () => {
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'a@b.com' },
    });
    const id = (JSON.parse(c.body) as { id: string }).id;

    const p = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${id}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: { novoNome: 'Alice 2' },
    });
    expect(p.statusCode).toBe(200);

    const res = await app.inject({ method: 'GET', url: `/api/v1/users/${id}/history` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { entries: unknown[]; nextCursor: string | null };
    expect(body.entries.length).toBeGreaterThanOrEqual(2);
    expect(body.nextCursor).toBeNull(); // cabe em uma página
  });
});
