// apps/api/src/modules/feature-flags/infrastructure/persistence/prisma-feature-flag.repository.integration.spec.ts
//
// pt-BR (feature-flags, 2026-10-18): a escrita das flags contra Postgres de
// verdade.
//
// POR QUE O UNITÁRIO NÃO CHEGA
// `prisma-feature-flag.repository.spec.ts` prova que `definir` chama `upsert`
// com os argumentos certos. Um mock não conhece `DEFAULT`, não tem PRIMARY KEY
// e não distingue "grava" de "grava e volta do disco". Tudo que é propriedade
// do BANCO só vira fato aqui:
//
//   1. o `DEFAULT true` da coluna — o `create` do Prisma envia `ativada`
//      explicitamente, então quem exercita o DEFAULT é o `INSERT` cruo abaixo;
//   2. a PRIMARY KEY `chave` — é ela que transforma um `create` duplicado em
//      erro, e um `update` sem linha em zero-affected;
//   3. o privilégio do papel de RUNTIME — o app conecta como `app_runtime`
//      (D10), e o `ALTER DEFAULT PRIVILEGES` da `20261020000000` é o que dá os
//      verbos numa tabela que ninguém listou. Se ele não cobrisse, tudo aqui
//      passaria no DONO e a feature quebraria em produção sem nenhum teste
//      vermelho.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import {
  setupTestDatabase,
  cleanDatabase,
  type TestContext,
} from '../../../../../test/testcontainers-helper.js';
import { uriComoPapelDeRuntime } from '../../../../shared/infrastructure/prisma/papel-de-runtime.js';
import { PrismaFeatureFlagRepository } from './prisma-feature-flag.repository.js';

describe('PrismaFeatureFlagRepository — Postgres (Fase 1)', () => {
  let ctx: TestContext;
  let repo: PrismaFeatureFlagRepository;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
    repo = new PrismaFeatureFlagRepository(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.stop();
  });

  beforeEach(async () => {
    await cleanDatabase(ctx.prisma);
  });

  it('começa vazio — nenhuma chave gravada é o estado normal', async () => {
    await expect(repo.listar()).resolves.toEqual([]);
  });

  it('grava e a leitura seguinte devolve a linha do banco', async () => {
    await repo.definir('tenancy.invites', false);

    // Cliente NOVO sobre a MESMA base: se isto devolvesse o objeto em memória,
    // a prova seria de que nada chegou ao Postgres.
    const outro = new PrismaFeatureFlagRepository(ctx.prisma);
    await expect(outro.listar()).resolves.toEqual([{ chave: 'tenancy.invites', ativada: false }]);
  });

  it('gravar duas vezes atualiza a linha em vez de criar outra', async () => {
    await repo.definir('tenancy.invites', false);
    await repo.definir('tenancy.invites', true);

    await expect(repo.listar()).resolves.toEqual([{ chave: 'tenancy.invites', ativada: true }]);
  });

  it('a coluna ativada tem DEFAULT true (o que faz linha ausente = ATIVADA)', async () => {
    // INSERT cru, sem a coluna `ativada` — é o DEFAULT do banco que decide.
    await ctx.prisma.$executeRawUnsafe(
      `INSERT INTO feature_flags (chave) VALUES ('tenancy.sem_coluna')`,
    );

    await expect(repo.listar()).resolves.toEqual([{ chave: 'tenancy.sem_coluna', ativada: true }]);
  });

  it('o papel de runtime lê e escreve (é com ele que o app conecta)', async () => {
    const prismaRuntime = new PrismaClient({
      datasourceUrl: uriComoPapelDeRuntime(ctx.uriDoBanco, ctx.senhaDoPapel),
    });
    try {
      const repoRuntime = new PrismaFeatureFlagRepository(prismaRuntime);

      await repoRuntime.definir('tenancy.invites', false);
      await expect(repoRuntime.listar()).resolves.toEqual([
        { chave: 'tenancy.invites', ativada: false },
      ]);
    } finally {
      await prismaRuntime.$disconnect();
    }
  });
});
