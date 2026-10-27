// apps/api/src/shared/audit/infrastructure/prisma-audit.service.integration.spec.ts
//
// Testes de integração do PrismaAuditService usando Testcontainers.
//
// - Sobe postgres:16-alpine no beforeAll (container compartilhado via singleFork)
// - Aplica migrations Prisma via `prisma migrate deploy`
// - Trunca tabelas entre testes (cleanDatabase)
// - Cobre o contrato do AuditServicePort:
//   - record() insere em users_history com metadata do ctx
//   - listHistory() filtra por entityId e pagina por cursor (id)
//   - getHistoryEntry() lookup por composite unique (entityId, version)
//   - archive() faz upsert por entityId (substitui version/snapshot/metadata)
//   - listArchive() pagina por cursor (id); getArchiveEntry() lookup por entityId
//
// pt-BR: orderBy `version asc` em users_history é estável porque (entityId,
// version) é unique — não empata. Para archive usamos `deletedAt desc`, e o
// id UUID como tiebreaker implícito. Todos os entityId/actorId são UUIDs v7
// válidos porque as colunas Prisma são `@db.Uuid`.

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import {
  setupTestDatabase,
  cleanDatabase,
  type TestContext,
} from '../../../../test/testcontainers-helper.js';
import { PrismaAuditService } from './prisma-audit.service.js';
import { AuditContext } from '../domain/audit-context.vo.js';
import { uriComoPapelDeRuntime } from '../../infrastructure/prisma/papel-de-runtime.js';
import { abrirEscopo } from '../../infrastructure/prisma/escopo.js';

