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
import {
  MIN_LENGTH as SENHA_MIN,
  MAX_LENGTH as SENHA_MAX,
} from '../../domain/value-objects/password-hash.vo.js';

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
  /**
   * Senha válida para acompanhar as varreduras de `nome`/`email`.
   *
   * ⚠️ MEDIDO 2026-10-13: quando `senha` passou a ser obrigatória no
   * `CreateUserSchema`, estas duas varreduras começaram a falhar em TODOS os
   * comprimentos — `boundary=recusa` contra `dominio=aceita` do 0 ao 100. A
   * causa não era paridade de `nome`: era que o payload estava incompleto,
   * e o boundary recusava por um campo que estes testes não estão medindo.
   *
   * Elas medem `nome` e `email`. Levar `senha` válida é o que as devolve ao
   * sujeito que elas declaram no nome; sem isso elas medem "falta a senha"
   * 101 vezes, que é verde falso para o defeito que foi medido em 2026-10-08.
   */
  const SENHA_OK = 'senha-super-secreta';

  // Faixa que atravessa MIN (2), MAX (100) e o `.max(120)` que o schema
  // declarava por engano. A varredura é por TODO comprimento — um
  // `.min`/`.max` literal que se move sem mover o outro aparece na
  // primeira distância entre eles, sem depender de escolher o ponto.
  it('nome: CreateUserSchema aceita exatamente o que UserName.create aceita', () => {
    const divergencias: string[] = [];
    for (let len = 0; len <= 125; len += 1) {
      const nome = 'a'.repeat(len);
      const peloBoundary = CreateUserSchema.safeParse({
        nome,
        email: 'ok@exemplo.com',
        senha: SENHA_OK,
      }).success;
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
      const peloBoundary = CreateUserSchema.safeParse({
        nome: 'Ana',
        email,
        senha: SENHA_OK,
      }).success;
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

  // ── senha ────────────────────────────────────────────────────────────────
  //
  // ⚠️ O lado "domínio" aqui NÃO pode ser `PasswordHash.create`, como é nos
  // casos de nome e email — e essa é a diferença que este teste documenta.
  // `PasswordHash.create` valida um HASH argon2id (formato), enquanto estes
  // limites descrevem a SENHA EM CLARO (8..72). Aplicar `PasswordHash.create`
  // como oráculo reprovaria toda senha válida (`'aaaaaaaa'` não é argon2id)
  // e reprovaria todo HASH válido do outro lado (~96 chars > 72). Ver o aviso
  // "MIN_LENGTH/MAX_LENGTH: POLÍTICA DA SENHA, NÃO TAMANHO DO HASH" no topo
  // de `password-hash.vo.ts`.
  //
  // A referência é a política exportada pelo VO — a MESMA que o boundary
  // importa. A varredura existe pelo mesmo motivo dos outros dois campos: um
  // `.min(6)`/`.max(60)` literal no schema divergiria do VO em todo comprimento
  // entre o número do schema e o número do VO, e o sintoma é o mesmo do
  // medido em 2026-10-08 — 400 que não vem, ou 500 que vem.
  it('senha: CreateUserSchema aceita exatamente a faixa MIN_LENGTH..MAX_LENGTH do VO', () => {
    const divergencias: string[] = [];
    for (let len = 0; len <= 80; len += 1) {
      const senha = 'a'.repeat(len);
      const peloBoundary = CreateUserSchema.safeParse({
        nome: 'Ana',
        email: 'ok@exemplo.com',
        senha,
      }).success;
      const peloDominio = len >= SENHA_MIN && len <= SENHA_MAX;
      if (peloBoundary !== peloDominio) {
        divergencias.push(
          `len=${len}: boundary=${peloBoundary ? 'aceita' : 'recusa'} ` +
            `dominio=${peloDominio ? 'aceita' : 'recusa'}`,
        );
      }
    }
    expect(divergencias).toEqual([]);
  });

  // O `senha` é OBRIGATÓRIO: um cadastro sem senha criaria um User que nunca
  // consegue autenticar, e o defeito só apareceria no login (Fase 4) como
  // "credencial inválida para sempre". Rejeitar no boundary é o ponto do
  // schema existir.
  it('senha ausente é recusado pelo boundary (campo obrigatório)', () => {
    const semSenha = CreateUserSchema.safeParse({ nome: 'Ana', email: 'ok@exemplo.com' });
    expect(semSenha.success).toBe(false);
  });

  // `passwordHash` é o nome da COLUNA; `senha` é o que o cliente manda. Se o
  // boundary aceitasse `passwordHash`, um POST mandando o hash — ou a senha em
  // claro num campo com cara de hash — entraria sem passar por `hash()`.
  it('boundary não aceita passwordHash no lugar de senha', () => {
    const comHash = CreateUserSchema.safeParse({
      nome: 'Ana',
      email: 'ok@exemplo.com',
      passwordHash: '$argon2id$v=19$m=65536,p=4,t=3$c2FsdA$bG9uZ2E',
    });
    expect(comHash.success).toBe(false);
  });
});
