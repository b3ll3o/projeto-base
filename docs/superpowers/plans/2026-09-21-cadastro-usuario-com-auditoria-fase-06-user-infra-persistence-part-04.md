# Fase 6 — User Infra Persistence (Parte 4/4)

> **Continuação** da Fase 6. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-06-user-infra-persistence.md)
>
> Esta é a parte 4 de 4 da Fase 6. Pule para a próxima parte ao final.

---

      })),
      nextCursor: hasMore ? data[data.length - 1].id : null,
    };
  }

  async getHistoryEntry(input: { entityName: string; entityId: string; version: number }) {
    const row = await this.prisma.userHistory.findUnique({
      where: { entityId_version: { entityId: input.entityId, version: input.version } },
    });
    if (!row) return null;
    return {
      version: row.version,
      previousVersion: row.previousVersion,
      snapshot: row.snapshot as Record<string, unknown>,
      operation: REVERSE_OP_MAP[row.operation],
      changedAt: row.changedAt,
      changedBy: row.changedBy,
      reason: row.reason,
    };
  }

  async archive(input: {
    entityName: string;
    entityId: string;
    version: number;
    snapshot: Record<string, unknown>;
    reason?: string | null;
    ctx: AuditContext;
  }): Promise<void> {
    await this.prisma.userArchive.upsert({
      where: { entityId: input.entityId },
      create: {
        entityId: input.entityId,
        version: input.version,
        snapshot: input.snapshot as any,
        deletedAt: input.ctx.timestamp,
        deletedBy: input.ctx.actorId,
        reason: input.reason ?? null,
      },
      update: {
        version: input.version,
        snapshot: input.snapshot as any,
        deletedAt: input.ctx.timestamp,
        deletedBy: input.ctx.actorId,
        reason: input.reason ?? null,
      },
    });
  }

  async listArchive(input: { entityName: string; cursor?: string; limit: number }) {
    const cursor = input.cursor ? { id: input.cursor } : undefined;
    const rows = await this.prisma.userArchive.findMany({
      ...(cursor ? { cursor, skip: 1 } : {}),
      take: input.limit + 1,
      orderBy: { deletedAt: 'desc' },
    });
    const hasMore = rows.length > input.limit;
    const data = hasMore ? rows.slice(0, input.limit) : rows;
    return {
      entries: data.map((r) => ({
        entityId: r.entityId,
        version: r.version,
        snapshot: r.snapshot as Record<string, unknown>,
        deletedAt: r.deletedAt,
        deletedBy: r.deletedBy,
        reason: r.reason,
      })),
      nextCursor: hasMore ? data[data.length - 1].id : null,
    };
  }

  async getArchiveEntry(input: { entityName: string; entityId: string }) {
    const row = await this.prisma.userArchive.findUnique({
      where: { entityId: input.entityId },
    });
    if (!row) return null;
    return {
      entityId: row.entityId,
      version: row.version,
      snapshot: row.snapshot as Record<string, unknown>,
      deletedAt: row.deletedAt,
      deletedBy: row.deletedBy,
      reason: row.reason,
    };
  }
}
```

- [ ] **Step 3: Rodar + commit**

Run: `pnpm --filter @projeto/api test:integration -- prisma-audit 2>&1 | tail -10`
Expected: 3 passed.

```bash
git add apps/api/src/shared/audit/infrastructure
git commit -m "feat(shared-audit): add PrismaAuditService implementation

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 6.8: Trocar binding de InMemoryAuditService → PrismaAuditService

**Files:**
- Modify: `apps/api/src/shared/audit/audit-infra.module.ts`
- Modify: `apps/api/src/modules/users/users.module.ts`

- [ ] **Step 1: Atualizar `AuditInfraModule`**

```typescript
// apps/api/src/shared/audit/audit-infra.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../infrastructure/prisma/prisma.module.js';
import { PrismaAuditService } from './infrastructure/prisma-audit.service.js';
import { AUDIT_SERVICE_PORT } from './shared/audit.tokens.js';

@Module({
  imports: [PrismaModule],
  providers: [
    {
      provide: AUDIT_SERVICE_PORT,
      useClass: PrismaAuditService,
    },
  ],
  exports: [AUDIT_SERVICE_PORT],
})
export class AuditInfraModule {}
```

