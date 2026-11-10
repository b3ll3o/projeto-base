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
import { Throttle } from '@nestjs/throttler';
import { ApiOperation } from '@nestjs/swagger';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service.js';
/**
 * O teto da rota de health, por IP, na janela de 60 s.
 *
 * ⚠️ A rota tem o SEU teto, e não o global (100/min). A razão é o probe:
 * o `HEALTHCHECK` do container roda a cada 10 s (6/min), e o harness de e2e
 * do web faz poll de `/api/v1/health` a cada **200 ms** — 5 req/s, ou 300/min
 * na pior rajada (o harness desiste aos 45 s: 225 requests). Com o teto
 * global, essa rajada estourava o balde e o probe levava 429 — e um
 * healthcheck que falha derruba o container (`depends_on: service_healthy`).
 *
 * O teto próprio (600/min) é 100× o probe do container e 2,6× a pior rajada
 * do harness — e, ao mesmo tempo, CONTINUA sendo um teto: a rota é pública
 * e faz `SELECT 1` no banco a cada chamada, e uma rota sem teto é um vetor
 * de pressão sobre o pool (que `operacao.md` §7 aponta como o limite de
 * escala da API).
 */
export const LIMITE_DE_HEALTH_POR_MINUTO = 600;

/** A janela do teto da rota de health, em ms. */
export const JANELA_DE_HEALTH_MS = 60_000;

// pt-BR (2026-11-10 — conformidade do system design): a rota de health tem
// teto PRÓPRIO (ver `LIMITE_DE_HEALTH_POR_MINUTO`), e não o global.
//
// MEDIDO 2026-11-10: `curl -i http://localhost:3000/api/v1/health` devolvia
// **429** `TOO_MANY_REQUESTS` (com `retry-after`), porque o `ThrottlerGuard`
// é global (`APP_GUARD`) e nada isentava a rota.
//
// O spec que prova isto é `test/e2e/scenarios/16-health-sem-rate-limit.e2e.spec.ts`.
@Throttle({ default: { limit: LIMITE_DE_HEALTH_POR_MINUTO, ttl: JANELA_DE_HEALTH_MS } })
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
