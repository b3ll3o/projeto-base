// apps/api/src/modules/users/application/user-use-cases.integration.spec.ts
//
// Teste de integração ponta-a-ponta do UserUseCases com Prisma real.
// Sobe Postgres via Testcontainers, aplica migrations, executa os casos de uso
// contra PrismaUserRepository + PrismaAuditService (não mocks).
//
// pt-BR: prova que o orquestrador funciona contra a infraestrutura real
// (sem HTTP). Complementa o spec unitário (132 testes) que valida boundary
// com InMemoryRepository.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  setupTestDatabase,
  cleanDatabase,
  type TestContext,
} from '../../../../test/testcontainers-helper.js';
import { UserUseCases } from './user-use-cases.js';
import { UserId } from '../domain/value-objects/user-id.vo.js';
import { PrismaUserRepository } from '../infrastructure/persistence/prisma-user.repository.js';
import { PrismaAuditService } from '../../../shared/audit/infrastructure/prisma-audit.service.js';
import { AuditContext } from '../../../shared/audit/domain/audit-context.vo.js';
import { AuditContextStore } from '../../../shared/audit/shared/audit-context-store.js';
import {
  ApplicationConcurrencyException,
  ApplicationResourceNotFoundException,
  ApplicationEmailAlreadyInUseException,
} from './exceptions/application.exceptions.js';
import { ConcurrencyException } from '../domain/exceptions/user.exceptions.js';

