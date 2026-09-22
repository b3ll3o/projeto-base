import { describe, it, expect, beforeEach } from 'vitest';
import { UserUseCases } from './user-use-cases.js';
import { InMemoryUserRepository } from '../infrastructure/persistence/in-memory-user.repository.js';
import { InMemoryAuditService } from '../../../shared/audit/application/in-memory-audit-service.js';
import { AuditContext } from '../../../shared/audit/domain/audit-context.vo.js';
import {
  AuditContextStore,
  AuditContextMissingError,
} from '../../../shared/audit/shared/audit-context-store.js';
import {
  ApplicationConcurrencyException,
  ApplicationEmailAlreadyInUseException,
  ApplicationInvalidRestoreException,
  ApplicationResourceDeletedException,
  ApplicationResourceNotFoundException,
  ApplicationValidationException,
} from './exceptions/application.exceptions.js';

const T0 = new Date('2026-09-21T10:00:00Z');
const T1 = new Date('2026-09-21T11:00:00Z');

function makeCtx(actorId: string | null = 'actor-1'): AuditContext {
  return new AuditContext({
    actorId,
    correlationId: 'corr-1',
    source: 'http',
    timestamp: T0,
  });
}

describe('UserUseCases', () => {
  let repo: InMemoryUserRepository;
  let audit: InMemoryAuditService;
  let useCases: UserUseCases;

  beforeEach(() => {
    repo = new InMemoryUserRepository();
    audit = new InMemoryAuditService();
    useCases = new UserUseCases(repo, audit);
  });

  describe('criarUser()', () => {
    it('cria User, persiste, retorna DTO, registra INSERT no audit', async () => {
      const ctx = makeCtx();
      const out = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com' }),
      );
      expect(out.nome).toBe('João');
      expect(out.email).toBe('joao@example.com');
      expect(out.version).toBe(1);
      expect(audit.history).toHaveLength(1);
      expect(audit.history[0]).toMatchObject({
        operation: 'INSERT',
        version: 1,
        previousVersion: null,
        changedBy: 'actor-1',
      });
    });

    it('rejeita email duplicado com ApplicationEmailAlreadyInUseException', async () => {
      const ctx = makeCtx();
      await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'duplicado@example.com' }),
      );
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.criarUser({ nome: 'Maria', email: 'duplicado@example.com' }),
        ),
      ).rejects.toThrow(ApplicationEmailAlreadyInUseException);
    });

    it('rejeita nome vazio com ApplicationValidationException', async () => {
      const ctx = makeCtx();
      await expect(
        AuditContextStore.run(ctx, () => useCases.criarUser({ nome: '', email: 'a@b.com' })),
      ).rejects.toThrow(ApplicationValidationException);
    });

    it('rejeita email vazio com ApplicationValidationException', async () => {
      const ctx = makeCtx();
      await expect(
        AuditContextStore.run(ctx, () => useCases.criarUser({ nome: 'João', email: '' })),
      ).rejects.toThrow(ApplicationValidationException);
    });
  });

  describe('obterPorId()', () => {
    it('retorna User existente', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com' }),
      );
      const got = await AuditContextStore.run(ctx, () => useCases.obterPorId({ id: created.id }));
      expect(got.id).toBe(created.id);
    });

    it('lança ApplicationResourceNotFoundException se não existe', async () => {
      const ctx = makeCtx();
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.obterPorId({ id: '0190a8b6-1234-7abc-9def-000000000999' }),
        ),
      ).rejects.toThrow(ApplicationResourceNotFoundException);
    });
  });

  describe('atualizarNome()', () => {
    it('renomeia, persiste e registra UPDATE no audit', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com' }),
      );
      const ctx1 = new AuditContext({
        actorId: 'actor-1',
        correlationId: 'corr-1',
        source: 'http',
        timestamp: T1,
      });
      const updated = await AuditContextStore.run(ctx1, () =>
        useCases.atualizarNome({
          id: created.id,
          novoNome: 'João Silva',
          expectedVersion: 1,
        }),
      );
      expect(updated.nome).toBe('João Silva');
      expect(updated.version).toBe(2);
      const updates = audit.history.filter((h) => h.operation === 'UPDATE');
      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatchObject({ previousVersion: 1, version: 2 });
    });

    it('rejeita se User foi soft-deleted', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com' }),
      );
      await AuditContextStore.run(ctx, () =>
        useCases.softDelete({ id: created.id, reason: null, expectedVersion: 1 }),
      );
      // Após o fix do findById (que agora filtra soft-deleted por padrão em ambos
      // Prisma e InMemory — semântica de produção), tentar atualizar um agregado
      // soft-deleted via orquestrador retorna 404 (não encontrado), não 410.
      // Espelha o comportamento do integration spec.
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.atualizarNome({
            id: created.id,
            novoNome: 'Novo',
            expectedVersion: 2,
          }),
        ),
      ).rejects.toThrow(ApplicationResourceNotFoundException);
    });

    it('lança ApplicationConcurrencyException quando expectedVersion diverge (sem mutar)', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com' }),
      );
      // created.version === 1; cliente envia expectedVersion=999
      const historyBefore = audit.history.length;
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.atualizarNome({
            id: created.id,
            novoNome: 'Não aplicado',
            expectedVersion: 999,
          }),
        ),
      ).rejects.toThrow(ApplicationConcurrencyException);

      // Verifica que NENHUMA mutação persistiu: histórico inalterado,
      // nome permanece o original, versão ainda é 1.
      expect(audit.history.length).toBe(historyBefore);
      const refetched = await AuditContextStore.run(ctx, () =>
        useCases.obterPorId({ id: created.id }),
      );
      expect(refetched.nome).toBe('João');
      expect(refetched.version).toBe(1);
    });
  });

  describe('atualizarEmail()', () => {
    it('troca email e registra UPDATE no audit', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com' }),
      );
      const updated = await AuditContextStore.run(ctx, () =>
        useCases.atualizarEmail({
          id: created.id,
          novoEmail: 'novo@example.com',
          expectedVersion: 1,
        }),
      );
      expect(updated.email).toBe('novo@example.com');
      const updates = audit.history.filter((h) => h.operation === 'UPDATE');
      expect(updates).toHaveLength(1);
    });

    it('rejeita se novo email já em uso', async () => {
      const ctx = makeCtx();
      const u1 = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'Ana', email: 'a@example.com' }),
      );
      await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'Bob', email: 'b@example.com' }),
      );
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.atualizarEmail({
            id: u1.id,
            novoEmail: 'b@example.com',
            expectedVersion: 1,
          }),
        ),
      ).rejects.toThrow(ApplicationEmailAlreadyInUseException);
    });

    it('lança ApplicationConcurrencyException quando expectedVersion diverge', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com' }),
      );
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.atualizarEmail({
            id: created.id,
            novoEmail: 'novo@example.com',
            expectedVersion: 42,
          }),
        ),
      ).rejects.toThrow(ApplicationConcurrencyException);
    });
  });

  describe('softDelete()', () => {
    it('marca como deleted, registra DELETE no audit + archive', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com' }),
      );
      const deleted = await AuditContextStore.run(ctx, () =>
        useCases.softDelete({ id: created.id, reason: 'LGPD', expectedVersion: 1 }),
      );
      expect(deleted.isDeleted).toBe(true);
      const deletes = audit.history.filter((h) => h.operation === 'DELETE');
      expect(deletes).toHaveLength(1);
      expect(audit.archives).toHaveLength(1);
      expect(audit.archives[0]).toMatchObject({ entityId: created.id, reason: 'LGPD' });
    });

    it('rejeita soft-delete duplicado', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com' }),
      );
      await AuditContextStore.run(ctx, () =>
        useCases.softDelete({ id: created.id, reason: null, expectedVersion: 1 }),
      );
      // Após o fix do findById, soft-delete de agregado já soft-deleted é 404
      // (findById filtra) — não 410. Espelha o integration spec.
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.softDelete({ id: created.id, reason: null, expectedVersion: 2 }),
        ),
      ).rejects.toThrow(ApplicationResourceNotFoundException);
    });

    it('lança ApplicationConcurrencyException quando expectedVersion diverge', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com' }),
      );
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.softDelete({ id: created.id, reason: 'x', expectedVersion: 7 }),
        ),
      ).rejects.toThrow(ApplicationConcurrencyException);
    });
  });

  describe('restaurar()', () => {
    it('limpa deletedAt e registra RESTORE', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com' }),
      );
      await AuditContextStore.run(ctx, () =>
        useCases.softDelete({ id: created.id, reason: null, expectedVersion: 1 }),
      );
      const restored = await AuditContextStore.run(ctx, () =>
        useCases.restaurar({ id: created.id, expectedVersion: 2 }),
      );
      expect(restored.isDeleted).toBe(false);
      const restores = audit.history.filter((h) => h.operation === 'RESTORE');
      expect(restores).toHaveLength(1);
    });

    it('rejeita restaurar User não-deletado', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com' }),
      );
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.restaurar({ id: created.id, expectedVersion: 1 }),
        ),
      ).rejects.toThrow(ApplicationInvalidRestoreException);
    });

    it('lança ApplicationConcurrencyException quando expectedVersion diverge', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com' }),
      );
      await AuditContextStore.run(ctx, () =>
        useCases.softDelete({ id: created.id, reason: null, expectedVersion: 1 }),
      );
      // Após softDelete, versão persistida = 2; cliente envia expectedVersion=99
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.restaurar({ id: created.id, expectedVersion: 99 }),
        ),
      ).rejects.toThrow(ApplicationConcurrencyException);
    });
  });

  describe('listar()', () => {
    it('lista Users excluindo soft-deleted por padrão', async () => {
      const ctx = makeCtx();
      await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'Ana', email: 'a@example.com' }),
      );
      await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'Bob', email: 'b@example.com' }),
      );
      const page = await AuditContextStore.run(ctx, () => useCases.listar({ limit: 10 }));
      expect(page.users).toHaveLength(2);
    });
  });

  it('lança AuditContextMissingError se AuditContext não está no scope', async () => {
    await expect(useCases.criarUser({ nome: 'João', email: 'joao@example.com' })).rejects.toThrow(
      AuditContextMissingError,
    );
  });
});
