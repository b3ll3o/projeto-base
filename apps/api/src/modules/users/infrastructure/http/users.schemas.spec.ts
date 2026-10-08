// apps/api/src/modules/users/infrastructure/http/users.schemas.spec.ts
//
// PARIDADE entre o boundary HTTP e a regra de domínio.
//
// MEDIDO 2026-10-08: `CreateUserSchema` declarava `min(1).max(120)` para
// `nome` e `.max(255)` para `email`, enquanto os VOs recusavam 2..100 e
// 254. O comentário do arquivo dizia que o schema "espelha `UserName`
// VO" — espelhava em 118 e 20. A consequência era 500 no cliente para
// toda a faixa que o boundary deixava passar.
//
// Este spec existe porque os números NÃO podem ser conferidos a olho:
// ele mede, para cada comprimento, se o boundary aceita exatamente o que
// o VO aceita. Qualquer reescrita de `.min(...)`/`.max(...)` literal
// divergindo do VO aparece aqui como falha de paridade, com o `length`
// que denuncia o ponto exato.
//
// Não substitui o e2e: o e2e diz o que o CLIENTE recebe; este diz que
// as duas camadas concordam. Um passa sem o outro quando uma delas para
// de ser chamada — que é o que aconteceu na primeira versão deste
// conserto (medido: a mutação que fazia o VO voltar a `Error` puro dava
// 9 passed, porque o boundary já rejeitava antes).

import { describe, it, expect } from 'vitest';
import { CreateUserSchema, UpdateUserSchema } from './users.schemas.js';
import { UserName } from '../../domain/value-objects/user-name.vo.js';
import { Email } from '../../domain/value-objects/email.vo.js';

/** Verdadeiro se o VO aceita o valor. */
const voAceita = (fn: () => unknown): boolean => {
  try {
    fn();
    return true;
  } catch {
    return false;
  }
};

describe('paridade boundary ↔ domínio', () => {
  // Faixa que atravessa MIN (2), MAX (100) e o `.max(120)` que o schema
  // declarava por engano. A varredura é por TODO comprimento — um
  // `.min`/`.max` literal que se move sem mover o outro aparece na
  // primeira distância entre eles, sem depender de escolher o ponto.
  it('nome: CreateUserSchema aceita exatamente o que UserName.create aceita', () => {
    const divergencias: string[] = [];
    for (let len = 0; len <= 125; len += 1) {
      const nome = 'a'.repeat(len);
      const peloBoundary = CreateUserSchema.safeParse({ nome, email: 'ok@exemplo.com' }).success;
      const peloDominio = voAceita(() => UserName.create(nome));
      if (peloBoundary !== peloDominio) {
        divergencias.push(
          `len=${len}: boundary=${peloBoundary ? 'aceita' : 'recusa'} ` +
            `dominio=${peloDominio ? 'aceita' : 'recusa'}`,
        );
      }
    }
    expect(divergencias).toEqual([]);
  });

  it('nome: UpdateUserSchema aceita exatamente o que UserName.create aceita', () => {
    const divergencias: string[] = [];
    for (let len = 0; len <= 125; len += 1) {
      const nome = 'a'.repeat(len);
      const peloBoundary = UpdateUserSchema.safeParse({ novoNome: nome }).success;
      const peloDominio = voAceita(() => UserName.create(nome));
      if (peloBoundary !== peloDominio) {
        divergencias.push(
          `len=${len}: boundary=${peloBoundary ? 'aceita' : 'recusa'} ` +
            `dominio=${peloDominio ? 'aceita' : 'recusa'}`,
        );
      }
    }
    expect(divergencias).toEqual([]);
  });

  // Janela em torno dos 254 (RFC 5321 §4.5.3.1.3, "addr-spec"), que era
  // 255 no schema — um octeto de margem que o VO nunca aceitou.
  it('email: CreateUserSchema aceita exatamente o que Email.create aceita', () => {
    const divergencias: string[] = [];
    const sufixo = '@exemplo.com';
    for (let total = 245; total <= 265; total += 1) {
      const email = 'a'.repeat(total - sufixo.length) + sufixo;
      const peloBoundary = CreateUserSchema.safeParse({ nome: 'Ana', email }).success;
      const peloDominio = voAceita(() => Email.create(email));
      if (peloBoundary !== peloDominio) {
        divergencias.push(
          `len=${total}: boundary=${peloBoundary ? 'aceita' : 'recusa'} ` +
            `dominio=${peloDominio ? 'aceita' : 'recusa'}`,
        );
      }
    }
    expect(divergencias).toEqual([]);
  });
});
