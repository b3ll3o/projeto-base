// apps/api/src/modules/users/infrastructure/persistence/prisma-user.repository.integration.spec.ts
//
// Testes de integração do PrismaUserRepository usando Testcontainers.
//
// - Sobe postgres:16-alpine no beforeAll (uma vez por arquivo via fork pool + singleFork)
// - Aplica migrations Prisma via `prisma migrate deploy`
// - Trunca tabelas entre testes (cleanDatabase)
// - Cobre o contrato do UserRepositoryPort: save (INSERT/UPDATE com optimistic
//   locking), findById, findByEmail, list (cursor + includeDeleted)
//
// pt-BR: o agregado é mutado ANTES do save() (renomear/marcarExcluido/restaurar)
// e o save recebe expectedVersion = version()-1, que é o estado pré-mutação.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  setupTestDatabase,
  cleanDatabase,
  type TestContext,
} from '../../../../../test/testcontainers-helper.js';
import { PrismaUserRepository } from './prisma-user.repository.js';
import { User } from '../../domain/user.aggregate.js';
import { UserId } from '../../domain/value-objects/user-id.vo.js';
import { Email } from '../../domain/value-objects/email.vo.js';
import { ConcurrencyException } from '../../domain/exceptions/user.exceptions.js';

describe('PrismaUserRepository (Testcontainers)', () => {
  let ctx: TestContext;
  let repo: PrismaUserRepository;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  beforeEach(async () => {
    await cleanDatabase(ctx.prisma);
    repo = new PrismaUserRepository(ctx.prisma);
  });

  it('save (INSERT) + findById round-trip preserva campos essenciais', async () => {
    const u = User.criar({
      nome: 'Ana',
      email: 'ana@example.com',
      agora: new Date('2026-09-21T10:00:00Z'),
    });
    const saved = await repo.save(u, 0);

    const got = await repo.findById(UserId.create(saved.id().value));
    expect(got).not.toBeNull();
    expect(got!.id().value).toBe(saved.id().value);
    expect(got!.email().value).toBe('ana@example.com');
    expect(got!.nome().value).toBe('Ana');
    expect(got!.version()).toBe(1);
    expect(got!.deletedAt()).toBeNull();
  });

  it('save (UPDATE) com expectedVersion correto persiste e incrementa versão', async () => {
    const u = User.criar({
      nome: 'Carla',
      email: 'carla@example.com',
      agora: new Date(),
    });
    await repo.save(u, 0);

    u.renomear('Carla Maria', new Date());
    const saved = await repo.save(u, u.version() - 1); // expectedVersion=1 (pré-mutação)
    expect(saved.nome().value).toBe('Carla Maria');
    expect(saved.version()).toBe(2);

    const refetched = await repo.findById(UserId.create(saved.id().value));
    expect(refetched!.nome().value).toBe('Carla Maria');
    expect(refetched!.version()).toBe(2);
  });

  it('save (UPDATE) lança ConcurrencyException quando expectedVersion está obsoleto', async () => {
    const u = User.criar({
      nome: 'Bob',
      email: 'bob@example.com',
      agora: new Date(),
    });
    await repo.save(u, 0);

    u.renomear('Bob Silva', new Date());
    // Esperado 999, mas a row está na versão 1 (pré-mutação).
    await expect(repo.save(u, 999)).rejects.toThrow(ConcurrencyException);
  });

  it('softDelete (via save após marcarExcluido) esconde User nas consultas default', async () => {
    const u = User.criar({
      nome: 'Diego',
      email: 'diego@example.com',
      agora: new Date(),
    });
    await repo.save(u, 0);

    u.marcarExcluido('test', new Date());
    await repo.save(u, u.version() - 1);

    expect(await repo.findById(UserId.create(u.id().value))).toBeNull();
    expect(await repo.findByEmail(Email.create('diego@example.com'))).toBeNull();
  });

  it('list com includeDeleted=true devolve soft-deleted', async () => {
    const u = User.criar({
      nome: 'Eva',
      email: 'eva@example.com',
      agora: new Date(),
    });
    await repo.save(u, 0);

    u.marcarExcluido(null, new Date());
    await repo.save(u, u.version() - 1);

    const hidden = await repo.list({ limit: 10 });
    expect(hidden.users.find((x) => x.id().value === u.id().value)).toBeUndefined();

    const shown = await repo.list({ limit: 10, includeDeleted: true });
    const found = shown.users.find((x) => x.id().value === u.id().value);
    expect(found).toBeDefined();
    expect(found!.deletedAt()).toBeInstanceOf(Date);
  });

  it('restore (via save após restaurar) devolve User com deletedAt=null e version incrementada', async () => {
    const u = User.criar({
      nome: 'Fabi',
      email: 'fabi@example.com',
      agora: new Date('2026-09-21T10:00:00Z'),
    });
    await repo.save(u, 0);
    u.marcarExcluido('test', new Date('2026-09-21T11:00:00Z'));
    await repo.save(u, u.version() - 1);

    expect(u.deletedAt()).toBeInstanceOf(Date);
    expect(u.version()).toBe(2);

    u.restaurar(new Date('2026-09-21T12:00:00Z'));
    await repo.save(u, u.version() - 1);

    const found = await repo.findById(UserId.create(u.id().value));
    expect(found).not.toBeNull();
    expect(found!.deletedAt()).toBeNull();
    expect(found!.version()).toBe(3);
  });

  it('findByEmail retorna null para email inexistente ou soft-deleted', async () => {
    expect(await repo.findByEmail(Email.create('nobody@example.com'))).toBeNull();

    const u = User.criar({
      nome: 'Gabi',
      email: 'gabi@example.com',
      agora: new Date(),
    });
    await repo.save(u, 0);
    expect((await repo.findByEmail(Email.create('gabi@example.com')))?.id().value).toBe(
      u.id().value,
    );

    u.marcarExcluido(null, new Date());
    await repo.save(u, u.version() - 1);
    expect(await repo.findByEmail(Email.create('gabi@example.com'))).toBeNull();
  });

  it('list pagina por cursor opaco (id)', async () => {
    for (const nome of ['Gabriel', 'Helen', 'Ivan']) {
      const u = User.criar({
        nome,
        email: `${nome.toLowerCase()}@example.com`,
        agora: new Date(),
      });
      await repo.save(u, 0);
    }

    const page1 = await repo.list({ limit: 2 });
    expect(page1.users).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await repo.list({ limit: 2, cursor: page1.nextCursor });
    expect(page2.users).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
  });
});
