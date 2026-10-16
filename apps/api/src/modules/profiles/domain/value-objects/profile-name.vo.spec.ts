// apps/api/src/modules/profiles/domain/value-objects/profile-name.vo.spec.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): testes do VO ProfileName.
// Aceita acentos/espaços, faz trim, 2-80 chars.

import { describe, it, expect } from 'vitest';
import { ProfileName } from './profile-name.vo.js';

describe('ProfileName', () => {
  it('aceita nome simples', () => {
    expect(ProfileName.create('Administrador').value).toBe('Administrador');
  });

  it('aceita acentos', () => {
    expect(ProfileName.create('Coordenação').value).toBe('Coordenação');
  });

  it('faz trim nas pontas', () => {
    expect(ProfileName.create('  Admin  ').value).toBe('Admin');
  });

  it('rejeita nome com 1 char', () => {
    expect(() => ProfileName.create('A')).toThrow();
  });

  it('rejeita nome vazio', () => {
    expect(() => ProfileName.create('')).toThrow();
  });

  it('rejeita nome whitespace-only (após trim fica vazio)', () => {
    expect(() => ProfileName.create('   ')).toThrow();
  });

  it('rejeita nome > 80 chars', () => {
    expect(() => ProfileName.create('a'.repeat(81))).toThrow();
  });

  it('rejeita nome não-string', () => {
    expect(() => ProfileName.create(123 as unknown as string)).toThrow();
  });

  it('equals compara valor', () => {
    const a = ProfileName.create('Admin');
    const b = ProfileName.create('Admin');
    const c = ProfileName.create('Viewer');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });
});