describe('UserUseCases (integration with Prisma)', () => {
  let ctx: TestContext;
  let sut: UserUseCases;
  let prisma: import('@prisma/client').PrismaClient;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
    prisma = ctx.prisma;
  });

  afterAll(async () => {
    await ctx.stop();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const repo = new PrismaUserRepository(prisma);
    const audit = new PrismaAuditService(prisma);
    sut = new UserUseCases(repo, audit);
  });

  // Actor IDs precisam ser UUID v7 válidos: as colunas `changedBy` (users_history)
  // e `deletedBy` (users_archive) são `@db.Uuid` no schema Prisma.
  const ACTOR_ADMIN_1 = '0190a8b6-aaaa-7bbb-7ccc-000000000001';
  const ACTOR_ADMIN_2 = '0190a8b6-aaaa-7bbb-7ccc-000000000002';

  const makeCtx = (actorId: string | null = ACTOR_ADMIN_1) =>
    new AuditContext({
      actorId,
      correlationId: 'corr-1',
      source: 'http',
      timestamp: new Date('2026-09-21T10:00:00.000Z'),
    });

  it('criarUser persiste User + entrada INSERT em user_history', async () => {
    const auditCtx = makeCtx(ACTOR_ADMIN_1);
    const dto = await AuditContextStore.run(auditCtx, () =>
      sut.criarUser({ nome: 'Alice', email: 'alice@example.com' }),
    );

    expect(dto.nome).toBe('Alice');
    expect(dto.email).toBe('alice@example.com');
    expect(dto.version).toBe(1);

    // Row gravada em users
    const row = await prisma.user.findUnique({ where: { email: 'alice@example.com' } });
    expect(row).not.toBeNull();
    expect(row!.name).toBe('Alice');
    expect(row!.version).toBe(1);
    expect(row!.deletedAt).toBeNull();

    // Entrada de histórico
    const hist = await prisma.userHistory.findMany({ where: { entityId: dto.id } });
    expect(hist).toHaveLength(1);
    expect(hist[0]!.operation).toBe('INSERT');
    expect(hist[0]!.version).toBe(1);
    expect(hist[0]!.previousVersion).toBeNull();
    expect(hist[0]!.changedBy).toBe(ACTOR_ADMIN_1);
  });

  it('criarUser rejeita email duplicado com ApplicationEmailAlreadyInUseException', async () => {
    const ctx = makeCtx();
    await AuditContextStore.run(ctx, () =>
      sut.criarUser({ nome: 'Bob', email: 'bob@example.com' }),
    );

    await expect(
      AuditContextStore.run(ctx, () => sut.criarUser({ nome: 'Bob 2', email: 'BOB@example.com' })),
    ).rejects.toThrow(ApplicationEmailAlreadyInUseException);

    // Nenhuma row extra foi criada
    const users = await prisma.user.findMany({ where: { email: 'bob@example.com' } });
    expect(users).toHaveLength(1);
  });

  it('atualizarNome aplica mutação e grava UPDATE no histórico', async () => {
    const ctx = makeCtx();
    const created = await AuditContextStore.run(ctx, () =>
      sut.criarUser({ nome: 'Carla', email: 'carla@example.com' }),
    );

    const updated = await AuditContextStore.run(ctx, () =>
      sut.atualizarNome({ id: created.id, novoNome: 'Carla Maria', expectedVersion: 1 }),
    );
    expect(updated.nome).toBe('Carla Maria');
    expect(updated.version).toBe(2);

    const hist = await prisma.userHistory.findMany({
      where: { entityId: created.id },
      orderBy: { version: 'asc' },
    });
    expect(hist.map((h) => h.operation)).toEqual(['INSERT', 'UPDATE']);
    expect(hist[1]!.previousVersion).toBe(1);
    expect(hist[1]!.version).toBe(2);
  });

  it('softDelete grava archive + DELETE no histórico; findById 404', async () => {
    const ctx = makeCtx(ACTOR_ADMIN_2);
    const created = await AuditContextStore.run(ctx, () =>
      sut.criarUser({ nome: 'Diego', email: 'diego@example.com' }),
    );

    const deleted = await AuditContextStore.run(ctx, () =>
      sut.softDelete({ id: created.id, reason: 'duplicate', expectedVersion: 1 }),
    );
    expect(deleted.deletedAt).not.toBeNull();

    // Row marcada como soft-deleted
    const row = await prisma.user.findUnique({ where: { id: created.id } });
    expect(row!.deletedAt).not.toBeNull();
    expect(row!.version).toBe(2);

    // Entrada DELETE no histórico
    const deleteEntry = await prisma.userHistory.findFirst({
      where: { entityId: created.id, operation: 'DELETE' },
    });
    expect(deleteEntry).not.toBeNull();
    expect(deleteEntry!.reason).toBe('duplicate');

    // Archive recebeu o snapshot
    const archive = await prisma.userArchive.findUnique({ where: { entityId: created.id } });
    expect(archive).not.toBeNull();
    expect(archive!.deletedBy).toBe(ACTOR_ADMIN_2);
    expect(archive!.reason).toBe('duplicate');

    // findById filtra soft-deleted por padrão → 404
    await expect(
      AuditContextStore.run(ctx, () => sut.obterPorId({ id: created.id })),
    ).rejects.toThrow(ApplicationResourceNotFoundException);
  });

  it('restaurar limpa deletedAt e grava RESTORE no histórico', async () => {
    const ctx = makeCtx();
    const created = await AuditContextStore.run(ctx, () =>
      sut.criarUser({ nome: 'Eva', email: 'eva@example.com' }),
    );
    await AuditContextStore.run(ctx, () =>
      sut.softDelete({ id: created.id, reason: null, expectedVersion: 1 }),
    );

    const restored = await AuditContextStore.run(ctx, () =>
      sut.restaurar({ id: created.id, expectedVersion: 2 }),
    );
    expect(restored.deletedAt).toBeNull();
    expect(restored.version).toBe(3);

    const restoreEntry = await prisma.userHistory.findFirst({
      where: { entityId: created.id, operation: 'RESTORE' },
    });
    expect(restoreEntry).not.toBeNull();
    expect(restoreEntry!.version).toBe(3);

    // Após restaurar, obterPorId volta a funcionar (não retorna 404)
    const fetched = await AuditContextStore.run(ctx, () => sut.obterPorId({ id: created.id }));
    expect(fetched.deletedAt).toBeNull();
  });

  it('atualizarEmail lança ApplicationConcurrencyException em cenário concorrente', async () => {
    const ctx = makeCtx();
    const created = await AuditContextStore.run(ctx, () =>
      sut.criarUser({ nome: 'Fabio', email: 'fabio@example.com' }),
    );

    // Simula concorrência: o caller A lê o user (version=1), depois o caller B
    // também lê e atualiza (port para version=2). Quando A tenta salvar com
    // expectedVersion=1, o repo detecta divergência.
    const repo = new PrismaUserRepository(prisma);
    const id = UserId.create(created.id);
    const userFromA = await repo.findById(id);
    expect(userFromA!.version()).toBe(1);

    const userFromB = await repo.findById(id);
    userFromB!.renomear('Fabio B', new Date());
    await repo.save(userFromB!, 1); // esperado=1, persiste v=2

    // A tenta salvar com expected=1 mas a versão real é 2
    userFromA!.renomear('Fabio A', new Date());
    await expect(repo.save(userFromA!, 1)).rejects.toThrow(ConcurrencyException);
  });

  it('application-layer short-circuita com ApplicationConcurrencyException antes de qualquer mutação', async () => {
    // Comportamento alvo da Fase 7: o caller lê o user, depois algum tempo
    // passa (ou outra aba atualizou), e a versão persistida diverge do
    // expectedVersion enviado. O use case deve falhar RÁPIDO com
    // ApplicationConcurrencyException (HTTP 412) sem chegar a chamar save()
    // ou emitir audit — preservando o histórico.
    const ctx = makeCtx();
    const created = await AuditContextStore.run(ctx, () =>
      sut.criarUser({ nome: 'Gabriela', email: 'gabriela@example.com' }),
    );
    expect(created.version).toBe(1);

    const historyBefore = await prisma.userHistory.findMany({
      where: { entityId: created.id },
    });
    expect(historyBefore).toHaveLength(1); // só o INSERT

    await expect(
      AuditContextStore.run(ctx, () =>
        sut.atualizarNome({
          id: created.id,
          novoNome: 'Não aplicado',
          expectedVersion: 999,
        }),
      ),
    ).rejects.toThrow(ApplicationConcurrencyException);

    // Nenhuma mutação foi persistida: row inalterada, histórico idem.
    const row = await prisma.user.findUnique({ where: { id: created.id } });
    expect(row!.name).toBe('Gabriela');
    expect(row!.version).toBe(1);

    const historyAfter = await prisma.userHistory.findMany({
      where: { entityId: created.id },
    });
    expect(historyAfter).toHaveLength(1);
    expect(historyAfter.map((h) => h.operation)).toEqual(['INSERT']);
  });
});
