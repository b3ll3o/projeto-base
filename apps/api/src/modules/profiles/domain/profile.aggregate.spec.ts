// apps/api/src/modules/profiles/domain/profile.aggregate.spec.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): testes do aggregate Profile.
// Cobre:
//
//   - criar com isAdmin/isSystem/authorizations iniciais
//   - restaurarDePersistencia mantém estado
//   - renomear/alterarDescricao bumpam version + emitem event
//   - adicionarAutorizacao idempotente vs duplicate-key exception
//   - removerAutorizacao idempotente vs not-found exception
//   - deletar emite event e bloqueia system profile
//   - getters retornam cópias defensivas

import { describe, it, expect } from 'vitest';
import { Profile } from './profile.aggregate.js';
import {
  AuthorizationAlreadyAssignedException,
  AuthorizationNotFoundException,
  ProfileSystemProtectedException,
} from './exceptions/profile.exceptions.js';

const T0 = new Date('2026-01-01T00:00:00Z');

describe('Profile (aggregate)', () => {
  describe('criar', () => {
    it('cria profile básico (isAdmin=false, sem auths)', () => {
      const p = Profile.criar({ slug: 'viewer', name: 'Visualizador', agora: T0 });
      expect(p.isAdmin()).toBe(false);
      expect(p.isSystem()).toBe(false);
      expect(p.authorizations().count()).toBe(0);
      expect(p.version()).toBe(1);
      expect(p.createdAt()).toEqual(T0);
      expect(p.updatedAt()).toEqual(T0);
      expect(pullEvents(p)).toHaveLength(1);
    });

    it('cria profile admin com authorizations iniciais', () => {
      const p = Profile.criar({
        slug: 'admin',
        name: 'Administrador',
        isAdmin: true,
        isSystem: true,
        initialAuthorizations: ['users.read', 'admin.manage-profiles'],
        agora: T0,
      });
      expect(p.isAdmin()).toBe(true);
      expect(p.isSystem()).toBe(true);
      expect(p.authorizations().count()).toBe(2);
      expect(p.authorizations().tem('users.read')).toBe(true);
    });

    it('emite ProfileCreatedEvent na criação', () => {
      const p = Profile.criar({ slug: 'viewer', name: 'Visualizador', agora: T0 });
      expect(firstEventName(p)).toBe('profile.created.v1');
    });
  });

  describe('restaurarDePersistencia', () => {
    it('hidrata sem emitir evento', () => {
      const p = Profile.restaurarDePersistencia({
        id: '00000000-0000-0000-0000-000000000001',
        slug: 'admin',
        name: 'Admin',
        description: 'desc',
        isAdmin: true,
        isSystem: true,
        tenantId: null,
        authorizations: ['users.read'],
        createdAt: T0,
        updatedAt: T0,
        version: 5,
      });
      expect(p.version()).toBe(5);
      expect(p.isAdmin()).toBe(true);
      expect(pullEvents(p)).toHaveLength(0);
    });

    // pt-BR (Fase 6 — tenancy): a DONA do perfil é o que decide se o dono da
    // Acme pode vesti-lo. Sem este campo no agregado a autorização é
    // INESCRITÍVEL — a única forma de saber de quem é o perfil seria a mesma
    // consulta da membership que a regra precisa proteger.
    it('hidrata o tenantId da row (quem é o DONO do perfil)', () => {
      const base = {
        id: '00000000-0000-0000-0000-000000000002',
        slug: 'gestor',
        name: 'Gestor',
        description: null,
        isAdmin: false,
        isSystem: false,
        authorizations: [] as readonly string[],
        createdAt: T0,
        updatedAt: T0,
        version: 1,
      };

      expect(Profile.restaurarDePersistencia({ ...base, tenantId: 'tenant-acme' }).tenantId()).toBe(
        'tenant-acme',
      );
      // `null` é o bucket GLOBAL (D3) — o perfil do seed serve a qualquer
      // empresa. Não pode virar string vazia nem `undefined` aqui, senão a
      // regra `perfil.tenantId ∈ {null, ator.tenantId}` passa a errar em
      // silêncio.
      expect(Profile.restaurarDePersistencia({ ...base, tenantId: null }).tenantId()).toBeNull();
    });
  });

  describe('mutators', () => {
    it('renomear bumpa version + emite ProfileUpdatedEvent', () => {
      const p = Profile.criar({ slug: 'viewer', name: 'Velho', agora: T0 });
      pullEvents(p); // limpa o created
      const t1 = new Date('2026-02-01T00:00:00Z');
      p.renomear('Novo', t1);
      expect(p.nome().value).toBe('Novo');
      expect(p.version()).toBe(2);
      expect(p.updatedAt()).toEqual(t1);
      expect(firstEventName(p)).toBe('profile.updated.v1');
    });

    it('alterarDescricao aceita null', () => {
      const p = Profile.criar({
        slug: 'viewer',
        name: 'Visualizador',
        description: 'antiga',
        agora: T0,
      });
      p.alterarDescricao(null, T0);
      expect(p.descricao()).toBeNull();
    });

    it('adicionarAutorizacao duplicada lança', () => {
      const p = Profile.criar({
        slug: 'admin',
        name: 'Admin',
        initialAuthorizations: ['users.read'],
        agora: T0,
      });
      expect(() => p.adicionarAutorizacao('users.read', T0)).toThrow(
        AuthorizationAlreadyAssignedException,
      );
    });

    it('adicionarAutorizacao com key não catalogada lança', () => {
      const p = Profile.criar({ slug: 'viewer', name: 'Visualizador', agora: T0 });
      expect(() => p.adicionarAutorizacao('users.sudo', T0)).toThrow();
    });

    it('removerAutorizacao existente funciona', () => {
      const p = Profile.criar({
        slug: 'admin',
        name: 'Admin',
        initialAuthorizations: ['users.read'],
        agora: T0,
      });
      p.removerAutorizacao('users.read', T0);
      expect(p.authorizations().tem('users.read')).toBe(false);
    });

    it('removerAutorizacao inexistente lança', () => {
      const p = Profile.criar({ slug: 'admin', name: 'Admin', agora: T0 });
      expect(() => p.removerAutorizacao('users.read', T0)).toThrow(AuthorizationNotFoundException);
    });
  });

  describe('deletar', () => {
    it('emite ProfileDeletedEvent para profile não-system', () => {
      const p = Profile.criar({ slug: 'custom', name: 'Customizado', agora: T0 });
      pullEvents(p);
      p.deletar('obsoleto', T0);
      expect(firstEventName(p)).toBe('profile.deleted.v1');
    });

    it('bloqueia deleção de profile isSystem', () => {
      const p = Profile.criar({
        slug: 'admin',
        name: 'Admin',
        isSystem: true,
        agora: T0,
      });
      expect(() => p.deletar('qualquer', T0)).toThrow(ProfileSystemProtectedException);
    });
  });

  describe('getters', () => {
    it('authorizations() retorna cópia defensiva (mutar não afeta o agregado)', () => {
      const p = Profile.criar({
        slug: 'admin',
        name: 'Admin',
        initialAuthorizations: ['users.read'],
        agora: T0,
      });
      const snap = p.authorizations();
      // O caller NÃO tem como mutar (ReadonlySet exposto); verificamos
      // apenas que duas chamadas devolvem instâncias independentes.
      const snap2 = p.authorizations();
      expect(snap).not.toBe(snap2);
      expect(snap.count()).toBe(1);
      expect(snap2.count()).toBe(1);
    });
  });
});

function pullEvents(p: Profile): Array<{ eventName: string }> {
  return p.pullEvents() as unknown as Array<{ eventName: string }>;
}

function firstEventName(p: Profile): string {
  const events = pullEvents(p);
  const first = events[0];
  if (first === undefined) {
    throw new Error('expected at least 1 event');
  }
  return first.eventName;
}
