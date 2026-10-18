// apps/api/src/modules/feature-flags/feature-flags.module.ts
//
// pt-BR (feature-flags, 2026-10-18): módulo do BC Feature Flags.
//
// Registra o controller de admin, a use case e a porta; EXPORTA A PORTA (e não
// a use case) porque quem consome é o GUARD de `convidar`, no BC Tenancy — o
// ator do convite é o dono de uma empresa, e a use case exige admin do sistema
// (D2). Passar pela use case barraria todo mundo (decisão D13).

import { Module } from '@nestjs/common';
import { AdminFeatureFlagsController } from './infrastructure/http/admin-feature-flags.controller.js';
import { FeatureFlagUseCases } from './application/feature-flag.use-cases.js';
import { FEATURE_FLAG_REPOSITORY_PORT } from './domain/ports/feature-flag-repository.port.js';
import { PrismaFeatureFlagRepository } from './infrastructure/persistence/prisma-feature-flag.repository.js';
import { AuthModule } from '../auth/auth.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';
import { PrismaPersistenceModule } from '../users/infrastructure/prisma-persistence.module.js';
import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module.js';

@Module({
  imports: [
    AuthModule,
    // `PermissionsGuard` injeta `UserProfileUseCases`, que o `ProfilesModule`
    // prove e exporta. `AuthModule` exporta o `JwtAuthGuard` e o cache, mas
    // NÃO as use cases de profile — sem esta aresta o guard não resolve.
    ProfilesModule,
    // MEDIDO 2026-10-18 (Fase 3, `feature-flags.module.spec.ts`): `@UseGuards(
    // JwtAuthGuard)` faz o Nest INSTANCIAR o guard no contexto do módulo do
    // controller — não reaproveitar o do `AuthModule`. E o `JwtAuthGuard`
    // injeta `TenantMembershipRepositoryPort`, que o `AuthModule` importa mas
    // NÃO re-exporta. Sem esta linha o boot morre com
    // `Nest can't resolve dependencies of the JwtAuthGuard (...)` — é o mesmo
    // motivo pelo qual o `ProfilesModule` importa o `PrismaPersistenceModule`.
    PrismaPersistenceModule,
    PrismaModule,
  ],
  controllers: [AdminFeatureFlagsController],
  providers: [
    // `JwtAuthGuard` e `PermissionsGuard` NÃO são providers aqui. MEDIDO
    // 2026-10-18 (Fase 3): declará-los localmente é desnecessário — tirando o
    // `PermissionsGuard` dos `providers`, o módulo continua compilando e as 6
    // asserções de `feature-flags.module.spec.ts` seguem verdes, porque o Nest
    // resolve o guard de `@UseGuards` pelos `injectables` de QUALQUER módulo do
    // container, e o `ProfilesModule` já o registra. Isto CORRIGE a D17 do plano
    // v1.3.0, que afirmava o oposto com base numa medição que esta fase refez.
    // O que o módulo precisa é das ARESTAS (acima), não dos providers.
    { provide: FEATURE_FLAG_REPOSITORY_PORT, useClass: PrismaFeatureFlagRepository },
    FeatureFlagUseCases,
  ],
  // Só a PORTA. A use case é interna deste módulo — quem precisa de flag fora
  // dele (o guard do Tenancy) lê a porta, e não a regra de admin.
  exports: [FEATURE_FLAG_REPOSITORY_PORT],
})
export class FeatureFlagsModule {}
