// apps/api/test/e2e/scenarios/17-idempotencia-de-escrita.e2e.spec.ts
//
// pt-BR (2026-11-10 — conformidade do system design): o RETRY SEGURO de uma
// escrita.
//
// A lacuna que este spec fecha está em `docs/system-design/dados.md` §6:
// "retry não é seguro — um cliente que repete por timeout **não tem como
// saber** se a primeira gravou, e recebe 409 no lugar de 201".
//
// ⚠️ POR QUE O SPEC É CONTRA O BANCO, E NÃO CONTRA UM DOUBLÊ
//
// A pergunta que importa é "o retry duplicou a linha?", e a resposta só sai
// do banco: dois requests com a mesma chave tem de produzir **UM** usuário.
// Um dublê de port mediria a decisão do interceptor — e essa é a outra spec
// (`idempotency.interceptor.spec.ts`).

import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import { bootstrapE2E, teardownE2E, type E2EContext } from '../test-app.helper.js';

const USERS = '/api/v1/users';
const CHAVE = 'chave-de-teste-idempotencia-1';

const CORPO = {
  nome: 'Joao Retry',
  email: 'joao-retry@projeto.test',
  senha: 'senha-de-teste-do-harness-e2e',
};

describe('A idempotência de escrita (Idempotency-Key)', () => {
  let e2e: E2EContext;

  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });
  afterAll(async () => {
    await teardownE2E(e2e);
  });

  it('o MESMO pedido com a MESMA chave devolve a MESMA resposta', async () => {
    const primeiro = await e2e.app.inject({
      method: 'POST',
      url: USERS,
      headers: { 'idempotency-key': CHAVE },
      payload: CORPO,
    });
    expect(primeiro.statusCode).toBe(201);
    expect(primeiro.headers['idempotency-replayed']).toBeUndefined();

    const segundo = await e2e.app.inject({
      method: 'POST',
      url: USERS,
      headers: { 'idempotency-key': CHAVE },
      payload: CORPO,
    });

    // O status é o da PRIMEIRA execução, e o corpo é o MESMO — inclusive o
    // id do usuário, que é o que prova que a operação não rodou de novo.
    expect(segundo.statusCode).toBe(201);
    expect(segundo.headers['idempotency-replayed']).toBe('true');
    expect(segundo.json()).toEqual(primeiro.json());
    // E o `ETag` volta: a resposta do retry tem de ser a MESMA da original
    // (o `ETag` é o que o cliente usa para montar o `If-Match` do PATCH).
    expect(segundo.headers['etag']).toBe(primeiro.headers['etag']);
  });

  it('o retry NÃO duplica a linha — o banco tem UM usuário', async () => {
    const usuarios = await e2e.ctx.prisma.user.count({ where: { email: CORPO.email } });
    expect(usuarios).toBe(1);
  });

  it('a MESMA chave com OUTRO corpo é conflito (409), e nada é criado', async () => {
    const outro = await e2e.app.inject({
      method: 'POST',
      url: USERS,
      headers: { 'idempotency-key': CHAVE },
      payload: { ...CORPO, email: 'outro-retry@projeto.test' },
    });

    expect(outro.statusCode).toBe(409);
    const criados = await e2e.ctx.prisma.user.count({
      where: { email: 'outro-retry@projeto.test' },
    });
    expect(criados).toBe(0);
  });

  it('SEM a chave, o pedido é o de sempre (nada muda para quem não pediu)', async () => {
    const semChave = await e2e.app.inject({
      method: 'POST',
      url: USERS,
      payload: { ...CORPO, email: 'sem-chave@projeto.test' },
    });
    expect(semChave.statusCode).toBe(201);
    expect(semChave.headers['idempotency-replayed']).toBeUndefined();
  });
});
