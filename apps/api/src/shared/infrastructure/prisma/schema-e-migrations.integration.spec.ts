// apps/api/src/shared/infrastructure/prisma/schema-e-migrations.integration.spec.ts
//
// pt-BR (issue #183 — 2026-11-25): o SCHEMA tem que CASAR com o BANCO, e o
// caminho oficial de criação de migration tem que funcionar.
//
// O QUE ESTA SPEC PROVA
//
// 1. **O drift é ZERO.** `prisma migrate diff` do banco vivo para o datamodel
//    sai vazio. Antes do conserto ele propunha 12 ALTERs: 6 conversões de
//    timestamp (TIMESTAMPTZ → TIMESTAMP(3)) e 4 `DROP DEFAULT` de id.
//
// 2. **O `prisma migrate dev` funciona** — o caminho oficial de criação de
//    migration. Ele morria com P3006/P1014 porque a migration
//    `20261020000003_revoke_prisma_migrations` fazia `REVOKE ALL ON
//    _prisma_migrations` numa base onde a tabela não existe: o SHADOW DATABASE
//    que o `migrate dev` cria para replayar as migrations não tem a tabela
//    `_prisma_migrations` (ela é do banco ALVO). MEDIDO antes do conserto:
//      Error: P3006
//      Migration `20261020000003_revoke_prisma_migrations` failed to apply
//      cleanly to the shadow database.
//      Error code: P1014
//      The underlying table for model `_prisma_migrations` does not exist.
//
// 3. **Um instante gravado e relido em sessão não-UTC não muda de valor.** O
//    drift de timestamp fazia o `ALTER ... SET DATA TYPE TIMESTAMP(3)`
//    reinterpretar o instante como hora-local do servidor: MEDIDO no Postgres
//    16, '2026-11-23 05:14:55+00' virava '2026-11-23 02:14:55' numa sessão
//    America/Sao_Paulo — 3 horas de deslocamento silencioso.
//
// POR QUE UM SPEC E NÃO UM GATE
//
// O `prisma migrate diff` e o `prisma migrate dev` são comandos que falam com
// o banco — e este repo mede o banco de verdade (container do Testcontainers),
// não uma fixture. Um gate de CI que roda `migrate diff` contra um banco
// efêmero é o mesmo trabalho com mais peças; o spec é o lugar onde o repo já
// mede o Postgres real.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupTestDatabase, type TestContext } from '../../../../test/testcontainers-helper.js';

/** O schema da aplicação, relativo à raiz de `apps/api`. */
const SCHEMA_DA_APLICACAO = 'prisma/schema.prisma';

/** O nome do banco de sondagem — vive no MESMO container, é descartado no fim. */
const BANCO_DE_SONDAGEM = 'sonda_do_migrate_dev';

/** Uma sessão em São Paulo: o fuso que fazia o instante mudar de valor. */
const FUSO_NAO_UTC = 'America/Sao_Paulo';

/**
 * O bloco `CREATE TABLE` de UMA tabela dentro de um DDL.
 *
 * O DDL canônico do Prisma traz todas as tabelas, e a verificação é POR
 * TABELA: `users`, `tenants`, `invitations` e `tenant_memberships` têm
 * `TIMESTAMP(3)` nos DOIS lados (o banco as criou assim) — acusar nelas seria
 * acusar o acerto.
 */
function blocoDaTabela(ddl: string, tabela: string): string {
  const inicio = ddl.indexOf(`CREATE TABLE "${tabela}"`);
  if (inicio < 0) return '';
  const fim = ddl.indexOf(');', inicio);
  return ddl.slice(inicio, fim < 0 ? undefined : fim);
}

