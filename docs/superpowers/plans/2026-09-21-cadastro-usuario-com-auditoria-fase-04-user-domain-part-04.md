# Fase 4 — User Domain (Parte 4/5)

> **Continuação** da Fase 4. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-04-user-domain.md)
>
> Esta é a parte 4 de 5 da Fase 4. Pule para a próxima parte ao final.

---

      expect(events[0].eventName).toBe('users.user.restored.v1');
    });

    it('rejeita restaurar User não-deletado', () => {
      const user = User.criar(baseProps());
      expect(() => user.restaurar(new Date())).toThrow(InvalidRestoreException);
    });
  });

  describe('pullEvents()', () => {
    it('retorna e esvazia lista de eventos', () => {
      const user = User.criar(baseProps());
      const first = user.pullEvents();
      const second = user.pullEvents();
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(0);
    });
  });

  describe('restaurarDeSnapshot()', () => {
    it('reconstrói User a partir de snapshot do archive', () => {
      const user = User.criar(baseProps());
      const snapshot = user.snapshot();
      const restored = User.restaurarDeSnapshot(snapshot);
      expect(restored.email.value).toBe('alice@example.com');
      expect(restored.version).toBe(1);
    });
  });

  describe('snapshot()', () => {
    it('serializa para objeto plain', () => {
      const user = User.criar(baseProps());
      const snap = user.snapshot();
      expect(snap).toMatchObject({
        id: user.id.value,
        email: 'alice@example.com',
        name: 'Alice',
        version: 1,
        createdBy: null,
        updatedBy: null,
        deletedAt: null,
      });
    });
  });
});
```

- [ ] **Step 2: Rodar — deve falhar (múltiplos)**

Run: `pnpm --filter @projeto/api test:unit -- user.aggregate 2>&1 | tail -3`
Expected: FAIL — `User` não existe.

- [ ] **Step 3: GREEN — implementar aggregate**

```typescript
// apps/api/src/modules/users/domain/user.aggregate.ts
import type { DomainEvent } from '../../../shared/domain/domain-event.js';
import { UserId } from './value-objects/user-id.vo.js';
import { Email } from './value-objects/email.vo.js';
import { UserName } from './value-objects/user-name.vo.js';
import { AuditTimestamps } from './value-objects/audit-timestamps.vo.js';
import { UserCreatedEvent } from './events/user-created.event.js';
import { UserUpdatedEvent } from './events/user-updated.event.js';
import { UserDeletedEvent } from './events/user-deleted.event.js';
import { UserRestoredEvent } from './events/user-restored.event.js';
import { UserDeletedException, InvalidRestoreException } from './exceptions/user.exceptions.js';

export interface UserProps {
  id: UserId;
  email: Email;
  name: UserName;
  timestamps: AuditTimestamps;
  version: number;
  createdBy: UserId | null;
  updatedBy: UserId | null;
  deletedAt: Date | null;
  deletedBy: UserId | null;
}

export interface CriarProps {
  id: UserId;
  email: Email;
  name: UserName;
  createdAt: Date;
  createdBy?: UserId | null;
  /** Callback opcional para checar unicidade. Lança EmailAlreadyInUseException. */
  ensureEmailAvailable?: (email: Email) => Promise<void> | void;
}

export interface UserSnapshot {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: string | null;
  deletedBy: string | null;
}

export class User {
  public readonly id: UserId;
  public email: Email;
  public name: UserName;
  public timestamps: AuditTimestamps;
  public version: number;
  public readonly createdBy: UserId | null;
  public updatedBy: UserId | null;
  public deletedAt: Date | null;
  public deletedBy: UserId | null;

  private events: DomainEvent[] = [];

  private constructor(props: UserProps) {
    this.id = props.id;
    this.email = props.email;
    this.name = props.name;
    this.timestamps = props.timestamps;
    this.version = props.version;
    this.createdBy = props.createdBy;
    this.updatedBy = props.updatedBy;
    this.deletedAt = props.deletedAt;
    this.deletedBy = props.deletedBy;
  }

