# Fase 2 — Shared Audit (Parte 3/3)

> **Continuação** da Fase 2. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-02-shared-audit.md)
>
> Esta é a parte 3 de 3 da Fase 2. Pule para a próxima parte ao final.

---


  it('archive adiciona entrada ao archive', async () => {
    await svc.archive({
      entityName: 'User',
      entityId: 'u-1',
      version: 3,
      snapshot: { id: 'u-1', deleted: true },
      ctx,
    });
    expect(svc.archive).toHaveLength(1);
    expect(svc.archive[0].deletedBy).toBe('u-1');
  });

  it('getArchiveEntry retorna null se não existir', async () => {
    const result = await svc.getArchiveEntry({ entityName: 'User', entityId: 'u-x' });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar + commit**

Run: `pnpm vitest run apps/api/src/shared/audit/application/in-memory-audit-service.spec.ts`
Expected: 4 passed.

```bash
git add apps/api/src/shared/audit/application/in-memory-audit-service.spec.ts
git commit -m "test(shared-audit): cover InMemoryAuditService behavior

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 2.7: Token DI `AUDIT_SERVICE_PORT`

**Files:**
- Create: `apps/api/src/shared/audit/shared/audit.tokens.ts`

- [ ] **Step 1: Criar token DI**

```typescript
// apps/api/src/shared/audit/shared/audit.tokens.ts
/**
 * Tokens de DI do NestJS para a camada de auditoria.
 * Modules externos importam isso para resolver dependências.
 */
export const AUDIT_SERVICE_PORT = Symbol.for('AuditServicePort');
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/shared/audit/shared/audit.tokens.ts
git commit -m "feat(shared-audit): add AUDIT_SERVICE_PORT DI token

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 2.8: AsyncLocalStorage wrapper para AuditContext

**Files:**
- Create: `apps/api/src/shared/audit/shared/audit-context-store.ts`

- [ ] **Step 1: Criar store**

```typescript
// apps/api/src/shared/audit/shared/audit-context-store.ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { AuditContext } from '../domain/audit-context.vo.js';

const storage = new AsyncLocalStorage<AuditContext>();

export const AuditContextStore = {
  run<T>(ctx: AuditContext, fn: () => Promise<T> | T): Promise<T> | T {
    return storage.run(ctx, fn);
  },
  get(): AuditContext {
    const ctx = storage.getStore();
    if (!ctx) {
      throw new Error('AuditContextStore.get: nenhum AuditContext no scope atual');
    }
    return ctx;
  },
  tryGet(): AuditContext | undefined {
    return storage.getStore();
  },
};
```

- [ ] **Step 2: Teste unitário**

```typescript
// apps/api/src/shared/audit/shared/audit-context-store.spec.ts
import { describe, it, expect } from 'vitest';
import { AuditContextStore } from './audit-context-store.js';
import { AuditContext } from '../domain/audit-context.vo.js';

describe('AuditContextStore', () => {
  const makeCtx = () =>
    new AuditContext({
      actorId: 'u-1',
      correlationId: 'c-1',
      source: 'http',
      timestamp: new Date(),
    });

  it('get dentro de run retorna contexto', async () => {
    const ctx = makeCtx();
    await AuditContextStore.run(ctx, async () => {
      expect(AuditContextStore.get().correlationId).toBe('c-1');
    });
  });

  it('get fora de run lança erro', () => {
    expect(() => AuditContextStore.get()).toThrow(/nenhum AuditContext/);
  });

  it('tryGet retorna undefined fora de run', () => {
    expect(AuditContextStore.tryGet()).toBeUndefined();
  });

  it('contexto não vaza entre runs paralelos', async () => {
    const ctx1 = makeCtx();
    const ctx2 = new AuditContext({
      actorId: 'u-2',
      correlationId: 'c-2',
      source: 'http',
      timestamp: new Date(),
    });
    await Promise.all([
      AuditContextStore.run(ctx1, async () => {
        await new Promise((r) => setTimeout(r, 10));
        expect(AuditContextStore.get().correlationId).toBe('c-1');
      }),
      AuditContextStore.run(ctx2, async () => {
        expect(AuditContextStore.get().correlationId).toBe('c-2');
      }),
    ]);
  });
});
```

- [ ] **Step 3: Rodar + commit**

Run: `pnpm vitest run apps/api/src/shared/audit/shared/audit-context-store.spec.ts`
Expected: 4 passed.

```bash
git add apps/api/src/shared/audit/shared/audit-context-store.ts apps/api/src/shared/audit/shared/audit-context-store.spec.ts
git commit -m "feat(shared-audit): AsyncLocalStorage wrapper for AuditContext propagation

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 2.9: Domain exception base para auditoria

**Files:**
- Create: `apps/api/src/shared/audit/domain/audit.exceptions.ts`

- [ ] **Step 1: Criar exceptions**

```typescript
// apps/api/src/shared/audit/domain/audit.exceptions.ts

/**
 * Exceções de domínio do shared/audit. Domain-puras, sem decorators NestJS.
 * Infrastructure (HTTP) faz mapeamento para HTTP status.
 */

export class AuditHistoryNotFoundException extends Error {
  constructor(
    public readonly entityName: string,
    public readonly entityId: string,
    public readonly version: number,
  ) {
    super(`Histórico não encontrado: ${entityName}#${entityId}@v${version}`);
    this.name = 'AuditHistoryNotFoundException';
  }
}

export class AuditArchiveNotFoundException extends Error {
  constructor(
    public readonly entityName: string,
    public readonly entityId: string,
  ) {
    super(`Arquivo não encontrado: ${entityName}#${entityId}`);
    this.name = 'AuditArchiveNotFoundException';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/shared/audit/domain/audit.exceptions.ts
git commit -m "feat(shared-audit): add domain exceptions (history/archive not found)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 2.10: Validar Fase 2

- [ ] **Step 1: Rodar lint + typecheck + tests da Fase 2**

```bash
pnpm --filter @projeto/api typecheck
pnpm --filter @projeto/api lint
pnpm vitest run apps/api/src/shared/audit
```

Expected: tudo passa.

- [ ] **Step 2: Validar regra custom ESLint**

Run: `cat > /tmp/domain-bad.ts <<'EOF'
import { Injectable } from '@nestjs/common';
export class BadDomain {}
EOF
cp /tmp/domain-bad.ts apps/api/src/shared/audit/domain/bad-import.spec.ts
pnpm --filter @projeto/api lint 2>&1 | grep -q "no-domain-imports-from-infra" && echo "✓ regra ativa" || echo "✗ regra NÃO ativa"
rm apps/api/src/shared/audit/domain/bad-import.spec.ts`
```

Expected: regra detecta imports proibidos.

- [ ] **Step 3: Commit (se houver ajustes)**

```bash
git status
# se ajustes:
# git add -A && git commit -m "fix(shared-audit): ajustes da validação Fase 2"
```

---

**Próxima fase:** [`fase-03-apps-scaffold.md`](./2026-09-21-cadastro-usuario-com-auditoria-fase-03-apps-scaffold.md)