describe('O schema casa com o banco (issue #183)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('o `prisma migrate diff` do banco para o datamodel sai VAZIO', () => {
    // MEDIDO: sem o conserto, o diff propunha 5 `ALTER TABLE` com 13 cláusulas
    // de `ALTER COLUMN` — 6 conversões de tipo de timestamp, 4 `DROP DEFAULT`
    // de id e 3 `DROP DEFAULT` de `updated_at`. O conserto é o schema casar
    // com o banco (o BANCO é o que já está em todo ambiente aplicado).
    const saida = execFileSync(
      'pnpm',
      [
        'exec',
        'prisma',
        'migrate',
        'diff',
        '--from-url',
        ctx.uriDoBanco,
        '--to-schema-datamodel',
        SCHEMA_DA_APLICACAO,
        '--script',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    // A saída canônica do Prisma para "nada a fazer" é esta linha — e ela é
    // literalmente o que o `prisma migrate dev` grava numa migration vazia.
    expect(saida.trim()).toContain('This is an empty migration');
    // A asserção que morde: nenhum ALTER no corpo.
    expect(saida).not.toMatch(/ALTER TABLE/i);
  });

  it('o `prisma migrate dev` roda numa base limpa (shadow database incluída)', async () => {
    // O `migrate dev` é o que CRIA migration — e o que morreu com P3006/P1014.
    // Aqui ele roda contra um banco NOVO do container (o `migrate deploy` do
    // helper já aplicou as migrations no banco principal) e contra um SHADOW
    // DATABASE que o próprio comando cria.
    //
    // ⚠️ O `migrate dev` escreve a migration gerada na pasta de migrations do
    // schema que ele lê — por isso o schema e as migrations vão para uma
    // CÓPIA temporária, e a pasta do repo fica intocada.
    const pastaTemporaria = mkdtempSync(join(tmpdir(), 'sonda-migrate-dev-'));
    try {
      cpSync('prisma', join(pastaTemporaria, 'prisma'), { recursive: true });

      // O banco de sondagem nasce do zero: as migrations são aplicadas nele do
      // começo, e é esse replay que o shadow database repete.
      //
      // ⚠️ O `CREATE DATABASE` roda pela conexão de MANUTENÇÃO (o banco
      // `postgres`), não pela do banco do spec: `CREATE DATABASE` não pode
      // rodar de dentro do banco que ele cria. E o `psql` não existe no host
      // (MEDIDO) — o dono do banco é alcançado pelo próprio `PrismaClient`.
      const { PrismaClient } = await import('@prisma/client');
      const manutencao = new PrismaClient({
        datasourceUrl: ctx.uriDoBanco.replace(/\/[^/]+(\?|$)/, '/postgres$1'),
      });
      try {
        await manutencao.$executeRawUnsafe(`DROP DATABASE IF EXISTS ${BANCO_DE_SONDAGEM}`);
        await manutencao.$executeRawUnsafe(`CREATE DATABASE ${BANCO_DE_SONDAGEM}`);
      } finally {
        await manutencao.$disconnect();
      }

      const uriDaSonda = ctx.uriDoBanco.replace(/\/[^/]+(\?|$)/, `/${BANCO_DE_SONDAGEM}$1`);
      const saida = execFileSync(
        'pnpm',
        [
          'exec',
          'prisma',
          'migrate',
          'dev',
          '--create-only',
          '--name',
          'sonda_do_spec',
          '--schema',
          join(pastaTemporaria, 'prisma', 'schema.prisma'),
        ],
        {
          cwd: process.cwd(),
          encoding: 'utf8',
          env: { ...process.env, DATABASE_URL: uriDaSonda, DIRECT_DATABASE_URL: uriDaSonda },
        },
      );

      // A falha que o conserto fecha é um código de erro do Prisma — o
      // processo sai com status != 0 e a mensagem traz P3006/P1014.
      expect(saida).not.toMatch(/P3006|P1014/);
      expect(saida).toContain('Prisma Migrate created the following migration');
    } finally {
      rmSync(pastaTemporaria, { recursive: true, force: true });
    }
  }, 180_000);

  it('o datamodel declara as colunas de tempo COM fuso, como o banco', () => {
    // O DDL canônico do Prisma é o que o `migrate dev` materializaria. Sem o
    // conserto ele dizia `TIMESTAMP(3)` — a parede de relógio, sem fuso —, e o
    // banco tem `TIMESTAMPTZ`. Esta é a asserção que **discrimina**: ela
    // falha no schema antigo mesmo com o banco já correto, porque o que
    // estava errado era o lado do DATAMODEL.
    const ddl = execFileSync(
      'pnpm',
      [
        'exec',
        'prisma',
        'migrate',
        'diff',
        '--from-empty',
        '--to-schema-datamodel',
        SCHEMA_DA_APLICACAO,
        '--script',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    // As 6 colunas drifted: `profiles` (2), `authorizations` (2) e
    // `feature_flags` (2).
    //
    // ⚠️ A asserção é POR TABELA: outras tabelas (`users`, `tenants`,
    // `invitations`, `tenant_memberships`) têmm `TIMESTAMP(3)` nos DOIS lados
    // — o banco as criou assim —, e acusar nelas seria acusar o acerto.
    for (const tabela of ['profiles', 'authorizations', 'feature_flags']) {
      const bloco = blocoDaTabela(ddl, tabela);
      expect(bloco, `a tabela ${tabela} não apareceu no DDL canônico`).toContain(
        '"created_at" TIMESTAMPTZ(6)',
      );
      expect(bloco).toContain('"updated_at" TIMESTAMPTZ(6)');
      expect(bloco).not.toContain('TIMESTAMP(3)');
    }
  });

  // ⚠️ Este caso NÃO discrimina o conserto (MEDIDO 2026-11-25): com o schema
  // antigo ele PASSA — porque a COLUNA do banco sempre foi `TIMESTAMPTZ` (a
  // migration `20261016000000` a criou assim), e o defeito era o SCHEMA
  // declarar `timestamp(3)`. O que este caso GUARDA é o valor: se um
  // `ALTER` destrutivo (o `SET DATA TYPE TIMESTAMP(3)` que o diff propunha)
  // for aplicado um dia, a mesma escrita e a mesma leitura dão
  // `02:14:55` em vez de `05:14:55`. O caso que discrimina o conserto é o
  // anterior (o DDL canônico com fuso).
  it('um instante gravado e relido em sessão não-UTC não muda de valor', async () => {
    const { PrismaClient } = await import('@prisma/client');
    const dono = new PrismaClient({ datasourceUrl: ctx.uriDoBanco });
    try {
      // O instante é UTC, com fuso explícito — o mesmo que o banco guarda.
      const instante = '2026-11-23 05:14:55+00';
      const id = '11111111-2222-3333-4444-555555555555';

      // ⚠️ O `SET TIME ZONE` e a leitura precisam ser NA MESMA SESSÃO: o
      // Prisma usa um POOL, e um `SET` fora de transação vale só para a
      // conexão que o executou — a leitura seguinte podia sair por outra e
      // mediria o fuso do servidor (UTC), não o da sonda. A transação
      // interativa prende as trêsstatements a uma conexão só.
      const linhas = await dono.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET TIME ZONE '${FUSO_NAO_UTC}'`);
        await tx.$executeRawUnsafe(
          `INSERT INTO profiles (id, slug, name, created_at, updated_at, version)
           VALUES ($1::uuid, $2, $3, $4::timestamptz, $4::timestamptz, 1)`,
          id,
          'sonda-do-fuso',
          'Sonda do fuso',
          instante,
        );

        // A LEITURA acontece na MESMA sessão não-UTC — é nela que o
        // deslocamento silencioso aparecia.
        return tx.$queryRawUnsafe<{ criado: Date }[]>(
          `SELECT created_at AS criado FROM profiles WHERE id = $1::uuid`,
          id,
        );
      });

      expect(linhas).toHaveLength(1);
      // O INSTANTE é o mesmo — não a parede de relógio local. Com o tipo
      // `timestamp` (sem fuso) o Postgres devolveria 02:14:55Z (3 horas antes).
      expect(linhas[0]?.criado.toISOString()).toBe('2026-11-23T05:14:55.000Z');
    } finally {
      await dono.$disconnect();
    }
  });
});
