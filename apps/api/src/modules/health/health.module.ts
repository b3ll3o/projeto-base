// apps/api/src/modules/health/health.module.ts
//
// pt-BR: módulo do endpoint /api/v1/health consumido pelo HEALTHCHECK
// do `apps/api/Dockerfile` (Fase 3b — Task 17).
//
// Composição:
//  - controllers: HealthController (checa DB via PrismaService)
//  - imports: PrismaModule (módulo `@Global()` — PrismaService já está
//    disponível em todo o AppModule, mas listar explicitamente aqui
//    documenta a dependência e permite testes de DI isolados.)

import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [HealthController],
})
export class HealthModule {}
