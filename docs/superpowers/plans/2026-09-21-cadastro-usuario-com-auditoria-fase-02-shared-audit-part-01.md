# Fase 2 — Shared Audit Module

> **Spec:** [`../specs/2026-09-21-cadastro-usuario-com-auditoria-01-arquitetura-ddd-hexagonal.md`](../specs/2026-09-21-cadastro-usuario-com-auditoria-01-arquitetura-ddd-hexagonal.md) §5
> **Foco:** Módulo transversal `shared/audit` que será usado por TODOS os use cases do monorepo. Implementa o port `AuditServicePort` que qualquer módulo de domínio consome para registrar auditoria.
> **Pré-requisitos:** Fase 1 completa.

---

## Task 2.1: Criar estrutura do shared/audit module

**Files:**
- Create: `apps/api/src/shared/audit/.gitkeep`

- [ ] **Step 1: Criar diretório + placeholder**

```bash
mkdir -p apps/api/src/shared/audit/{domain,application,interfaces}
touch apps/api/src/shared/audit/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/shared/audit
git commit -m "chore(shared): scaffold shared/audit directory tree

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 2.2: Criar `apps/api/package.json` mínimo (workspace)

**Files:**
- Create: `apps/api/package.json`

- [ ] **Step 1: Criar `package.json` do workspace api**

```json
{
  "name": "@projeto/api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "lint": "eslint . --max-warnings=0",
    "typecheck": "tsc --noEmit",
    "test": "echo 'no tests yet' && exit 0",
    "test:unit": "echo 'no tests yet' && exit 0",
    "build": "echo 'no build yet' && exit 0",
    "clean": "rm -rf dist .turbo"
  },
  "devDependencies": {
    "@projeto/tsconfig": "workspace:*",
    "@projeto/eslint-config": "workspace:*",
    "typescript": "^5.6.0",
    "eslint": "^9.12.0",
    "@types/node": "^20.16.0"
  }
}
```

- [ ] **Step 2: Criar `tsconfig.json` mínimo**

```json
{
  "extends": "@projeto/tsconfig/node.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"],
  "exclude": ["**/*.spec.ts", "dist", "node_modules"]
}
```

- [ ] **Step 3: Criar `.eslintrc.js` mínimo**

```javascript
import baseConfig from '@projeto/eslint-config';
export default [...baseConfig, { rules: {} }];
```

- [ ] **Step 4: Instalar + commit**

```bash
pnpm install
git add apps/api/package.json apps/api/tsconfig.json apps/api/.eslintrc.js
git commit -m "chore(api): scaffold apps/api workspace (lint/typecheck)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 2.3: Definir VO `AuditContext` (domain puro)

**Files:**
- Create: `apps/api/src/shared/audit/domain/audit-context.vo.ts`
- Create: `apps/api/src/shared/audit/domain/audit-context.vo.spec.ts`

- [ ] **Step 1: RED — escrever teste**

```typescript
// apps/api/src/shared/audit/domain/audit-context.vo.spec.ts
import { describe, it, expect } from 'vitest';
import { AuditContext } from './audit-context.vo.js';

describe('AuditContext', () => {
  it('cria contexto válido com todos os campos', () => {
    const ctx = new AuditContext({
      actorId: 'u-123',
      correlationId: 'corr-1',
      source: 'http',
      timestamp: new Date('2026-09-21T10:00:00Z'),
    });
    expect(ctx.actorId).toBe('u-123');
    expect(ctx.correlationId).toBe('corr-1');
    expect(ctx.source).toBe('http');
    expect(ctx.timestamp.toISOString()).toBe('2026-09-21T10:00:00.000Z');
  });

  it('permite actorId null para eventos de sistema', () => {
    const ctx = new AuditContext({
      actorId: null,
      correlationId: 'system',
      source: 'job',
      timestamp: new Date(),
    });
    expect(ctx.actorId).toBeNull();
  });

  it('rejeita correlationId vazio', () => {
    expect(
      () =>
        new AuditContext({
          actorId: 'u-1',
          correlationId: '',
          source: 'http',
          timestamp: new Date(),
        }),
    ).toThrow(/correlationId/);
  });

  it('rejeita source fora do enum', () => {
    expect(
      () =>
        new AuditContext({
          actorId: 'u-1',
          correlationId: 'c',
          source: 'invalid' as any,
          timestamp: new Date(),
        }),
    ).toThrow(/source/);
  });

  it('congelado: atributos read-only', () => {
    const ctx = new AuditContext({
      actorId: 'u-1',
      correlationId: 'c',
      source: 'http',
      timestamp: new Date(),
    });
    expect(Object.isFrozen(ctx)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar teste — deve falhar**

Run: `pnpm vitest run apps/api/src/shared/audit/domain/audit-context.vo.spec.ts`
Expected: FAIL — "Cannot find module './audit-context.vo.js'"

- [ ] **Step 3: GREEN — implementar VO**

```typescript
// apps/api/src/shared/audit/domain/audit-context.vo.ts

