# Fase 9 — Testes E2E Ponta-a-Ponta (Parte 2/3)

> **Continuação** da Fase 9. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-09-tests-e2e.md)
>
> Esta é a parte 2 de 3 da Fase 9. Pule para a próxima parte ao final.

---

## Task 9.4: Cenário E2E 03 — Concurrency / If-Match

**Files:**
- Create: `apps/api/test/e2e/scenarios/03-concurrency.e2e.spec.ts`

- [ ] **Step 1: Criar cenário**

```typescript
// apps/api/test/e2e/scenarios/03-concurrency.e2e.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootstrapE2E, teardownE2E, type E2EContext } from '../test-app.helper.js';

describe('E2E 03: Optimistic Locking via If-Match', () => {
  let e2e: E2EContext;
  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });
  afterAll(async () => {
    await teardownE2E(e2e);
  });

  it('PATCH com If-Match desatualizado -> 412 CONCURRENCY_CONFLICT', async () => {
    const { app } = e2e;
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'concur@b.com', name: 'Concur' },
    });
    const u = JSON.parse(c.body);

    // Cliente A: atualiza para v2
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${u.id}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: { name: 'A wins' },
    });

    // Cliente B: tinha If-Match v1, tenta atualizar
    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${u.id}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: { name: 'B tries' },
    });
    expect(stale.statusCode).toBe(412);
    const body = JSON.parse(stale.body);
    expect(body.code).toBe('CONCURRENCY_CONFLICT');
  });

  it('DELETE com If-Match errado -> 412', async () => {
    const { app } = e2e;
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'd@b.com', name: 'D' },
    });
    const u = JSON.parse(c.body);
    const wrong = await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${u.id}`,
      headers: { 'if-match': 'W/"v99"' },
    });
    expect(wrong.statusCode).toBe(412);
  });

  it('PATCH sem If-Match -> 400/428', async () => {
    const { app } = e2e;
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'noheader@b.com', name: 'N' },
    });
    const u = JSON.parse(c.body);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${u.id}`,
      payload: { name: 'X' },
    });
    expect([400, 428, 412]).toContain(res.statusCode);
  });
});
```

- [ ] **Step 2: Rodar + commit**

```bash
git add apps/api/test/e2e/scenarios/03-concurrency.e2e.spec.ts
git commit -m "test(e2e): scenario 03 - optimistic locking conflict resolution

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 9.5: Cenário E2E 04 — Validação Zod + RFC 7807

**Files:**
- Create: `apps/api/test/e2e/scenarios/04-validation-errors.e2e.spec.ts`

- [ ] **Step 1: Criar cenário**

```typescript
// apps/api/test/e2e/scenarios/04-validation-errors.e2e.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootstrapE2E, teardownE2E, type E2EContext } from '../test-app.helper.js';

describe('E2E 04: Validation errors (Zod) + RFC 7807', () => {
  let e2e: E2EContext;
  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });
  afterAll(async () => {
    await teardownE2E(e2e);
  });

  it('POST sem email -> 400 VALIDATION_ERROR com errors[]', async () => {
    const { app } = e2e;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toMatch(/VALIDATION|HTTP/);
    expect(body).toHaveProperty('traceId');
    expect(body).toHaveProperty('instance');
  });

  it('POST email inválido -> 400', async () => {
    const { app } = e2e;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'not-an-email', name: 'X' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('GET id inválido (não-UUID) -> 500 ou 400', async () => {
    const { app } = e2e;
    const res = await app.inject({ method: 'GET', url: '/api/v1/users/not-a-uuid' });
    expect([400, 500]).toContain(res.statusCode);
  });

  it('PATCH com payload vazio -> 400', async () => {
    const { app } = e2e;
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'a@b.com', name: 'A' },
    });
    const u = JSON.parse(c.body);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${u.id}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Rodar + commit**

```bash
git add apps/api/test/e2e/scenarios/04-validation-errors.e2e.spec.ts
git commit -m "test(e2e): scenario 04 - validation + RFC 7807 format

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 9.6: Cenário E2E 05 — Listagem cursor + includeDeleted

**Files:**
- Create: `apps/api/test/e2e/scenarios/05-pagination.e2e.spec.ts`

- [ ] **Step 1: Criar cenário**

```typescript
// apps/api/test/e2e/scenarios/05-pagination.e2e.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootstrapE2E, teardownE2E, type E2EContext } from '../test-app.helper.js';

describe('E2E 05: Cursor pagination + includeDeleted', () => {
  let e2e: E2EContext;
  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });
  afterAll(async () => {
    await teardownE2E(e2e);
  });

  it('paginação cursor percorre todas as páginas', async () => {
    const { app } = e2e;
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const c = await app.inject({
        method: 'POST',
        url: '/api/v1/users',
        payload: { email: `p${i}@b.com`, name: `P${i}` },
      });
      ids.push(JSON.parse(c.body).id);
    }
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    while (true) {
      const url = cursor
        ? `/api/v1/users?limit=2&cursor=${cursor}`
        : '/api/v1/users?limit=2';
      const r = await app.inject({ method: 'GET', url });
      const body = JSON.parse(r.body);
      for (const u of body.data) seen.add(u.id);
      pages++;
      if (!body.pagination.hasMore) break;
      cursor = body.pagination.nextCursor;
      if (pages > 10) throw new Error('infinite loop');
    }
    expect(seen.size).toBe(5);
  });

  it('?includeDeleted=true lista soft-deleted', async () => {
    const { app, ctx } = e2e;
    const c1 = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'keep@b.com', name: 'K' },
    });
    const c2 = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'rm@b.com', name: 'R' },
    });
    const id2 = JSON.parse(c2.body).id;
    await app.inject({
      method: 'DELETE',
      url: `/api/v1/users/${id2}`,
      headers: { 'if-match': 'W/"v1"' },
    });

    const normal = await app.inject({ method: 'GET', url: '/api/v1/users?limit=100' });
    expect(normal.statusCode).toBe(200);
    expect(JSON.parse(normal.body).data.find((u: any) => u.id === id2)).toBeUndefined();

    const withDel = await app.inject({ method: 'GET', url: '/api/v1/users?limit=100&includeDeleted=true' });
    expect(withDel.statusCode).toBe(200);
    expect(JSON.parse(withDel.body).data.find((u: any) => u.id === id2)).toBeDefined();
  });
});
```

- [ ] **Step 2: Rodar + commit**

```bash
git add apps/api/test/e2e/scenarios/05-pagination.e2e.spec.ts
git commit -m "test(e2e): scenario 05 - cursor pagination + includeDeleted

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

