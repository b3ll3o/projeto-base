// apps/api/src/modules/tenancy/tenancy.module.ts
//
// pt-BR (Fase 5 — tenancy, 2026-10-16): módulo do BC Tenancy.
//
// Registra o controller de convites e exporta `TENANCY_USE_CASES`, que o
// `UsersModule` injeta para entregar o `destino` de `POST /users` ao mesmo
// lugar que trata o aceite. Exportar o TOKEN — e não a classe — é o que
// mantém a aresta de runtime em um sentido só: `tenancy.use-cases.ts`
// importa VOs de `users/domain`, e `users/application` importando a classe
// aqui viraria ciclo de arquivos no build.

import { Module } from '@nestjs/common';
import { TenancyInvitationsController } from './infrastructure/http/tenancy-invitations.controller.js';
import { TenancyEmpresasController } from './infrastructure/http/tenancy-empresas.controller.js';
import { TENANCY_USE_CASES, TenancyUseCases } from './application/tenancy.use-cases.js';
import { PrismaPersistenceModule } from '../users/infrastructure/prisma-persistence.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module.js';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module.js';

@Module({
  // pt-BR: `PrismaPersistenceModule` é quem PROVE `TENANT_ONBOARDING_PORT`,
  // `TENANT_MEMBERSHIP_REPOSITORY_PORT` e `USER_REPOSITORY_PORT` — os três
  // que `TenancyUseCases` consome. `AuthModule` e `PrismaModule` entram pelo
  // mesmo motivo de `ProfilesModule`: `JwtAuthGuard` e `PrismaService` não
  // existem no grafo sem eles.
  imports: [AuthModule, PrismaPersistenceModule, PrismaModule, FeatureFlagsModule],
  controllers: [TenancyInvitationsController, TenancyEmpresasController],
  providers: [{ provide: TENANCY_USE_CASES, useClass: TenancyUseCases }],
  exports: [TENANCY_USE_CASES],
})
export class TenancyModule {}