- [ ] **Step 2: Atualizar `UsersModule` para usar PrismaUserRepository**

```typescript
// providers — substituir InMemoryUserRepository por PrismaUserRepository
import { PrismaUserRepository } from './infrastructure/persistence/prisma-user.repository.js';

{
  provide: USER_REPOSITORY_PORT,
  useClass: PrismaUserRepository,
},
```

- [ ] **Step 3: Typecheck + commit**

```bash
pnpm --filter @projeto/api typecheck
git add apps/api/src/shared/audit/audit-infra.module.ts apps/api/src/modules/users/users.module.ts
git commit -m "feat(api): bind Prisma implementations (audit + users)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 6.9: Teste de integração do use case CreateUser (E2E sem HTTP)

**Files:**
- Create: `apps/api/src/modules/users/application/use-cases/create-user.use-case.integration.spec.ts`

- [ ] **Step 1: Criar teste integrado**

```typescript
// apps/api/src/modules/users/application/use-cases/create-user.use-case.integration.spec.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestDatabase, cleanDatabase, type TestContext } from '../../../../test/testcontainers-helper.js';
import { CreateUserUseCase } from './create-user.use-case.js';
import { PrismaUserRepository } from '../../infrastructure/persistence/prisma-user.repository.js';
import { PrismaAuditService } from '../../../../shared/audit/infrastructure/prisma-audit.service.js';
import { AuditContext } from '../../../../shared/audit/domain/audit-context.vo.js';

describe('CreateUserUseCase (integration with Prisma)', () => {
  let ctx: TestContext;
  let sut: CreateUserUseCase;
  let prisma: import('@prisma/client').PrismaClient;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
    prisma = ctx.prisma;
  });
  afterAll(async () => {
    await ctx.stop();
  });
  beforeEach(async () => {
    await cleanDatabase(prisma);
    const repo = new PrismaUserRepository(prisma);
    const audit = new PrismaAuditService(prisma);
    sut = new CreateUserUseCase(repo, audit);
  });

  it('persiste User + entrada de histórico INSERT', async () => {
    const auditCtx = new AuditContext({
      actorId: 'admin',
      correlationId: 'c-1',
      source: 'http',
      timestamp: new Date(),
    });
    const dto = await sut.execute({ email: 'a@b.com', name: 'Alice' }, auditCtx);
    expect(dto.version).toBe(1);
    const row = await prisma.user.findUnique({ where: { email: 'a@b.com' } });
    expect(row).not.toBeNull();
    const hist = await prisma.userHistory.findMany({ where: { entityId: row!.id } });
    expect(hist).toHaveLength(1);
    expect(hist[0].operation).toBe('INSERT');
  });
});
```

- [ ] **Step 2: Rodar + commit**

Run: `pnpm --filter @projeto/api test:integration -- create-user 2>&1 | tail -10`
Expected: 1 passed.

```bash
git add apps/api/src/modules/users/application/use-cases/create-user.use-case.integration.spec.ts
git commit -m "test(users-app): integration test for CreateUserUseCase (Prisma real)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 6.10: Validar Fase 6

- [ ] **Step 1: Validar typecheck + lint**

```bash
pnpm --filter @projeto/api typecheck
pnpm --filter @projeto/api lint
```

Expected: 0 erros.

- [ ] **Step 2: Rodar unit + integration**

```bash
pnpm --filter @projeto/api test:unit 2>&1 | tail -5
pnpm --filter @projeto/api test:integration 2>&1 | tail -5
```

Expected: ambos passam.

- [ ] **Step 3: Validar cobertura integration ≥ 80%**

```bash
pnpm --filter @projeto/api test:integration -- --coverage src/modules/users/infrastructure 2>&1 | tail -20
```

Expected: lines ≥ 80%. Se menor, adicionar testes.

- [ ] **Step 4: Commit final (se ajustes)**

---

**Próxima fase:** [`fase-07-user-infra-http.md`](./2026-09-21-cadastro-usuario-com-auditoria-fase-07-user-infra-http.md)
