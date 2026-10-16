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
import { UserProfileCacheService } from '../../shared/infrastructure/security/user-profile-cache.service.js';
import { AdminProfilesController } from './infrastructure/http/admin-profiles.controller.js';
import { AdminAuthorizationsController } from './infrastructure/http/admin-authorizations.controller.js';
import { MeProfileController } from './infrastructure/http/me-profile.controller.js';
import { AdminUsersController } from './infrastructure/http/admin-users.controller.js';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service.js';
import { PermissionsGuard } from './infrastructure/http/guards/permissions.guard.js';
import {
  PROFILE_REPOSITORY_PORT,
  type ProfileRepositoryPort,
} from './domain/ports/profile-repository.port.js';
import {
  AUTHORIZATION_REPOSITORY_PORT,
  type AuthorizationRepositoryPort,
} from './domain/ports/authorization-repository.port.js';

@Module({
  providers: [
    PrismaService,
    { provide: PROFILE_REPOSITORY_PORT, useClass: PrismaProfileRepository },
    { provide: AUTHORIZATION_REPOSITORY_PORT, useClass: PrismaAuthorizationRepository },
    UserProfileCacheService,
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
    UserProfileCacheService,
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
