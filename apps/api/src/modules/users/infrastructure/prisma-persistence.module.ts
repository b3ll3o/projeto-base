/**
 * PrismaPersistenceModule — binding Prisma do UserRepositoryPort (Fase 6).
 *
 * pt-BR: substitui InMemoryPersistenceModule em produção. Mesma interface
 * (`USER_REPOSITORY_PORT`), implementação Prisma real. Requer
 * `PrismaModule` no import graph (já é `@Global()`, então auto-injetado).
 */
import { Module } from '@nestjs/common';
import { PrismaUserRepository } from './persistence/prisma-user.repository.js';
import { USER_REPOSITORY_PORT } from '../domain/ports/user-repository.port.js';
import { PrismaTenantMembershipRepository } from '../../tenancy/infrastructure/persistence/prisma-tenant-membership.repository.js';
import { TENANT_MEMBERSHIP_REPOSITORY_PORT } from '../../tenancy/domain/ports/tenant-membership-repository.port.js';
import { PrismaTenantOnboardingRepository } from '../../tenancy/infrastructure/persistence/prisma-tenant-onboarding.repository.js';
import { TENANT_ONBOARDING_PORT } from '../../tenancy/domain/ports/tenant-onboarding.port.js';

@Module({
  providers: [
    PrismaUserRepository,
    {
      provide: USER_REPOSITORY_PORT,
      useExisting: PrismaUserRepository,
    },
    // pt-BR (Fase 4 — tenancy): mora AQUI, e não no `ProfilesModule`, porque
    // este módulo é o que o resto da aplicação importa para ter Prisma ligado
    // a um repositório. Um binding novo em `ProfilesModule` seria invisível
    // para qualquer BC que não importasse Profiles.
    PrismaTenantMembershipRepository,
    {
      provide: TENANT_MEMBERSHIP_REPOSITORY_PORT,
      useExisting: PrismaTenantMembershipRepository,
    },
    // pt-BR (Fase 5): o binding mora aqui pelo mesmo motivo do de cima — este
    // é o módulo que o resto da aplicação importa para ter Prisma ligado a um
    // repositório.
    PrismaTenantOnboardingRepository,
    {
      provide: TENANT_ONBOARDING_PORT,
      useExisting: PrismaTenantOnboardingRepository,
    },
  ],
  exports: [USER_REPOSITORY_PORT, TENANT_MEMBERSHIP_REPOSITORY_PORT, TENANT_ONBOARDING_PORT],
})
export class PrismaPersistenceModule {}
