// apps/api/src/modules/health/health.controller.ts
//
// pt-BR: endpoint de healthcheck consumido pelo HEALTHCHECK do
// `apps/api/Dockerfile` (Fase 3b — Task 17). Rota: GET /api/v1/health.
//
// Comportamento:
//  - DB up → 200 { status: 'ok', checks: { database: 'ok' }, timestamp }
//  - DB down → 503 { status: 'degraded', checks: { database: 'down' } }
//    (lançado como ServiceUnavailableException — NestJS converte para
//    503 no boundary HTTP.)
//
// `@Controller({ path: 'health', version: '1' })` casa com
// `app.setGlobalPrefix('api/v1')` no main.ts → URL final `/api/v1/health`.
// `version: '1'` é exigência do FastifyAdapter para VERSIONING.

import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service.js';

// pt-BR (2026-11-10 — conformidade do system design): a rota de health é
// ISENTA do rate limit global.
//
// MEDIDO 2026-11-10: `curl -i http://localhost:3000/api/v1/health` devolvia
// **429** `TOO_MANY_REQUESTS` (com `retry-after`), porque o `ThrottlerGuard`
// é global (`APP_GUARD`) e nada isentava a rota. O `Dockerfile` roda o
// HEALTHCHECK a cada 10 s e o compose usa `depends_on: service_healthy` — um
// probe que recebe 429 derruba o container, e o que depende dele junto.
//
// ⚠️ A isenção é do CONTROLLER, e não do método: a rota é uma só, e o
// decorator no controller cobre qualquer rota que ele ganhe depois — sem
// que ninguém se lembre de repetir a isenção.
//
// O spec que prova isto é `test/e2e/scenarios/16-health-sem-rate-limit.e2e.spec.ts`
// (101 requisições seguidas → todas 200).
@SkipThrottle()
@Controller({ path: 'health', version: '1' })
export class HealthController {
  // pt-BR: `@Inject` explícito é OBRIGATÓRIO aqui, não redundância.
  // `dev` roda com `tsx` (esbuild), que NÃO emite `design:paramtypes`
  // mesmo com `emitDecoratorMetadata: true` no tsconfig — sem `@Inject`,
  // o Nest resolve `prisma` como `undefined` e o healthcheck cai em
  // `catch` → 503 com o banco no ar. O build (`tsc`) emite metadata, então
  // o defeito só aparece em dev. Mesmo idioma do resto do repo
  // (ver `prisma-audit.service.ts`).
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Verificar a saúde da API e do banco' })
  async check(): Promise<{
    status: 'ok' | 'degraded';
    checks: { database: 'ok' | 'down' };
    timestamp?: string;
  }> {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return {
        status: 'ok',
        checks: { database: 'ok' },
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        status: 'degraded',
        checks: { database: 'down' },
      });
    }
  }
}
