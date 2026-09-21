# Fase 9 — Testes E2E Ponta-a-Ponta (Fluxos Completos)

> **Spec:** [`../specs/2026-09-21-cadastro-usuario-com-auditoria-03-fluxos-operacoes.md`](../specs/2026-09-21-cadastro-usuario-com-auditoria-03-fluxos-operacoes.md)
> **Foco:** Cobertura E2E completa dos fluxos CRUD + audit + restore + history. Testcontainers + Supertest + Fastify inject. Cada teste representa um cenário do spec §3.
> **Pré-requisitos:** Fases 1-8.

---

## Task 9.1: Helper de bootstrap E2E

**Files:**
- Create: `apps/api/test/e2e/test-app.helper.ts`

- [ ] **Step 1: Criar helper**

```typescript
// apps/api/test/e2e/test-app.helper.ts
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { setupTestDatabase, cleanDatabase, type TestContext } from '../testcontainers-helper.js';
import { AppModule } from '../../src/app.module.js';

export interface E2EContext {
  app: NestFastifyApplication;
  ctx: TestContext;
}

export async function bootstrapE2E(): Promise<E2EContext> {
  const ctx = await setupTestDatabase();
  process.env.DATABASE_URL = ctx.prisma['_engineConfig']?.overrideUrl ?? process.env.DATABASE_URL;
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.init();
  return { app, ctx };
}

export async function teardownE2E({ app, ctx }: E2EContext): Promise<void> {
  await app.close();
  await cleanDatabase(ctx.prisma);
  await ctx.stop();
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/test/e2e/test-app.helper.ts
git commit -m "test(e2e): extract bootstrap helper for E2E tests

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 9.2: Cenário E2E 01 — CREATE + GET + LIST + UPDATE

**Files:**
- Create: `apps/api/test/e2e/scenarios/01-crud-happy-path.e2e.spec.ts`

- [ ] **Step 1: Criar cenário**

```typescript
// apps/api/test/e2e/scenarios/01-crud-happy-path.e2e.spec.ts
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
      payload: { email: 'a@b.com', name: 'Alice' },
    });
    expect(c.statusCode).toBe(201);
    const user = JSON.parse(c.body);
    expect(user.email).toBe('a@b.com');
    expect(user.version).toBe(1);
    expect(c.headers.etag).toBe('W/"v1"');

    // GET
    const g = await app.inject({ method: 'GET', url: `/api/v1/users/${user.id}` });
    expect(g.statusCode).toBe(200);
    expect(JSON.parse(g.body).id).toBe(user.id);

    // LIST
    const l = await app.inject({ method: 'GET', url: '/api/v1/users?limit=10' });
    expect(l.statusCode).toBe(200);
    const list = JSON.parse(l.body);
    expect(list.data.length).toBeGreaterThanOrEqual(1);

    // UPDATE
    const u = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${user.id}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: { name: 'Alice 2' },
    });
    expect(u.statusCode).toBe(200);
    const updated = JSON.parse(u.body);
    expect(updated.version).toBe(2);
    expect(updated.name).toBe('Alice 2');

    // GET updated
    const g2 = await app.inject({ method: 'GET', url: `/api/v1/users/${user.id}` });
    expect(JSON.parse(g2.body).name).toBe('Alice 2');
  });
});
```

- [ ] **Step 2: Rodar + commit**

Run: `pnpm --filter @projeto/api test:e2e -- 01-crud 2>&1 | tail -10`
Expected: 1 passed.

```bash
git add apps/api/test/e2e/scenarios/01-crud-happy-path.e2e.spec.ts
git commit -m "test(e2e): scenario 01 - CRUD happy path

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 9.3: Cenário E2E 02 — DELETE → RESTORE → history completo

**Files:**
- Create: `apps/api/test/e2e/scenarios/02-delete-restore-audit.e2e.spec.ts`

- [ ] **Step 1: Criar cenário**

```typescript
// apps/api/test/e2e/scenarios/02-delete-restore-audit.e2e.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootstrapE2E, teardownE2E, type E2EContext } from '../test-app.helper.js';

describe('E2E 02: DELETE → RESTORE → histórico completo', () => {
  let e2e: E2EContext;
  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });
  afterAll(async () => {
    await teardownE2E(e2e);
  });

  it('audit trail completo: INSERT, UPDATE, DELETE, RESTORE', async () => {
    const { app, ctx } = e2e;

    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'audit@b.com', name: 'Audit' },
    });
    const u = JSON.parse(c.body);

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${u.id}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: { name: 'Audit 2' },
    });

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${u.id}`,
      headers: { 'if-match': 'W/"v2"' },
      payload: { name: 'Audit 3' },
    });

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${u.id}`,
      headers: { 'if-match': 'W/"v3"' },
    });

    // Verifica archive tem entrada
    const archiveRow = await ctx.prisma.userArchive.findUnique({ where: { entityId: u.id } });
    expect(archiveRow).not.toBeNull();
    expect(archiveRow?.version).toBe(4); // versão pós delete

    // Restaura
    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/users/${u.id}/restore`,
      headers: { 'if-match': 'W/"v4"' },
    });
    expect(r.statusCode).toBe(201);
    expect(JSON.parse(r.body).version).toBe(5);

    // Histórico completo
    const h = await app.inject({ method: 'GET', url: `/api/v1/users/${u.id}/history` });
    const histBody = JSON.parse(h.body);
    const ops = histBody.entries.map((e: any) => e.operation).sort();
    expect(ops).toEqual(['DELETE', 'INSERT', 'RESTORE', 'UPDATE', 'UPDATE']);

    // Cada entrada tem snapshot completo
    for (const e of histBody.entries) {
      expect(e.snapshot).toHaveProperty('id');
      expect(e.snapshot).toHaveProperty('email');
    }
  });
});
```

- [ ] **Step 2: Rodar + commit**

Run: `pnpm --filter @projeto/api test:e2e -- 02-delete-restore 2>&1 | tail -10`
Expected: 1 passed.

```bash
git add apps/api/test/e2e/scenarios/02-delete-restore-audit.e2e.spec.ts
git commit -m "test(e2e): scenario 02 - DELETE/RESTORE + audit trail validation

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

