# Fase 6 — User Infra Persistence (Parte 2/4)

> **Continuação** da Fase 6. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-06-user-infra-persistence.md)
>
> Esta é a parte 2 de 4 da Fase 6. Pule para a próxima parte ao final.

---

    });
    expect(user.email.value).toBe('alice@example.com'); // normalização
    expect(user.version).toBe(1);
  });

  it('toPersistence converte User em Prisma row', () => {
    const { User } = await import('../../domain/user.aggregate.js');
    const { UserId } = await import('../../domain/value-objects/user-id.vo.js');
    const { Email } = await import('../../domain/value-objects/email.vo.js');
    const { UserName } = await import('../../domain/value-objects/user-name.vo.js');
    const u = User.criar({
      id: UserId.create('0190a8b6-1234-7abc-9def-000000000002'),
      email: Email.create('a@b.com'),
      name: UserName.create('A'),
      createdAt: new Date('2026-09-21T10:00:00Z'),
    });
    const row = UserPrismaMapper.toPersistence(u);
    expect(row.id).toBe('0190a8b6-1234-7abc-9def-000000000002');
    expect(row.version).toBe(1);
  });
});
```

- [ ] **Step 2: GREEN — implementar mapper**

```typescript
// apps/api/src/modules/users/infrastructure/persistence/user.prisma-mapper.ts
import { User, type UserSnapshot } from '../../domain/user.aggregate.js';
import { UserId } from '../../domain/value-objects/user-id.vo.js';
import { Email } from '../../domain/value-objects/email.vo.js';
import { UserName } from '../../domain/value-objects/user-name.vo.js';
import { AuditTimestamps } from '../../domain/value-objects/audit-timestamps.vo.js';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

export interface UserPersistenceRow {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  version: number;
}

export const UserPrismaMapper = {
  toDomain(row: UserRow): User {
    const snap: UserSnapshot = {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      version: row.version,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      deletedBy: row.deletedBy,
    };
    const user = User.restaurarDeSnapshot(snap);
    // Re-aplicar campos que snapshot não carrega
    return user;
  },

  toPersistence(user: User): UserPersistenceRow {
    const snap = user.snapshot();
    return {
      id: snap.id,
      email: snap.email,
      name: snap.name,
      createdAt: new Date(snap.createdAt),
      updatedAt: new Date(snap.updatedAt),
      createdBy: snap.createdBy,
      updatedBy: snap.updatedBy,
      deletedAt: snap.deletedAt ? new Date(snap.deletedAt) : null,
      deletedBy: snap.deletedBy,
      version: snap.version,
    };
  },
};
```

- [ ] **Step 3: Rodar + commit**

Run: `pnpm --filter @projeto/api test:unit -- user.prisma-mapper 2>&1 | tail -5`
Expected: 2 passed.

```bash
git add apps/api/src/modules/users/infrastructure/persistence/user.prisma-mapper.ts apps/api/src/modules/users/infrastructure/persistence/user.prisma-mapper.spec.ts
git commit -m "feat(users-infra): add UserPrismaMapper (Prisma <-> Domain)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 6.6: PrismaUserRepository (Testcontainers)

**Files:**
- Create: `apps/api/src/modules/users/infrastructure/persistence/prisma-user.repository.ts`
- Create: `apps/api/src/modules/users/infrastructure/persistence/prisma-user.repository.spec.ts`

- [ ] **Step 1: Adicionar Testcontainers**

```bash
pnpm --filter @projeto/api add -D @testcontainers/postgresql@^10.13.0
```

- [ ] **Step 2: Criar test helper para Postgres container**

```typescript
// apps/api/test/testcontainers-helper.ts
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

let container: StartedPostgreSqlContainer | undefined;
let prisma: PrismaClient | undefined;

export async function setupTestDatabase(): Promise<{ prisma: PrismaClient; stop: () => Promise<void> }> {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  process.env.DATABASE_URL = container.getConnectionUri();
  prisma = new PrismaClient({ datasourceUrl: container.getConnectionUri() });
  execSync('pnpm prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: container.getConnectionUri() },
    stdio: 'inherit',
  });
  return {
    prisma,
    stop: async () => {
      await prisma?.$disconnect();
      await container?.stop();
    },
  };
}

export async function cleanDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.userArchive.deleteMany({});
  await prisma.userHistory.deleteMany({});
  await prisma.user.deleteMany({});
}
```

