import { describe, it, expect } from 'vitest';
import { InvalidCredentialsException } from './auth.exceptions.js';

describe('InvalidCredentialsException', () => {
  it('tem nome estável para log e para o GlobalExceptionFilter', () => {
    const e = new InvalidCredentialsException();
    expect(e.name).toBe('InvalidCredentialsException');
  });

  it('a mensagem padrão é genérica — não diz se foi o e-mail ou a senha', () => {
    // pt-BR: esta string é o ÚNICO texto que o cliente recebe. Se ela
    // nomear o campo que falhou, o endpoint volta a ser um oráculo de
    // existência de conta — que é o que o 401 genérico existe para evitar.
    const e = new InvalidCredentialsException();
    expect(e.message).toBe('Credenciais inválidas.');
    expect(e.message).not.toMatch(/email|e-mail|senha|password|user|usuário/i);
  });

  it('sobrevive a `instanceof` depois de passar pelo transpilador ESM', () => {
    // pt-BR: o mesmo motivo do `Object.setPrototypeOf` nos outros
    // `*.exceptions.ts` do repo — sem ele, `err instanceof X` dá false
    // para a exceção vinda de outro arquivo compilado, e o mapper cai
    // no `return` de 500 em vez do 401.
    expect(new InvalidCredentialsException()).toBeInstanceOf(InvalidCredentialsException);
    expect(new InvalidCredentialsException()).toBeInstanceOf(Error);
  });

  it('duas instâncias com a mensagem padrão são indistinguíveis para o caller', () => {
    // pt-BR: o requisito é "usuário ausente E senha errada levantam a MESMA
    // exceção". Isso se mede comparando as duas, não comparando cada uma com
    // uma constante escrita à mão no teste.
    const emailInexistente = new InvalidCredentialsException();
    const senhaErrada = new InvalidCredentialsException();
    expect(emailInexistente.message).toBe(senhaErrada.message);
    expect(emailInexistente.name).toBe(senhaErrada.name);
  });
});
