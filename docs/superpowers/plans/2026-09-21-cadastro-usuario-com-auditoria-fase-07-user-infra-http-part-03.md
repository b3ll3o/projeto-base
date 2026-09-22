# Fase 7 — User Infra HTTP (Parte 3/3)

> **Continuação** da Fase 7. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-07-user-infra-http.md)
>
> Esta é a parte 3 de 3 da Fase 7. Pule para a próxima parte ao final.

---

// apps/api/package.json
"scripts": {
  "openapi:export": "tsx scripts/export-openapi.ts"
}
```

- [ ] **Step 3: Executar + commit**

```bash
pnpm --filter @projeto/api openapi:export
git add apps/api/scripts/export-openapi.ts apps/api/package.json apps/api/openapi.json
git commit -m "feat(api): export OpenAPI spec to openapi.json

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 7.7: Teste e2e do controller (Supertest + Testcontainers)

**Files:**
- Create: `apps/api/test/e2e/users.e2e.spec.ts`

- [ ] **Step 1: Criar teste e2e**

```typescript
// apps/api/test/e2e/users.e2e.spec.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { setupTestDatabase, cleanDatabase, type TestContext } from '../testcontainers-helper.js';
import { AppModule } from '../../src/app.module.js';
import { ValidationPipe } from '@nestjs/common';

describe('Users E2E (Supertest + Testcontainers)', () => {
  let app: NestFastifyApplication;
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await ctx.stop();
  });

  beforeEach(async () => {
    await cleanDatabase(ctx.prisma);
  });

  it('POST /api/v1/users cria e retorna ETag', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'a@b.com', name: 'Alice' },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.email).toBe('a@b.com');
    expect(body.version).toBe(1);
    expect(res.headers.etag).toBe('W/"v1"');
  });

  it('POST /api/v1/users duplicado -> 409 EMAIL_IN_USE', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'a@b.com', name: 'Alice' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'A@B.COM', name: 'Alice 2' },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.code).toBe('EMAIL_IN_USE');
  });

  it('GET /api/v1/users lista paginado', async () => {
    for (let i = 0; i < 3; i++) {
      await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        payload: { email: `u${i}@b.com`, name: `U${i}` },
      });
    }
    const res = await app.inject({ method: 'GET', url: '/api/v1/users?limit=2' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveLength(2);
    expect(body.pagination.hasMore).toBe(true);
  });

  it('PATCH sem If-Match -> 400/428 (depende do filter)', async () => {
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'a@b.com', name: 'Alice' },
    });
    const id = JSON.parse(c.body).id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${id}`,
      payload: { name: 'X' },
    });
    expect([400, 428, 412]).toContain(res.statusCode);
  });

  it('PATCH com If-Match correto atualiza', async () => {
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'a@b.com', name: 'Alice' },
    });
    const id = JSON.parse(c.body).id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${id}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: { name: 'Alice 2' },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).version).toBe(2);
  });

  it('DELETE soft-deleta; GET retorna 404', async () => {
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'a@b.com', name: 'Alice' },
    });
    const id = JSON.parse(c.body).id;
    const d = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${id}`,
      headers: { 'if-match': 'W/"v1"' },
    });
    expect(d.statusCode).toBe(204);
    const g = await app.inject({ method: 'GET', url: `/api/v1/users/${id}` });
    expect(g.statusCode).toBe(404);
  });

  it('POST restore -> user volta', async () => {
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'a@b.com', name: 'Alice' },
    });
    const id = JSON.parse(c.body).id;
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${id}`,
      headers: { 'if-match': 'W/"v1"' },
    });
    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${id}/restore`,
      headers: { 'if-match': 'W/"v2"' },
    });
    expect(r.statusCode).toBe(201);
    expect(JSON.parse(r.body).version).toBe(3);
  });

  it('GET /:id/history retorna lista de versões', async () => {
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'a@b.com', name: 'Alice' },
    });
    const id = JSON.parse(c.body).id;
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${id}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: { name: 'Alice 2' },
    });
    const res = await app.inject({ method: 'GET', url: `/api/v1/users/${id}/history` });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.entries.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Renomear para `.e2e.spec.ts` e configurar**

```bash
mv apps/api/test/e2e/users.e2e.spec.ts /tmp/users.e2e.spec.ts 2>/dev/null || true
mkdir -p apps/api/test/e2e
mv /tmp/users.e2e.spec.ts apps/api/test/e2e/users.e2e.spec.ts
```

- [ ] **Step 3: Atualizar vitest config**

```typescript
// apps/api/vitest.config.ts — adicionar projeto e2e
projects: [
  // ... unit, integration
  {
    test: {
      name: 'e2e',
      include: ['test/**/*.e2e.spec.ts'],
      testTimeout: 120_000,
      hookTimeout: 120_000,
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
    },
  },
]
```

- [ ] **Step 4: Rodar + commit**

Run: `pnpm --filter @projeto/api test:e2e 2>&1 | tail -20`
Expected: 8 passed.

```bash
git add apps/api/test apps/api/vitest.config.ts
git commit -m "test(users-http): E2E tests for users controller (RFC 7807 + If-Match)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 7.8: Validar Fase 7

- [ ] **Step 1: Rodar TODOS os testes**

```bash
pnpm --filter @projeto/api test:unit 2>&1 | tail -5
pnpm --filter @projeto/api test:integration 2>&1 | tail -5
pnpm --filter @projeto/api test:e2e 2>&1 | tail -5
```

Expected: todos passam.

- [ ] **Step 2: Validar cobertura controller ≥ 80%**

```bash
pnpm --filter @projeto/api test:e2e -- --coverage 2>&1 | tail -20
```

Expected: lines ≥ 80% em `users.controller.ts`.

- [ ] **Step 3: Validar OpenAPI gerado**

```bash
cat apps/api/openapi.json | jq '.paths | keys' | head
```

Expected: lista `/users`, `/users/{id}`, `/users/{id}/restore`, `/users/{id}/history`, etc.

- [ ] **Step 4: Commit (se ajustes)**

---

**Próxima fase:** [`fase-08-stack-code-reviewer-doc-sync.md`](./2026-09-21-cadastro-usuario-com-auditoria-fase-08-stack-code-reviewer-doc-sync.md)
