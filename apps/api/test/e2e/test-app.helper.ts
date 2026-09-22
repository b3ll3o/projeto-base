// apps/api/test/e2e/test-app.helper.ts
//
// Helper para testes E2E ponta-a-ponta do UsersController (Fase 9 Task 9.1).
//
// Centraliza o bootstrap:
//  - Sobe container PostgreSQL real via Testcontainers.
//  - Compila AppModule inteiro (controllers + Prisma + Audit + Users).
//  - Aplica o mesmo wiring de main.ts (global prefix 'api/v1' +
//    GlobalExceptionFilter + ZodValidationPipe).
//  - Expõe `{ app, ctx }` para `app.inject(...)` (Fastify adapter test API).
//
// pt-BR:
//  - Replica EXATAMENTE o inline setup de users.e2e.spec.ts para garantir
//    paridade entre suites — qualquer mudança no wiring de produção deve
//    ser refletida aqui também.
//  - `cleanE2EDatabase(ctx)` deve ser chamado em `beforeEach` se o spec
//    usar múltiplos `it()` com dados conflitantes; cenário 01 não precisa
//    porque roda tudo num único `it()` sequencial.

import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { z } from 'zod';
import { setupTestDatabase, cleanDatabase, type TestContext } from '../testcontainers-helper.js';
import { AppModule } from '../../src/app.module.js';
import { GlobalExceptionFilter } from '../../src/shared/infrastructure/http/global-exception.filter.js';
import { ZodValidationPipe } from '../../src/shared/infrastructure/http/zod-validation.pipe.js';

export interface E2EContext {
  app: NestFastifyApplication;
  ctx: TestContext;
}

/**
 * Sobe container Postgres via Testcontainers, compila AppModule, aplica
 * wiring idêntico ao main.ts de produção e devolve `{ app, ctx }`.
 */
export async function bootstrapE2E(): Promise<E2EContext> {
  // pt-BR: container Postgres compartilhado via singleFork; setupTestDatabase
  // aplica migrations Prisma e injeta DATABASE_URL no process.env.
  const ctx = await setupTestDatabase();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

  // pt-BR: replica o wiring de main.ts (prefix + filter + pipe).
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(new ZodValidationPipe(z.any()));

  await app.init();
  return { app, ctx };
}

/**
 * Encerra o app Nest e o container Postgres. Idempotente quanto a ordem
 * (app.close primeiro para drenar conexões Prisma ativas).
 */
export async function teardownE2E({ app, ctx }: E2EContext): Promise<void> {
  await app.close();
  await ctx.stop();
}

/**
 * Trunca as tabelas do schema de users. Chame em `beforeEach` quando o
 * spec tiver múltiplos `it()` com dados conflitantes.
 */
export async function cleanE2EDatabase(ctx: TestContext): Promise<void> {
  await cleanDatabase(ctx.prisma);
}
