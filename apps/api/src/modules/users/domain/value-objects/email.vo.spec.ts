import { describe, it, expect } from 'vitest';
import { Email } from './email.vo.js';

describe('Email', () => {
  it('aceita email válido e normaliza para lowercase', () => {
    const e = Email.create('  User@Example.COM ');
    expect(e.value).toBe('user@example.com');
  });

  it('rejeita email sem @', () => {
    expect(() => Email.create('user.example.com')).toThrow(/inválido/);
  });

  it('rejeita email sem domínio', () => {
    expect(() => Email.create('user@')).toThrow(/inválido/);
  });

  it('rejeita email > 254 chars', () => {
    const local = 'a'.repeat(250);
    const email = `${local}@x.com`;
    expect(() => Email.create(email)).toThrow(/tamanho/);
  });

  it('equals por valor', () => {
    expect(Email.create('a@b.com').equals(Email.create('A@B.COM'))).toBe(true);
  });

  it('congelado', () => {
    expect(Object.isFrozen(Email.create('a@b.com'))).toBe(true);
  });
});
