/**
 * UsersModule — bounded context de Users.
 *
 * Composição (DDD/Hexagonal):
 *  - domain/ (User aggregate, VOs, events, exceptions, ports)
 *  - application/ (UserUseCases + DTOs + application exceptions)
 *  - infrastructure/persistence/ (PrismaUserRepository — Fase 6; InMemoryUserRepository
 *    preservado para testes unitários que ainda o importam diretamente)
 *
 * DI bindings atuais (Fase 6):
 *  - USER_REPOSITORY_PORT → PrismaUserRepository (PrismaPersistenceModule)
 *  - AUDIT_SERVICE_PORT → PrismaAuditService (AuditInfraModule)
 *
 * pt-BR: o `UserUseCases` é instanciado uma vez pelo container e exportado.
 * Os controllers HTTP (Fase 7) o consomem via `@Inject(USER_USE_CASES)` ou
 * via nome da classe.
 */
import { Module } from '@nestjs/common';
import { UserUseCases, USER_USE_CASES } from './application/user-use-cases.js';
import { PrismaPersistenceModule } from './infrastructure/prisma-persistence.module.js';
import { AuditInfraModule } from '../../shared/audit/audit-infra.module.js';

@Module({
  imports: [PrismaPersistenceModule, AuditInfraModule],
  providers: [
    {
      provide: USER_USE_CASES,
      useClass: UserUseCases,
    },
  ],
  exports: [USER_USE_CASES],
})
export class UsersModule {}
