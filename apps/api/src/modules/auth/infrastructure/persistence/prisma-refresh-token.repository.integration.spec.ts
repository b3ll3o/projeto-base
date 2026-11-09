// apps/api/src/modules/auth/infrastructure/persistence/prisma-refresh-token.repository.integration.spec.ts
//
// pt-BR (#132): o REGISTRO de refresh tokens contra Postgres de verdade.
//
// O QUE ESTE ARQUIVO PROVA, E O UNITÁRIO NÃO PROVE
//
// O unitário (`auth-use-cases.spec.ts`) mede a DECISÃO — quem revoga, e
// quando. Este mede o ARMAZENAMENTO: que a revogação sobrevive a um
// `restart`, que o `jti` é único, que a revogação é idempotente, e — o mais
// importante — que a CONTA do runtime NÃO alcança a tabela.
//
// ⚠️ A última é a que fecha o furo: `ALTER DEFAULT PRIVILEGES` dá CRUD em
// toda tabela nova para `app_runtime`, e `app_runtime` é a credencial que o
// próprio repo classifica como "a que mais vaza". Com UPDATE liberado, ela
// desrevogaria qualquer refresh token — e a revogação seria um controle que
// a credencial mais exposta consegue desfazer.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  setupTestDatabase,
  cleanDatabase,
  type TestContext,
} from '../../../../../test/testcontainers-helper.js';
import { PrismaRefreshTokenRepository } from './prisma-refresh-token.repository.js';
import { uriComoPapelDeRuntime } from '../../../../shared/infrastructure/prisma/papel-de-runtime.js';

