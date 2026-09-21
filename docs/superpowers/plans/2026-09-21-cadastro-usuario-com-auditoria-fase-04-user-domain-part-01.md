# Fase 4 — User Domain (Aggregate + VOs + Events + Ports)

> **Spec:** [`../specs/2026-09-21-cadastro-usuario-com-auditoria-01-arquitetura-ddd-hexagonal.md`](../specs/2026-09-21-cadastro-usuario-com-auditoria-01-arquitetura-ddd-hexagonal.md) §4
>                                  [`../specs/2026-09-21-cadastro-usuario-com-auditoria-02-modelo-dados.md`](../specs/2026-09-21-cadastro-usuario-com-auditoria-02-modelo-dados.md)
> **Foco:** Camada **DOMAIN** pura (zero framework). Aggregate `User`, Value Objects (Email, Name, UserId, AuditTimestamps), Domain Events, e Port `UserRepositoryPort`. Cobertura obrigatória 100%.
> **Pré-requisitos:** Fases 1, 2, 3.

---

## Task 4.1: Criar estrutura do domain

**Files:**
- Create: `apps/api/src/modules/users/domain/.gitkeep`

- [ ] **Step 1: Criar subdiretórios**

```bash
mkdir -p apps/api/src/modules/users/domain/{events,ports,exceptions}
touch apps/api/src/modules/users/domain/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/users/domain
git commit -m "chore(users): scaffold domain/ subdirectories

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 4.2: Value Object `UserId` (UUID branded type)

**Files:**
- Create: `apps/api/src/modules/users/domain/value-objects/user-id.vo.ts`
- Create: `apps/api/src/modules/users/domain/value-objects/user-id.vo.spec.ts`

- [ ] **Step 1: RED — teste**

```typescript
// apps/api/src/modules/users/domain/value-objects/user-id.vo.spec.ts
import { describe, it, expect } from 'vitest';
import { UserId } from './user-id.vo.js';

