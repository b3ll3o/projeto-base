/**
 * InMemoryPersistenceModule — binding InMemory do UserRepositoryPort.
 *
 * Usado em testes unitários e no dev inicial (Fase 4-5). Será substituído
 * por PrismaPersistenceModule na Fase 6 (mesma interface `USER_REPOSITORY_PORT`,
 * implementação Prisma real).
 *
 * pt-BR: este módulo NÃO é global — quem precisar do InMemory binding
 * importa explicitamente (em testes, no main.ts em modo dev, etc.).
 */
import { Module } from '@nestjs/common';
import { InMemoryUserRepository } from './persistence/in-memory-user.repository.js';
import { USER_REPOSITORY_PORT } from '../domain/ports/user-repository.port.js';

@Module({
  providers: [
    InMemoryUserRepository,
    {
      provide: USER_REPOSITORY_PORT,
      useExisting: InMemoryUserRepository,
    },
  ],
  exports: [USER_REPOSITORY_PORT],
})
export class InMemoryPersistenceModule {}
