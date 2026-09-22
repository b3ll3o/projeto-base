import { describe, it, expect } from 'vitest';
import { User } from './user.aggregate.js';
import { UserCreatedEvent } from './events/user-created.event.js';
import { UserUpdatedEvent } from './events/user-updated.event.js';
import { UserDeletedEvent } from './events/user-deleted.event.js';
import { UserRestoredEvent } from './events/user-restored.event.js';
import { UserDeletedException, InvalidRestoreException } from './exceptions/user.exceptions.js';

const T0 = new Date('2026-09-21T10:00:00Z');
const T1 = new Date('2026-09-21T11:00:00Z');
const T2 = new Date('2026-09-21T12:00:00Z');
const T3 = new Date('2026-09-21T13:00:00Z');
const T4 = new Date('2026-09-21T14:00:00Z');

describe('User aggregate', () => {
  describe('criar()', () => {
    it('cria User com id gerado e versão 1', () => {
      const u = User.criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      expect(u.id().value).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(u.version()).toBe(1);
      expect(u.isDeleted()).toBe(false);
    });

    it('aceita id explícito (UUID v7)', () => {
      const id = '0190a8b6-1234-7abc-9def-000000000001';
      const u = User.criar({ id, nome: 'Maria', email: 'maria@example.com', agora: T0 });
      expect(u.id().value).toBe(id);
    });

    it('rejeita email inválido', () => {
      expect(() => User.criar({ nome: 'X', email: 'não-é-email', agora: T0 })).toThrow();
    });

    it('rejeita nome < 2 chars', () => {
      expect(() => User.criar({ nome: 'A', email: 'a@b.com', agora: T0 })).toThrow();
    });

    it('emite UserCreatedEvent em pullEvents()', () => {
      const u = User.criar({ nome: 'Carlos', email: 'carlos@example.com', agora: T0 });
      const events = u.pullEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(UserCreatedEvent);
      expect(events[0]!.eventName).toBe('users.user.created.v1');
      expect((events[0] as UserCreatedEvent).version).toBe(1);
      // pullEvents esvazia
      expect(u.pullEvents()).toHaveLength(0);
    });
  });

  describe('renomear()', () => {
    it('atualiza nome e incrementa versão', () => {
      const u = User.criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents(); // drena created
      u.renomear('João Silva', T1);
      expect(u.nome().value).toBe('João Silva');
      expect(u.version()).toBe(2);
      expect(u.updatedAt()).toBe(T1);
    });

    it('emite UserUpdatedEvent com previousVersion e version', () => {
      const u = User.criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.renomear('João Silva', T1);
      const events = u.pullEvents();
      expect(events[0]).toBeInstanceOf(UserUpdatedEvent);
      const e = events[0] as UserUpdatedEvent;
      expect(e.previousVersion).toBe(1);
      expect(e.version).toBe(2);
    });

    it('rejeita nome inválido', () => {
      const u = User.criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      expect(() => u.renomear('A', T1)).toThrow();
    });

    it('lança UserDeletedException se User foi soft-deleted', () => {
      const u = User.criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.marcarExcluido(null, T1);
      u.pullEvents();
      expect(() => u.renomear('João Silva', T2)).toThrow(UserDeletedException);
    });
  });

  describe('alterarEmail()', () => {
    it('atualiza email normalizado', () => {
      const u = User.criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.alterarEmail('NOVO@EXAMPLE.COM', T1);
      expect(u.email().value).toBe('novo@example.com');
      expect(u.version()).toBe(2);
    });

    it('emite UserUpdatedEvent', () => {
      const u = User.criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.alterarEmail('novo@example.com', T1);
      expect(u.pullEvents()[0]).toBeInstanceOf(UserUpdatedEvent);
    });

    it('lança UserDeletedException se User foi soft-deleted', () => {
      const u = User.criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.marcarExcluido(null, T1);
      u.pullEvents();
      expect(() => u.alterarEmail('novo@example.com', T2)).toThrow(UserDeletedException);
    });
  });

  describe('marcarExcluido()', () => {
    it('marca deletedAt e isDeleted retorna true', () => {
      const u = User.criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.marcarExcluido(null, T1);
      expect(u.isDeleted()).toBe(true);
      expect(u.deletedAt()).toBe(T1);
      expect(u.version()).toBe(2);
    });

    it('emite UserDeletedEvent', () => {
      const u = User.criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.marcarExcluido('motivo X', T1);
      const events = u.pullEvents();
      expect(events[0]).toBeInstanceOf(UserDeletedEvent);
      expect((events[0] as UserDeletedEvent).reason).toBe('motivo X');
    });

    it('lança UserDeletedException se já excluído', () => {
      const u = User.criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.marcarExcluido(null, T1);
      expect(() => u.marcarExcluido(null, T2)).toThrow(UserDeletedException);
    });
  });

  describe('restaurar()', () => {
    it('limpa deletedAt após soft delete', () => {
      const u = User.criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.marcarExcluido(null, T1);
      u.pullEvents();
      u.restaurar(T2);
      expect(u.isDeleted()).toBe(false);
      expect(u.deletedAt()).toBeNull();
      expect(u.version()).toBe(3);
    });

    it('emite UserRestoredEvent', () => {
      const u = User.criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.marcarExcluido(null, T1);
      u.pullEvents();
      u.restaurar(T2);
      const events = u.pullEvents();
      expect(events[0]).toBeInstanceOf(UserRestoredEvent);
      const e = events[0] as UserRestoredEvent;
      expect(e.restoredFromVersion).toBe(2);
      expect(e.version).toBe(3);
    });

    it('lança InvalidRestoreException se não está excluído', () => {
      const u = User.criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      expect(() => u.restaurar(T1)).toThrow(InvalidRestoreException);
    });

    it('lança InvalidRestoreException se agora é anterior ao deletedAt', () => {
      const u = User.criar({ nome: 'João', email: 'joao@example.com', agora: T0 });
      u.pullEvents();
      u.marcarExcluido(null, T2); // soft delete em T2
      u.pullEvents();
      expect(() => u.restaurar(T1)).toThrow(InvalidRestoreException); // T1 < T2
    });
  });

  describe('restaurarDePersistencia()', () => {
    it('hidrata sem emitir eventos', () => {
      const id = '0190a8b6-1234-7abc-9def-000000000001';
      const u = User.restaurarDePersistencia({
        id,
        nome: 'João',
        email: 'joao@example.com',
        createdAt: T0,
        updatedAt: T1,
        version: 5,
        deletedAt: null,
      });
      expect(u.id().value).toBe(id);
      expect(u.version()).toBe(5);
      expect(u.createdAt()).toBe(T0);
      expect(u.updatedAt()).toBe(T1);
      expect(u.pullEvents()).toEqual([]); // sem eventos
    });
  });
});
