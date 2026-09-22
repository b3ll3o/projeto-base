# Fase 3 — Apps Scaffold (apps/api NestJS + apps/web Next.js)

> **Spec:** [`../specs/2026-09-21-cadastro-usuario-com-auditoria-01-arquitetura-ddd-hexagonal.md`](../specs/2026-09-21-cadastro-usuario-com-auditoria-01-arquitetura-ddd-hexagonal.md) §3
> **Foco:** Bootstrap dos dois apps do monorepo. `apps/api` é NestJS 11 + Fastify + Prisma 6 + Pino. `apps/web` é Next.js 15 + React 19 + Tailwind 4 + shadcn/ui. Estrutura DDD/Hexagonal desde o dia 1.
> **Pré-requisitos:** Fases 1 e 2 completas.

---

## Task 3.1: Adicionar deps NestJS 11 + Fastify

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Adicionar dependências backend**

```bash
pnpm --filter @projeto/api add \
  @nestjs/common@^11.0.0 \
  @nestjs/core@^11.0.0 \
  @nestjs/platform-fastify@^11.0.0 \
  @nestjs/config@^3.2.3 \
  @nestjs/event-emitter@^2.0.0 \
  @nestjs/swagger@^11.0.0 \
  nestjs-pino@^4.1.0 \
  pino-http@^10.3.0 \
  pino-pretty@^11.2.2 \
  reflect-metadata@^0.2.2 \
  rxjs@^7.8.1
```

- [ ] **Step 2: Adicionar class-validator e class-transformer**

```bash
pnpm --filter @projeto/api add class-validator class-transformer
```

- [ ] **Step 3: Adicionar devDeps**

```bash
pnpm --filter @projeto/api add -D \
  @nestjs/testing@^11.0.0 \
  @types/express@^5.0.0 \
  supertest@^7.0.0 \
  @types/supertest@^6.0.2 \
  vitest@^2.1.0 \
  @vitest/coverage-v8@^2.1.0
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "chore(api): add NestJS 11 + Fastify + Pino deps

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 3.2: Criar bootstrap NestJS (`main.ts`)

**Files:**
- Create: `apps/api/src/main.ts`
- Create: `apps/api/src/app.module.ts`

- [ ] **Step 1: Criar `main.ts`**

```typescript
// apps/api/src/main.ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './shared/infrastructure/http/global-exception.filter.js';

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({ logger: false });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(/* ValidationPipe configured in AppModule */);
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Projeto Base API')
    .setDescription('API do projeto base — DDD + Hexagonal')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Bootstrap falhou:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Criar `app.module.ts`**

```typescript
// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AuditInfraModule } from './shared/audit/audit-infra.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV === 'production'
            ? undefined
            : { target: 'pino-pretty', options: { singleLine: true, colorize: true } },
        redact: ['req.headers.authorization', 'req.headers.cookie'],
      },
    }),
    AuditInfraModule,
    UsersModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 3: Stub do `GlobalExceptionFilter`**

```typescript
// apps/api/src/shared/infrastructure/http/global-exception.filter.ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import type { ProblemDetailsDto } from '@projeto/shared-types';
import { randomUUID } from 'node:crypto';

/**
 * Filter global: converte TODA exceção em RFC 7807 Problem Details.
 * Cada erro carrega: type, title, status, detail, instance, code, traceId.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<{ url: string; method: string; id?: string }>();
    const traceId = request.id ?? randomUUID();

    const { status, title, code, detail } = this.mapException(exception);
    const problem: ProblemDetailsDto = {
      type: `https://errors.projeto.com/${code}`,
      title,
      status,
      detail,
      instance: `${request.method} ${request.url}`,
      code,
      traceId,
    };

    void reply.status(status).send(problem);
  }

  private mapException(exception: unknown): {
    status: number;
    title: string;
    code: string;
    detail: string;
  } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        title: HttpStatus[status] ?? 'Erro HTTP',
        code: this.codeFromStatus(status),
        detail: exception.message,
      };
    }
    if (exception instanceof Error) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        title: 'Erro interno',
        code: 'INTERNAL_ERROR',
        detail: exception.message,
      };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      title: 'Erro desconhecido',
      code: 'UNKNOWN',
      detail: String(exception),
    };
  }

  private codeFromStatus(status: number): string {
    return HttpStatus[status]?.toString().replace(/ /g, '_').toUpperCase() ?? 'ERROR';
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/main.ts apps/api/src/app.module.ts apps/api/src/shared/infrastructure/http/global-exception.filter.ts
git commit -m "feat(api): bootstrap NestJS 11 + Fastify + Pino + Swagger + RFC 7807 filter

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 3.3: Criar estrutura DDD do módulo users (placeholder)

**Files:**
- Create: `apps/api/src/modules/users/users.module.ts`
- Create: `apps/api/src/modules/users/.gitkeep`

- [ ] **Step 1: Criar diretórios**

```bash
mkdir -p apps/api/src/modules/users/{domain,application,infrastructure/http,infrastructure/persistence}
touch apps/api/src/modules/users/.gitkeep
```

- [ ] **Step 2: Criar `users.module.ts` placeholder**

```typescript
// apps/api/src/modules/users/users.module.ts
import { Module } from '@nestjs/common';
// domain layer será populada nas Fases 4-5
// infra layer será populada nas Fases 6-7

@Module({})
export class UsersModule {}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/users
git commit -m "chore(api): scaffold users module DDD directories

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 3.4: Criar `AuditInfraModule` (bootstrap do port)

**Files:**
- Create: `apps/api/src/shared/audit/audit-infra.module.ts`

- [ ] **Step 1: Criar module (sem implementação Prisma ainda — usa InMemory)**

```typescript
// apps/api/src/shared/audit/audit-infra.module.ts
import { Module } from '@nestjs/common';
import { AUDIT_SERVICE_PORT } from './shared/audit.tokens.js';
import { InMemoryAuditService } from './application/in-memory-audit-service.js';

/**
 * Stub de infraestrutura. Na Fase 6 será substituído pela
 * PrismaAuditService. Use cases dependem só do port, então trocar
 * a binding não exige mudanças fora deste módulo.
 */
@Module({
  providers: [
    {
      provide: AUDIT_SERVICE_PORT,
      useClass: InMemoryAuditService,
    },
  ],
  exports: [AUDIT_SERVICE_PORT],
})
