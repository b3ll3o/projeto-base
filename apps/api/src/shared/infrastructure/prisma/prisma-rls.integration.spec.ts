// apps/api/src/shared/infrastructure/prisma/prisma-rls.integration.spec.ts
//
// pt-BR (Fase 9 — RLS, 2026-10-17): a policy de escopo de empresa, contra
// Postgres de verdade.
//
// POR QUE ESTE ARQUIVO EXISTE E POR QUE ELE É O MAIS IMPORTANTE DA FASE
// Uma policy de RLS é código que só existe para ser uma garantia. Se ela nunca
// dispara, o repositório fica com a aparência de isolamento e com o isolamento
// real sendo só a guarda da aplicação — exatamente o estado em que a Fase 8
// encontrou a gestão de perfis. Por isso o primeiro teste deste arquivo é a
// PRECONDIÇÃO: que a sessão que mede tudo é um papel sem superuser e sem
// BYPASSRLS. Sem ela, os outros passam todos e o arquivo inteiro mede nada.
//
// Por que `rolsuper = false` não basta: superuser é o caso óbvio, mas
// `rolbypassrls` (BYPASSRLS) é um atributo independente, e um papel com ele
// continua vendo tudo sem ser superuser. Os dois são conferidos.
//
// ⚠️ O fixture é criado pelo DONO (`ctx.prisma`), que ignora RLS por ser o
// dono das tabelas. Isso é deliberado: quem mede precisa ver o banco inteiro,
// senão "a escrita não aconteceu" só é verificável através da mesma política que
// deveria tê-la barrado.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Prisma } from '@prisma/client';
import {
  setupTestDatabase,
  cleanDatabase,
  type TestContext,
} from '../../../../test/testcontainers-helper.js';
import { ESCOPO_DE_SISTEMA, PAPEL_DE_RUNTIME, uriComoPapelDeRuntime } from './papel-de-runtime.js';

