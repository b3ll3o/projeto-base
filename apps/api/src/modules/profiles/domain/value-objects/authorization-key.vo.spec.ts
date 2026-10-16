// apps/api/src/modules/profiles/domain/value-objects/authorization-key.vo.spec.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): testes do VO AuthorizationKey.
// Cobre:
//
//   - aceita key catalogada
//   - rejeita key NÃO catalogada (fantasma)
//   - equals por valor
//   - restore aceita qualquer string (assume DB válido)

import { describe, it, expect } from 'vitest';
import { AuthorizationKey } from './authorization-key.vo.js';

describe('AuthorizationKey', () => {
  it('aceita key catalogada', () => {
    const k = AuthorizationKey.create('users.read');
    expect(k.value).toBe('users.read');
  });

  it('aceita todas as keys do catalog', () => {
    // pt-BR: as 7 keys do permissions-catalog.ts. Se o catálogo crescer
    // e o usuário esquecer de atualizar o spec, este teste falha e
    // sinaliza.
    const keys = [
      'users.read',
      'users.write',
      'users.delete',
      'admin.manage-profiles',
      'admin.manage-authorizations',
      'admin.manage-users',
      'audits.read',
    ];
    for (const k of keys) {
      expect(() => AuthorizationKey.create(k)).not.toThrow();
    }
  });

  it('rejeita key fantasma (não catalogada)', () => {
    expect(() => AuthorizationKey.create('users.sudo')).toThrow();
  });

  it('rejeita key vazia', () => {
    expect(() => AuthorizationKey.create('')).toThrow();
  });

  it('equals compara valor', () => {
    const a = AuthorizationKey.create('users.read');
    const b = AuthorizationKey.create('users.read');
    const c = AuthorizationKey.create('users.write');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('restore aceita qualquer string (assume DB válido)', () => {
    // pt-BR: usado na hidratação do banco. NÃO valida contra catalog.
    // Se o banco tem uma key que foi removida do catalog, é um problema
    // de migration/limpeza, não de validação de domínio.
    const k = AuthorizationKey.restore('users.read');
    expect(k.value).toBe('users.read');
  });
});
