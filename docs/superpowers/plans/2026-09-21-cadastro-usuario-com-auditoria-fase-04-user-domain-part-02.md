# Fase 4 — User Domain (Parte 2/5)

> **Continuação** da Fase 4. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-04-user-domain.md)
>
> Esta é a parte 2 de 5 da Fase 4. Pule para a próxima parte ao final.

---

    Object.freeze(this);
  }

  static create(raw: string): UserName {
    if (typeof raw !== 'string') {
      throw new Error('UserName: valor deve ser string');
    }
    const trimmed = raw.trim().replace(/\s+/g, ' ');
    if (trimmed.length < MIN_LENGTH) {
      throw new Error(`UserName: muito curto (mín ${MIN_LENGTH} chars)`);
    }
    if (trimmed.length > MAX_LENGTH) {
      throw new Error(`UserName: muito longo (max ${MAX_LENGTH} chars)`);
    }
    return new UserName(trimmed);
  }

  equals(other: UserName | null | undefined): boolean {
    return !!other && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }
}
```

- [ ] **Step 3: Rodar + commit**

Run: `pnpm --filter @projeto/api test:unit -- user-name.vo 2>&1 | tail -5`
Expected: 5 passed.

```bash
git add apps/api/src/modules/users/domain/value-objects/user-name.vo.ts apps/api/src/modules/users/domain/value-objects/user-name.vo.spec.ts
git commit -m "feat(users-domain): add UserName value object with trim

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 4.5: Value Object `AuditTimestamps`

**Files:**
- Create: `apps/api/src/modules/users/domain/value-objects/audit-timestamps.vo.ts`
- Create: `apps/api/src/modules/users/domain/value-objects/audit-timestamps.vo.spec.ts`

- [ ] **Step 1: RED — teste**

```typescript
// apps/api/src/modules/users/domain/value-objects/audit-timestamps.vo.spec.ts
import { describe, it, expect } from 'vitest';
import { AuditTimestamps } from './audit-timestamps.vo.js';

describe('AuditTimestamps', () => {
  const t0 = new Date('2026-09-21T10:00:00Z');
  const t1 = new Date('2026-09-21T11:00:00Z');

  it('inicial() para entidades novas: createdAt === updatedAt', () => {
    const ts = AuditTimestamps.inicial(t0);
    expect(ts.createdAt).toBe(t0);
    expect(ts.updatedAt).toBe(t0);
    expect(ts.createdAt).toBe(ts.updatedAt);
  });

  it('marcarAtualizado preserva createdAt', () => {
    const ts = AuditTimestamps.inicial(t0);
    const novo = ts.marcarAtualizado(t1);
    expect(novo.createdAt).toBe(t0);
    expect(novo.updatedAt).toBe(t1);
  });

  it('rejeita updatedAt < createdAt', () => {
    const ts = AuditTimestamps.inicial(t0);
    expect(() => ts.marcarAtualizado(new Date('2026-09-21T09:00:00Z'))).toThrow(
      /updatedAt/,
    );
  });

  it('congelado', () => {
    expect(Object.isFrozen(AuditTimestamps.inicial(t0))).toBe(true);
  });

  it('imutabilidade: novo objeto retornado', () => {
    const ts = AuditTimestamps.inicial(t0);
    const novo = ts.marcarAtualizado(t1);
    expect(novo).not.toBe(ts);
  });
});
```

- [ ] **Step 2: GREEN — implementar**

```typescript
// apps/api/src/modules/users/domain/value-objects/audit-timestamps.vo.ts

export class AuditTimestamps {
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(createdAt: Date, updatedAt: Date) {
    if (!(createdAt instanceof Date) || Number.isNaN(createdAt.getTime())) {
      throw new Error('AuditTimestamps: createdAt deve ser Date válida');
    }
    if (!(updatedAt instanceof Date) || Number.isNaN(updatedAt.getTime())) {
      throw new Error('AuditTimestamps: updatedAt deve ser Date válida');
    }
    if (updatedAt.getTime() < createdAt.getTime()) {
      throw new Error('AuditTimestamps: updatedAt não pode ser anterior a createdAt');
    }
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    Object.freeze(this);
  }

  static inicial(t: Date): AuditTimestamps {
    return new AuditTimestamps(t, t);
  }

  static restaurar(createdAt: Date, updatedAt: Date): AuditTimestamps {
    return new AuditTimestamps(createdAt, updatedAt);
  }

  marcarAtualizado(t: Date): AuditTimestamps {
    return new AuditTimestamps(this.createdAt, t);
  }
}
```

