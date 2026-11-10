import { Module } from '@nestjs/common';
import { IDEMPOTENCY_PORT } from './shared/idempotency.tokens.js';
import { PrismaIdempotencyService } from './infrastructure/prisma-idempotency.service.js';

/**
 * Módulo de infraestrutura da idempotência de escrita.
 *
 * pt-BR (2026-11-10 — conformidade do system design): o binding do port
 * `IDEMPOTENCY_PORT` para o adapter Prisma.
 *
 * O interceptor (`infrastructure/http/idempotency.interceptor.ts`) é
 * registrado como `APP_INTERCEPTOR` no `AppModule` — e é ele que resolve o
 * port por este módulo.
 */
@Module({
  providers: [
    {
      provide: IDEMPOTENCY_PORT,
      useClass: PrismaIdempotencyService,
    },
  ],
  exports: [IDEMPOTENCY_PORT],
})
export class IdempotencyInfraModule {}
