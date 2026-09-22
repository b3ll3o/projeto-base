import { describe, it, expect, beforeEach } from 'vitest';
import { UserUseCases } from './user-use-cases.js';
import { InMemoryUserRepository } from '../infrastructure/persistence/in-memory-user.repository.js';
import { InMemoryAuditService } from '../../../shared/audit/application/in-memory-audit-service.js';
import { AuditContext } from '../../../shared/audit/domain/audit-context.vo.js';
import { AuditContextStore } from '../../../shared/audit/shared/audit-context-store.js';
import {
  ApplicationEmailAlreadyInUseException,
  ApplicationInvalidRestoreException,
  ApplicationResourceDeletedException,
  ApplicationResourceNotFoundException,
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

    it('rejeita nome vazio', async () => {
      const ctx = makeCtx();
      await expect(
        AuditContextStore.run(ctx, () => useCases.criarUser({ nome: '', email: 'a@b.com' })),
      ).rejects.toThrow();
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
        useCases.atualizarNome({ id: created.id, novoNome: 'João Silva' }),
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
      await AuditContextStore.run(ctx, () => useCases.softDelete({ id: created.id, reason: null }));
      await expect(
        AuditContextStore.run(ctx, () =>
          useCases.atualizarNome({ id: created.id, novoNome: 'Novo' }),
        ),
      ).rejects.toThrow(ApplicationResourceDeletedException);
    });
  });

  describe('atualizarEmail()', () => {
    it('troca email e registra UPDATE no audit', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com' }),
      );
      const updated = await AuditContextStore.run(ctx, () =>
        useCases.atualizarEmail({ id: created.id, novoEmail: 'novo@example.com' }),
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
          useCases.atualizarEmail({ id: u1.id, novoEmail: 'b@example.com' }),
        ),
      ).rejects.toThrow(ApplicationEmailAlreadyInUseException);
    });
  });

  describe('softDelete()', () => {
    it('marca como deleted, registra DELETE no audit + archive', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com' }),
      );
      const deleted = await AuditContextStore.run(ctx, () =>
        useCases.softDelete({ id: created.id, reason: 'LGPD' }),
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
      await AuditContextStore.run(ctx, () => useCases.softDelete({ id: created.id, reason: null }));
      await expect(
        AuditContextStore.run(ctx, () => useCases.softDelete({ id: created.id, reason: null })),
      ).rejects.toThrow(ApplicationResourceDeletedException);
    });
  });

  describe('restaurar()', () => {
    it('limpa deletedAt e registra RESTORE', async () => {
      const ctx = makeCtx();
      const created = await AuditContextStore.run(ctx, () =>
        useCases.criarUser({ nome: 'João', email: 'joao@example.com' }),
      );
      await AuditContextStore.run(ctx, () => useCases.softDelete({ id: created.id, reason: null }));
      const restored = await AuditContextStore.run(ctx, () =>
        useCases.restaurar({ id: created.id }),
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
        AuditContextStore.run(ctx, () => useCases.restaurar({ id: created.id })),
      ).rejects.toThrow(ApplicationInvalidRestoreException);
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

  it('lança erro se AuditContext não está no scope', async () => {
    await expect(useCases.criarUser({ nome: 'João', email: 'joao@example.com' })).rejects.toThrow();
  });
});
