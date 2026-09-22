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

@Module({
  providers: [
    PrismaUserRepository,
    {
      provide: USER_REPOSITORY_PORT,
      useExisting: PrismaUserRepository,
    },
  ],
  exports: [USER_REPOSITORY_PORT],
})
export class PrismaPersistenceModule {}
