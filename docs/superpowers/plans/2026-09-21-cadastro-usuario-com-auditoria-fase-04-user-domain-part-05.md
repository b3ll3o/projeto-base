# Fase 4 — User Domain (Parte 5/5)

> **Continuação** da Fase 4. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-04-user-domain.md)
>
> Esta é a parte 5 de 5 da Fase 4. Pule para a próxima parte ao final.

---

- [ ] **Step 2: Se cobertura < 100%, adicionar testes faltantes**

Procurar uncovered lines em `user.aggregate.ts` (ex.: `restaurarDeSnapshot`, branches excepcionais) e adicionar testes correspondentes.

- [ ] **Step 3: Commit (se ajustes)**

```bash
git status
```

---

## Task 4.12: Validar regra ESLint `no-domain-imports-from-infra`

- [ ] **Step 1: Criar arquivo temporário violador**

```bash
cat > apps/api/src/modules/users/domain/bad-import.spec.ts <<'EOF'
import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

describe('x', () => { it('y', () => {}); });
EOF
```

- [ ] **Step 2: Rodar lint**

```bash
pnpm --filter @projeto/api lint 2>&1 | head -10
```

Expected: erros do tipo `ddd-hexagonal/no-domain-imports-from-infra`.

- [ ] **Step 3: Remover arquivo**

```bash
rm apps/api/src/modules/users/domain/bad-import.spec.ts
```

- [ ] **Step 4: Commit (se houver fix de lint)**

---

## Task 4.13: In-memory repository (para testes de application na Fase 5)

**Files:**
- Create: `apps/api/src/modules/users/infrastructure/persistence/in-memory-user.repository.ts`
- Create: `apps/api/src/modules/users/infrastructure/persistence/in-memory-user.repository.spec.ts`

- [ ] **Step 1: Criar InMemoryUserRepository**

```typescript
// apps/api/src/modules/users/infrastructure/persistence/in-memory-user.repository.ts
import type { User } from '../../domain/user.aggregate.js';
import type {
  UserRepositoryPort,
  FindByIdOptions,
} from '../../domain/ports/user-repository.port.js';
import { UserId } from '../../domain/value-objects/user-id.vo.js';
import { ConcurrencyException } from '../../domain/exceptions/user.exceptions.js';

export class InMemoryUserRepository implements UserRepositoryPort {
  private byId = new Map<string, User>();

  async save(user: User): Promise<void> {
    this.byId.set(user.id.value, user);
  }

  async findById(id: string, options?: FindByIdOptions): Promise<User | null> {
    const user = this.byId.get(id);
    if (!user) return null;
    if (!options?.includeDeleted && user.deletedAt !== null) return null;
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const u of this.byId.values()) {
      if (u.deletedAt === null && u.email.value === email.toLowerCase()) {
        return u;
      }
    }
    return null;
  }

  async updateWithLock(
    user: User,
    expectedVersion: number,
  ): Promise<void> {
    const current = this.byId.get(user.id.value);
    if (!current || current.version !== expectedVersion) {
      throw new ConcurrencyException(expectedVersion, current?.version ?? null);
    }
    this.byId.set(user.id.value, user);
  }

  async list(input: { cursor?: string; limit: number; includeDeleted?: boolean }): Promise<{
    users: User[];
    nextCursor: string | null;
  }> {
    const all = Array.from(this.byId.values()).filter((u) =>
      input.includeDeleted ? true : u.deletedAt === null,
    );
    const offset = input.cursor ? Number(input.cursor) : 0;
    const slice = all.slice(offset, offset + input.limit);
    const next = offset + input.limit < all.length ? String(offset + input.limit) : null;
    return { users: slice, nextCursor: next };
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const current = this.byId.get(id);
    if (!current || current.version !== expectedVersion) {
      throw new ConcurrencyException(expectedVersion, current?.version ?? null);
    }
  }

  async restore(id: string, expectedVersion: number): Promise<User> {
    const current = this.byId.get(id);
    if (!current || current.version !== expectedVersion) {
      throw new ConcurrencyException(expectedVersion, current?.version ?? null);
    }
    return current;
  }

  seed(users: User[]): void {
    for (const u of users) this.byId.set(u.id.value, u);
  }

  clear(): void {
    this.byId.clear();
  }
}
```

- [ ] **Step 2: Smoke test**

```typescript
// apps/api/src/modules/users/infrastructure/persistence/in-memory-user.repository.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryUserRepository } from './in-memory-user.repository.js';
import { User } from '../../domain/user.aggregate.js';
import { UserId } from '../../domain/value-objects/user-id.vo.js';
import { Email } from '../../domain/value-objects/email.vo.js';
import { UserName } from '../../domain/value-objects/user-name.vo.js';
import { ConcurrencyException } from '../../domain/exceptions/user.exceptions.js';

describe('InMemoryUserRepository', () => {
  let repo: InMemoryUserRepository;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
  });

  it('save + findById retorna User', async () => {
    const u = User.criar({
      id: UserId.create('0190a8b6-1234-7abc-9def-000000000001'),
      email: Email.create('a@b.com'),
      name: UserName.create('Alice'),
      createdAt: new Date(),
    });
    await repo.save(u);
    const got = await repo.findById(u.id.value);
    expect(got?.email.value).toBe('a@b.com');
  });

  it('updateWithLock lança ConcurrencyException em versão errada', async () => {
    const u = User.criar({
      id: UserId.create('0190a8b6-1234-7abc-9def-000000000002'),
      email: Email.create('b@b.com'),
      name: UserName.create('Bob'),
      createdAt: new Date(),
    });
    await repo.save(u);
    await expect(repo.updateWithLock(u, 999)).rejects.toThrow(ConcurrencyException);
  });
});
```

- [ ] **Step 3: Rodar + commit**

Run: `pnpm --filter @projeto/api test:unit -- in-memory-user 2>&1 | tail -5`
Expected: 2 passed.

```bash
git add apps/api/src/modules/users/infrastructure/persistence/in-memory-user.repository.ts apps/api/src/modules/users/infrastructure/persistence/in-memory-user.repository.spec.ts
git commit -m "test(users): add InMemoryUserRepository for application tests

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 4.14: Validar Fase 4

- [ ] **Step 1: Rodar todos os testes do módulo**

```bash
pnpm --filter @projeto/api test:unit -- users
```

Expected: ~30 testes passando.

- [ ] **Step 2: Validar typecheck**

```bash
pnpm --filter @projeto/api typecheck
```

Expected: 0 erros.

- [ ] **Step 3: Validar lint**

```bash
pnpm --filter @projeto/api lint
```

Expected: 0 erros.

- [ ] **Step 4: Commit final (se ajustes)**

---

## Task 4.15: Validar regra de boundary (domain não importa nada proibido)

- [ ] **Step 1: grep imports no domain**

```bash
grep -rE "^import .* from" apps/api/src/modules/users/domain --include="*.ts" | grep -vE "(\.js|\.\./)" | head -20
```

Expected: imports devem ser apenas relativos locais ou tipos do `shared/domain`.

- [ ] **Step 2: Verificar nenhum import de `@nestjs`, `@prisma`, `class-validator`**

```bash
grep -rE "@nestjs|@prisma|class-validator" apps/api/src/modules/users/domain && echo "VIOLATION" || echo "✓ domain limpo"
```

Expected: `✓ domain limpo`.

---

**Próxima fase:** [`fase-05-user-application.md`](./2026-09-21-cadastro-usuario-com-auditoria-fase-05-user-application.md)
