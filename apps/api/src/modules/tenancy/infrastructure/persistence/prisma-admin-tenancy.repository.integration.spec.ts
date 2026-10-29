// apps/api/src/modules/tenancy/infrastructure/persistence/prisma-admin-tenancy.repository.integration.spec.ts
//
// pt-BR (visão de admin, 2026-10-22): o INVENTÁRIO do bucket de SISTEMA contra
// Postgres de verdade.
//
// POR QUE O UNITÁRIO NÃO CHEGA
// `prisma-admin-tenancy.repository.spec.ts` confere o `where` entregue ao
// Prisma — mas o MOCK NÃO AVALIA `where`: ele devolve o que o teste mandou.
// Tudo que o filtro promete só vira fato aqui:
//
//   1. `where: { user: { deletedAt: null } }` na relação `memberships` — a
//      membership SOBREVIVE ao soft-delete, e sem o filtro a empresa
//      continuaria exibindo como membro uma conta que não existe mais;
//   2. `where: { deletedAt: null }` em `users` — a conta apagada não é pessoa
//      para o admin;
//   3. o perfil devolvido é o EFETIVO (GLOBAL ou DAQUELA empresa), e o de
//      OUTRA empresa resolve `null`;
//   4. ⚠️ A RLS: a sessão que mede é a CREDENCIAL de SISTEMA (`app_system`,
//      sem superuser e sem BYPASSRLS). É a sessão que abre o bucket de
//      SISTEMA desde o #118 — o GUC `'*'` na sessão de runtime devolveria
//      ZERO linhas, e a tela do admin ficaria vazia sem erro nenhum. É o item
//      que o unitário NÃO pode provar: mock não tem policy.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  setupTestDatabase,
  cleanDatabase,
  type TestContext,
} from '../../../../../test/testcontainers-helper.js';
import {
  uriComoPapelDeRuntime,
  PAPEL_DE_RUNTIME,
  PAPEL_DE_SISTEMA,
  ESCOPO_DE_SISTEMA,
} from '../../../../shared/infrastructure/prisma/papel-de-runtime.js';
import { abrirEscopo } from '../../../../shared/infrastructure/prisma/escopo.js';
import { PrismaAdminTenancyRepository } from './prisma-admin-tenancy.repository.js';

const AGORA = new Date('2026-10-22T12:00:00.000Z');

