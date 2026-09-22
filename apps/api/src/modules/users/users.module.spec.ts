import { describe, it, expect } from 'vitest';
import { Test } from '@nestjs/testing';
import { UsersModule } from './users.module.js';
import { UserUseCases, USER_USE_CASES } from './application/user-use-cases.js';
import { USER_REPOSITORY_PORT } from './domain/ports/user-repository.port.js';
import { InMemoryUserRepository } from './infrastructure/persistence/in-memory-user.repository.js';
import { AUDIT_SERVICE_PORT } from '../../shared/audit/shared/audit.tokens.js';
import { InMemoryAuditService } from '../../shared/audit/application/in-memory-audit-service.js';

describe('UsersModule (DI wiring)', () => {
  it('compila e resolve o grafo de DI', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [UsersModule],
    }).compile();

    expect(moduleRef.get(USER_USE_CASES)).toBeInstanceOf(UserUseCases);

    const useCases = moduleRef.get<UserUseCases>(USER_USE_CASES);
    expect(useCases).toBeDefined();

    await moduleRef.close();
  });

  it('USER_REPOSITORY_PORT resolve para InMemoryUserRepository', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [UsersModule],
    }).compile();

    const repo = moduleRef.get(USER_REPOSITORY_PORT);
    expect(repo).toBeInstanceOf(InMemoryUserRepository);

    await moduleRef.close();
  });

  it('AUDIT_SERVICE_PORT resolve para InMemoryAuditService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [UsersModule],
    }).compile();

    const audit = moduleRef.get(AUDIT_SERVICE_PORT);
    expect(audit).toBeInstanceOf(InMemoryAuditService);

    await moduleRef.close();
  });
});
