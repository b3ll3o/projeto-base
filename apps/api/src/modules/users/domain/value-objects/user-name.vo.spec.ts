import { describe, it, expect } from 'vitest';
import { UserName, MIN_LENGTH, MAX_LENGTH } from './user-name.vo.js';
import { UserValidationException } from '../exceptions/user.exceptions.js';

/** Verdadeiro se a regra aceita o valor — usada onde o TIPO não é o alvo. */
function voAceita(fn: () => unknown): boolean {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
}

describe('UserName', () => {
  it('aceita nome válido e trim', () => {
    const n = UserName.create('  João Silva  ');
    expect(n.value).toBe('João Silva');
  });

  it('colapsa múltiplos espaços internos em um único', () => {
    const n = UserName.create(' João   Silva  Santos ');
    expect(n.value).toBe('João Silva Santos');
  });

  it('rejeita vazio', () => {
    expect(() => UserName.create('   ')).toThrow(/em branco/);
  });

  it('rejeita nome > 100 chars', () => {
    expect(() => UserName.create('a'.repeat(101))).toThrow(/100/);
  });

  it('rejeita nome < 2 chars (após trim)', () => {
    expect(() => UserName.create('a')).toThrow(/2/);
  });

  // MEDIDO 2026-10-08: `toThrow(/2/)` passa com `Error` puro, com
  // `TypeError`, e com a exceção que o `mapExceptionToHttp` reconhece
  // como 400. O que ele afirma é a PALAVRA na mensagem, não o status
  // que o cliente recebe — e foi por isso que `nome: 'A'` virava 500.
  it('recusa com UserValidationException, não com Error puro', () => {
    let capturada: unknown;
    try {
      UserName.create('A');
    } catch (e) {
      capturada = e;
    }
    expect(capturada).toBeInstanceOf(UserValidationException);
    expect((capturada as Error).name).toBe('UserValidationException');
    expect((capturada as UserValidationException).campo).toBe('nome');
  });

  // A faixa que o `CreateUserSchema` deixa passar: o Zod conta
  // caracteres crus, o VO conta os já aparados. MEDIDO: estes três
  // devolviam 500 com o VO lançando `Error` puro, e é o que dá dente ao
  // conserto — os testes de limite exato passaram 9 de 9 sob a mesma
  // mutação, porque o boundary já rejeitava antes.
  it.each([
    { rotulo: 'espaço nas pontas', nome: ' A ' },
    { rotulo: 'muitos espaços', nome: '   A   ' },
    { rotulo: 'tab nas pontas', nome: '\tA\t' },
    { rotulo: 'newline nas pontas', nome: 'A\n' },
  ])('rejeita "$rotulo" com a exceção de validação', ({ nome }) => {
    expect(() => UserName.create(nome)).toThrow(UserValidationException);
  });

  it('os limites exportados são os que a regra aplica', () => {
    // Os mesmos números que o `CreateUserSchema` importa. Assertar aqui
    // que o VO aceita `MAX_LENGTH` e recusa `MAX_LENGTH + 1` amarra o
    // export ao comportamento — sem isso, `MAX_LENGTH` exportado errado
    // compila, e o boundary herda o erro.
    expect(voAceita(() => UserName.create('a'.repeat(MIN_LENGTH)))).toBe(true);
    expect(voAceita(() => UserName.create('a'.repeat(MAX_LENGTH)))).toBe(true);
    expect(voAceita(() => UserName.create('a'.repeat(MAX_LENGTH + 1)))).toBe(false);
  });

  it('congelado', () => {
    expect(Object.isFrozen(UserName.create('João'))).toBe(true);
  });
});