describe('RLS — isolamento de empresa no Postgres (Fase 9)', () => {
  let ctx: TestContext;
  /** Sessão da APLICAÇÃO: papel sem BYPASSRLS, onde as policies valem. */
  let runtime: InstanceType<typeof import('@prisma/client').PrismaClient>;

  let acmeId: string;
  let globexId: string;
  let perfilDaAcme: string;
  let perfilDaGlobex: string;
  let perfilGlobal: string;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
    const { PrismaClient } = await import('@prisma/client');
    runtime = new PrismaClient({ datasourceUrl: uriComoPapelDeRuntime(ctx.uriDoBanco) });
  });

  afterAll(async () => {
    await runtime.$disconnect();
    await ctx.stop();
  });

  beforeEach(async () => {
    await cleanDatabase(ctx.prisma);
    acmeId = await criarEmpresa('acme');
    globexId = await criarEmpresa('globex');
    perfilDaAcme = await criarPerfil(acmeId, 'gestor-acme');
    perfilDaGlobex = await criarPerfil(globexId, 'gestor-globex');
    perfilGlobal = await criarPerfil(null, 'admin-global');
  });

  async function criarEmpresa(slug: string): Promise<string> {
    const t = await ctx.prisma.tenant.create({ data: { name: slug, slug } });
    return t.id;
  }

  async function criarPerfil(tenantId: string | null, slug: string): Promise<string> {
    const p = await ctx.prisma.profile.create({
      data: { slug, name: slug, isAdmin: false, isSystem: false, tenantId },
    });
    await ctx.prisma.authorization.create({
      data: { profileId: p.id, permissionKey: 'users.read' },
    });
    return p.id;
  }

  /**
   * Executa `fn` numa transação com o escopo de sessão definido.
   *
   * `set_config(..., true)` = **LOCAL**, que morre no fim da transação. Com
   * `false` o parâmetro vazaria para a conexão do pool e a próxima requisição
   * herdaria o escopo da anterior — o defeito clássico de fazer `SET` em
   * conexão com pool.
   */
  async function comEscopo<T>(
    escopo: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return runtime.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT set_config('app.tenant_id', ${escopo}, true)`;
      return fn(tx);
    });
  }

  /** Sem escopo: a sessão nunca define o parâmetro. */
  async function semEscopo<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return runtime.$transaction(async (tx) => fn(tx));
  }

  // ─────────────── a precondição, que dá sentido aos outros ───────────────

  it('a sessão que mede a policy é um papel SEM superuser e SEM BYPASSRLS', async () => {
    const papel = await runtime.$queryRaw<
      Array<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>
    >`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;

    // Sem esta linha, um papel superuser passaria TODOS os testes abaixo e o
    // arquivo inteiro mediria nada.
    expect(papel).toEqual([{ rolname: PAPEL_DE_RUNTIME, rolsuper: false, rolbypassrls: false }]);
  });

  // ─────────────── leitura ───────────────

  it('a propria funcao de escopo recusa sem o parametro, e assimila assimetria de leitura e escrita', async () => {
    // Este teste e a prova de dentes da fase, e ela e PERMANENTE em vez de ser
    // uma mutacao temporaria: ele afirma o valor de RETORNO da guarda, nao o
    // efeito dela. Apagar o `escopo_atual() IS NOT NULL` da migration deixa
    // esta linha vermelha; trocar `aceita_global` por `true` no INSERT deixa a
    // segunda assertion vermelha. Sem ele, o resto do arquivo provaria so o
    // comportamento observavel — que tambem e verde quando a policy nao existe.
    const semParametro = await semEscopo(async (tx) => {
      const r = await tx.$queryRaw<Array<{ dentro: boolean; global_lido: boolean }>>`
        SELECT no_escopo_atual(CAST(${acmeId} AS uuid), false) AS dentro,
               no_escopo_atual(NULL::uuid, true) AS global_lido`;
      return r[0];
    });

    // Fail-closed: sem o parametro, NADA entra — nem a propria empresa, nem o
    // bucket de sistema.
    expect(semParametro).toEqual({ dentro: false, global_lido: false });

    // A assimetria da fase: com escopo, o bucket de sistema e LEGIVEL, e a mesma
    // linha com `aceita_global` verdadeiro em escrita e a escalada que a Fase 8
    // fechou por codigo.
    //
    // Alias em `snake_case`: o Postgres dobra identificadores nao-citados, e
    // `AS globalLido` voltaria como `globallido` — foi o que o primeiro run
    // mediu (MEDIDO 2026-10-17, `Tests 1 failed | 10 passed`).
    const comParametro = await comEscopo(acmeId, async (tx) => {
      const r = await tx.$queryRaw<
        Array<{ da_empresa: boolean; global_lido: boolean; global_escrito: boolean }>
      >`
        SELECT no_escopo_atual(CAST(${acmeId} AS uuid), false) AS da_empresa,
               no_escopo_atual(NULL::uuid, true) AS global_lido,
               no_escopo_atual(NULL::uuid, false) AS global_escrito`;
      return r[0];
    });

    expect(comParametro).toEqual({ da_empresa: true, global_lido: true, global_escrito: false });
  });

  it('SEM escopo definido a sessão não vê perfil de NENHUMA empresa (fail-closed)', async () => {
    // O caminho perigoso de um RLS é o default permissivo: se o parâmetro não
    // definido CAIR no "vê tudo", uma rota que esqueça de abrir o escopo vaza
    // em silêncio. Aqui o esquecimento some, e vira o 404/403 do usuário.
    const ids = await semEscopo(async (tx) => {
      const r = await tx.profile.findMany({ select: { id: true } });
      return r.map((p) => p.id);
    });

    expect(ids).toEqual([]);
  });

  it('com o escopo da ACME, o perfil da GLOBEX não aparece', async () => {
    const ids = await comEscopo(acmeId, async (tx) => {
      const r = await tx.profile.findMany({ select: { id: true } });
      return r.map((p) => p.id);
    });

    expect(ids).toContain(perfilDaAcme);
    expect(ids).not.toContain(perfilDaGlobex);
  });

  it('com o escopo da ACME, o perfil GLOBAL aparece — o bucket de sistema é legível', async () => {
    // Se o perfil global sumisse, a empresa perderia o direito de vestir
    // profiles de sistema (D3), e o conserto seria desescalar a aplicação
    // inteira em vez de ajustar a policy.
    const ids = await comEscopo(acmeId, async (tx) => {
      const r = await tx.profile.findMany({ select: { id: true } });
      return r.map((p) => p.id);
    });

    expect(ids).toContain(perfilGlobal);
  });

  it('com o escopo de SISTEMA as três empresas aparecem', async () => {
    const ids = await comEscopo(ESCOPO_DE_SISTEMA, async (tx) => {
      const r = await tx.profile.findMany({ select: { id: true } });
      return r.map((p) => p.id);
    });

    expect(ids).toEqual(expect.arrayContaining([perfilDaAcme, perfilDaGlobex, perfilGlobal]));
  });

  // ─────────────── escrita ───────────────

  it('UPDATE no perfil da GLOBEX com o escopo da ACME não muda nada', async () => {
    const alterados = await comEscopo(acmeId, async (tx) => {
      const r = await tx.profile.updateMany({
        where: { id: perfilDaGlobex },
        data: { name: 'INVADIDO PELA ACME' },
      });
      return r.count;
    });

    expect(alterados).toBe(0);
    // O dono confere: um `count` 0 com o dado gravado é o defeito que o teste
    // seguinte, o da autorização, já provou existir.
    const depois = await ctx.prisma.profile.findUniqueOrThrow({
      where: { id: perfilDaGlobex },
    });
    expect(depois.name).toBe('gestor-globex');
  });

  it('INSERT de perfil de OUTRA empresa com o escopo da ACME é recusado pelo banco', async () => {
    await expect(
      comEscopo(acmeId, async (tx) => {
        await tx.profile.create({
          data: {
            slug: 'invasor',
            name: 'Invasor',
            isAdmin: false,
            isSystem: false,
            tenantId: globexId,
          },
        });
      }),
    ).rejects.toThrow(/row-level security policy/);

    expect(await ctx.prisma.profile.count({ where: { slug: 'invasor' } })).toBe(0);
  });

  it('INSERT de perfil GLOBAL dentro de uma empresa é recusado — a escalada da Fase 8, fechada também no banco', async () => {
    // `tenant_id IS NULL` é o bucket de SISTEMA. Uma empresa fabricando perfil
    // global é a escalada que `exigePerfilDoEscopo` fecha na aplicação; aqui o
    // banco fecha o mesmo buraco por conta própria, e é o que sobrevive a um
    // bug futuro no use case.
    await expect(
      comEscopo(acmeId, async (tx) => {
        await tx.profile.create({
          data: {
            slug: 'falsao-sistema',
            name: 'Falsao',
            isAdmin: false,
            isSystem: false,
            tenantId: null,
          },
        });
      }),
    ).rejects.toThrow(/row-level security policy/);

    expect(await ctx.prisma.profile.count({ where: { slug: 'falsao-sistema' } })).toBe(0);
  });

  // ─────────────── remoção: o verbo que nenhum teste exercitava ───────────────
  //
  // MEDIDO 2026-10-17 (auditoria adversarial): com 11 testes verdes, `DELETE`
  // não era exercitado por nenhum deles, e era por `USING` com
  // `aceita_global = true` que uma empresa apagava o bucket de sistema inteiro.
  // `DELETE` não tem `WITH CHECK`, então "legível" virou "apagável".

  it('DELETE no perfil GLOBAL com o escopo da ACME não apaga nada', async () => {
    const apagados = await comEscopo(acmeId, async (tx) => {
      const r = await tx.profile.deleteMany({ where: { id: perfilGlobal } });
      return r.count;
    });

    expect(apagados).toBe(0);
    await expect(
      ctx.prisma.profile.findUnique({ where: { id: perfilGlobal } }),
    ).resolves.toMatchObject({ slug: 'admin-global', tenantId: null });
  });

  it('DELETE no perfil da GLOBEX com o escopo da ACME não apaga nada', async () => {
    const apagados = await comEscopo(acmeId, async (tx) => {
      const r = await tx.profile.deleteMany({ where: { id: perfilDaGlobex } });
      return r.count;
    });

    expect(apagados).toBe(0);
    await expect(
      ctx.prisma.profile.findUnique({ where: { id: perfilDaGlobex } }),
    ).resolves.toMatchObject({ slug: 'gestor-globex' });
  });

  it('DELETE no perfil GLOBAL com o escopo de SISTEMA continua funcionando — o conserto não fecha o caminho legítimo', async () => {
    // Controle positivo: se os três de cima ficassem verdes por `USING (false)`
    // em TODAS as linhas, o banco inteiro ficaria imutável e os testes
    // transmitiriam uma garantia que não existe. O admin global tem de poder
    // apagar perfil global — é o que `ProfileUseCases.deletar` faz.
    const apagados = await comEscopo(ESCOPO_DE_SISTEMA, async (tx) => {
      const r = await tx.profile.deleteMany({ where: { id: perfilGlobal } });
      return r.count;
    });

    expect(apagados).toBe(1);
    await expect(
      ctx.prisma.profile.findUnique({ where: { id: perfilGlobal } }),
    ).resolves.toBeNull();
  });

  it('UPDATE que MOVERIA o perfil GLOBAL para dentro da ACME é barrado', async () => {
    // O `WITH CHECK (…, false)` desta policy só exige que o valor NOVO esteja
    // no escopo. Mover `NULL → ACME` satisfaz isso, e `USING (…, true)` deixa
    // a linha alcançável: trocava a DONA do perfil de sistema sem alterar nada
    // que a política verificasse.
    const alterados = await comEscopo(acmeId, async (tx) => {
      const r = await tx.profile.updateMany({
        where: { id: perfilGlobal },
        data: { tenantId: acmeId },
      });
      return r.count;
    });

    expect(alterados).toBe(0);
    await expect(
      ctx.prisma.profile.findUnique({ where: { id: perfilGlobal } }),
    ).resolves.toMatchObject({ tenantId: null, isSystem: false });
  });

  it('UPDATE que ROUBARIA a autorização do perfil GLOBAL para o perfil da ACME é barrado', async () => {
    // `authorizations` é onde mora a permissão. Trocar o `profile_id` do dono
    // não altera a chave nem viola o `WITH CHECK` (o novo dono está no escopo):
    // é o mesmo formato do teste de mover perfil, na tabela mais perigosa.
    //
    // ⚠️ A permissão tem de ser uma que SÓ o global tem. Na primeira versão
    // deste teste eu movi a `users.read` — que o `criarPerfil` dá a todos — e o
    // `updateMany` morreu em `Unique constraint failed`. O teste ficou vermelho
    // pelo motivo errado: mediu a chave única, não a policy. Mesma armadilha já
    // registrada em `mutation-can-fail-for-the-wrong-reason`.
    await ctx.prisma.authorization.create({
      data: { profileId: perfilGlobal, permissionKey: 'users.delete' },
    });

    const alterados = await comEscopo(acmeId, async (tx) => {
      const r = await tx.authorization.updateMany({
        where: { profileId: perfilGlobal, permissionKey: 'users.delete' },
        data: { profileId: perfilDaAcme },
      });
      return r.count;
    });

    expect(alterados).toBe(0);
    const dona = await ctx.prisma.authorization.findFirst({
      where: { profileId: perfilGlobal, permissionKey: 'users.delete' },
    });
    expect(dona).not.toBeNull();
    await expect(
      ctx.prisma.authorization.findFirst({
        where: { profileId: perfilDaAcme, permissionKey: 'users.delete' },
      }),
    ).resolves.toBeNull();
  });

  // ─────────────── a tabela que NÃO tem tenant_id ───────────────

  it('authorizations herdam o escopo do perfil: a da GLOBEX some com o escopo da ACME', async () => {
    // `authorizations` não tem `tenant_id` — a dona é `profiles`. A policy
    // precisa atravessar a relação, senão a tabela mais perigosa do RBAC (é
    // nela que mora `users.delete`) fica sem proteção nenhuma.
    const achadas = await comEscopo(acmeId, async (tx) => {
      const r = await tx.authorization.findMany({ select: { profileId: true } });
      return r.map((a) => a.profileId);
    });

    expect(achadas).toContain(perfilDaAcme);
    expect(achadas).not.toContain(perfilDaGlobex);
  });

  it('a escrita em authorization de perfil alheio é barrada, e a injeção não fica no banco', async () => {
    await expect(
      comEscopo(acmeId, async (tx) => {
        await tx.authorization.create({
          data: { profileId: perfilDaGlobex, permissionKey: 'users.delete' },
        });
      }),
    ).rejects.toThrow(/row-level security policy/);

    await expect(
      ctx.prisma.authorization.findFirst({
        where: { profileId: perfilDaGlobex, permissionKey: 'users.delete' },
      }),
    ).resolves.toBeNull();
  });
});
