import { describe, it, expect } from 'vitest';
import { Email } from './email.vo.js';
import { UserValidationException } from '../exceptions/user.exceptions.js';

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
    expect(() => Email.create(email)).toThrow(/no máximo 254/);
  });

  it('equals por valor', () => {
    expect(Email.create('a@b.com').equals(Email.create('A@B.COM'))).toBe(true);
  });

  it('congelado', () => {
    expect(Object.isFrozen(Email.create('a@b.com'))).toBe(true);
  });

  // MEDIDO 2026-10-08: o tipo da exceção É o que decide o status HTTP.
  // `mapExceptionToHttp` cai no `return` final (500 INTERNAL) para
  // qualquer coisa que ele não reconheça — e o `detail` vaza a mensagem
  // interna. Um `toThrow(/tamanho/)` passa igual com `Error` puro, com
  // `TypeError`, ou com a exceção certa: ele afirma sobre a PALAVRA, não
  // sobre o que o cliente recebe.
  it('recusa com UserValidationException, não com Error puro', () => {
    const local = 'a'.repeat(250);
    let capturada: unknown;
    try {
      Email.create(`${local}@x.com`);
    } catch (e) {
      capturada = e;
    }
    expect(capturada).toBeInstanceOf(UserValidationException);
    expect(capturada).toBeInstanceOf(Error);
    expect((capturada as UserValidationException).campo).toBe('email');
    // `instanceof Error` sozinho não distingue: a subclasse também é.
    // O que separa é o NOME, que o `mapExceptionToHttp` casa.
    expect((capturada as Error).name).toBe('UserValidationException');
  });

  it('a mensagem vai para o cliente sem o nome da classe nem a sintaxe do VO', () => {
    let capturada: UserValidationException | undefined;
    try {
      Email.create('nao-e-email');
    } catch (e) {
      capturada = e as UserValidationException;
    }
    expect(capturada?.message).not.toMatch(/UserValidationException|Email\.create/);
    expect(capturada?.message).toMatch(/email/);
  });
});