describe('PrismaAuditService (Testcontainers)', () => {
  let ctx: TestContext;
  let svc: PrismaAuditService;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  beforeEach(async () => {
    await cleanDatabase(ctx.prisma);
    svc = new PrismaAuditService(ctx.prisma);
  });

  const ACTOR_1 = '0190a8b6-aaaa-7bbb-9ccc-000000000001';
  const ACTOR_A = '0190a8b6-aaaa-7bbb-9ccc-00000000000a';
  const ACTOR_B = '0190a8b6-aaaa-7bbb-9ccc-00000000000b';
  const ENTITY_U1 = '0190a8b6-1234-7abc-9def-000000000001';
  const ENTITY_U2 = '0190a8b6-1234-7abc-9def-000000000002';
  const ENTITY_A = '0190a8b6-1234-7abc-9def-00000000000a';
  const ENTITY_B = '0190a8b6-1234-7abc-9def-00000000000b';
  const ENTITY_C = '0190a8b6-1234-7abc-9def-00000000000c';
  const ENTITY_MISSING = '0190a8b6-1234-7abc-9def-0000000000ff';

  const ctxAudit = (actorId: string | null = ACTOR_1): AuditContext =>
    new AuditContext({
      actorId,
      correlationId: 'corr-1',
      source: 'http',
      timestamp: new Date('2026-09-21T10:00:00Z'),
    });

  // pt-BR (Fase 10+): os testes deste escopo usam `ctx.prisma`, que é o DONO e
  // ignora RLS — logo o 2º argumento das leituras não muda o resultado deles.
  // `null` (bucket de SISTEMA) é o valor honesto para "sem escopo em jogo".
  const SISTEMA = null;

  it('record insere em user_history com metadata do ctx', async () => {
    await svc.record(
      {
        entityName: 'User',
        entityId: ENTITY_U1,
        operation: 'INSERT',
        previousVersion: null,
        newVersion: 1,
        snapshot: { id: ENTITY_U1, email: 'a@b.com' },
      },
      ctxAudit(ACTOR_1),
    );

    const row = await ctx.prisma.userHistory.findFirst({});
    expect(row).not.toBeNull();
    expect(row!.operation).toBe('INSERT');
    expect(row!.version).toBe(1);
    expect(row!.previousVersion).toBeNull();
    expect(row!.changedBy).toBe(ACTOR_1);
    expect(row!.snapshot).toEqual({ id: ENTITY_U1, email: 'a@b.com' });
  });

  it('listHistory filtra por entityId e pagina por cursor', async () => {
    const baseCtx = ctxAudit();
    for (let v = 1; v <= 5; v++) {
      await svc.record(
        {
          entityName: 'User',
          entityId: ENTITY_U1,
          operation: v === 1 ? 'INSERT' : 'UPDATE',
          previousVersion: v === 1 ? null : v - 1,
          newVersion: v,
          snapshot: { id: ENTITY_U1, v },
        },
        baseCtx,
      );
    }
    await svc.record(
      {
        entityName: 'User',
        entityId: ENTITY_U2,
        operation: 'INSERT',
        previousVersion: null,
        newVersion: 1,
        snapshot: { id: ENTITY_U2 },
      },
      baseCtx,
    );

    const page1 = await svc.listHistory(
      {
        entityName: 'User',
        entityId: ENTITY_U1,
        limit: 2,
      },
      SISTEMA,
    );
    expect(page1.entries).toHaveLength(2);
    expect(page1.entries.map((e) => e.version)).toEqual([1, 2]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await svc.listHistory(
      {
        entityName: 'User',
        entityId: ENTITY_U1,
        cursor: page1.nextCursor,
        limit: 2,
      },
      SISTEMA,
    );
    expect(page2.entries.map((e) => e.version)).toEqual([3, 4]);
    expect(page2.nextCursor).not.toBeNull();

    const page3 = await svc.listHistory(
      {
        entityName: 'User',
        entityId: ENTITY_U1,
        cursor: page2.nextCursor,
        limit: 2,
      },
      SISTEMA,
    );
    expect(page3.entries).toHaveLength(1);
    expect(page3.entries[0]?.version).toBe(5);
    expect(page3.nextCursor).toBeNull();
  });

  it('getHistoryEntry retorna entrada específica via composite unique (entityId, version)', async () => {
    await svc.record(
      {
        entityName: 'User',
        entityId: ENTITY_U1,
        operation: 'INSERT',
        previousVersion: null,
        newVersion: 1,
        snapshot: { a: 1 },
      },
      ctxAudit(),
    );

    const found = await svc.getHistoryEntry(
      {
        entityName: 'User',
        entityId: ENTITY_U1,
        version: 1,
      },
      SISTEMA,
    );
    expect(found).not.toBeNull();
    expect(found?.version).toBe(1);
    expect(found?.snapshot).toEqual({ a: 1 });

    const missing = await svc.getHistoryEntry(
      {
        entityName: 'User',
        entityId: ENTITY_U1,
        version: 99,
      },
      SISTEMA,
    );
    expect(missing).toBeNull();
  });

  it('archive insere; segunda chamada faz upsert (substitui)', async () => {
    const ctx1 = ctxAudit(ACTOR_A);
    await svc.archive({
      entityName: 'User',
      entityId: ENTITY_U1,
      version: 4,
      snapshot: { id: ENTITY_U1, v: 4 },
      ctx: ctx1,
    });
    let row = await ctx.prisma.userArchive.findFirst({ where: { entityId: ENTITY_U1 } });
    expect(row).not.toBeNull();
    expect(row!.version).toBe(4);
    expect(row!.deletedBy).toBe(ACTOR_A);
    expect(row!.reason).toBeNull();

    const ctx2 = ctxAudit(ACTOR_B);
    await svc.archive({
      entityName: 'User',
      entityId: ENTITY_U1,
      version: 5,
      snapshot: { id: ENTITY_U1, v: 5 },
      reason: 're-archive after restore',
      ctx: ctx2,
    });
    row = await ctx.prisma.userArchive.findFirst({ where: { entityId: ENTITY_U1 } });
    expect(row!.version).toBe(5);
    expect(row!.deletedBy).toBe(ACTOR_B);
    expect(row!.reason).toBe('re-archive after restore');

    const total = await ctx.prisma.userArchive.count();
    expect(total).toBe(1);
  });

  it('listArchive pagina por cursor; getArchiveEntry retorna null quando ausente', async () => {
    await svc.archive({
      entityName: 'User',
      entityId: ENTITY_A,
      version: 1,
      snapshot: { id: ENTITY_A },
      ctx: ctxAudit(),
    });
    await svc.archive({
      entityName: 'User',
      entityId: ENTITY_B,
      version: 1,
      snapshot: { id: ENTITY_B },
      ctx: ctxAudit(),
    });
    await svc.archive({
      entityName: 'User',
      entityId: ENTITY_C,
      version: 1,
      snapshot: { id: ENTITY_C },
      ctx: ctxAudit(),
    });

    const page1 = await svc.listArchive({ entityName: 'User', limit: 2 }, SISTEMA);
    expect(page1.entries).toHaveLength(2);
    expect(page1.entries.map((e) => e.entityId)).toEqual([ENTITY_A, ENTITY_B]);
    expect(page1.nextCursor).not.toBeNull();

    const found = await svc.getArchiveEntry({ entityName: 'User', entityId: ENTITY_A }, SISTEMA);
    expect(found).not.toBeNull();
    expect(found?.entityId).toBe(ENTITY_A);

    const missing = await svc.getArchiveEntry(
      { entityName: 'User', entityId: ENTITY_MISSING },
      SISTEMA,
    );
    expect(missing).toBeNull();
  });

  // ─────────── Fase 10+: a auditoria como diretório de uuids cross-tenant ───────────
  //
  // MEDIDO 2026-10-17: `users_history.entity_id` e `users_archive.entity_id` são
  // o **uuid do usuário** — `user-use-cases.ts` grava `entityId: ev.aggregateId`,
  // que é o id do agregado `User`. As duas tabelas eram legíveis por qualquer
  // sessão `app_runtime`, e como `memberships_insercao` é
  // `WITH CHECK (no_escopo_atual(tenant_id, false))` — que confere o `tenant_id`
  // e NUNCA o `user_id` — ler um `entity_id` alheio e se auto-conceder uma
  // membership abria o `password_hash` dele. A cadeia inteira está na §3 da
  // migration `20261020000001`.
  //
  // Este bloco é o ÚNICO lugar do repo onde a auditoria fala com um papel sem
  // BYPASSRLS. Todo o resto do arquivo usa `ctx.prisma`, que é o DONO e ignora
  // RLS — então os testes acima continuariam verdes com a escalada aberta. É o
  // mesmo furo que a §4.1 documentou: verde porque o sujeito não tem dente.
  describe('com a sessão da aplicação (as policies valem)', () => {
    const ACME = '0190a8b6-0000-7000-8000-0000000000ac';
    const GLOBEX = '0190a8b6-0000-7000-8000-00000000000b';
    const ALICE = '0190a8b6-1111-7111-8111-000000000001';
    const BOB = '0190a8b6-2222-7222-8222-000000000002';

    let runtime: InstanceType<typeof import('@prisma/client').PrismaClient>;
    let app: PrismaAuditService;

    const ctxDoEscopo = (actorId: string | null, tenantId: string | null): AuditContext =>
      new AuditContext({
        actorId,
        correlationId: 'corr-10',
        source: 'http',
        timestamp: new Date('2026-10-20T10:00:00Z'),
        tenantId,
      });

    beforeAll(async () => {
      const { PrismaClient } = await import('@prisma/client');
      runtime = new PrismaClient({
        datasourceUrl: uriComoPapelDeRuntime(ctx.uriDoBanco, ctx.senhaDoPapel),
      });
    });

    afterAll(async () => {
      await runtime.$disconnect();
    });

    beforeEach(async () => {
      await cleanDatabase(ctx.prisma);
      // Duas empresas com um membro cada: o menor fixture que separa "meu" de
      // "alheio" sem introduzir nenhuma variável extra.
      await ctx.prisma.tenant.createMany({
        data: [
          { id: ACME, name: 'ACME', slug: 'acme-aud' },
          { id: GLOBEX, name: 'GLOBEX', slug: 'globex-aud' },
        ],
      });
      await ctx.prisma.user.createMany({
        data: [
          { id: ALICE, name: 'Alice', email: 'alice@acme.dev', passwordHash: 'x', version: 1 },
          { id: BOB, name: 'Bob', email: 'bob@globex.dev', passwordHash: 'x', version: 1 },
        ],
      });
      await ctx.prisma.tenantMembership.createMany({
        data: [
          { userId: ALICE, tenantId: ACME, role: 'member', profileId: null },
          { userId: BOB, tenantId: GLOBEX, role: 'member', profileId: null },
        ],
      });
      await ctx.prisma.userHistory.createMany({
        data: [
          { entityId: ALICE, version: 1, operation: 'INSERT', snapshot: { id: ALICE } },
          { entityId: BOB, version: 1, operation: 'INSERT', snapshot: { id: BOB } },
        ],
      });
      await ctx.prisma.userArchive.createMany({
        data: [
          { entityId: ALICE, version: 9, snapshot: { id: ALICE } },
          { entityId: BOB, version: 9, snapshot: { id: BOB } },
        ],
      });
      app = new PrismaAuditService(runtime);
    });

    it('listHistory da GLOBEX pela sessão da ACME volta vazio — e a da ACME, não', async () => {
      const alheio = await app.listHistory({ entityName: 'User', entityId: BOB, limit: 20 }, ACME);
      expect(alheio.entries).toEqual([]);

      const proprio = await app.listHistory(
        { entityName: 'User', entityId: ALICE, limit: 20 },
        ACME,
      );
      expect(proprio.entries.map((e) => e.entityId)).toEqual([ALICE]);
    });

    it('getHistoryEntry alheio devolve null; o próprio devolve a entrada', async () => {
      const alheio = await app.getHistoryEntry(
        { entityName: 'User', entityId: BOB, version: 1 },
        ACME,
      );
      expect(alheio).toBeNull();

      const proprio = await app.getHistoryEntry(
        { entityName: 'User', entityId: ALICE, version: 1 },
        ACME,
      );
      expect(proprio).not.toBeNull();
      expect(proprio?.snapshot).toEqual({ id: ALICE });
    });

    it('listArchive da ACME não traz o arquivo da GLOBEX, e getArchiveEntry alheio é null', async () => {
      const page = await app.listArchive({ entityName: 'User', limit: 20 }, ACME);
      expect(page.entries.map((e) => e.entityId)).toEqual([ALICE]);
      expect(await app.getArchiveEntry({ entityName: 'User', entityId: BOB }, ACME)).toBeNull();
    });

    it('a sessão de SISTEMA continua enxergando as duas — o bucket global não perde', async () => {
      const page = await app.listArchive({ entityName: 'User', limit: 20 }, null);
      expect(page.entries).toHaveLength(2);
    });

    it('gravar auditoria de usuário alheio morre em RLS, e a de membro passa', async () => {
      // O controle positivo é o que impede que o conserto vire "banco inútil com
      // tudo verde": sem ele, fechar tudo também passaria.
      await app.record(
        {
          entityName: 'User',
          entityId: ALICE,
          operation: 'UPDATE',
          previousVersion: 1,
          newVersion: 2,
          snapshot: { id: ALICE },
        },
        ctxDoEscopo(ALICE, ACME),
      );
      expect(await ctx.prisma.userHistory.count({ where: { entityId: ALICE } })).toBe(2);

      await expect(
        app.record(
          {
            entityName: 'User',
            entityId: BOB,
            operation: 'UPDATE',
            previousVersion: 1,
            newVersion: 2,
            snapshot: { id: BOB },
          },
          ctxDoEscopo(ALICE, ACME),
        ),
      ).rejects.toThrow(/row-level security|42501/i);
      expect(await ctx.prisma.userHistory.count({ where: { entityId: BOB } })).toBe(1);
    });

    it('a trilha é append-only: DELETE é CONCEDIDO ao papel, apaga ZERO por falta de policy', async () => {
      // O papel de runtime tem `DELETE` concedido — migration
      // `20261020000000` §2 faz `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL
      // TABLES` — e o código nunca chama `delete` nessas duas tabelas (só
      // `create`, `findMany`, `findUnique` e `upsert`).
      //
      // O que fecha a trilha NÃO é a ausência da chamada: "ninguém chama" é um
      // fato do código de hoje, e um `deleteMany` novo passaria por review como
      // inofensivo. Fecha por não existir policy de DELETE — o RLS nega a linha.
      // MEDIDO aqui porque a garantia que interessa é a do BANCO.
      //
      // ⚠️ Um `REVOKE DELETE` escopado seria a segunda trava sobre a mesma
      // garantia. Não está aqui de propósito: ele não muda o que este teste
      // mede, e quem quiser a redundância em vez do teste medido é decisão de
      // endurecimento, não correção de um furo aberto.
      const apagados = await runtime.$transaction(async (tx) => {
        await abrirEscopo(tx, ACME);

        // PRECONDIÇÃO MEDIDA: o escopo precisa estar DE PÉ. Sem esta leitura o
        // teste passaria pelo motivo errado: se `abrirEscopo` virasse no-op,
        // `usuario_no_escopo` devolveria falso para TUDO e o `DELETE` voltaria
        // a dar 0 — verde, provando "a RLS barra a trilha" quando o que barra
        // seria "não há escopo nenhum". O revisor independente apontou a
        // lacuna; ela era real e fica fechada aqui.
        const [escopoLido] = await tx.$queryRaw<Array<{ escopo_atual: string | null }>>`
          SELECT escopo_atual() AS escopo_atual
        `;
        expect(escopoLido?.escopo_atual).toBe(ACME);

        return tx.userHistory.deleteMany({ where: { entityId: ALICE } });
      });

      // Fail-closed e SEM erro: o DELETE não falha, ele não encontra a linha.
      expect(apagados.count).toBe(0);

      // O DONO confirma que a entrada continua lá. Sem isto, "count 0" é
      // indistinguível de "já não havia nada" — o verde por conjunto vazio.
      expect(await ctx.prisma.userHistory.count({ where: { entityId: ALICE } })).toBe(1);

      // Mesma trava no arquivo: `archive()` é `upsert`, nunca há remoção.
      const apagadosNoArquivo = await runtime.$transaction(async (tx) => {
        await abrirEscopo(tx, ACME);
        return tx.userArchive.deleteMany({ where: { entityId: ALICE } });
      });
      expect(apagadosNoArquivo.count).toBe(0);
      expect(await ctx.prisma.userArchive.count({ where: { entityId: ALICE } })).toBe(1);

      // DENTE DO TESTE: o DONO apaga a MESMA linha, e apaga. Sem isto, "count 0"
      // acima é indistinguível de um `deleteMany` que simplesmente não rodou —
      // e um teste que não pode falhar não prova que a trilha está fechada.
      // O que bloqueia a sessão da aplicação é a AUSÊNCIA de policy, e é isso
      // que o contraste entre as duas linhas mede.
      const peloDono = await ctx.prisma.userHistory.deleteMany({ where: { entityId: ALICE } });
      expect(peloDono.count).toBe(1);
      expect(await ctx.prisma.userHistory.count({ where: { entityId: ALICE } })).toBe(0);
    });
  });
});
