// apps/api/src/modules/health/health.controller.spec.ts
//
// pt-BR: spec unitária do HealthController — verifica o contrato do
// endpoint /api/v1/health (DB check via $queryRawUnsafe('SELECT 1')).
// RED → GREEN: escrita ANTES do controller (Task 17 da Fase 3b).

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import type { PrismaService } from '../../shared/infrastructure/prisma/prisma.service.js';

describe('HealthController', () => {
  let controller: HealthController;
  let $queryRawUnsafe: Mock;

  beforeEach(() => {
    // pt-BR: stub tipado do PrismaService — só o método usado pelo
    // controller. Injeção direta (sem Test.createTestingModule)
    // porque o controller não tem dependências adicionais e o
    // pattern já é usado em users.controller.spec.ts.
    $queryRawUnsafe = vi.fn();
    controller = new HealthController({ $queryRawUnsafe } as unknown as PrismaService);
  });

  it('GET /health retorna 200 status=ok quando DB up', async () => {
    $queryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);
    const result = await controller.check();
    expect(result.status).toBe('ok');
    expect(result.checks.database).toBe('ok');
    expect(result.timestamp).toBeDefined();
    expect($queryRawUnsafe).toHaveBeenCalledWith('SELECT 1');
  });

  it('GET /health retorna 503 quando DB down', async () => {
    $queryRawUnsafe.mockRejectedValue(new Error('connection refused'));
    await expect(controller.check()).rejects.toThrow(ServiceUnavailableException);
    try {
      await controller.check();
    } catch (err) {
      expect((err as ServiceUnavailableException).getResponse()).toEqual({
        status: 'degraded',
        checks: { database: 'down' },
      });
    }
  });
});
