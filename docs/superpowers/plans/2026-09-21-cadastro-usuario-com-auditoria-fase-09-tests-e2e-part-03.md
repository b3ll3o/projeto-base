# Fase 9 — Testes E2E Ponta-a-Ponta (Parte 3/3)

> **Continuação** da Fase 9. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-09-tests-e2e.md)
>
> Esta é a parte 3 de 3 da Fase 9 (final).

---

## Task 9.7: Cenário E2E 06 — History pagination + snapshot integrity

**Files:**
- Create: `apps/api/test/e2e/scenarios/06-history-snapshots.e2e.spec.ts`

- [ ] **Step 1: Criar cenário**

```typescript
// apps/api/test/e2e/scenarios/06-history-snapshots.e2e.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { bootstrapE2E, teardownE2E, type E2EContext } from '../test-app.helper.js';

describe('E2E 06: Histórico completo preserva versões antigas', () => {
  let e2e: E2EContext;
  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });
  afterAll(async () => {
    await teardownE2E(e2e);
  });

  it('cada versão tem snapshot completo do estado', async () => {
    const { app } = e2e;
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { email: 'snap@b.com', name: 'Snap v1' },
    });
    const u = JSON.parse(c.body);

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${u.id}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: { name: 'Snap v2' },
    });

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${u.id}`,
      headers: { 'if-match': 'W/"v2"' },
      payload: { email: 'NEW@b.com' },
    });

    const h = await app.inject({ method: 'GET', url: `/api/v1/users/${u.id}/history` });
    const body = JSON.parse(h.body);
    expect(body.entries).toHaveLength(3);

    const byV: Record<number, any> = {};
    for (const e of body.entries) byV[e.version] = e;

    expect(byV[1].snapshot.name).toBe('Snap v1');
    expect(byV[1].snapshot.email).toBe('snap@b.com');

    expect(byV[2].snapshot.name).toBe('Snap v2');
    expect(byV[2].snapshot.email).toBe('snap@b.com');

    expect(byV[3].snapshot.name).toBe('Snap v2');
    expect(byV[3].snapshot.email).toBe('new@b.com'); // normalizado

    expect(byV[3].previousVersion).toBe(2);
  });
});
```

- [ ] **Step 2: Rodar + commit**

```bash
git add apps/api/test/e2e/scenarios/06-history-snapshots.e2e.spec.ts
git commit -m "test(e2e): scenario 06 - history preserves snapshots across versions

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 9.8: Validar Fase 9 + cobertura geral

- [ ] **Step 1: Rodar TODOS os testes**

```bash
pnpm --filter @projeto/api test:unit 2>&1 | tail -5
pnpm --filter @projeto/api test:integration 2>&1 | tail -5
pnpm --filter @projeto/api test:e2e 2>&1 | tail -5
```

Expected:
- Unit: ~80 testes passam
- Integration: ~10 testes passam
- E2E: ~15 testes passam (6 cenários)

- [ ] **Step 2: Validar cobertura total ≥ 85%**

```bash
pnpm --filter @projeto/api test:unit -- --coverage src/modules 2>&1 | tail -20
pnpm --filter @projeto/api test:integration -- --coverage 2>&1 | tail -20
pnpm --filter @projeto/api test:e2e -- --coverage 2>&1 | tail -20
```

Expected: linhas ≥ 85% em domain + application + infrastructure.

- [ ] **Step 3: Rodar tdd:check global**

```bash
pnpm turbo run tdd:check 2>&1 | tail -10
```

Expected: passa (todos os pacotes com testes unit passam).

- [ ] **Step 4: Commit (se ajustes)**

```bash
git status
```

---

**Próxima fase:** [`fase-10-docs-adr-finishing.md`](./2026-09-21-cadastro-usuario-com-auditoria-fase-10-docs-adr-finishing.md)
