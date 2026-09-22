# Fase 7 — Infrastructure HTTP (Controllers + RFC 7807 + Optimistic Lock)

> **Spec:** [`../specs/2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md`](../specs/2026-09-21-cadastro-usuario-com-auditoria-04-contrato-http.md)
> **Foco:** Camada **HTTP** NestJS — controllers finos (delega tudo para use cases), Swagger/OpenAPI, validação Zod → ValidationPipe, mapeamento RFC 7807 para todas as exceções de domínio.
> **Pré-requisitos:** Fases 1-6.

---

## Task 7.1: Criar ValidationPipe global (Zod)

**Files:**
- Create: `apps/api/src/shared/infrastructure/http/zod-validation.pipe.ts`

- [ ] **Step 1: Criar pipe**

```typescript
// apps/api/src/shared/infrastructure/http/zod-validation.pipe.ts
import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const errors = result.error as ZodError;
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        detail: 'Falha de validação',
        errors: errors.errors.map((e) => ({
          field: e.path.join('.') || '(root)',
          message: e.message,
          code: e.code,
        })),
      });
    }
    return result.data;
  }
}
```

- [ ] **Step 2: Registrar no main.ts**

```typescript
// apps/api/src/main.ts — adicionar
import { ZodValidationPipe } from './shared/infrastructure/http/zod-validation.pipe.js';
app.useGlobalPipes(new ZodValidationPipe(/* default schema */));
```

Atualizar `main.ts`:

```typescript
app.useGlobalPipes(new ZodValidationPipe(z.any())); // default noop
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/shared/infrastructure/http/zod-validation.pipe.ts apps/api/src/main.ts
git commit -m "feat(api): add ZodValidationPipe (RFC 7807 errors)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 7.2: Mapeamento de exceções de domínio → HTTP (filter ou interceptor)

**Files:**
- Create: `apps/api/src/shared/infrastructure/http/domain-exception-to-http.ts`

- [ ] **Step 1: Criar mapeamento**

```typescript
// apps/api/src/shared/infrastructure/http/domain-exception-to-http.ts
import { HttpStatus } from '@nestjs/common';
import {
  UserNotFoundException,
  EmailAlreadyInUseException,
  ConcurrencyException,
  UserDeletedException,
  InvalidRestoreException,
} from '../../../modules/users/domain/exceptions/user.exceptions.js';
import { AuditHistoryNotFoundException, AuditArchiveNotFoundException } from '../../audit/domain/audit.exceptions.js';

export interface HttpErrorMapping {
  status: number;
  code: string;
  title: string;
}

export function mapDomainExceptionToHttp(err: unknown): HttpErrorMapping {
  if (err instanceof UserNotFoundException) {
    return { status: HttpStatus.NOT_FOUND, code: 'USER_NOT_FOUND', title: 'Usuário não encontrado' };
  }
  if (err instanceof AuditHistoryNotFoundException) {
    return { status: HttpStatus.NOT_FOUND, code: 'HISTORY_NOT_FOUND', title: 'Histórico não encontrado' };
  }
  if (err instanceof AuditArchiveNotFoundException) {
    return { status: HttpStatus.GONE, code: 'ARCHIVE_NOT_FOUND', title: 'Arquivo não encontrado' };
  }
  if (err instanceof EmailAlreadyInUseException) {
    return { status: HttpStatus.CONFLICT, code: 'EMAIL_IN_USE', title: 'Email já em uso' };
  }
  if (err instanceof ConcurrencyException) {
    return { status: HttpStatus.CONFLICT, code: 'CONCURRENCY_CONFLICT', title: 'Conflito de versão' };
  }
  if (err instanceof UserDeletedException) {
    return { status: HttpStatus.GONE, code: 'USER_DELETED', title: 'Usuário deletado' };
  }
  if (err instanceof InvalidRestoreException) {
    return { status: HttpStatus.UNPROCESSABLE_ENTITY, code: 'INVALID_RESTORE', title: 'Restauração inválida' };
  }
  return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: 'INTERNAL', title: 'Erro interno' };
}
```

- [ ] **Step 2: Atualizar `GlobalExceptionFilter`**

```typescript
// apps/api/src/shared/infrastructure/http/global-exception.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ProblemDetailsDto } from '@projeto/shared-types';
import { randomUUID } from 'node:crypto';
import { mapDomainExceptionToHttp } from './domain-exception-to-http.js';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const req = ctx.getRequest<FastifyRequest & { id?: string }>();
    const traceId = req.id ?? randomUUID();

    let status: number;
    let code: string;
    let title: string;
    let detail: string;
    let extra: { errors?: Array<{ field: string; message: string; code: string }> } = {};

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      if (typeof resp === 'object' && resp !== null) {
        const r = resp as Record<string, unknown>;
        code = (r['code'] as string) ?? HttpStatus[status] ?? 'HTTP_ERROR';
        title = (r['title'] as string) ?? HttpStatus[status] ?? 'Erro HTTP';
        detail = (r['message'] as string) ?? exception.message;
        extra.errors = r['errors'] as any;
      } else {
        code = HttpStatus[status]?.toString().replace(/ /g, '_').toUpperCase() ?? 'HTTP_ERROR';
        title = HttpStatus[status] ?? 'Erro HTTP';
        detail = exception.message;
      }
    } else {
      const mapped = mapDomainExceptionToHttp(exception);
      status = mapped.status;
      code = mapped.code;
      title = mapped.title;
      detail = exception instanceof Error ? exception.message : String(exception);
    }

    // 412 PRECONDITION_FAILED para Concurrency
    if (code === 'CONCURRENCY_CONFLICT') {
      status = HttpStatus.PRECONDITION_FAILED;
    }

    if (status >= 500) {
      this.logger.error(`[${traceId}] ${req.method} ${req.url} -> ${code}: ${detail}`, exception instanceof Error ? exception.stack : undefined);
    }

    const problem: ProblemDetailsDto = {
      type: `https://errors.projeto.com/${code}`,
      title,
      status,
      detail,
      instance: `${req.method} ${req.url}`,
      code,
      traceId,
      ...(extra.errors ? { errors: extra.errors } : {}),
    };

    void reply.status(status).send(problem);
  }
}
```

- [ ] **Step 3: Teste unitário do mapper**

```typescript
// apps/api/src/shared/infrastructure/http/domain-exception-to-http.spec.ts
import { describe, it, expect } from 'vitest';
import { mapDomainExceptionToHttp } from './domain-exception-to-http.js';
import { UserNotFoundException, EmailAlreadyInUseException } from '../../../modules/users/domain/exceptions/user.exceptions.js';

