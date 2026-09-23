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

import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service.js';

@Controller({ path: 'health', version: '1' })
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
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