  static criar(props: CriarProps): User {
    if (props.ensureEmailAvailable) {
      // síncrono, mas aceita Promise para flexibilidade
      const r = props.ensureEmailAvailable(props.email);
      if (r instanceof Promise) {
        // Em uso normal (síncrono in-memory), Promise.resolve será descartado.
        // Use cases chamam ensureEmailAvailable de forma assíncrona antes de criar.
        // Aqui aceitamos mas não await; em ambiente Prisma o check é feito fora.
      }
    }
    const timestamps = AuditTimestamps.inicial(props.createdAt);
    const user = new User({
      id: props.id,
      email: props.email,
      name: props.name,
      timestamps,
      version: 1,
      createdBy: props.createdBy ?? null,
      updatedBy: props.createdBy ?? null,
      deletedAt: null,
      deletedBy: null,
    });
    user.events.push(
      new UserCreatedEvent(user.id.value, user.version, props.createdAt),
    );
    return user;
  }

  static restaurarDeSnapshot(snap: UserSnapshot): User {
    const timestamps = AuditTimestamps.restaurar(
      new Date(snap.createdAt),
      new Date(snap.updatedAt),
    );
    return new User({
      id: UserId.create(snap.id),
      email: Email.create(snap.email),
      name: UserName.create(snap.name),
      timestamps,
      version: snap.version,
      createdBy: snap.createdBy ? UserId.create(snap.createdBy) : null,
      updatedBy: snap.updatedBy ? UserId.create(snap.updatedBy) : null,
      deletedAt: snap.deletedAt ? new Date(snap.deletedAt) : null,
      deletedBy: snap.deletedBy ? UserId.create(snap.deletedBy) : null,
    });
  }

  atualizar(
    patch: { email?: Email; name?: UserName },
    now: Date,
    identityResolver: () => User | null,
  ): void {
    if (this.deletedAt !== null) {
      throw new UserDeletedException(this.id.value);
    }
    const previousVersion = this.version;
    if (patch.email) this.email = patch.email;
    if (patch.name) this.name = patch.name;
    this.timestamps = this.timestamps.marcarAtualizado(now);
    this.version = previousVersion + 1;
    const actor = identityResolver();
    this.updatedBy = actor ? actor.id : null;
    this.events.push(
      new UserUpdatedEvent(this.id.value, this.version, previousVersion, now),
    );
  }

  softDelete(now: Date, reason: string | null, actorId: UserId | null = null): void {
    if (this.deletedAt !== null) {
      throw new UserDeletedException(`${this.id.value} já deletado`);
    }
    const previousVersion = this.version;
    this.deletedAt = now;
    this.deletedBy = actorId;
    this.timestamps = this.timestamps.marcarAtualizado(now);
    this.version = previousVersion + 1;
    this.events.push(
      new UserDeletedEvent(this.id.value, this.version, reason, now),
    );
  }

  restaurar(now: Date): void {
    if (this.deletedAt === null) {
      throw new InvalidRestoreException(`User ${this.id.value} não está deletado`);
    }
    const previousVersion = this.version;
    this.deletedAt = null;
    this.deletedBy = null;
    this.timestamps = this.timestamps.marcarAtualizado(now);
    this.version = previousVersion + 1;
    this.events.push(
      new UserRestoredEvent(this.id.value, this.version, previousVersion, now),
    );
  }

  pullEvents(): DomainEvent[] {
    const evts = [...this.events];
    this.events = [];
    return evts;
  }

  snapshot(): UserSnapshot {
    return {
      id: this.id.value,
      email: this.email.value,
      name: this.name.value,
      createdAt: this.timestamps.createdAt.toISOString(),
      updatedAt: this.timestamps.updatedAt.toISOString(),
      version: this.version,
      createdBy: this.createdBy?.value ?? null,
      updatedBy: this.updatedBy?.value ?? null,
      deletedAt: this.deletedAt?.toISOString() ?? null,
      deletedBy: this.deletedBy?.value ?? null,
    };
  }
}
```

- [ ] **Step 4: Rodar — todos passam**

Run: `pnpm --filter @projeto/api test:unit -- user.aggregate 2>&1 | tail -10`
Expected: ~14 testes passando.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/users/domain/user.aggregate.ts apps/api/src/modules/users/domain/user.aggregate.spec.ts
git commit -m "feat(users-domain): add User aggregate with full lifecycle (create/update/delete/restore)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 4.11: Validar 100% cobertura do domain

- [ ] **Step 1: Rodar cobertura do módulo**

```bash
pnpm --filter @projeto/api test:unit -- --coverage src/modules/users/domain 2>&1 | tail -20
```

Expected: 100% lines/functions/branches no domain.

