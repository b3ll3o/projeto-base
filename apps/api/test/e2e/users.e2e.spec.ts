// apps/api/test/e2e/users.e2e.spec.ts
//
// Testes E2E ponta-a-ponta do UsersController (Fase 7 Task 7.7).
//
// Stack:
//  - NestJS 11 + FastifyAdapter (mesmo adapter de produção)
//  - Testcontainers (postgres:16-alpine) — PrismaClient REAL, sem mocks
//  - GlobalExceptionFilter + ZodValidationPipe(z.any()) replicando o
//    wiring de main.ts, então os erros chegam no formato RFC 7807 Problem
//    Details
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
//
// ⚠️ Este arquivo USAVA um bootstrap próprio, cópia do que hoje é
// `bootstrapE2E`. A duplicação custou caro quando `UserOwnershipGuard`
// entrou: a cópia sobrescrevia `authorization` com o token da sessão, então
// cada rota por-id respondia 403 e a correção precisava ser aplicada duas
// vezes — uma no helper compartilhado, outra aqui. MEDIDO 2026-10-13: 6
// testes deste arquivo caíam por isso. Agora este arquivo usa o harness de
// `test-app.helper.ts`, e a paridade de wiring que o cabeçalho do helper
// promete é garantida por construção (é o MESMO código), não por cópia.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  bootstrapE2E,
  teardownE2E,
  cleanE2EDatabase,
  criarUsuarioAutenticado,
  type E2EContext,
  SENHA_DE_TESTE,
} from './test-app.helper.js';

