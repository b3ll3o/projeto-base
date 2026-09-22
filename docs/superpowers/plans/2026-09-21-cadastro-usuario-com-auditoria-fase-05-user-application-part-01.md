# Fase 5 — User Application (Use Cases + DTOs)

> **Spec:** [`../specs/2026-09-21-cadastro-usuario-com-auditoria-01-arquitetura-ddd-hexagonal.md`](../specs/2026-09-21-cadastro-usuario-com-auditoria-01-arquitetura-ddd-hexagonal.md) §4
>                                  [`../specs/2026-09-21-cadastro-usuario-com-auditoria-03-fluxos-operacoes.md`](../specs/2026-09-21-cadastro-usuario-com-auditoria-03-fluxos-operacoes.md)
> **Foco:** Camada **APPLICATION** — orquestra fluxos usando ports. Use cases chamam `UserRepositoryPort` e `AuditServicePort`. Eventos são publicados. Cobertura mínima 95%.
> **Pré-requisitos:** Fases 1-4.

---

## Task 5.1: Criar estrutura do application/

**Files:**
- Create: `apps/api/src/modules/users/application/.gitkeep`

- [ ] **Step 1: Criar diretórios**

```bash
mkdir -p apps/api/src/modules/users/application/{use-cases,dto,mappers}
touch apps/api/src/modules/users/application/.gitkeep
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/users/application
git commit -m "chore(users): scaffold application/ subdirectories

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 5.2: DTO `CreateUserDto` + Zod schema

**Files:**
- Create: `apps/api/src/modules/users/application/dto/create-user.dto.ts`

- [ ] **Step 1: Adicionar zod como dep**

```bash
pnpm --filter @projeto/api add zod
```

- [ ] **Step 2: Criar DTO**

```typescript
// apps/api/src/modules/users/application/dto/create-user.dto.ts
import { z } from 'zod';

export const CreateUserSchema = z.object({
  email: z.string().email().max(254),
  name: z.string().min(2).max(100),
});

export type CreateUserDto = z.infer<typeof CreateUserSchema>;
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/users/application/dto/create-user.dto.ts pnpm-lock.yaml
git commit -m "feat(users-app): add CreateUserDto with zod validation

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 5.3: DTO `UpdateUserDto`

**Files:**
- Create: `apps/api/src/modules/users/application/dto/update-user.dto.ts`

- [ ] **Step 1: Criar DTO**

```typescript
// apps/api/src/modules/users/application/dto/update-user.dto.ts
import { z } from 'zod';

export const UpdateUserSchema = z
  .object({
    email: z.string().email().max(254).optional(),
    name: z.string().min(2).max(100).optional(),
  })
  .refine((d) => d.email !== undefined || d.name !== undefined, {
    message: 'informe ao menos um campo para atualizar',
  });

export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/users/application/dto/update-user.dto.ts
git commit -m "feat(users-app): add UpdateUserDto (partial, zod)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 5.4: DTO `RestoreUserDto`

**Files:**
- Create: `apps/api/src/modules/users/application/dto/restore-user.dto.ts`

- [ ] **Step 1: Criar DTO**

```typescript
// apps/api/src/modules/users/application/dto/restore-user.dto.ts
import { z } from 'zod';

export const RestoreUserSchema = z.object({
  expectedVersion: z.number().int().min(1),
  reason: z.string().min(3).max(500).optional(),
});

export type RestoreUserDto = z.infer<typeof RestoreUserSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/modules/users/application/dto/restore-user.dto.ts
git commit -m "feat(users-app): add RestoreUserDto (expectedVersion required for optimistic lock)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 5.5: Mapper `User → UserOutputDto`

**Files:**
- Create: `apps/api/src/modules/users/application/mappers/user.mapper.ts`

- [ ] **Step 1: Criar mapper**

```typescript
// apps/api/src/modules/users/application/mappers/user.mapper.ts
import type { UserOutputDto } from '@projeto/shared-types';
import type { User } from '../../domain/user.aggregate.js';

export const UserMapper = {
  toOutput(user: User): UserOutputDto {
    return {
      id: user.id.value,
      email: user.email.value,
      name: user.name.value,
      version: user.version,
      createdAt: user.timestamps.createdAt.toISOString(),
      updatedAt: user.timestamps.updatedAt.toISOString(),
      createdBy: user.createdBy?.value ?? null,
      updatedBy: user.updatedBy?.value ?? null,
    };
  },
};
```

- [ ] **Step 2: Teste unitário**

