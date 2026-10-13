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
import { SENHA_DE_TESTE, emitirTokenDeSessao } from './test-app.helper.js';

describe('Users E2E (Supertest + Testcontainers)', () => {
  let app: NestFastifyApplication;
  let ctx: TestContext;
  // pt-BR: este spec tem bootstrap PRÓPRIO (não usa `bootstrapE2E`), então
  // traz a sessão junto. `emitirTokenDeSessao` é o mesmo helper do resto da
  // suíte — a conta nasce pelo `POST /users` público e o par vem do login
  // real. O `beforeEach` restaura a sessão depois de truncar as tabelas.
  let injetar: (
    r: Parameters<NestFastifyApplication['inject']>[0],
  ) => Promise<Awaited<ReturnType<NestFastifyApplication['inject']>>>;
  /** Token vivo da conta de sessão; reemitido no `beforeEach`. */
  let token: string;

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

    token = await emitirTokenDeSessao(app, ctx.prisma);
    injetar = (r) =>
      // `inject` aceita `string | InjectOptions`; a forma string não tem
      // header, então segue sem token (mesmo tratamento do helper).
      typeof r === 'string'
        ? app.inject(r)
        : app.inject({
            ...r,
            headers: {
              ...((r.headers ?? {}) as Record<string, unknown>),
              authorization: `Bearer ${token}`,
            },
          });
  });

  afterAll(async () => {
    await app.close();
    await ctx.stop();
  });

  beforeEach(async () => {
    await cleanDatabase(ctx.prisma);
    // A conta de sessão foi apagada junto com o resto; sem recriá-la, o
    // próximo login com aquele e-mail daria 401 (`findByEmail` filtra
    // soft-deleted) e a suíte inteira cairia por um motivo que não é dela.
    token = await emitirTokenDeSessao(app, ctx.prisma);
  });

  // ───────────────────────── POST /users ─────────────────────────

  it('POST /api/v1/users cria usuário e retorna ETag W/"v1"', async () => {
    const res = await injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'a@b.com', senha: SENHA_DE_TESTE },
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
    const first = await injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'a@b.com', senha: SENHA_DE_TESTE },
    });
    expect(first.statusCode).toBe(201);

    const second = await injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice 2', email: 'A@B.COM', senha: SENHA_DE_TESTE },
    });

    expect(second.statusCode).toBe(409);
    const body = JSON.parse(second.body) as { code: string };
    expect(body.code).toBe('EMAIL_IN_USE');
  });

  it('POST /api/v1/users com payload inválido -> 400 VALIDATION_ERROR', async () => {
    // pt-BR: email vazio viola `z.string().email()`.
    const res = await injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: '', senha: SENHA_DE_TESTE },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { code: string; errors?: unknown[] };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.errors)).toBe(true);
  });

  // ───────────────────────── GET /users ──────────────────────────

  it('GET /api/v1/users lista paginado (limit=2 retorna 2 itens + nextCursor)', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await injetar({
        method: 'POST',
        url: '/api/v1/users',
        payload: { nome: `User ${i}`, email: `u${i}@b.com`, senha: SENHA_DE_TESTE },
      });
      expect(r.statusCode).toBe(201);
    }

    const res = await injetar({
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
    const c = await injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'a@b.com', senha: SENHA_DE_TESTE },
    });
    const id = (JSON.parse(c.body) as { id: string }).id;

    const res = await injetar({
      method: 'PATCH',
      url: `/api/v1/users/${id}`,
      payload: { novoNome: 'Alice 2' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('IF_MATCH_REQUIRED');
  });

  it('PATCH /api/v1/users/:id com If-Match correto atualiza e bump version', async () => {
    const c = await injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'a@b.com', senha: SENHA_DE_TESTE },
    });
    const id = (JSON.parse(c.body) as { id: string }).id;

    const res = await injetar({
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
    const c = await injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'a@b.com', senha: SENHA_DE_TESTE },
    });
    const id = (JSON.parse(c.body) as { id: string }).id;

    const res = await injetar({
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
    const c = await injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'a@b.com', senha: SENHA_DE_TESTE },
    });
    const id = (JSON.parse(c.body) as { id: string }).id;

    const d = await injetar({
      method: 'DELETE',
      url: `/api/v1/users/${id}`,
      headers: { 'if-match': 'W/"v1"' },
    });
    expect(d.statusCode).toBe(204);

    const g = await injetar({ method: 'GET', url: `/api/v1/users/${id}` });
    expect(g.statusCode).toBe(404);
  });

  // ───────────────────────── POST /users/:id/restore ────────────

  it('POST /api/v1/users/:id/restore ressuscita soft-deleted; version incrementa para 3', async () => {
    const c = await injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'a@b.com', senha: SENHA_DE_TESTE },
    });
    const id = (JSON.parse(c.body) as { id: string }).id;

    // v1 -> soft-delete -> v2
    const d = await injetar({
      method: 'DELETE',
      url: `/api/v1/users/${id}`,
      headers: { 'if-match': 'W/"v1"' },
    });
    expect(d.statusCode).toBe(204);

    // restore usando If-Match v2 -> v3
    const r = await injetar({
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
    const c = await injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'a@b.com', senha: SENHA_DE_TESTE },
    });
    const id = (JSON.parse(c.body) as { id: string }).id;

    const p = await injetar({
      method: 'PATCH',
      url: `/api/v1/users/${id}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: { novoNome: 'Alice 2' },
    });
    expect(p.statusCode).toBe(200);

    const res = await injetar({ method: 'GET', url: `/api/v1/users/${id}/history` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { entries: unknown[]; nextCursor: string | null };
    expect(body.entries.length).toBeGreaterThanOrEqual(2);
    expect(body.nextCursor).toBeNull(); // cabe em uma página
  });
});