describe('Users E2E (Fastify inject + Testcontainers)', () => {
  let e2e: E2EContext;

  beforeAll(async () => {
    // `bootstrapE2E` sobe o container Postgres compartilhado (singleFork),
    // compila o AppModule, aplica o mesmo wiring de main.ts (prefixo
    // 'api/v1' + GlobalExceptionFilter + ZodValidationPipe) e emite um par
    // de tokens REAL por login real.
    e2e = await bootstrapE2E();
  });

  afterAll(async () => {
    await teardownE2E(e2e);
  });

  beforeEach(async () => {
    // Trunca as três tabelas E restaura a conta de sessão: sem recriá-la, o
    // próximo login com aquele e-mail daria 401 (`findByEmail` filtra
    // soft-deleted) e a suíte inteira cairia por um motivo que não é dela.
    await cleanE2EDatabase(e2e);
  });

  // ───────────────────────── POST /users ─────────────────────────

  it('POST /api/v1/users cria usuário e retorna ETag W/"v1"', async () => {
    const res = await e2e.injetar({
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
    const first = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'a@b.com', senha: SENHA_DE_TESTE },
    });
    expect(first.statusCode).toBe(201);

    const second = await e2e.injetar({
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
    const res = await e2e.injetar({
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
      const r = await e2e.injetar({
        method: 'POST',
        url: '/api/v1/users',
        payload: { nome: `User ${i}`, email: `u${i}@b.com`, senha: SENHA_DE_TESTE },
      });
      expect(r.statusCode).toBe(201);
    }

    const res = await e2e.injetar({
      method: 'GET',
      url: '/api/v1/users?limit=2',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { users: unknown[]; nextCursor: string | null };
    expect(body.users).toHaveLength(2);
    expect(body.nextCursor).not.toBeNull();
  });

  // ───────────────────────── PATCH /users/:id ───────────────────
  //
  // ⚠️ Daqui para baixo toda rota é por-id, e por-id significa "o token
  // precisa ser do DONO do registro" (`UserOwnershipGuard`). O token padrão
  // do `injetar` é da conta de sessão e2e, que é de outra pessoa — daí
  // `dona.headers` em todas elas.

  it('PATCH /api/v1/users/:id sem If-Match -> 400 IF_MATCH_REQUIRED', async () => {
    const dona = await criarUsuarioAutenticado(e2e, { nome: 'Alice', email: 'a@b.com' });

    const res = await e2e.injetar({
      method: 'PATCH',
      url: `/api/v1/users/${dona.id}`,
      headers: dona.headers,
      payload: { novoNome: 'Alice 2' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('IF_MATCH_REQUIRED');
  });

  it('PATCH /api/v1/users/:id com If-Match correto atualiza e bump version', async () => {
    const dona = await criarUsuarioAutenticado(e2e, { nome: 'Alice', email: 'a@b.com' });

    const res = await e2e.injetar({
      method: 'PATCH',
      url: `/api/v1/users/${dona.id}`,
      headers: { ...dona.headers, 'if-match': 'W/"v1"' },
      payload: { novoNome: 'Alice 2' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { nome: string; version: number };
    expect(body.nome).toBe('Alice 2');
    expect(body.version).toBe(2);
    expect(res.headers.etag).toBe('W/"v2"');
  });

  it('PATCH /api/v1/users/:id com If-Match errado -> 412 CONCURRENCY_CONFLICT', async () => {
    const dona = await criarUsuarioAutenticado(e2e, { nome: 'Alice', email: 'a@b.com' });

    const res = await e2e.injetar({
      method: 'PATCH',
      url: `/api/v1/users/${dona.id}`,
      headers: { ...dona.headers, 'if-match': 'W/"v999"' },
      payload: { novoNome: 'Alice 2' },
    });

    expect(res.statusCode).toBe(412);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('CONCURRENCY_CONFLICT');
  });

  // ───────────────────────── DELETE /users/:id ──────────────────

  it('DELETE /api/v1/users/:id soft-deleta; GET subsequente -> 404', async () => {
    const dona = await criarUsuarioAutenticado(e2e, { nome: 'Alice', email: 'a@b.com' });

    const d = await e2e.injetar({
      method: 'DELETE',
      url: `/api/v1/users/${dona.id}`,
      headers: { ...dona.headers, 'if-match': 'W/"v1"' },
    });
    expect(d.statusCode).toBe(204);

    const g = await e2e.injetar({
      method: 'GET',
      url: `/api/v1/users/${dona.id}`,
      headers: dona.headers,
    });
    expect(g.statusCode).toBe(404);
  });

  // ───────────────────────── POST /users/:id/restore ────────────

  it('POST /api/v1/users/:id/restore ressuscita soft-deleted; version incrementa para 3', async () => {
    const dona = await criarUsuarioAutenticado(e2e, { nome: 'Alice', email: 'a@b.com' });

    // v1 -> soft-delete -> v2
    const d = await e2e.injetar({
      method: 'DELETE',
      url: `/api/v1/users/${dona.id}`,
      headers: { ...dona.headers, 'if-match': 'W/"v1"' },
    });
    expect(d.statusCode).toBe(204);

    // restore usando If-Match v2 -> v3
    const r = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/users/${dona.id}/restore`,
      headers: { ...dona.headers, 'if-match': 'W/"v2"' },
    });
    expect(r.statusCode).toBe(201);
    const body = JSON.parse(r.body) as { version: number; isDeleted: boolean };
    expect(body.version).toBe(3);
    expect(body.isDeleted).toBe(false);
  });

  // ───────────────────────── GET /users/:id/history ─────────────

  it('GET /api/v1/users/:id/history retorna versões (INSERT + UPDATE >= 2)', async () => {
    const dona = await criarUsuarioAutenticado(e2e, { nome: 'Alice', email: 'a@b.com' });

    const p = await e2e.injetar({
      method: 'PATCH',
      url: `/api/v1/users/${dona.id}`,
      headers: { ...dona.headers, 'if-match': 'W/"v1"' },
      payload: { novoNome: 'Alice 2' },
    });
    expect(p.statusCode).toBe(200);

    const res = await e2e.injetar({
      method: 'GET',
      url: `/api/v1/users/${dona.id}/history`,
      headers: dona.headers,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { entries: unknown[]; nextCursor: string | null };
    expect(body.entries.length).toBeGreaterThanOrEqual(2);
    expect(body.nextCursor).toBeNull(); // cabe em uma página
  });
});