```typescript
// apps/api/src/modules/users/application/mappers/user.mapper.spec.ts
import { describe, it, expect } from 'vitest';
import { UserMapper } from './user.mapper.js';
import { User } from '../../domain/user.aggregate.js';
import { UserId } from '../../domain/value-objects/user-id.vo.js';
import { Email } from '../../domain/value-objects/email.vo.js';
import { UserName } from '../../domain/value-objects/user-name.vo.js';

describe('UserMapper', () => {
  it('toOutput mapeia todos os campos', () => {
    const u = User.criar({
      id: UserId.create('0190a8b6-1234-7abc-9def-000000000001'),
      email: Email.create('a@b.com'),
      name: UserName.create('Alice'),
      createdAt: new Date('2026-09-21T10:00:00Z'),
    });
    const dto = UserMapper.toOutput(u);
    expect(dto.id).toBe('0190a8b6-1234-7abc-9def-000000000001');
    expect(dto.email).toBe('a@b.com');
    expect(dto.name).toBe('Alice');
    expect(dto.version).toBe(1);
    expect(dto.createdAt).toBe('2026-09-21T10:00:00.000Z');
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/users/application/mappers
git commit -m "feat(users-app): add UserMapper.toOutput

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 5.6: Use case `CreateUserUseCase`

**Files:**
- Create: `apps/api/src/modules/users/application/use-cases/create-user.use-case.ts`
- Create: `apps/api/src/modules/users/application/use-cases/create-user.use-case.spec.ts`

- [ ] **Step 1: RED — teste**

```typescript
// apps/api/src/modules/users/application/use-cases/create-user.use-case.spec.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CreateUserUseCase } from './create-user.use-case.js';
import { InMemoryUserRepository } from '../../infrastructure/persistence/in-memory-user.repository.js';
import { InMemoryAuditService } from '../../../../shared/audit/application/in-memory-audit-service.js';
import { AuditContext } from '../../../../shared/audit/domain/audit-context.vo.js';
import { EmailAlreadyInUseException } from '../../domain/exceptions/user.exceptions.js';

describe('CreateUserUseCase', () => {
  let repo: InMemoryUserRepository;
  let audit: InMemoryAuditService;
  let sut: CreateUserUseCase;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    audit = new InMemoryAuditService();
    sut = new CreateUserUseCase(repo, audit);
  });

  it('cria User, persiste e registra auditoria', async () => {
    const ctx = new AuditContext({
      actorId: 'u-admin',
      correlationId: 'c-1',
      source: 'http',
      timestamp: new Date(),
    });
    const dto = await sut.execute(
      { email: 'a@b.com', name: 'Alice' },
      ctx,
    );
    expect(dto.email).toBe('a@b.com');
    expect(dto.version).toBe(1);
    expect(repo['byId'].size).toBe(1);
    expect(audit.history).toHaveLength(1);
    expect(audit.history[0].operation).toBe('INSERT');
  });

  it('lança EmailAlreadyInUseException se email duplicado', async () => {
    const ctx = new AuditContext({
      actorId: null,
      correlationId: 'c-1',
      source: 'http',
      timestamp: new Date(),
    });
    await sut.execute({ email: 'a@b.com', name: 'Alice' }, ctx);
    await expect(sut.execute({ email: 'A@B.com', name: 'Alice 2' }, ctx)).rejects.toThrow(
      EmailAlreadyInUseException,
    );
  });

  it('NÃO chama repo.save se email duplicado', async () => {
    const ctx = new AuditContext({
      actorId: null,
      correlationId: 'c-1',
      source: 'http',
      timestamp: new Date(),
    });
    await sut.execute({ email: 'a@b.com', name: 'Alice' }, ctx);
    const sizeAntes = repo['byId'].size;
    await expect(
      sut.execute({ email: 'a@b.com', name: 'Other' }, ctx),
    ).rejects.toThrow();
    expect(repo['byId'].size).toBe(sizeAntes);
  });
});
```

- [ ] **Step 2: GREEN — implementar use case**

```typescript
// apps/api/src/modules/users/application/use-cases/create-user.use-case.ts
import type { UserOutputDto } from '@projeto/shared-types';
import type { UserRepositoryPort } from '../../domain/ports/user-repository.port.js';
import type { AuditServicePort } from '../../../../shared/audit/application/audit-service.port.js';
import type { AuditContext } from '../../../../shared/audit/domain/audit-context.vo.js';
import { User } from '../../domain/user.aggregate.js';
import { UserId } from '../../domain/value-objects/user-id.vo.js';
import { Email } from '../../domain/value-objects/email.vo.js';
import { UserName } from '../../domain/value-objects/user-name.vo.js';
import { EmailAlreadyInUseException } from '../../domain/exceptions/user.exceptions.js';
import { UserMapper } from '../mappers/user.mapper.js';