describe('PrismaAdminTenancyRepository — o inventário do bucket de SISTEMA (Postgres)', () => {
  let ctx: TestContext;
  /**
   * Sessão da APLICAÇÃO: o papel `app_runtime`, sem superuser e sem BYPASSRLS.
   *
   * ⚠️ É o papel CERTO e não o dono (`ctx.prisma`) que o spec mede: o dono
   * ignora RLS por construção, e um spec que roda no dono mede a query sem a
   * policy — a tela do admin "funcionando" contra um banco onde o isolamento
   * não existe. O dono fica só como quem MONTA o fixture e quem confere o
   * dado bruto.
   */
  let runtime: InstanceType<typeof import('@prisma/client').PrismaClient>;
  /**
   * Sessão do SISTEMA: o papel `app_system` (#118) — a CREDENCIAL que abre o
   * bucket de SISTEMA.
   *
   * ⚠️ #118 — O BUCKET DE SISTEMA É A CREDENCIAL, E NÃO O GUC. O repositório
   * medido abre a transação NESTA sessão (é o que `comEscopoDeSistema` faz):
   * a sessão de runtime com o GUC em `'*'` enxerga ZERO linhas, e o GUC
   * `'*'` na sessão de sistema enxerga tudo. A sessão de runtime segue aqui
   * como o CONTRASTE — ela é a que mostra que o filtro não é o que esconde.
   */
  let sistema: InstanceType<typeof import('@prisma/client').PrismaClient>;
  let repo: PrismaAdminTenancyRepository;

  let acmeId: string;
  let globexId: string;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
    const { PrismaClient } = await import('@prisma/client');
    runtime = new PrismaClient({
      datasourceUrl: uriComoPapelDeRuntime(ctx.uriDoBanco, ctx.senhaDoPapel),
    });
    sistema = new PrismaClient({ datasourceUrl: ctx.uriDoPapelDeSistema });
    repo = new PrismaAdminTenancyRepository();
  });

  afterAll(async () => {
    await runtime.$disconnect();
    await sistema.$disconnect();
    await ctx.stop();
  });

  async function criarConta(nome: string, email: string, apagadaEm?: Date): Promise<string> {
    const id = randomUUID();
    await ctx.prisma.user.create({
      data: {
        id,
        name: nome,
        email,
        passwordHash: 'x',
        createdAt: AGORA,
        version: 1,
        deletedAt: apagadaEm ?? null,
      },
    });
    return id;
  }

  async function criarEmpresa(nome: string, slug: string): Promise<string> {
    const t = await ctx.prisma.tenant.create({ data: { name: nome, slug } });
    return t.id;
  }

  /** Perfil DONO de uma empresa (`tenantId` preenchido), ou GLOBAL se `null`. */
  async function criarPerfil(tenantId: string | null, slug: string): Promise<string> {
    const p = await ctx.prisma.profile.create({ data: { slug, name: slug, tenantId } });
    return p.id;
  }

  async function vincular(
    userId: string,
    tenantId: string,
    role: string,
    profileId: string | null,
  ): Promise<void> {
    await ctx.prisma.tenantMembership.create({ data: { userId, tenantId, role, profileId } });
  }

  /**
   * O cenário de REFERÊNCIA: duas empresas com gente, uma empresa sem NINGUÉM,
   * um perfil global, um perfil de outra empresa e uma conta apagada.
   *
   * A conta sem empresa é a do ADMIN DO SISTEMA (do seed): ela mora no bucket
   * global e não pertence a empresa nenhuma — e é o caso que uma lista montada
   * a partir das memberships ESQUECERIA.
   */
  beforeEach(async () => {
    await cleanDatabase(ctx.prisma);
    acmeId = await criarEmpresa('ACME', 'acme');
    globexId = await criarEmpresa('GLOBEX', 'globex');
    await criarEmpresa('Vazia', 'vazia');

    const ana = await criarConta('Ana', 'ana@acme.dev');
    const bia = await criarConta('Bia', 'bia@acme.dev');
    const carlos = await criarConta('Carlos', 'carlos@globex.dev');
    const zoe = await criarConta('Zoe', 'zoe@acme.dev');
    await criarConta('Root', 'root@sistema.dev');
    const saindo = await criarConta('Saindo', 'saindo@acme.dev', AGORA);

    const perfilAcme = await criarPerfil(acmeId, 'gerente-acme');
    const perfilGlobex = await criarPerfil(globexId, 'gerente-globex');
    const perfilGlobal = await criarPerfil(null, 'admin-global');

    await vincular(ana, acmeId, 'gerente', perfilAcme);
    // A Bia veste o perfil da GLOBEX dentro da ACME: o estado que o port
    // admite ter existido, e que resolve `null` (o perfil alheio não vale
    // nesta empresa).
    await vincular(bia, acmeId, 'member', perfilGlobex);
    await vincular(carlos, globexId, 'member', perfilGlobex);
    // A Zoe veste o perfil GLOBAL: vale em qualquer empresa.
    await vincular(zoe, acmeId, 'member', perfilGlobal);
    // A conta apagada CONTINUA membro: a membership sobrevive ao soft-delete.
    await vincular(saindo, acmeId, 'member', perfilAcme);
  });

  // ─────────────────────── listarEmpresasComMembros ───────────────────────

  it('devolve a empresa COM o membro, e a empresa SEM membro aparece com lista vazia', async () => {
    const empresas = await repo.listarEmpresasComMembros();

    // A ordem é FUNCIONAL (a tela lista por nome), e a query a garante.
    expect(empresas.map((e) => e.slug)).toEqual(['acme', 'globex', 'vazia']);

    const acme = empresas.find((e) => e.slug === 'acme');
    expect(acme?.membros.map((m) => m.email).sort()).toEqual([
      'ana@acme.dev',
      'bia@acme.dev',
      'zoe@acme.dev',
    ]);
    expect(acme?.membros.find((m) => m.email === 'ana@acme.dev')).toMatchObject({
      nome: 'Ana',
      role: 'gerente',
    });

    // Empresa sem NINGUÉM é um estado real (a empresa acabada de abrir) —
    // escondê-la diria que ela não existe.
    expect(empresas.find((e) => e.slug === 'vazia')?.membros).toEqual([]);
  });

  it('a conta apagada NÃO aparece como membro — a membership sobrevive, o filtro a esconde', async () => {
    const empresas = await repo.listarEmpresasComMembros();
    const acme = empresas.find((e) => e.slug === 'acme');

    expect(acme?.membros.map((m) => m.email)).not.toContain('saindo@acme.dev');

    // ⚠️ O CONTROLE: a membership CONTINUA lá (4 na ACME). Sem esta linha,
    // "não apareceu" seria compatível com "o vínculo foi apagado" — e quem
    // apaga o vínculo é a empresa que sai da lista, não a conta que se foi.
    expect(await ctx.prisma.tenantMembership.count({ where: { tenantId: acmeId } })).toBe(4);
    expect(
      await ctx.prisma.user.count({
        where: { email: 'saindo@acme.dev', deletedAt: { not: null } },
      }),
    ).toBe(1);
    // ⚠️ E a sessão de VERDADE enxerga os 4 vínculos (o escopo é o de
    // SISTEMA). Sem isto, "não apareceu" seria compatível com "a linha estava
    // escondida por outro motivo" — e o filtro não estaria provado: seria a
    // RLS, não o `where`, escondendo a conta.
    //
    // ⚠️ #118: a sessão que enxerga é a de SISTEMA (`app_system`), e não a de
    // runtime. O bucket de SISTEMA é concedido pela CREDENCIAL — o GUC
    // `'*'` na sessão de runtime devolve ZERO linhas.
    const visiveis = await sistema.$transaction(async (tx) => {
      await abrirEscopo(tx, ESCOPO_DE_SISTEMA);
      return tx.tenantMembership.count({ where: { tenantId: acmeId } });
    });
    expect(visiveis).toBe(4);
  });

  // ─────────────────────── listarUsuariosComEmpresas ───────────────────────

  it('devolve o usuário com as empresas, e a conta sem empresa nenhuma aparece com lista vazia', async () => {
    const usuarios = await repo.listarUsuariosComEmpresas();

    // A ordem é por nome, e a conta apagada NÃO está na lista.
    expect(usuarios.map((u) => u.email)).toEqual([
      'ana@acme.dev',
      'bia@acme.dev',
      'carlos@globex.dev',
      'root@sistema.dev',
      'zoe@acme.dev',
    ]);

    const ana = usuarios.find((u) => u.email === 'ana@acme.dev');
    expect(ana?.empresas).toHaveLength(1);
    expect(ana?.empresas[0]).toMatchObject({
      nome: 'ACME',
      slug: 'acme',
      role: 'gerente',
      perfil: 'gerente-acme',
    });

    // A conta do ADMIN DO SISTEMA não pertence a empresa nenhuma — e lista
    // vazia é RESPOSTA, não defeito. Uma lista montada a partir das
    // memberships a esqueceria, e "todos os usuários" seria quase-todos.
    const root = usuarios.find((u) => u.email === 'root@sistema.dev');
    expect(root?.empresas).toEqual([]);
  });

  it('a conta apagada NÃO aparece na lista de usuários', async () => {
    const usuarios = await repo.listarUsuariosComEmpresas();

    expect(usuarios.map((u) => u.email)).not.toContain('saindo@acme.dev');
    // E a conta continua no banco: apagada é soft-delete, não sumiu.
    expect(await ctx.prisma.user.count({ where: { deletedAt: { not: null } } })).toBe(1);
    // ⚠️ E a sessão de VERDADE enxerga a conta apagada (o escopo é o de
    // SISTEMA) — logo quem a esconde é o `where`, e não a RLS.
    //
    // ⚠️ #118: a sessão que enxerga é a de SISTEMA (`app_system`) — o bucket
    // de SISTEMA é concedido pela CREDENCIAL, e o GUC `'*'` na sessão de
    // runtime devolve ZERO linhas.
    const visiveis = await sistema.$transaction(async (tx) => {
      await abrirEscopo(tx, ESCOPO_DE_SISTEMA);
      return tx.user.count({ where: { deletedAt: { not: null } } });
    });
    expect(visiveis).toBe(1);
  });

  // ─────────────────────── o perfil EFETIVO ───────────────────────

  it('o perfil devolvido é o EFETIVO: o da própria empresa e o GLOBAL valem, o de OUTRA empresa resolve nulo', async () => {
    const empresas = await repo.listarEmpresasComMembros();
    const acme = empresas.find((e) => e.slug === 'acme');

    // CONTROLE POSITIVO: o perfil da PRÓPRIA empresa volta. Sem ele, um
    // "tudo nulo" passaria por conserto.
    expect(acme?.membros.find((m) => m.email === 'ana@acme.dev')?.perfil).toBe('gerente-acme');
    // O GLOBAL vale para qualquer empresa (D3).
    expect(acme?.membros.find((m) => m.email === 'zoe@acme.dev')?.perfil).toBe('admin-global');
    // O de OUTRA empresa resolve NULO — como em `findProfileId`. Mostrar o
    // slug alheio diria que a pessoa veste um perfil que a API não resolve
    // para aquela empresa, e o defeito é invisível: o resto da tela funciona.
    expect(acme?.membros.find((m) => m.email === 'bia@acme.dev')?.perfil).toBeNull();
  });

  it('na lista de usuários o perfil segue o MESMO critério (o efetivo daquela empresa)', async () => {
    const usuarios = await repo.listarUsuariosComEmpresas();

    expect(usuarios.find((u) => u.email === 'ana@acme.dev')?.empresas[0]?.perfil).toBe(
      'gerente-acme',
    );
    expect(usuarios.find((u) => u.email === 'carlos@globex.dev')?.empresas[0]?.perfil).toBe(
      'gerente-globex',
    );
    expect(usuarios.find((u) => u.email === 'zoe@acme.dev')?.empresas[0]?.perfil).toBe(
      'admin-global',
    );
    expect(usuarios.find((u) => u.email === 'bia@acme.dev')?.empresas[0]?.perfil).toBeNull();
  });

  // ─────────────────────── a RLS é o que decide ───────────────────────

  it('a sessão que mede é um papel SEM superuser e SEM BYPASSRLS — senão a RLS seria decoração', async () => {
    const papel = await runtime.$queryRaw<
      Array<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>
    >`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;

    // Sem esta linha, os testes acima medem a query SEM policy — e passariam
    // iguais num banco onde o isolamento não existe.
    expect(papel).toEqual([{ rolname: PAPEL_DE_RUNTIME, rolsuper: false, rolbypassrls: false }]);

    // E a sessão que o REPOSITÓRIO medido usa é a de SISTEMA — que também não
    // é superuser nem tem BYPASSRLS. Uma `app_system` com BYPASSRLS leria
    // tudo sem policy, e a lista do admin "funcionaria" num banco onde o
    // isolamento não existe.
    const papelDoSistema = await sistema.$queryRaw<
      Array<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>
    >`SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`;

    expect(papelDoSistema).toEqual([
      { rolname: PAPEL_DE_SISTEMA, rolsuper: false, rolbypassrls: false },
    ]);
  });

  /**
   * O DENTE do #118: o GUC `'*'` na sessão de RUNTIME NÃO abre o bucket de
   * SISTEMA.
   *
   * ⚠️ É o teste que pega a REGRESSÃO que a lista do admin traria de volta:
   * com `comEscopo(prisma, escopoDoTenant(null), fn)` — o GUC `'*'` na sessão
   * de runtime — a lista devolveria ZERO linhas, e a tela do admin ficaria
   * VAZIA sem erro nenhum. O repositório abre a transação na CREDENCIAL de
   * sistema (`comEscopoDeSistema`), e este teste prova que a diferença é
   * REAL: o mesmo GUC, na sessão de runtime, não abre.
   */
  it('a sessão de RUNTIME com o GUC de SISTEMA NÃO abre o bucket de sistema — a CREDENCIAL é o que abre', async () => {
    const noRuntime = await runtime.$transaction(async (tx) => {
      await abrirEscopo(tx, ESCOPO_DE_SISTEMA);
      return tx.tenant.count();
    });

    const noSistema = await sistema.$transaction(async (tx) => {
      await abrirEscopo(tx, ESCOPO_DE_SISTEMA);
      return tx.tenant.count();
    });

    // O MESMO GUC, nas DUAS sessões: uma devolve as empresas, a outra não
    // devolve NENHUMA. Se as duas devolvessem o mesmo, a credencial não
    // estaria decidindo nada — e a lista do admin voltaria a depender do GUC.
    expect(noRuntime).toBe(0);
    expect(noSistema).toBe(3);
  });

  it('o escopo de SISTEMA é o que ABRE a lista: com o escopo da EMPRESA, a outra não aparece', async () => {
    // CONTRASTE: o MESMO banco e o MESMO papel, outro escopo. Com o escopo da
    // ACME, a GLOBEX e a VAZIA somem — a policy está valendo.
    const comEmpresa = await runtime.$transaction(async (tx) => {
      await abrirEscopo(tx, acmeId);
      return (await tx.tenant.findMany({ select: { id: true } })).map((t) => t.id);
    });
    expect(comEmpresa).toEqual([acmeId]);

    // E o repositório — que abre o escopo de SISTEMA — devolve as TRÊS.
    // Sem este par, "devolveu tudo" seria indistinguível de "a policy não
    // existe".
    const empresas = await repo.listarEmpresasComMembros();
    expect(empresas.map((e) => e.slug)).toEqual(['acme', 'globex', 'vazia']);
  });
});
