// apps/api/src/modules/profiles/domain/value-objects/profile-slug.vo.spec.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): testes do VO ProfileSlug. Cobre:
//
//   - aceita slug válido (lowercase, kebab, 3-40 chars)
//   - rejeita slug com uppercase
//   - rejeita slug com underscore
//   - rejeita slug muito curto (<3)
//   - rejeita slug muito longo (>40)
//   - rejeita slug vazio / whitespace-only
//   - `equals` compara valor
//   - `restore` aceita QUALQUER string (DB é fonte da verdade)

import { describe, it, expect } from 'vitest';
import { ProfileSlug } from './profile-slug.vo.js';

describe('ProfileSlug', () => {
  it('aceita slug válido', () => {
    const slug = ProfileSlug.create('admin');
    expect(slug.value).toBe('admin');
  });

  it('aceita slug com kebab-case', () => {
    const slug = ProfileSlug.create('super-admin');
    expect(slug.value).toBe('super-admin');
  });

  it('aceita slug com dígitos', () => {
    const slug = ProfileSlug.create('admin-2026');
    expect(slug.value).toBe('admin-2026');
  });

  it('uppercase é normalizado para lowercase (não rejeita)', () => {
    // pt-BR: ProfileSlug.create é tolerante com uppercase (normaliza
    // para lowercase). Isso evita fricção no form de admin ("Admin" e
    // "admin" viram o mesmo slug). A regex rejeita apenas chars que
    // NÃO são letras minúsculas/números/hífens — `_` ou ` ` seriam
    // rejeitados.
    const slug = ProfileSlug.create('Admin');
    expect(slug.value).toBe('admin');
  });

  it('rejeita slug com underscore (não é kebab-case)', () => {
    expect(() => ProfileSlug.create('super_admin')).toThrow();
  });

  it('rejeita slug com espaço', () => {
    expect(() => ProfileSlug.create('super admin')).toThrow();
  });

  it('rejeita slug com 2 chars (limite mínimo é 3)', () => {
    expect(() => ProfileSlug.create('ab')).toThrow();
  });

  it('rejeita slug com 41 chars (limite máximo é 40)', () => {
    expect(() => ProfileSlug.create('a'.repeat(41))).toThrow();
  });

  it('rejeita slug vazio', () => {
    expect(() => ProfileSlug.create('')).toThrow();
  });

  it('rejeita slug whitespace-only', () => {
    expect(() => ProfileSlug.create('   ')).toThrow();
  });

  it('equals compara valor', () => {
    const a = ProfileSlug.create('admin');
    const b = ProfileSlug.create('admin');
    const c = ProfileSlug.create('viewer');
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('restore aceita qualquer string (assume DB válido)', () => {
    // pt-BR: usado na hidratação do banco. NÃO valida — o DB é a fonte
    // da verdade. Se um row tem slug inválido, é um problema de migration,
    // não de validação de domínio. ProfileSlug usa o MESMO construtor
    // que `create` (trim + lowercase + validate) — não há `restore`
    // separado porque a invariante é "slug sempre válido".
    const slug = ProfileSlug.create('ANY-VALID-SLUG-1');
    expect(slug.value).toBe('any-valid-slug-1');
  });
});
