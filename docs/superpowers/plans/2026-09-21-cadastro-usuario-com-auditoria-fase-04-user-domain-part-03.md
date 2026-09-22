# Fase 4 — User Domain (Parte 3/5)

> **Continuação** da Fase 4. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-04-user-domain.md)
>
> Esta é a parte 3 de 5 da Fase 4. Pule para a próxima parte ao final.

---

  }
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/users/domain/events
git commit -m "feat(users-domain): add domain events (created/updated/deleted/restored)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 4.8: Domain Exceptions

**Files:**
- Create: `apps/api/src/modules/users/domain/exceptions/user.exceptions.ts`

- [ ] **Step 1: Criar exceptions**

```typescript
// apps/api/src/modules/users/domain/exceptions/user.exceptions.ts

export class UserNotFoundException extends Error {
  constructor(public readonly userId: string) {
    super(`User não encontrado: ${userId}`);
    this.name = 'UserNotFoundException';
  }
}

export class EmailAlreadyInUseException extends Error {
  constructor(public readonly email: string) {
    super(`Email já em uso: ${email}`);
    this.name = 'EmailAlreadyInUseException';
  }
}

export class ConcurrencyException extends Error {
  constructor(
    public readonly expectedVersion: number,
    public readonly actualVersion: number | null,
  ) {
    super(
      `Concurrency: versão esperada ${expectedVersion}, encontrada ${
        actualVersion ?? '(ausente)'
      }`,
    );
    this.name = 'ConcurrencyException';
  }
}

export class UserDeletedException extends Error {
  constructor(public readonly userId: string) {
    super(`User já deletado (soft delete): ${userId}`);
    this.name = 'UserDeletedException';
  }
}

export class InvalidRestoreException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRestoreException';
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/users/domain/exceptions/user.exceptions.ts
git commit -m "feat(users-domain): add domain exceptions

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 4.9: Port `UserRepositoryPort`

**Files:**
- Create: `apps/api/src/modules/users/domain/ports/user-repository.port.ts`

- [ ] **Step 1: Criar port**

```typescript
// apps/api/src/modules/users/domain/ports/user-repository.port.ts
import type { User } from '../user.aggregate.js';

export interface FindByIdOptions {
  includeDeleted?: boolean;
}

/**
 * Port do repositório de User.
 * Implementação Prisma vive em apps/api/src/modules/users/infrastructure/persistence/.
 * Domain depende só desta interface.
 */
export interface UserRepositoryPort {
  save(user: User): Promise<void>;
  findById(id: string, options?: FindByIdOptions): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;

  /**
   * Atualização com optimistic locking.
   * @throws ConcurrencyException se versão mudou
   */
  updateWithLock(
    user: User,
    expectedVersion: number,
    options: { includeDeleted?: boolean },
  ): Promise<void>;

  list(input: {
    cursor?: string;
    limit: number;
    includeDeleted?: boolean;
  }): Promise<{ users: User[]; nextCursor: string | null }>;

  /**
   * Soft delete (marca deleted_at, NÃO remove).
   */
  softDelete(id: string, expectedVersion: number): Promise<void>;

  /**
   * Restauração de soft-deleted (limpa deleted_at).
   */
  restore(id: string, expectedVersion: number): Promise<User>;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/users/domain/ports/user-repository.port.ts
git commit -m "feat(users-domain): define UserRepositoryPort (DDD repository pattern)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 4.10: Aggregate `User` (factory + mutators + invariants)

**Files:**
- Create: `apps/api/src/modules/users/domain/user.aggregate.ts`
- Create: `apps/api/src/modules/users/domain/user.aggregate.spec.ts`

- [ ] **Step 1: RED — testes do aggregate**

```typescript
// apps/api/src/modules/users/domain/user.aggregate.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { User } from './user.aggregate.js';
import { UserId } from './value-objects/user-id.vo.js';
import { Email } from './value-objects/email.vo.js';
import { UserName } from './value-objects/user-name.vo.js';
import {
  EmailAlreadyInUseException,
  InvalidRestoreException,
  UserDeletedException,
} from './exceptions/user.exceptions.js';

describe('User aggregate', () => {
  const baseProps = () => ({
    id: UserId.create('0190a8b6-1234-7abc-9def-000000000001'),
    email: Email.create('alice@example.com'),
    name: UserName.create('Alice'),
    createdAt: new Date('2026-09-21T10:00:00Z'),
  });

  describe('criar()', () => {
    it('cria User com version=1 e timestamps iguais', () => {
      const user = User.criar(baseProps());
      expect(user.version).toBe(1);
      expect(user.timestamps.createdAt).toBe(user.timestamps.updatedAt);
    });

    it('emite UserCreatedEvent', () => {
      const user = User.criar(baseProps());
      const events = user.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventName).toBe('users.user.created.v1');
    });

    it('rejeita email duplicado via factory callback', () => {
      expect(() =>
        User.criar({
          ...baseProps(),
          email: Email.create('alice@example.com'),
          ensureEmailAvailable: () => {
            throw new EmailAlreadyInUseException('alice@example.com');
          },
        }),
      ).toThrow(EmailAlreadyInUseException);
    });
  });

  describe('atualizar()', () => {
    let user: User;
    beforeEach(() => {
      user = User.criar(baseProps());
      user.pullEvents();
    });

    it('incrementa versão e atualiza updatedAt', () => {
      const antes = user.version;
      const tAntes = user.timestamps.updatedAt;
      const novaData = new Date(tAntes.getTime() + 60_000);

      user.atualizar({ name: UserName.create('Alice 2') }, novaData, () => user);

      expect(user.version).toBe(antes + 1);
      expect(user.timestamps.updatedAt).toBe(novaData);
      expect(user.name.value).toBe('Alice 2');
    });

    it('emite UserUpdatedEvent com previousVersion', () => {
      user.atualizar({ name: UserName.create('Alice 2') }, new Date(), () => user);
      const events = user.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventName).toBe('users.user.updated.v1');
      expect((events[0] as any).previousVersion).toBe(1);
    });

    it('rejeita alteração em User deletado', () => {
      user.softDelete(new Date(), 'GDPR');
      expect(() => user.atualizar({ name: UserName.create('X') }, new Date(), () => user)).toThrow(
        UserDeletedException,
      );
    });

    it('passa nil para email quando não fornecido, mantém o atual', () => {
      user.atualizar({}, new Date(), () => user);
      expect(user.email.value).toBe('alice@example.com');
    });
  });

  describe('softDelete()', () => {
    it('marca deletedAt e incrementa versão', () => {
      const user = User.criar(baseProps());
      const antes = user.version;
      user.softDelete(new Date(), 'request');
      expect(user.deletedAt).toBeInstanceOf(Date);
      expect(user.version).toBe(antes + 1);
    });

    it('emite UserDeletedEvent com reason', () => {
      const user = User.criar(baseProps());
      user.softDelete(new Date(), 'GDPR request');
      const events = user.pullEvents();
      expect(events[0].eventName).toBe('users.user.deleted.v1');
    });

    it('rejeita duplo delete', () => {
      const user = User.criar(baseProps());
      user.softDelete(new Date(), 'x');
      expect(() => user.softDelete(new Date(), 'y')).toThrow(/já deletado/);
    });
  });

  describe('restaurar()', () => {
    it('limpa deletedAt e emite UserRestoredEvent', () => {
      const user = User.criar(baseProps());
      user.softDelete(new Date(), 'old');
      user.pullEvents();
      user.restaurar(new Date());
      expect(user.deletedAt).toBeNull();
      const events = user.pullEvents();
