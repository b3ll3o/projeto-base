/**
 * UsersModule — bounded context de Users.
 *
 * Composição (DDD/Hexagonal):
 *  - domain/ (User aggregate, VOs, events, exceptions, ports)
 *  - application/ (UserUseCases + DTOs + application exceptions)
 *  - infrastructure/persistence/ (InMemoryUserRepository)
 *
 * DI bindings atuais (Fase 5):
 *  - USER_REPOSITORY_PORT → InMemoryUserRepository (InMemoryPersistenceModule)
 *  - AUDIT_SERVICE_PORT → InMemoryAuditService (AuditInfraModule — já wired na Fase 3)
 *
 * pt-BR: o `UserUseCases` é instanciado uma vez pelo container e exportado.
 * Os controllers HTTP (Fase 7) o consomem via `@Inject(USER_USE_CASES)` ou
 * via nome da classe.
 */
import { Module } from '@nestjs/common';
import { UserUseCases, USER_USE_CASES } from './application/user-use-cases.js';
import { InMemoryPersistenceModule } from './infrastructure/in-memory-persistence.module.js';
import { AuditInfraModule } from '../../shared/audit/audit-infra.module.js';

@Module({
  imports: [InMemoryPersistenceModule, AuditInfraModule],
  providers: [
    {
      provide: USER_USE_CASES,
      useClass: UserUseCases,
    },
  ],
  exports: [USER_USE_CASES],
})
export class UsersModule {}