- [ ] **Step 3: RED — teste de integração**

```typescript
// apps/api/src/modules/users/infrastructure/persistence/prisma-user.repository.spec.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDatabase, cleanDatabase, type TestContext } from '../../../../test/testcontainers-helper.js';
import { PrismaUserRepository } from './prisma-user.repository.js';
import type { PrismaClient } from '@prisma/client';
import { ConcurrencyException, UserNotFoundException } from '../../domain/exceptions/user.exceptions.js';

describe('PrismaUserRepository (Testcontainers)', () => {
  let ctx: TestContext;
  let repo: PrismaUserRepository;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
    prisma = ctx.prisma;
  });

  afterAll(async () => {
    await ctx.stop();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    repo = new PrismaUserRepository(prisma);
  });

  it('save + findById', async () => {
    const { User } = await import('../../domain/user.aggregate.js');
    const { UserId } = await import('../../domain/value-objects/user-id.vo.js');
    const { Email } = await import('../../domain/value-objects/email.vo.js');
    const { UserName } = await import('../../domain/value-objects/user-name.vo.js');
    const u = User.criar({
      id: UserId.create(),
      email: Email.create('a@b.com'),
      name: UserName.create('A'),
      createdAt: new Date(),
    });
    await repo.save(u);
    const got = await repo.findById(u.id.value);
    expect(got?.email.value).toBe('a@b.com');
  });

  it('updateWithLock lança ConcurrencyException se versão mudou', async () => {
    const { User } = await import('../../domain/user.aggregate.js');
    const { UserId } = await import('../../domain/value-objects/user-id.vo.js');
    const { Email } = await import('../../domain/value-objects/email.vo.js');
    const { UserName } = await import('../../domain/value-objects/user-name.vo.js');
    const u = User.criar({
      id: UserId.create(),
      email: Email.create('a@b.com'),
      name: UserName.create('A'),
      createdAt: new Date(),
    });
    await repo.save(u);
    await expect(repo.updateWithLock(u, 999)).rejects.toThrow(ConcurrencyException);
  });

  it('softDelete remove da listagem por padrão', async () => {
    const { User } = await import('../../domain/user.aggregate.js');
    const { UserId } = await import('../../domain/value-objects/user-id.vo.js');
    const { Email } = await import('../../domain/value-objects/email.vo.js');
    const { UserName } = await import('../../domain/value-objects/user-name.vo.js');
    const u = User.criar({
      id: UserId.create(),
      email: Email.create('a@b.com'),
      name: UserName.create('A'),
      createdAt: new Date(),
    });
    await repo.save(u);
    await repo.softDelete(u.id.value, 1);
    expect(await repo.findById(u.id.value)).toBeNull();
    const found = await repo.findById(u.id.value, { includeDeleted: true });
    expect(found?.deletedAt).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 4: Implementar `PrismaUserRepository`**

```typescript
// apps/api/src/modules/users/infrastructure/persistence/prisma-user.repository.ts
import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import type { User } from '../../domain/user.aggregate.js';
import type {
  UserRepositoryPort,
  FindByIdOptions,
} from '../../domain/ports/user-repository.port.js';
import {
  ConcurrencyException,
  UserNotFoundException,
} from '../../domain/exceptions/user.exceptions.js';
import { UserPrismaMapper } from './user.prisma-mapper.js';

@Injectable()
export class PrismaUserRepository implements UserRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  async save(user: User): Promise<void> {
    const row = UserPrismaMapper.toPersistence(user);
    await this.prisma.user.create({ data: row });
  }

  async findById(id: string, options?: FindByIdOptions): Promise<User | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    if (!row) return null;
    if (!options?.includeDeleted && row.deletedAt !== null) return null;
    return UserPrismaMapper.toDomain(row);
  }