- [ ] **Step 3: Rodar + commit**

Run: `pnpm --filter @projeto/api test:unit -- audit-timestamps.vo 2>&1 | tail -5`
Expected: 5 passed.

```bash
git add apps/api/src/modules/users/domain/value-objects/audit-timestamps.vo.ts apps/api/src/modules/users/domain/value-objects/audit-timestamps.vo.spec.ts
git commit -m "feat(users-domain): add AuditTimestamps value object (immutable)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 4.6: Domain Event base

**Files:**
- Create: `apps/api/src/shared/domain/domain-event.ts`

- [ ] **Step 1: Criar interface**

```typescript
// apps/api/src/shared/domain/domain-event.ts
export interface DomainEvent {
  readonly eventName: string;
  readonly occurredAt: Date;
  readonly aggregateId: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/shared/domain/domain-event.ts
git commit -m "feat(shared-domain): add DomainEvent interface

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 4.7: Domain Events específicos do User

**Files:**
- Create: `apps/api/src/modules/users/domain/events/user-created.event.ts`
- Create: `apps/api/src/modules/users/domain/events/user-updated.event.ts`
- Create: `apps/api/src/modules/users/domain/events/user-deleted.event.ts`
- Create: `apps/api/src/modules/users/domain/events/user-restored.event.ts`

- [ ] **Step 1: Criar `UserCreatedEvent`**

```typescript
// apps/api/src/modules/users/domain/events/user-created.event.ts
import type { DomainEvent } from '../../../../shared/domain/domain-event.js';

export class UserCreatedEvent implements DomainEvent {
  readonly eventName = 'users.user.created.v1';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly version: number;

  constructor(aggregateId: string, version: number, occurredAt: Date) {
    this.aggregateId = aggregateId;
    this.version = version;
    this.occurredAt = occurredAt;
  }
}
```

- [ ] **Step 2: Criar `UserUpdatedEvent`**

```typescript
// apps/api/src/modules/users/domain/events/user-updated.event.ts
import type { DomainEvent } from '../../../../shared/domain/domain-event.js';

export class UserUpdatedEvent implements DomainEvent {
  readonly eventName = 'users.user.updated.v1';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly version: number;
  readonly previousVersion: number;

  constructor(
    aggregateId: string,
    version: number,
    previousVersion: number,
    occurredAt: Date,
  ) {
    this.aggregateId = aggregateId;
    this.version = version;
    this.previousVersion = previousVersion;
    this.occurredAt = occurredAt;
  }
}
```

- [ ] **Step 3: Criar `UserDeletedEvent`**

```typescript
// apps/api/src/modules/users/domain/events/user-deleted.event.ts
import type { DomainEvent } from '../../../../shared/domain/domain-event.js';

export class UserDeletedEvent implements DomainEvent {
  readonly eventName = 'users.user.deleted.v1';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly version: number;
  readonly reason: string | null;

  constructor(aggregateId: string, version: number, reason: string | null, occurredAt: Date) {
    this.aggregateId = aggregateId;
    this.version = version;
    this.reason = reason;
    this.occurredAt = occurredAt;
  }
}
```

- [ ] **Step 4: Criar `UserRestoredEvent`**

```typescript
// apps/api/src/modules/users/domain/events/user-restored.event.ts
import type { DomainEvent } from '../../../../shared/domain/domain-event.js';

export class UserRestoredEvent implements DomainEvent {
  readonly eventName = 'users.user.restored.v1';
  readonly occurredAt: Date;
  readonly aggregateId: string;
  readonly version: number;
  readonly restoredFromVersion: number;

  constructor(
    aggregateId: string,
    version: number,
    restoredFromVersion: number,
    occurredAt: Date,
  ) {
    this.aggregateId = aggregateId;
    this.version = version;
    this.restoredFromVersion = restoredFromVersion;
    this.occurredAt = occurredAt;
