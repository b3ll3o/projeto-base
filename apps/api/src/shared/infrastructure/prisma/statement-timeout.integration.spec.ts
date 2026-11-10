// apps/api/src/shared/infrastructure/prisma/statement-timeout.integration.spec.ts
//
// pt-BR (2026-11-10 — conformidade do system design): o ORÇAMENTO DE TEMPO
// da API no banco, medido contra Postgres de verdade.
//
// O QUE ESTA SPEC PROVA
//
// `docs/system-design/operacao.md` §6 afirmava: "API → banco | **nenhum** |
// não há `statement_timeout` no papel de runtime — a query espera o Postgres
// desistir". Sem orçamento, um `SELECT` lento segura a conexão do pool até
// o Postgres desistir — e o pool é o limite de escala da API.
//
// MEDIDO 2026-11-10, no Postgres 16 local, ANTES da migration
// `20261110000000_statement_timeout_do_papel`:
//
//   $ psql -U app_runtime -c 'SHOW statement_timeout'
//   statement_timeout
//   ------------------
//   0            ← 0 = SEM LIMITE
//
// DEPOIS: `8s`. A spec existe para que a propriedade seja MEDIDA a cada
// migration — e não lembrada.
//
// ⚠️ O DONO (o papel que roda a migration) NÃO é afetado: o orçamento é do
// papel da API, e uma migration longa precisa poder rodar.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestDatabase, type TestContext } from '../../../../test/testcontainers-helper.js';
import {
  STATEMENT_TIMEOUT_DO_PAPEL,
  uriComoPapelDeRuntime,
  uriComoPapelDeSistema,
} from './papel-de-runtime.js';

/** O orçamento que a sessão está usando agora. */
const CONSULTA = "SELECT current_setting('statement_timeout') AS timeout_do_papel";

describe('O orçamento de tempo do banco (statement_timeout do papel)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('a sessão do papel de RUNTIME tem o orçamento que a migration declara', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const runtime = new PrismaClient({
      datasourceUrl: uriComoPapelDeRuntime(ctx.uriDoBanco, ctx.senhaDoPapel),
    });
    try {
      const linhas = await runtime.$queryRawUnsafe<{ timeout_do_papel: string }[]>(CONSULTA);
      expect(linhas).toEqual([{ timeout_do_papel: STATEMENT_TIMEOUT_DO_PAPEL }]);
      // E o número NÃO é zero — `0` é "sem limite", que é a lacuna fechada.
      expect(linhas[0]?.timeout_do_papel).not.toBe('0');
    } finally {
      await runtime.$disconnect();
    }
  });

  it('a sessão do papel de SISTEMA tem o mesmo orçamento', async () => {
    // O bucket de sistema (login, refresh, logout e a idempotência) fala com
    // o mesmo banco — e uma query lenta ali segura a conexão do mesmo jeito.
    const { PrismaClient } = await import('@prisma/client');
    const sistema = new PrismaClient({
      datasourceUrl: uriComoPapelDeSistema(ctx.uriDoBanco, ctx.senhaDoPapel),
    });
    try {
      const linhas = await sistema.$queryRawUnsafe<{ timeout_do_papel: string }[]>(CONSULTA);
      expect(linhas).toEqual([{ timeout_do_papel: STATEMENT_TIMEOUT_DO_PAPEL }]);
    } finally {
      await sistema.$disconnect();
    }
  });

  it('o DONO — o papel que roda a migration — NÃO fica com o orçamento da API', async () => {
    // O `ALTER ROLE` é do papel, não do banco: uma migration longa (criar
    // índice, backfill) precisa poder rodar sem ser cortada pela metade.
    const linhas = await ctx.prisma.$queryRawUnsafe<{ timeout_do_papel: string }[]>(CONSULTA);
    expect(linhas[0]?.timeout_do_papel).not.toBe(STATEMENT_TIMEOUT_DO_PAPEL);
  });
});