export type AuditSource = 'http' | 'cli' | 'job' | 'event' | 'migration';

export interface AuditContextProps {
  actorId: string | null;
  correlationId: string;
  source: AuditSource;
  timestamp: Date;
}

const VALID_SOURCES: ReadonlyArray<AuditSource> = ['http', 'cli', 'job', 'event', 'migration'];

/**
 * Contexto imutável de auditoria propagado pela request via AsyncLocalStorage.
 * Domain-puro: sem dependências de framework.
 */
export class AuditContext {
  public readonly actorId: string | null;
  public readonly correlationId: string;
  public readonly source: AuditSource;
  public readonly timestamp: Date;

  constructor(props: AuditContextProps) {
    if (!props.correlationId || props.correlationId.trim() === '') {
      throw new Error('AuditContext: correlationId é obrigatório');
    }
    if (!VALID_SOURCES.includes(props.source)) {
      throw new Error(`AuditContext: source inválido '${props.source}'`);
    }
    if (!(props.timestamp instanceof Date) || Number.isNaN(props.timestamp.getTime())) {
      throw new Error('AuditContext: timestamp deve ser Date válida');
    }

    this.actorId = props.actorId;
    this.correlationId = props.correlationId.trim();
    this.source = props.source;
    this.timestamp = props.timestamp;

    Object.freeze(this);
  }

  static system(correlationId: string): AuditContext {
    return new AuditContext({
      actorId: null,
      correlationId,
      source: 'job',
      timestamp: new Date(),
    });
  }
}
```

- [ ] **Step 4: Rodar teste — deve passar**

Run: `pnpm vitest run apps/api/src/shared/audit/domain/audit-context.vo.spec.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/shared/audit/domain
git commit -m "feat(shared-audit): add AuditContext value object (domain puro)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 2.4: Definir interface do port `AuditServicePort`

**Files:**
- Create: `apps/api/src/shared/audit/application/audit-service.port.ts`

- [ ] **Step 1: Criar port**

```typescript
// apps/api/src/shared/audit/application/audit-service.port.ts
import { AuditContext } from '../domain/audit-context.vo.js';

export type AuditOperation = 'INSERT' | 'UPDATE' | 'DELETE' | 'RESTORE';

export interface AuditRecordInput {
  entityName: string;
  entityId: string;
  operation: AuditOperation;
  previousVersion: number | null;
  newVersion: number;
  snapshot: Record<string, unknown>;
  reason?: string | null;
}

/**
 * Port para registro de auditoria.
 * Implementações vivem em apps/api/src/shared/audit/infrastructure/.
 * Use cases só dependem desta interface (inversão de dependência).
 */
export interface AuditServicePort {
  record(input: AuditRecordInput, ctx: AuditContext): Promise<void>;

  /** Lista versões históricas de uma entidade. */
  listHistory(input: {
    entityName: string;
    entityId: string;
    cursor?: string;
    limit: number;
  }): Promise<{
    entries: Array<{
      version: number;
      previousVersion: number | null;
      snapshot: Record<string, unknown>;
      operation: AuditOperation;
      changedAt: Date;
      changedBy: string | null;
      reason: string | null;
    }>;
    nextCursor: string | null;
  }>;

  /** Busca versão específica do histórico. */
  getHistoryEntry(input: {
    entityName: string;
    entityId: string;
    version: number;
  }): Promise<{
    version: number;
    previousVersion: number | null;
    snapshot: Record<string, unknown>;