describe('PrismaRefreshTokenRepository — o registro de revogação (#132)', () => {
  let ctx: TestContext;
  let repo: PrismaRefreshTokenRepository;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
    // ⚠️ O construtor é VAZIO de propósito: o cliente que o repositório
    // usa é o de SISTEMA, e ele vem do AMBIENTE (`comEscopoDeSistema`).
    repo = new PrismaRefreshTokenRepository();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  /** Uma conta de verdade — o registro tem FK para `users`. */
  async function conta(): Promise<string> {
    const user = await ctx.prisma.user.create({
      data: {
        id: randomUUID(),
        email: `ana-${randomUUID()}@acme.dev`,
        name: 'Ana',
        passwordHash: 'x',
      },
    });
    return user.id;
  }

  it('um `jti` registrado está ATIVO', async () => {
    await cleanDatabase(ctx.prisma);
    const userId = await conta();

    await repo.registrar('jti-1', userId, new Date(Date.now() + 60_000));

    expect(await repo.estadoDe('jti-1')).toEqual({
      registrado: true,
      revogadoEm: null,
      userId: expect.any(String),
    });
  });

  it('um `jti` NUNCA registrado é DESCONHECIDO', async () => {
    await cleanDatabase(ctx.prisma);

    expect(await repo.estadoDe('jti-que-nao-existe')).toEqual({
      registrado: false,
      revogadoEm: null,
      userId: null,
    });
  });

  it('revogar muda o estado para REVOGADO — e a revogação persiste', async () => {
    await cleanDatabase(ctx.prisma);
    const userId = await conta();
    await repo.registrar('jti-1', userId, new Date(Date.now() + 60_000));

    await repo.revogar('jti-1');

    const estado = await repo.estadoDe('jti-1');
    expect(estado.registrado).toBe(true);
    expect(estado.revogadoEm).toBeInstanceOf(Date);
  });

  it('revogar é IDEMPOTENTE — revogar um `jti` revogado não muda o instante', async () => {
    await cleanDatabase(ctx.prisma);
    const userId = await conta();
    await repo.registrar('jti-1', userId, new Date(Date.now() + 60_000));

    await repo.revogar('jti-1');
    const primeiro = (await repo.estadoDe('jti-1')).revogadoEm;
    await repo.revogar('jti-1');
    const segundo = (await repo.estadoDe('jti-1')).revogadoEm;

    expect(segundo?.getTime()).toBe(primeiro?.getTime());
  });

  it('`revogarTodosDoUsuario` derruba os tokens VIVOS da conta — e só dela', async () => {
    await cleanDatabase(ctx.prisma);
    const ana = await conta();
    const bruno = await conta();
    await repo.registrar('jti-ana-1', ana, new Date(Date.now() + 60_000));
    await repo.registrar('jti-ana-2', ana, new Date(Date.now() + 60_000));
    await repo.registrar('jti-bruno-1', bruno, new Date(Date.now() + 60_000));

    await repo.revogarTodosDoUsuario(ana);

    expect((await repo.estadoDe('jti-ana-1')).revogadoEm).toBeInstanceOf(Date);
    expect((await repo.estadoDe('jti-ana-2')).revogadoEm).toBeInstanceOf(Date);
    // A conta do Bruno NÃO é derrubada — a revogação é por usuário.
    expect((await repo.estadoDe('jti-bruno-1')).revogadoEm).toBeNull();
  });

  it('registrar de novo NÃO ressuscita um token revogado', async () => {
    await cleanDatabase(ctx.prisma);
    const userId = await conta();
    await repo.registrar('jti-1', userId, new Date(Date.now() + 60_000));
    await repo.revogar('jti-1');

    // Um `registrar` repetido (o login pode ser repetido) NÃO pode
    // DESPREVOGAR: o `upsert` do repositório só atualiza o prazo.
    await repo.registrar('jti-1', userId, new Date(Date.now() + 120_000));

    expect((await repo.estadoDe('jti-1')).revogadoEm).toBeInstanceOf(Date);
  });

  it('ROTACIONAR consome o antigo e registra o novo — e é ATÔMICA', async () => {
    await cleanDatabase(ctx.prisma);
    const userId = await conta();
    await repo.registrar('jti-1', userId, new Date(Date.now() + 60_000));

    const rotacionou = await repo.rotacionar(
      'jti-1',
      'jti-2',
      userId,
      new Date(Date.now() + 120_000),
    );

    expect(rotacionou).toBe(true);
    // O antigo foi consumido...
    expect((await repo.estadoDe('jti-1')).revogadoEm).toBeInstanceOf(Date);
    // ...e o novo está registrado e ATIVO.
    expect(await repo.estadoDe('jti-2')).toEqual({
      registrado: true,
      revogadoEm: null,
      userId,
    });
  });

  it('⚠️ DIFERENCIAL: a rotação é ATÔMICA — a falha entre o consumo e o registro NÃO consome o token antigo', async () => {
    // ⚠️ A PROPRIEDADE que o PR vende: "rotação, numa transação só" (#132).
    // Os testes acima só medem o caminho feliz — os DOIS efeitos presentes.
    // MEDIDO por mutação: tirando a transação (consumo e registro em duas),
    // a suíte inteira continuava VERDE — e a atomicidade ficava sem dente.
    //
    // A falha é injetada pelo `jti` novo: o `create` do token novo colide
    // com um registro que JÁ existe (P2002), e a transação inteira é
    // desfeita. O token antigo tem de CONTINUAR ATIVO — e é isso que
    // distingue "uma transação" de "duas".
    await cleanDatabase(ctx.prisma);
    const userId = await conta();
    await repo.registrar('jti-1', userId, new Date(Date.now() + 60_000));
    // O `jti` novo JÁ EXISTE — e o `create` do repositório vai colidir.
    await repo.registrar('jti-2', userId, new Date(Date.now() + 60_000));

    await expect(
      repo.rotacionar('jti-1', 'jti-2', userId, new Date(Date.now() + 120_000)),
    ).rejects.toThrow();

    // ⚠️ O DIFERENCIAL: com DUAS transações, o consumo do `jti-1` ficaria
    // VALENDO (a primeira já tinha commitado) — e quem pegasse o intervalo
    // ficaria SEM refresh token nenhum, sem caminho de recuperação. É o
    // cenário que o comentário do código descreve.
    expect((await repo.estadoDe('jti-1')).revogadoEm).toBeNull();
  });

  it('ROTACIONAR um `jti` já consumido devolve `false` — e NÃO registra o novo', async () => {
    // ⚠️ A atomicidade: quando o consumo falha, o registro novo também não
    // acontece (a transação inteira é desfeita). Sem isso, um token novo
    // nasceria sem estar no registro — e o próximo refresh dele seria
    // recusado como "desconhecido".
    await cleanDatabase(ctx.prisma);
    const userId = await conta();
    await repo.registrar('jti-1', userId, new Date(Date.now() + 60_000));

    const primeiro = await repo.rotacionar(
      'jti-1',
      'jti-2',
      userId,
      new Date(Date.now() + 120_000),
    );
    expect(primeiro).toBe(true);

    // O segundo, com o MESMO `jti` antigo: o consumo falha.
    const segundo = await repo.rotacionar('jti-1', 'jti-3', userId, new Date(Date.now() + 120_000));
    expect(segundo).toBe(false);
    // E o `jti-3` NÃO foi registrado.
    expect((await repo.estadoDe('jti-3')).registrado).toBe(false);
  });

  it('o estado devolve o DONO do registro — a fonte autoritativa do replay', async () => {
    await cleanDatabase(ctx.prisma);
    const userId = await conta();
    await repo.registrar('jti-1', userId, new Date(Date.now() + 60_000));

    // ⚠️ A detecção de replay revoga a conta inteira, e o alvo tem de ser o
    // dono do REGISTRO — e não o `sub` do token, que é o que o portador tem.
    expect((await repo.estadoDe('jti-1')).userId).toBe(userId);
  });

  it('⚠️ o papel de RUNTIME NÃO alcança a tabela (a revogação é um controle real)', async () => {
    // Este é o teste que fecha o furo da supply chain de credencial: o
    // `app_runtime` é a credencial que vive no container da API — a que mais
    // vaza. Se ela alcançasse a tabela, um `UPDATE refresh_tokens SET
    // revoked_at = NULL` desrevogaria qualquer token — inclusive o token
    // roubado que disparou a detecção de replay.
    await cleanDatabase(ctx.prisma);
    const userId = await conta();
    await repo.registrar('jti-1', userId, new Date(Date.now() + 60_000));

    const { PrismaClient } = await import('@prisma/client');
    const runtime = new PrismaClient({
      datasourceUrl: uriComoPapelDeRuntime(ctx.uriDoBanco, ctx.senhaDoPapel),
    });
    try {
      // ⚠️ O MATCHER importa: `rejects.toThrow()` sem matcher aceitaria
      // QUALQUER erro — inclusive "a tabela não existe" ou "URL inválida" —
      // e o teste passaria verde mesmo que o papel de runtime NÃO fosse
      // lido do banco. O `42501` é o `insufficient_privilege` do Postgres:
      // é ele que diz que a credencial foi barrada pelo GRANT, e não por
      // qualquer outra coisa.
      await expect(
        runtime.refreshToken.updateMany({
          where: { jti: 'jti-1' },
          data: { revokedAt: null },
        }),
      ).rejects.toThrow(/42501|insufficient privilege/i);
      // E a leitura também é barrada — a tabela é do caminho de SISTEMA.
      await expect(runtime.refreshToken.findMany({})).rejects.toThrow(
        /42501|insufficient privilege/i,
      );
    } finally {
      await runtime.$disconnect();
    }

    // O dono (o verificador) enxerga, e o estado é o de antes.
    expect((await repo.estadoDe('jti-1')).revogadoEm).toBeNull();
  });
});
