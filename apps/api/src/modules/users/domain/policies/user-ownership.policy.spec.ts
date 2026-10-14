// apps/api/src/modules/users/domain/policies/user-ownership.policy.spec.ts
//
// pt-BR: a política é a regra de negócio; o guard é a casca HTTP. Se esta
// suíte passar e o IDOR voltar, o defeito está na casca — e vice-versa.

import { describe, it, expect } from 'vitest';
import { exigirPropriedade } from './user-ownership.policy.js';
import { UserOwnershipViolationException } from '../exceptions/user.exceptions.js';

const ALVO = '0190a8b6-1a2b-7c3d-8e4f-5a6b7c8d9e0f';

describe('política de propriedade do registro de usuário', () => {
  it('aceita quando o ator É o dono', () => {
    expect(() => exigirPropriedade(ALVO, ALVO)).not.toThrow();
  });

  it('recusa quando o ator é outra pessoa autenticada', () => {
    // O caso medido ao vivo que motivou a política: token da conta A em rota
    // que aponta para o id da conta B.
    const outro = '0190a8b6-ffff-7c3d-8e4f-5a6b7c8d9e0f';
    expect(() => exigirPropriedade(outro, ALVO)).toThrow(UserOwnershipViolationException);
  });

  it('recusa quando não há ator — undefined é "ninguém", e ninguém não é dono', () => {
    // O `@CurrentUser()` é `TokenSubject | undefined` porque roda em rota
    // `@Public()`. Um `?? ''` silencioso aqui transformaria "sem sessão" em
    // "dono do id vazio".
    expect(() => exigirPropriedade(undefined, ALVO)).toThrow(UserOwnershipViolationException);
  });

  it('recusa quando o ator é dono de OUTRO registro — o caso não é o do id', () => {
    // ⚠️ O teste que segura o `startsWith`. Com `startsWith`, um token cujo
    // `sub` é prefixo do `alvo` passaria — e UUIDs de_container compartilham
    // prefixo de propósito, para que o container seja único só no sufixo.
    expect(() => exigirPropriedade(`${ALVO}-extra`, ALVO)).toThrow(UserOwnershipViolationException);
    expect(() => exigirPropriedade(ALVO.slice(0, 20), ALVO)).toThrow(
      UserOwnershipViolationException,
    );
  });

  it('a mensagem NÃO embute o id do alvo — um 403 não confirma existência', () => {
    let mensagem = '';
    try {
      exigirPropriedade('outro-id', ALVO);
    } catch (erro) {
      mensagem = (erro as Error).message;
    }
    expect(mensagem).not.toContain(ALVO);
    expect(mensagem).not.toContain('outro-id');
  });
});
