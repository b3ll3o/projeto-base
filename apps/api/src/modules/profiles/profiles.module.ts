// apps/api/src/modules/profiles/profiles.module.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): módulo do BC Profiles. Exporta
// os use cases para AuthModule (que precisa do UserProfileCacheService
// no login) e UsersModule (que precisa do UserProfileUseCases no
// atribuirProfile). Os controllers são registrados aqui e ficam
// disponíveis em /api/v1/admin/profiles e /api/v1/me.

import { Module } from '@nestjs/common';
import {
  ProfileUseCases,
  AuthorizationUseCases,
  UserProfileUseCases,
} from './application/profiles.use-cases.js';
import { PrismaProfileRepository } from './infrastructure/persistence/prisma-profile.repository.js';
import { PrismaAuthorizationRepository } from './infrastructure/persistence/prisma-authorization.repository.js';
import { AdminProfilesController } from './infrastructure/http/admin-profiles.controller.js';
import { AdminAuthorizationsController } from './infrastructure/http/admin-authorizations.controller.js';
import { MeProfileController } from './infrastructure/http/me-profile.controller.js';
import { AdminUsersController } from './infrastructure/http/admin-users.controller.js';
import { PermissionsGuard } from './infrastructure/http/guards/permissions.guard.js';
import {
  PROFILE_REPOSITORY_PORT,
  type ProfileRepositoryPort,
} from './domain/ports/profile-repository.port.js';
import {
  AUTHORIZATION_REPOSITORY_PORT,
  type AuthorizationRepositoryPort,
} from './domain/ports/authorization-repository.port.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaPersistenceModule } from '../users/infrastructure/prisma-persistence.module.js';
import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module.js';

@Module({
  // pt-BR (#97): `PrismaPersistenceModule` é o módulo que PROVE
  // `USER_REPOSITORY_PORT` — o `AuthModule` importa mas não re-exporta, e
  // sem a aresta o Nest nem acha o token. `PrismaModule` entra pelo mesmo
  // motivo do `AuthModule`: `PrismaService` só existe se o módulo global
  // for registrado no grafo.
  imports: [AuthModule, PrismaPersistenceModule, PrismaModule],
  providers: [
    // pt-BR (#97): `PrismaService` saiu daqui. Declarado localmente ele
    // virava um SEGUNDO PrismaClient (outro pool de conexões) porque
    // `PrismaModule` é `@Global()` e já entrega a instância singleton.
    { provide: PROFILE_REPOSITORY_PORT, useClass: PrismaProfileRepository },
    { provide: AUTHORIZATION_REPOSITORY_PORT, useClass: PrismaAuthorizationRepository },
    // pt-BR (#97): `UserProfileCacheService` NÃO é provider aqui. Declarado
    // localmente virava uma segunda instância: as use cases invalidavam um
    // Map e o `JwtAuthGuard` (instância do AuthModule) lia outro — revogar
    // permissão não surtia efeito até o TTL. O `AuthModule` (importado acima)
    // é o dono e o exporta.
    ProfileUseCases,
    AuthorizationUseCases,
    UserProfileUseCases,
    PermissionsGuard,
  ],
  controllers: [
    AdminProfilesController,
    AdminAuthorizationsController,
    AdminUsersController,
    MeProfileController,
  ],
  exports: [
    UserProfileUseCases,
    ProfileUseCases,
    AuthorizationUseCases,
    PROFILE_REPOSITORY_PORT,
    AUTHORIZATION_REPOSITORY_PORT,
  ],
})
export class ProfilesModule {}

/* re-exports consumidos por outros BCs */
export type { ProfileRepositoryPort, AuthorizationRepositoryPort };
