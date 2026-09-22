# Fase 7 — User Infra HTTP (Parte 2/3)

> **Continuação** da Fase 7. Veja o índice completo em:
> [](./2026-09-21-cadastro-usuario-com-auditoria-fase-07-user-infra-http.md)
>
> Esta é a parte 2 de 3 da Fase 7. Pule para a próxima parte ao final.

---

@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(
    @Inject(CreateUserUseCase) private readonly createUser: CreateUserUseCase,
    @Inject(UpdateUserUseCase) private readonly updateUser: UpdateUserUseCase,
    @Inject(GetUserUseCase) private readonly getUser: GetUserUseCase,
    @Inject(ListUsersUseCase) private readonly listUsers: ListUsersUseCase,
    @Inject(SoftDeleteUserUseCase) private readonly softDeleteUser: SoftDeleteUserUseCase,
    @Inject(RestoreUserUseCase) private readonly restoreUser: RestoreUserUseCase,
    @Inject(GetUserHistoryUseCase) private readonly getHistory: GetUserHistoryUseCase,
  ) {}

  private buildContext(actorId: string | null, correlationId: string): AuditContext {
    return new AuditContext({
      actorId,
      correlationId,
      source: 'http',
      timestamp: new Date(),
    });
  }

  @Post()
  @ApiOperation({ summary: 'Criar novo usuário' })
  @ApiResponse({ status: 201, description: 'User criado' })
  @ApiResponse({ status: 409, description: 'Email já em uso' })
  async create(
    @Body(new ZodValidationPipe(CreateUserSchema)) body: CreateUserDto,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('authorization') authHeader?: string,
  ): Promise<unknown> {
    const ctx = this.buildContext(this.extractActor(authHeader), this.correlationId());
    const user = await this.createUser.execute(body, ctx);
    reply.header('ETag', `W/"v${user.version}"`);
    reply.status(201);
    return user;
  }

  @Get()
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async list(
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '20',
  ): Promise<unknown> {
    return this.listUsers.execute({
      cursor,
      limit: Number(limit),
    });
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<unknown> {
    return this.getUser.execute({ id });
  }

  @Patch(':id')
  @ApiHeader({ name: 'If-Match', required: true, description: 'Versão esperada para optimistic locking' })
  async update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateUserSchema)) body: UpdateUserDto,
    @Headers('if-match') ifMatch: string,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('authorization') authHeader?: string,
  ): Promise<unknown> {
    const expectedVersion = this.parseIfMatch(ifMatch);
    const ctx = this.buildContext(this.extractActor(authHeader), this.correlationId());
    const updated = await this.updateUser.execute({ id, expectedVersion, ...body }, ctx);
    reply.header('ETag', `W/"v${updated.version}"`);
    return updated;
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiHeader({ name: 'If-Match', required: true })
  async remove(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('authorization') authHeader?: string,
  ): Promise<void> {
    const expectedVersion = this.parseIfMatch(ifMatch);
    const ctx = this.buildContext(this.extractActor(authHeader), this.correlationId());
    await this.softDeleteUser.execute({ id, expectedVersion }, ctx);
    return;
  }

  @Post(':id/restore')
  async restore(
    @Param('id') id: string,
    @Headers('if-match') ifMatch: string,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Headers('authorization') authHeader?: string,
  ): Promise<unknown> {
    const expectedVersion = this.parseIfMatch(ifMatch);
    const ctx = this.buildContext(this.extractActor(authHeader), this.correlationId());
    const restored = await this.restoreUser.execute({ id, expectedVersion }, ctx);
    reply.header('ETag', `W/"v${restored.version}"`);
    return restored;
  }

  @Get(':id/history')
  async history(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '20',
  ): Promise<unknown> {
    return this.getHistory.execute({
      entityId: id,
      cursor,
      limit: Number(limit),
    });
  }

  private parseIfMatch(raw: string | undefined): number {
    if (!raw) {
      throw new Error('Header If-Match ausente');
    }
    const m = /^W\/"v(\d+)"$/i.exec(raw.trim());
    if (!m) {
      throw new Error('Header If-Match inválido (esperado W/"v<n>")');
    }
    return Number(m[1]);
  }

  private extractActor(authHeader: string | undefined): string | null {
    if (!authHeader) return null;
    const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    return m ? m[1] : null; // Fase 8 substituirá por JWT real
  }

  private correlationId(): string {
    return Math.random().toString(36).slice(2); // Fase 8 usará trace-id real
  }
}
```

- [ ] **Step 2: Teste unitário (mock use cases)**

```typescript
// apps/api/src/modules/users/infrastructure/http/users.controller.spec.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UsersController } from './users.controller.js';

describe('UsersController.parseIfMatch', () => {
  let ctrl: UsersController;
  beforeEach(() => {
    ctrl = new UsersController(
      {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );
  });

  it('aceita W/"v3"', () => {
    expect(ctrl['parseIfMatch']('W/"v3"')).toBe(3);
  });
  it('rejeita versão ausente', () => {
    expect(() => ctrl['parseIfMatch'](undefined)).toThrow(/ausente/);
  });
  it('rejeita formato inválido', () => {
    expect(() => ctrl['parseIfMatch']('3')).toThrow(/inválido/);
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/users/infrastructure/http/users.controller.ts apps/api/src/modules/users/infrastructure/http/users.controller.spec.ts
git commit -m "feat(users-http): add UsersController with optimistic locking via If-Match

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 7.4: Validar body de input — DTOs já validados

- [ ] **Step 1: Validar Zod schemas em uso**

```bash
grep -r "ZodValidationPipe" apps/api/src --include="*.ts"
```

Expected: aparece em `users.controller.ts`.

- [ ] **Step 2: Confirmar erros viram 400**

```bash
# Será validado no e2e (Fase 9)
echo "OK — será validado em Fase 9"
```

---

## Task 7.5: Registrar controller no UsersModule

**Files:**
- Modify: `apps/api/src/modules/users/users.module.ts`

- [ ] **Step 1: Adicionar controller**

```typescript
// adicionar no array controllers
import { UsersController } from './infrastructure/http/users.controller.js';

@Module({
  // ...
  controllers: [UsersController],
  // ...
})
export class UsersModule {}
```

- [ ] **Step 2: Rodar typecheck + commit**

```bash
pnpm --filter @projeto/api typecheck 2>&1 | tail -10
git add apps/api/src/modules/users/users.module.ts
git commit -m "feat(users): wire UsersController into module

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

---

## Task 7.6: OpenAPI gerado + commit

**Files:**
- Create: `apps/api/scripts/export-openapi.ts`

- [ ] **Step 1: Criar script de export**

```typescript
// apps/api/scripts/export-openapi.ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

async function exportOpenApi(): Promise<void> {
  const adapter = new FastifyAdapter({ logger: false });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    logger: false,
  });
  const config = new DocumentBuilder()
    .setTitle('Projeto Base API')
    .setDescription('API do projeto base — DDD + Hexagonal + Audit')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  const outputPath = './apps/api/openapi.json';
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(document, null, 2));
  await app.close();
  console.log(`✓ OpenAPI exportado: ${outputPath}`);
}

exportOpenApi().catch((err) => {
  console.error('Falha ao exportar OpenAPI:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Adicionar script**

```json