describe('mapDomainExceptionToHttp', () => {
  it('UserNotFound -> 404', () => {
    const m = mapDomainExceptionToHttp(new UserNotFoundException('x'));
    expect(m.status).toBe(404);
    expect(m.code).toBe('USER_NOT_FOUND');
  });
  it('EmailAlreadyInUse -> 409', () => {
    const m = mapDomainExceptionToHttp(new EmailAlreadyInUseException('a@b.com'));
    expect(m.status).toBe(409);
    expect(m.code).toBe('EMAIL_IN_USE');
  });
  it('unknown -> 500', () => {
    const m = mapDomainExceptionToHttp(new Error('bug'));
    expect(m.status).toBe(500);
  });
});
```

- [ ] **Step 4: Rodar + commit**

Run: `pnpm --filter @projeto/api test:unit -- domain-exception 2>&1 | tail -5`
Expected: 3 passed.

```bash
git add apps/api/src/shared/infrastructure/http
git commit -m "feat(api): wire domain exceptions to HTTP status codes (RFC 7807)

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 7.3: Controller `POST /users` (Create)

**Files:**
- Create: `apps/api/src/modules/users/infrastructure/http/users.controller.ts`
- Create: `apps/api/src/modules/users/infrastructure/http/users.controller.spec.ts`

- [ ] **Step 1: Criar controller**

```typescript
// apps/api/src/modules/users/infrastructure/http/users.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Inject,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiHeader, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe.js';
import {
  CreateUserSchema,
  type CreateUserDto,
} from '../../application/dto/create-user.dto.js';
import {
  UpdateUserSchema,
  type UpdateUserDto,
} from '../../application/dto/update-user.dto.js';
import { CreateUserUseCase } from '../../application/use-cases/create-user.use-case.js';
import { UpdateUserUseCase } from '../../application/use-cases/update-user.use-case.js';
import { GetUserUseCase } from '../../application/use-cases/get-user.use-case.js';
import { ListUsersUseCase } from '../../application/use-cases/list-users.use-case.js';
import { SoftDeleteUserUseCase } from '../../application/use-cases/soft-delete-user.use-case.js';
import { RestoreUserUseCase } from '../../application/use-cases/restore-user.use-case.js';
import { GetUserHistoryUseCase } from '../../application/use-cases/get-user-history.use-case.js';
import type { FastifyReply } from 'fastify';
import { AuditContextStore } from '../../../../shared/audit/shared/audit-context-store.js';
import { AuditContext } from '../../../../shared/audit/domain/audit-context.vo.js';

@ApiTags('users')
