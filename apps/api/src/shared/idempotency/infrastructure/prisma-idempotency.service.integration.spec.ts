// apps/api/src/shared/idempotency/infrastructure/prisma-idempotency.service.integration.spec.ts
//
// pt-BR (2026-11-10 — conformidade do system design): o REGISTRO de
// idempotência contra Postgres de verdade.
//
// O QUE ESTE ARQUIVO PROVA, E O UNITÁRIO NÃO PROVE
//
// O unitário (`idempotency.interceptor.spec.ts`) mede a DECISÃO do
// interceptor, com o port dublê. Este mede o ARMAZENAMENTO: que a reserva é
// ÚNICA (o `P2002` é o caminho do replay, não um erro), que a resposta
// guardada volta igual, que uma chave EXPIRADA pode ser reusada, e — o mais
// importante — que a CONTA de runtime NÃO alcança a tabela.
//
// ⚠️ A última é a que fecha o furo: a resposta guardada é PII de outra
// empresa (o corpo do `POST /users` tem nome e e-mail), e a RLS é o que
// impede o papel de runtime de ler a base de outra empresa. Uma tabela sem
// RLS legível pelo runtime seria a primeira brecha desse controle.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestDatabase,
  cleanDatabase,
  type TestContext,
} from '../../../../test/testcontainers-helper.js';
import { uriComoPapelDeRuntime } from '../../infrastructure/prisma/papel-de-runtime.js';
import { PrismaIdempotencyService } from './prisma-idempotency.service.js';

const PEDIDO = {
  chave: 'chave-1',
  ator: 'ator-1',
  rota: '/api/v1/users',
  impressao: 'impressao-1',
};

