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
import { AdminTenancyController } from './infrastructure/http/admin-tenancy.controller.js';
import { TENANCY_USE_CASES, TenancyUseCases } from './application/tenancy.use-cases.js';
import { PrismaAdminTenancyRepository } from './infrastructure/persistence/prisma-admin-tenancy.repository.js';
import { ADMIN_TENANCY_REPOSITORY_PORT } from './domain/ports/admin-tenancy-repository.port.js';
import { PrismaPersistenceModule } from '../users/infrastructure/prisma-persistence.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module.js';
import { FeatureFlagsModule } from '../feature-flags/feature-flags.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';

@Module({
  // pt-BR: `PrismaPersistenceModule` é quem PROVE `TENANT_ONBOARDING_PORT`,
  // `TENANT_MEMBERSHIP_REPOSITORY_PORT` e `USER_REPOSITORY_PORT` — os que
  // `TenancyUseCases` consome. `AuthModule` e `PrismaModule` entram pelo mesmo
  // motivo de `ProfilesModule`: `JwtAuthGuard` e `PrismaService` não existem no
  // grafo sem eles.
  //
  // pt-BR (visão de admin, 2026-10-22): `ProfilesModule` entra porque o
  // `AdminTenancyController` usa o `PermissionsGuard`, e ele injeta
  // `UserProfileUseCases` — que o `ProfilesModule` prove. É o mesmo motivo
  // que o `FeatureFlagsModule` já documenta, e a mesma aresta (module → module),
  // sem ciclo: o `ProfilesModule` não importa o `TenancyModule`.
  imports: [AuthModule, PrismaPersistenceModule, PrismaModule, FeatureFlagsModule, ProfilesModule],
  controllers: [TenancyInvitationsController, TenancyEmpresasController, AdminTenancyController],
  providers: [
    { provide: TENANCY_USE_CASES, useClass: TenancyUseCases },
    // ⚠️ pt-BR (2026-10-29): o binding do INVENTÁRIO mora AQUI, e não no
    // `PrismaPersistenceModule`. Aquele módulo é importado por `AuthModule`,
    // `UsersModule`, `ProfilesModule` e `FeatureFlagsModule` — e o que ele
    // entregava era a leitura que ATRAVESSA empresas (o bucket de SISTEMA
    // aberto, com nome e e-mail de TODAS as contas). O único portão era D2, na
    // camada de aplicação, dois níveis acima: qualquer BC que importasse
    // `PrismaPersistenceModule` podia injetar a porta e chamar a leitura
    // direto, sem passar por nenhum portão.
    //
    // Aqui o portão fica a UMA camada: o `TenancyModule` é o único que tem o
    // token, e o único consumidor é a `TenancyUseCases` — a mesma classe que
    // exige D2.
    PrismaAdminTenancyRepository,
    {
      provide: ADMIN_TENANCY_REPOSITORY_PORT,
      useExisting: PrismaAdminTenancyRepository,
    },
  ],
  exports: [TENANCY_USE_CASES],
})
export class TenancyModule {}