describe('UserId', () => {
  it('cria a partir de UUID válido', () => {
    const id = UserId.create('0190a8b6-1234-7abc-9def-000000000001');
    expect(id.value).toBe('0190a8b6-1234-7abc-9def-000000000001');
  });

  it('gera novo UUID quando omitido', () => {
    const id = UserId.create();
    expect(id.value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('rejeita UUID inválido', () => {
    expect(() => UserId.create('não-é-uuid')).toThrow(/UUID/);
  });

  it('dois UserIds com mesmo valor são iguais', () => {
    expect(UserId.create('0190a8b6-1234-7abc-9def-000000000002').equals(
      UserId.create('0190a8b6-1234-7abc-9def-000000000002'),
    )).toBe(true);
  });

  it('equals retorna false para valores diferentes', () => {
    expect(UserId.create('0190a8b6-1234-7abc-9def-000000000003').equals(
      UserId.create('0190a8b6-1234-7abc-9def-000000000004'),
    )).toBe(false);
  });

  it('congelado (imutável)', () => {
    const id = UserId.create('0190a8b6-1234-7abc-9def-000000000005');
    expect(Object.isFrozen(id)).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `pnpm --filter @projeto/api test:unit 2>&1 | grep -E "FAIL|Cannot find" | head -3`
Expected: FAIL — module not found.

- [ ] **Step 3: GREEN — implementar VO**

```typescript
// apps/api/src/modules/users/domain/value-objects/user-id.vo.ts
import { randomUUID } from 'node:crypto';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class UserId {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }

  static create(value?: string): UserId {
    const v = value ?? randomUUID();
    if (!UUID_RE.test(v)) {
      throw new Error(`UserId: valor não é UUID v7 válido: '${value ?? '(undefined)'}'`);
    }
    return new UserId(v);
  }

  equals(other: UserId | null | undefined): boolean {
    return other !== null && other !== undefined && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }
}
```

- [ ] **Step 4: Rodar — deve passar**

Run: `pnpm --filter @projeto/api test:unit -- user-id.vo 2>&1 | tail -5`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/users/domain/value-objects/user-id.vo.ts apps/api/src/modules/users/domain/value-objects/user-id.vo.spec.ts
git commit -m "feat(users-domain): add UserId value object (UUID v7)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 4.3: Value Object `Email`

**Files:**
- Create: `apps/api/src/modules/users/domain/value-objects/email.vo.ts`
- Create: `apps/api/src/modules/users/domain/value-objects/email.vo.spec.ts`

- [ ] **Step 1: RED — teste**

```typescript
// apps/api/src/modules/users/domain/value-objects/email.vo.spec.ts
import { describe, it, expect } from 'vitest';
import { Email } from './email.vo.js';

describe('Email', () => {
  it('aceita email válido e normaliza para lowercase', () => {
    const e = Email.create('  User@Example.COM ');
    expect(e.value).toBe('user@example.com');
  });

  it('rejeita email sem @', () => {
    expect(() => Email.create('user.example.com')).toThrow(/inválido/);
  });

  it('rejeita email sem domínio', () => {
    expect(() => Email.create('user@')).toThrow(/inválido/);
  });

  it('rejeita email > 254 chars', () => {
    const local = 'a'.repeat(250);
    const email = `${local}@x.com`;
    expect(() => Email.create(email)).toThrow(< 254);
  });

  it('equals por valor', () => {
    expect(Email.create('a@b.com').equals(Email.create('A@B.COM'))).toBe(true);
  });

  it('congelado', () => {
    expect(Object.isFrozen(Email.create('a@b.com'))).toBe(true);
  });
});
```

- [ ] **Step 2: GREEN — implementar**

```typescript
// apps/api/src/modules/users/domain/value-objects/email.vo.ts
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_LENGTH = 254;

export class Email {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
    Object.freeze(this);
  }

  static create(raw: string): Email {
    if (typeof raw !== 'string') {
      throw new Error('Email: valor deve ser string');
    }
    const trimmed = raw.trim().toLowerCase();
    if (trimmed.length === 0 || trimmed.length > MAX_LENGTH) {
      throw new Error(`Email: tamanho inválido (max ${MAX_LENGTH})`);
    }
    if (!EMAIL_RE.test(trimmed)) {
      throw new Error('Email: formato inválido');
    }
    return new Email(trimmed);
  }

  equals(other: Email | null | undefined): boolean {
    return !!other && other.value === this.value;
  }

  toString(): string {
    return this.value;
  }
}
```

- [ ] **Step 3: Rodar — 6 passed, e o 4o? Ajustar regex MAX_LENGTH check**

Re-rodar: `pnpm --filter @projeto/api test:unit -- email.vo 2>&1 | tail -5`

Se falhar no teste de tamanho, ajustar:

```typescript
// Atualizar spec para:
expect(() => Email.create(email)).toThrow(/tamanho/);
```

E ajustar erro na implementação se necessário.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/users/domain/value-objects/email.vo.ts apps/api/src/modules/users/domain/value-objects/email.vo.spec.ts
git commit -m "feat(users-domain): add Email value object with normalization

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 4.4: Value Object `UserName`

**Files:**
- Create: `apps/api/src/modules/users/domain/value-objects/user-name.vo.ts`
- Create: `apps/api/src/modules/users/domain/value-objects/user-name.vo.spec.ts`

- [ ] **Step 1: RED — teste**

```typescript
// apps/api/src/modules/users/domain/value-objects/user-name.vo.spec.ts
import { describe, it, expect } from 'vitest';
import { UserName } from './user-name.vo.js';

describe('UserName', () => {
  it('aceita nome válido e trim', () => {
    const n = UserName.create('  João Silva  ');
    expect(n.value).toBe('João Silva');
  });

  it('rejeita vazio', () => {
    expect(() => UserName.create('   ')).toThrow(/vazio/);
  });

  it('rejeita nome > 100 chars', () => {
    expect(() => UserName.create('a'.repeat(101))).toThrow(/100/);
  });

  it('rejeita nome < 2 chars (após trim)', () => {
    expect(() => UserName.create('a')).toThrow(/2/);
  });

  it('congelado', () => {
    expect(Object.isFrozen(UserName.create('João'))).toBe(true);
  });
});
```

- [ ] **Step 2: GREEN — implementar**

```typescript
// apps/api/src/modules/users/domain/value-objects/user-name.vo.ts
const MIN_LENGTH = 2;
const MAX_LENGTH = 100;

export class UserName {
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
