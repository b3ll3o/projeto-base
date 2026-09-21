# Fase 5 — User Application (Parte 5/5)

> **Continuação** da Fase 5. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-05-user-application.md)
>
> Esta é a parte 5 de 5 da Fase 5. Pule para a próxima parte ao final.

---

    });
    return {
      entries: result.entries.map((e) => ({
        version: e.version,
        previousVersion: e.previousVersion,
        snapshot: e.snapshot,
        operation: e.operation,
        changedAt: e.changedAt,
        changedBy: e.changedBy,
        reason: e.reason,
      })),
      nextCursor: result.nextCursor,
    };
  }
}
```

- [ ] **Step 3: Rodar + commit**

```bash
git add apps/api/src/modules/users/application/use-cases/get-user-history.use-case.ts apps/api/src/modules/users/application/use-cases/get-user-history.use-case.spec.ts
git commit -m "feat(users-app): add GetUserHistoryUseCase

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 5.13: Configurar DI dos use cases no UsersModule

**Files:**
- Modify: `apps/api/src/modules/users/users.module.ts`

- [ ] **Step 1: Adicionar providers dos use cases**

```typescript
// apps/api/src/modules/users/users.module.ts
import { Module } from '@nestjs/common';
import { AUDIT_SERVICE_PORT } from '../../shared/audit/shared/audit.tokens.js';
import { CreateUserUseCase } from './application/use-cases/create-user.use-case.js';
import { UpdateUserUseCase } from './application/use-cases/update-user.use-case.js';
import { GetUserUseCase } from './application/use-cases/get-user.use-case.js';
import { ListUsersUseCase } from './application/use-cases/list-users.use-case.js';
import { SoftDeleteUserUseCase } from './application/use-cases/soft-delete-user.use-case.js';
import { RestoreUserUseCase } from './application/use-cases/restore-user.use-case.js';
import { GetUserHistoryUseCase } from './application/use-cases/get-user-history.use-case.js';
import { InMemoryUserRepository } from './infrastructure/persistence/in-memory-user.repository.js';
import { USER_REPOSITORY_PORT } from './infrastructure/persistence/user-repository.token.js';
import type { AuditServicePort } from '../../shared/audit/application/audit-service.port.js';

const USER_REPOSITORY_PORT = Symbol.for('UserRepositoryPort');

@Module({
  providers: [
    {
      provide: USER_REPOSITORY_PORT,
      useClass: InMemoryUserRepository,
    },
    {
      provide: CreateUserUseCase,
      useFactory: (repo: any, audit: AuditServicePort) => new CreateUserUseCase(repo, audit),
      inject: [USER_REPOSITORY_PORT, AUDIT_SERVICE_PORT],
    },
    { provide: UpdateUserUseCase, useFactory: (repo: any, audit: AuditServicePort) => new UpdateUserUseCase(repo, audit), inject: [USER_REPOSITORY_PORT, AUDIT_SERVICE_PORT] },
    { provide: GetUserUseCase, useFactory: (repo: any) => new GetUserUseCase(repo), inject: [USER_REPOSITORY_PORT] },
    { provide: ListUsersUseCase, useFactory: (repo: any) => new ListUsersUseCase(repo), inject: [USER_REPOSITORY_PORT] },
    { provide: SoftDeleteUserUseCase, useFactory: (repo: any, audit: AuditServicePort) => new SoftDeleteUserUseCase(repo, audit), inject: [USER_REPOSITORY_PORT, AUDIT_SERVICE_PORT] },
    { provide: RestoreUserUseCase, useFactory: (repo: any, audit: AuditServicePort) => new RestoreUserUseCase(repo, audit), inject: [USER_REPOSITORY_PORT, AUDIT_SERVICE_PORT] },
    { provide: GetUserHistoryUseCase, useFactory: (audit: AuditServicePort) => new GetUserHistoryUseCase(audit), inject: [AUDIT_SERVICE_PORT] },
  ],
  exports: [
    CreateUserUseCase,
    UpdateUserUseCase,
    GetUserUseCase,
    ListUsersUseCase,
    SoftDeleteUserUseCase,
    RestoreUserUseCase,
    GetUserHistoryUseCase,
  ],
})
export class UsersModule {}
```

- [ ] **Step 2: Criar `user-repository.token.ts`**

```typescript
// apps/api/src/modules/users/infrastructure/persistence/user-repository.token.ts
export const USER_REPOSITORY_PORT = Symbol.for('UserRepositoryPort');
```

- [ ] **Step 3: Typecheck + commit**

Run: `pnpm --filter @projeto/api typecheck 2>&1 | tail -10`
Expected: 0 erros.

```bash
git add apps/api/src/modules/users/users.module.ts apps/api/src/modules/users/infrastructure/persistence/user-repository.token.ts
git commit -m "feat(users-app): wire DI for all use cases in UsersModule

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 5.14: Validar Fase 5

- [ ] **Step 1: Rodar todos os testes do application**

```bash
pnpm --filter @projeto/api test:unit -- users/application
```

Expected: ~25 testes passando.

- [ ] **Step 2: Validar typecheck + lint**

```bash
pnpm --filter @projeto/api typecheck && pnpm --filter @projeto/api lint
```

Expected: 0 erros.

- [ ] **Step 3: Validar cobertura ≥ 90% no application**

```bash
pnpm --filter @projeto/api test:unit -- --coverage src/modules/users/application 2>&1 | tail -20
```

Expected: lines ≥ 90%. Se menor, adicionar testes faltantes.

- [ ] **Step 4: Commit (se ajustes)**

---

**Próxima fase:** [`fase-06-user-infra-persistence.md`](./2026-09-21-cadastro-usuario-com-auditoria-fase-06-user-infra-persistence.md)
