/**
 * UsersModule — bounded context de Users.
 *
 * Composição (DDD/Hexagonal):
 *  - domain/ (User aggregate, VOs, events, exceptions, ports)
 *  - application/ (UserUseCases + DTOs + application exceptions)
 *  - infrastructure/http/ (UsersController — Fase 7 Task 7.5)
 *  - infrastructure/persistence/ (PrismaUserRepository — Fase 6; InMemoryUserRepository
 *    preservado para testes unitários que ainda o importam diretamente)
 *
 * DI bindings atuais (Fase 6 + 7):
 *  - USER_REPOSITORY_PORT → PrismaUserRepository (PrismaPersistenceModule)
 *  - AUDIT_SERVICE_PORT → PrismaAuditService (AuditInfraModule)
 *
 * pt-BR: o `UserUseCases` é instanciado uma vez pelo container e exportado.
 * O `UsersController` (Fase 7) é registrado no array `controllers` e o
 * consome via `@Inject(USER_USE_CASES)` + `@Inject(AUDIT_SERVICE_PORT)`.
 */
import { Module } from '@nestjs/common';
import { UserUseCases, USER_USE_CASES } from './application/user-use-cases.js';
import { PrismaPersistenceModule } from './infrastructure/prisma-persistence.module.js';
import { AuditInfraModule } from '../../shared/audit/audit-infra.module.js';
import { UsersController } from './infrastructure/http/users.controller.js';
import { JwtAuthGuard } from '../auth/infrastructure/http/jwt-auth.guard.js';
import { AuthModule } from '../auth/auth.module.js';
import { TenancyModule } from '../tenancy/tenancy.module.js';
import { ProfilesModule } from '../profiles/profiles.module.js';

@Module({
  // pt-BR: `AuthModule` entra na lista de imports (e não só o guard) porque
  // o `JwtAuthGuard` depende de `TOKEN_ISSUER_PORT`, que é provider do
  // `AuthModule`. Trazer só a classe do guard para `providers` resolveria
  // o guard e deixaria `TOKEN_ISSUER_PORT` indefinido — o mesmo modo de
  // falha do `@Inject` faltando, um nível acima.
  //
  // `ProfilesModule` entra pelo MESMO motivo, e o `@UseGuards(PermissionsGuard)`
  // em `GET /users` é que precisa dele. O `PermissionsGuard` hidrata
  // `req.user.permissions` a partir de `UserProfileUseCases`, provider do
  // `ProfilesModule`. MEDIDO sem esta linha: o boot morre com "Nest can't
  // resolve dependencies of the PermissionsGuard (Reflector, ?)", porque
  // `tsx`/esbuild não emite a metadata de DI sem `@Inject` explícito — a mesma
  // armadilha que o `JwtAuthGuard` já documenta acima.
  //
  // Sem ciclo: `ProfilesModule` importa `PrismaPersistenceModule`, que vive
  // dentro de `users/` mas é um módulo próprio — ele não importa `UsersModule`.
  imports: [PrismaPersistenceModule, AuditInfraModule, AuthModule, TenancyModule, ProfilesModule],
  controllers: [UsersController],
  providers: [
    {
      provide: USER_USE_CASES,
      useClass: UserUseCases,
    },
    // Declarado localmente para que `@UseGuards(JwtAuthGuard)` no
    // controller resolva a CLASSE (que é o token que o decorator usa),
    // independentemente de o `AuthModule` exportá-la pelo nome do slot.
    JwtAuthGuard,
    // pt-BR (#97): `UserProfileCacheService` saiu daqui. Redeclarar o
    // provider criava uma TERCEIRA instância do cache que ninguém consome
    // — e o comentário afirmava "mesma instância", o que é falso: provider
    // não é singleton, cada `providers: [X]` instancia. O AuthModule é o
    // dono e o exporta (importado aqui na linha 34).
  ],
  exports: [USER_USE_CASES],
})
export class UsersModule {}