describe('PrismaIdempotencyService — o registro da chave', () => {
  let ctx: TestContext;
  let servico: PrismaIdempotencyService;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
    servico = new PrismaIdempotencyService();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('a chave LIBRE é reservada — e a segunda reserva da MESMA chave é "em voo"', async () => {
    await cleanDatabase(ctx.prisma);

    expect(await servico.reservar(PEDIDO)).toEqual({ estado: 'livre' });
    // A segunda reserva encontra a linha reservada, SEM resposta: é o que
    // impede dois requests com a mesma chave de executarem ao mesmo tempo.
    expect(await servico.reservar(PEDIDO)).toEqual({ estado: 'em_voo' });
  });

  it('com a resposta guardada, a reserva devolve o REPLAY — com o status e o corpo', async () => {
    await cleanDatabase(ctx.prisma);
    await servico.reservar(PEDIDO);
    await servico.guardar({
      chave: PEDIDO.chave,
      ator: PEDIDO.ator,
      status: 201,
      resposta: { id: 'u-1', nome: 'João' },
      headers: { etag: 'W/"v1"' },
    });

    expect(await servico.reservar(PEDIDO)).toEqual({
      estado: 'replay',
      status: 201,
      resposta: { id: 'u-1', nome: 'João' },
      // Os headers que a aplicação escreveu voltam com o replay — sem
      // eles, a resposta do retry não seria a mesma da original.
      headers: { etag: 'W/"v1"' },
    });
  });

  it('a MESMA chave com OUTRA impressão é CONFLITO', async () => {
    await cleanDatabase(ctx.prisma);
    await servico.reservar(PEDIDO);

    expect(await servico.reservar({ ...PEDIDO, impressao: 'impressao-2' })).toEqual({
      estado: 'conflito',
    });
  });

  it('depois de LIBERAR, a chave pode ser reservada de novo', async () => {
    await cleanDatabase(ctx.prisma);
    await servico.reservar(PEDIDO);
    await servico.liberar({ chave: PEDIDO.chave, ator: PEDIDO.ator });

    expect(await servico.reservar(PEDIDO)).toEqual({ estado: 'livre' });
  });

  it('a chave é escopada pelo ATOR — a de um não vale para o outro', async () => {
    await cleanDatabase(ctx.prisma);
    await servico.reservar(PEDIDO);

    // Outro ator, MESMA chave: é outra reserva.
    expect(await servico.reservar({ ...PEDIDO, ator: 'ator-2' })).toEqual({ estado: 'livre' });
  });

  it('uma chave EXPIRADA pode ser reusada', async () => {
    await cleanDatabase(ctx.prisma);
    await servico.reservar(PEDIDO);
    // Envelhece a chave: a validade é de 24 h, e aqui ela vira uma que já
    // passou — sem isso, o pedido com a chave expirada levaria "em voo".
    await ctx.prisma.idempotencyKey.updateMany({
      where: { key: PEDIDO.chave },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await servico.reservar(PEDIDO)).toEqual({ estado: 'livre' });
  });

  // ⚠️ A CORRIDA que a RECONQUISTA ATÔMICA fecha: os dois requests leem a
  // linha expirada; e o que um deles faz com ela NÃO pode apagar a reserva
  // que o outro acabou de fazer. Com um DELETE sem condição, os dois
  // saíam com `livre` — e a operação rodava DUAS vezes, que é exatamente o
  // que a chave existe para impedir.
  //
  // São 5 rodadas porque a ordem que denuncia o defeito é uma das
  // interleavings possíveis: com uma rodada só, o teste passaria verde
  // contra o código defeituoso.
  it('DUAS reservas concorrentes da MESMA chave expirada: só uma fica "livre"', async () => {
    for (let rodada = 1; rodada <= 5; rodada += 1) {
      await cleanDatabase(ctx.prisma);
      await servico.reservar(PEDIDO);
      await ctx.prisma.idempotencyKey.updateMany({
        where: { key: PEDIDO.chave },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const [a, b] = await Promise.all([servico.reservar(PEDIDO), servico.reservar(PEDIDO)]);

      const livres = [a, b].filter((r) => r.estado === 'livre');
      expect(livres, `rodada ${rodada}: a chave é de UM request`).toHaveLength(1);
    }
  });

  // A reserva reconquistada NÃO herda a resposta antiga: a chave foi reusada,
  // e o que estava guardado é de um pedido que já expirou.
  it('a chave reconquistada começa VAZIA — a resposta antiga não volta', async () => {
    await cleanDatabase(ctx.prisma);
    await servico.reservar(PEDIDO);
    await servico.guardar({
      chave: PEDIDO.chave,
      ator: PEDIDO.ator,
      status: 201,
      resposta: { id: 'u-antigo' },
      headers: { etag: 'W/"v1"' },
    });
    // A chave expira e é reconquistada por OUTRO pedido (impressão diferente).
    await ctx.prisma.idempotencyKey.updateMany({
      where: { key: PEDIDO.chave },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await servico.reservar({ ...PEDIDO, impressao: 'impressao-2' })).toEqual({
      estado: 'livre',
    });
    const linha = await ctx.prisma.idempotencyKey.findUnique({
      where: { key_actor: { key: PEDIDO.chave, actor: PEDIDO.ator } },
    });
    expect(linha?.status).toBeNull();
    expect(linha?.response).toBeNull();
  });

  it('⚠️ o papel de RUNTIME NÃO alcança a tabela (a resposta guardada é PII)', async () => {
    await cleanDatabase(ctx.prisma);
    await servico.reservar(PEDIDO);
    await servico.guardar({
      chave: PEDIDO.chave,
      ator: PEDIDO.ator,
      status: 201,
      resposta: { id: 'u-1', email: 'pessoa@empresa.dev' },
      headers: {},
    });

    const { PrismaClient } = await import('@prisma/client');
    const runtime = new PrismaClient({
      datasourceUrl: uriComoPapelDeRuntime(ctx.uriDoBanco, ctx.senhaDoPapel),
    });
    try {
      // ⚠️ O MATCHER importa: `rejects.toThrow()` sem matcher aceitaria
      // QUALQUER erro — inclusive "a tabela não existe" — e o teste passaria
      // verde mesmo que o papel não fosse lido do banco. O `42501` é o
      // `insufficient_privilege` do Postgres: é ele que diz que a credencial
      // foi barrada pelo REVOKE, e não por qualquer outra coisa.
      await expect(runtime.idempotencyKey.findMany({})).rejects.toThrow(
        /42501|insufficient privilege/i,
      );
    } finally {
      await runtime.$disconnect();
    }
  });
});
