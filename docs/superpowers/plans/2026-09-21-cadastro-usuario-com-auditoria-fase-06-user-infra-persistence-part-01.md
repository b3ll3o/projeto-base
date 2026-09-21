# Fase 6 — Infrastructure Persistence (Prisma + Repositories + Mappers + Audit)

> **Spec:** [`../specs/2026-09-21-cadastro-usuario-com-auditoria-02-modelo-dados.md`](../specs/2026-09-21-cadastro-usuario-com-auditoria-02-modelo-dados.md)
> **Foco:** Schema Prisma, client, mappers Prisma↔Domain, `PrismaUserRepository` (com optimistic locking real) e `PrismaAuditService` (implementação real do port).
> **Pré-requisitos:** Fases 1-5.

---

## Task 6.1: Adicionar Prisma 6 como dep

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Instalar Prisma**

```bash
pnpm --filter @projeto/api add @prisma/client@^6.0.0
pnpm --filter @projeto/api add -D prisma@^6.0.0
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add Prisma 6 (client + cli)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 6.2: Inicializar Prisma + schema com User + UserHistory + UserArchive

**Files:**
- Create: `apps/api/prisma/schema.prisma`

- [ ] **Step 1: Criar schema**

```prisma
// apps/api/prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// =====================
// Enums
// =====================

enum AuditOperation {
  INSERT
  UPDATE
  DELETE
  RESTORE

  @@map("audit_operation")
}

// =====================
// User (aggregate principal)
// =====================

model User {
  id        String    @id @db.Uuid
  email     String    @unique
  name      String
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt       @map("updated_at")
  createdBy String?   @map("created_by") @db.Uuid
  updatedBy String?   @map("updated_by") @db.Uuid
  deletedAt DateTime? @map("deleted_at")
  deletedBy String?   @map("deleted_by") @db.Uuid
  version   Int       @default(1)

  @@index([email])
  @@index([deletedAt])
  @@index([createdAt(sort: Desc)])
  @@map("users")
}

// =====================
// UserHistory (auditoria completa — 1 linha por versão)
// =====================

model UserHistory {
  id              String         @id @default(uuid()) @db.Uuid
  entityId        String         @map("entity_id") @db.Uuid
  version         Int            @map("version")
  previousVersion Int?           @map("previous_version")
  operation       AuditOperation @map("operation")
  snapshot        Json           @map("snapshot")
  changedAt       DateTime       @default(now()) @map("changed_at")
  changedBy       String?        @map("changed_by") @db.Uuid
  reason          String?        @map("reason")

  @@unique([entityId, version])
  @@index([entityId, changedAt(sort: Desc)])
  @@map("users_history")
}

// =====================
// UserArchive (lixeira viva — 1 linha por entidade soft-deleted)
// =====================

model UserArchive {
  id        String   @id @default(uuid()) @db.Uuid
  entityId  String   @unique @map("entity_id") @db.Uuid
  version   Int      @map("version")
  snapshot  Json     @map("snapshot")
  deletedAt DateTime @default(now()) @map("deleted_at")
  deletedBy String?  @map("deleted_by") @db.Uuid
  reason    String?  @map("reason")

  @@index([deletedAt(sort: Desc)])
  @@map("users_archive")
}
```

- [ ] **Step 2: Validar schema**

Run: `pnpm --filter @projeto/api exec prisma validate`
Expected: "The schema at apps/api/prisma/schema.prisma is valid 🚀"

- [ ] **Step 3: Commit**

```bash
git add apps/api/prisma/schema.prisma
git commit -m "feat(api): add Prisma schema (User + UserHistory + UserArchive)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 6.3: Gerar Prisma Client + primeira migration

**Files:**
- Create: `apps/api/prisma/migrations/`

- [ ] **Step 1: Gerar migration inicial**

```bash
pnpm --filter @projeto/api exec prisma migrate dev --name init_audit_user --skip-seed
```

Expected: cria `migrations/00000000000000_init_audit_user/migration.sql` e aplica no DB.

- [ ] **Step 2: Verificar tabelas**

```bash
docker compose exec postgres psql -U projeto -d projeto_base -c '\dt'
```

Expected: `users`, `users_history`, `users_archive`.

- [ ] **Step 3: Gerar client**

```bash
pnpm --filter @projeto/api exec prisma generate
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/prisma/migrations apps/api/src/generated 2>/dev/null || \
  git add apps/api/prisma/migrations
git commit -m "feat(api): initial Prisma migration (users + history + archive)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 6.4: Prisma Service (NestJS DI)

**Files:**
- Create: `apps/api/src/shared/infrastructure/prisma/prisma.service.ts`
- Create: `apps/api/src/shared/infrastructure/prisma/prisma.module.ts`

- [ ] **Step 1: Criar PrismaService**

```typescript
// apps/api/src/shared/infrastructure/prisma/prisma.service.ts
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma conectado');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

- [ ] **Step 2: Criar PrismaModule global**

```typescript
// apps/api/src/shared/infrastructure/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 3: Adicionar PrismaModule em app.module.ts**

```typescript
// apps/api/src/app.module.ts — adicionar no array de imports
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    LoggerModule.forRoot({ /* ... */ }),
    PrismaModule,
    AuditInfraModule,
    UsersModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/shared/infrastructure/prisma
git commit -m "feat(api): add PrismaService (Nest lifecycle) + global PrismaModule

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 6.5: User mapper (Prisma row → Domain)

**Files:**
- Create: `apps/api/src/modules/users/infrastructure/persistence/user.prisma-mapper.ts`
- Create: `apps/api/src/modules/users/infrastructure/persistence/user.prisma-mapper.spec.ts`

- [ ] **Step 1: RED — teste**

```typescript
// apps/api/src/modules/users/infrastructure/persistence/user.prisma-mapper.spec.ts
import { describe, it, expect } from 'vitest';
import { UserPrismaMapper } from './user.prisma-mapper.js';

describe('UserPrismaMapper', () => {
  it('toDomain converte Prisma row em User aggregate', () => {
    const user = UserPrismaMapper.toDomain({
      id: '0190a8b6-1234-7abc-9def-000000000001',
      email: 'Alice@Example.com',
      name: 'Alice',
      createdAt: new Date('2026-09-21T10:00:00Z'),
      updatedAt: new Date('2026-09-21T10:00:00Z'),
      createdBy: null,
      updatedBy: null,
      deletedAt: null,
      deletedBy: null,
      version: 1,
