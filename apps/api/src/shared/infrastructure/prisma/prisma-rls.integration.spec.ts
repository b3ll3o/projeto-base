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
import { createHmac, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  setupTestDatabase,
  cleanDatabase,
  type TestContext,
} from '../../../../test/testcontainers-helper.js';
import {
  ESCOPO_DE_SISTEMA,
  PAPEL_DE_RUNTIME,
  PAPEL_DE_SISTEMA,
  uriComoPapelDeRuntime,
} from './papel-de-runtime.js';
import { abrirEscopo } from './escopo.js';
import { UserId } from '../../../modules/users/domain/value-objects/user-id.vo.js';
import { corpoDaAssinatura } from './assinatura-de-membership.js';

describe('RLS — isolamento de empresa no Postgres (Fase 9)', () => {
  let ctx: TestContext;
  /** Sessão da APLICAÇÃO: papel sem BYPASSRLS, onde as policies valem. */
  let runtime: InstanceType<typeof import('@prisma/client').PrismaClient>;
  /** A credencial de SISTEMA (#118) — a que abre o bucket de sistema. */
  let sistema: InstanceType<typeof import('@prisma/client').PrismaClient>;

  let acmeId: string;
  let globexId: string;
  let perfilDaAcme: string;
  let perfilDaGlobex: string;
  let perfilGlobal: string;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
    const { PrismaClient } = await import('@prisma/client');
    runtime = new PrismaClient({
      datasourceUrl: uriComoPapelDeRuntime(ctx.uriDoBanco, ctx.senhaDoPapel),
    });
    // #118: a credencial de SISTEMA. O bucket de sistema deixou de ser
    // concedido por um valor de GUC e passou a ser concedido pela
    // CREDENCIAL — e as DUAS credenciais estão neste arquivo de proposito: é
    // a separação que o teste abaixo mede.
    sistema = new PrismaClient({ datasourceUrl: ctx.uriDoPapelDeSistema });
  });

  afterAll(async () => {
    await runtime.$disconnect();
    await sistema.$disconnect();
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
   * Usuário global, sem empresa. É o que `users` é por desenho: identidade é
   * global (D4). O que muda é quem enxerga e quem escreve nele — e por isso o
   * vínculo com a empresa é uma `membership`, criada à parte.
   */
  /**
   * Um envelope argon2id COM FORMA.
   *
   * ⚠️ O `UserPrismaMapper` hidrata a senha (`PasswordHash.create`), e o VO
   * recusa o que não PARECE um argon2id. A fixture usava
   * `${slug}-hash-secreto`, que não é um hash — e o mapper lançava
   * `UserPersistenceException` DEPOIS de a conta ser encontrada, o que
   * media a exception e não o achado. Não é um hash real: nada aqui verifica
   * senha, e a conta do login é a de uma sessão de teste.
   */
  const HASH_COM_FORMA =
    '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHRzYWx0c2FsdHNhbHQ$ZGlnZXN0ZGlnZXN0ZGlnZXN0ZGlnZXN0ZGlnZXN0';

  async function criarUsuario(slug: string): Promise<string> {
    // `User.id` é `@id @db.Uuid` **sem** `@default` — é o domínio que gera
    // (`User.criar` recebe o id). Omitir aqui dá `PrismaClientValidationError`
    // nos 9 testes novos, que é vermelho pela fixture e não pela policy.
    //
    // ⚠️ E o id é um **UUID v7**, não um v4: o `UserId` (e o mapper que o
    // hidrata) só aceita v7. A fixture usava `randomUUID()` (v4), e o
    // repositório achava a conta e LANÇAVA ao hidratar o agregado — o
    // vermelheiro mediava a exception, não o achado.
    const u = await ctx.prisma.user.create({
      data: {
        id: UserId.create().value,
        email: `${slug}@teste.local`,
        name: slug,
        passwordHash: HASH_COM_FORMA,
      },
    });
    return u.id;
  }

  async function associar(userId: string, tenantId: string): Promise<void> {
    await ctx.prisma.tenantMembership.create({ data: { userId, tenantId } });
  }

  /**
   * Executa `fn` numa transação com o escopo de sessão definido.
   *
   * `set_config(..., true)` = **LOCAL**, que morre no fim da transação. Com
   * `false` o parâmetro vazaria para a conexão do pool e a próxima requisição
   * herdaria o escopo da anterior — o defeito clássico de fazer `SET` em
   * conexão com pool.
   *
   * ⚠️ Chama `abrirEscopo`, a função DE PRODUÇÃO, em vez de repetir o
   * `set_config` aqui. Repetir mediava uma cópia: um conserto na costura real
   * deixaria este arquivo inteiro verde. Agora qualquer normalização do escopo
   * que a aplicação faz é o que estes ~40 testes exercitam.
   */
  async function comEscopo<T>(
    escopo: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return runtime.$transaction(async (tx) => {
      await abrirEscopo(tx, escopo);
      return fn(tx);
    });
  }

  /**
   * O escopo de SISTEMA, na CREDENCIAL de sistema (#118).
   *
   * O GUC continua sendo `'*'` — o que muda é QUEM abre a transação, e por
   * isso o que a policy vê. Uma sessão de RUNTIME com o mesmo GUC não abre
   * nada (é o teste que mede isso).
   */
  async function comEscopoDeSistema<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return sistema.$transaction(async (tx) => {
      await abrirEscopo(tx, ESCOPO_DE_SISTEMA);
      return fn(tx);
    });
  }

  /**
   * Sem escopo: a sessão nunca define o parâmetro. É o estado em que a sessão
   * fica quando alguém esquece o `comEscopo` — por isso ela precisa não fazer
   * NADA, nem ler e nem escrever.
   */
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

  it('o papel de runtime NAO tem nenhum privilegio em `_prisma_migrations`', async () => {
    // `GRANT ... ON ALL TABLES IN SCHEMA public` alcança `_prisma_migrations`
    // tanto quanto alcança as tabelas de negócio — e ela NÃO tem RLS, então é a
    // única das 9 onde o `DELETE` concedido não encontra trava no banco.
    // Migration `20261020000003`.
    //
    // ⚠️ O privado é MEDIDO pelo DONO (`ctx.prisma`), não pela sessão da
    // aplicação: perguntar a `app_runtime` se ela tem privilégio responderia
    // "não" mesmo com o privilégio concedido, porque a própria lack de
    // privilégio esconde a linha da consulta. Um gate cego para a própria coisa
    // que mede.
    const privilegios = await ctx.prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.table_privileges
      WHERE grantee = ${PAPEL_DE_RUNTIME} AND table_schema = 'public'
        AND table_name = '_prisma_migrations'
    `;

    expect(privilegios).toEqual([]);

    // CONTROLE POSITIVO: o privilégio continua lá para o DONO, e as tabelas de
    // negócio continuam com o que a RLS espera. Sem isto, "não tem privilégio
    // nenhum" também seria verdade de uma sessão vazia ou de uma consulta que
    // não achou nada.
    const doDono = await ctx.prisma.$queryRaw<Array<{ privilege_type: string }>>`
      SELECT privilege_type FROM information_schema.table_privileges
      WHERE grantee = current_user AND table_schema = 'public'
        AND table_name = '_prisma_migrations'
    `;
    expect(doDono.length).toBeGreaterThan(0);

    // CONTROLE POSITIVO: uma tabela de negócio que MANTÉM os 4 verbos. Uso
    // `tenants` e não `tenant_memberships` porque a `20261020000004` tirou o
    // `INSERT` de `tenant_memberships` de propósito — usar aqui a tabela que o
    // conserto mexe deixa o controle positivo preso ao conserto, e um controle
    // positivo que falha junto com o defeito não é controle: é mais uma
    // asserção que acusa a mesma coisa duas vezes.
    const negocio = await ctx.prisma.$queryRaw<Array<{ privilege_type: string }>>`
      SELECT privilege_type FROM information_schema.table_privileges
      WHERE grantee = ${PAPEL_DE_RUNTIME} AND table_schema = 'public'
        AND table_name = 'tenants'
    `;
    // Uma linha por tipo de privilégio — MEDIDO: 4 (DELETE, INSERT, SELECT,
    // UPDATE). O que importa é que NÃO é zero: as tabelas de negócio seguem com
    // o que a RLS espera, e o `REVOKE` não vazou para elas.
    expect(negocio.length).toBeGreaterThan(0);
    expect(negocio.map((p) => p.privilege_type).sort()).toEqual([
      'DELETE',
      'INSERT',
      'SELECT',
      'UPDATE',
    ]);

    // E o que as `20261020000004` e `20261020000005` tiraram, medido:
    // `tenant_memberships` sobrou com `SELECT` e nada mais. Se o `REVOKE` tivesse
    // vazado para `SELECT`, o teste acima continuaria verde e esta linha ficaria
    // fora do alcance — por isso ela existe.
    //
    // ⚠️ `UPDATE` NÃO aparece aqui de propósito: a `20261020000005` trocou o
    // privilégio de TABELA por privilégio de COLUNA (`GRANT UPDATE (profile_id,
    // updated_at)`), e `table_privileges` responde vazio para privilégio de
    // coluna. Medir só esta vista diria "a escrita da membership foi perdida",
    // que é exatamente o que o `atribuirPerfil` faz e depende. A vista de
    // coluna vem logo abaixo, e as duas juntas fecham o par.
    const memberships = await ctx.prisma.$queryRaw<Array<{ privilege_type: string }>>`
      SELECT privilege_type FROM information_schema.table_privileges
      WHERE grantee = ${PAPEL_DE_RUNTIME} AND table_schema = 'public'
        AND table_name = 'tenant_memberships'
    `;
    expect(memberships.map((p) => p.privilege_type).sort()).toEqual(['SELECT']);

    const colunas = await ctx.prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.column_privileges
      WHERE grantee = ${PAPEL_DE_RUNTIME} AND table_schema = 'public'
        AND table_name = 'tenant_memberships' AND privilege_type = 'UPDATE'
      ORDER BY column_name
    `;
    // `updated_at` porque `TenantMembership.updatedAt` é `@updatedAt`: o Prisma
    // escreve a coluna a cada `updateMany`, e sem ela no `GRANT` a escrita
    // legítima daria `42501`. E `user_id` e `role` NÃO entram — são as duas
    // colunas que os verbos que sobraram tentavam reescrever.
    expect(colunas.map((c) => c.column_name)).toEqual(['profile_id', 'updated_at']);
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
    const ids = await comEscopoDeSistema(async (tx) => {
      const r = await tx.profile.findMany({ select: { id: true } });
      return r.map((p) => p.id);
    });

    expect(ids).toEqual(expect.arrayContaining([perfilDaAcme, perfilDaGlobex, perfilGlobal]));
  });

  // ── #118: a PROVA de que o bypass fechou ────────────────────────────────
  //
  // MEDIDO (issue #118): antes desta migration, uma sessão `app_runtime` que
  // fizesse `SET app.tenant_id = '*'` enxergava TODOS os usuários de TODAS as
  // empresas. O `NOBYPASSRLS` impede o papel de *pular* a policy; não
  // impede o papel de *escolher* o valor do GUC.
  //
  // A correção: quem concede o bucket de sistema é a CREDENCIAL
  // (`current_user = 'app_system'`), e não o valor que a sessão escreve. O
  // GUC continua sendo `'*'` — o que muda é QUEM abre a transação.
  it('#118: a sessão de RUNTIME com o escopo de SISTEMA NÃO abre o bucket de empresa', async () => {
    // O MESMO GUC, a MESMA sessão de runtime — e o resultado é o oposto.
    const ids = await comEscopo(ESCOPO_DE_SISTEMA, async (tx) => {
      const r = await tx.profile.findMany({ select: { id: true } });
      return r.map((p) => p.id);
    });

    // Nenhuma empresa de outra.
    expect(ids).not.toContain(perfilDaAcme);
    expect(ids).not.toContain(perfilDaGlobex);
  });

  it('#118: e o que a sessão de RUNTIME vê é o bucket GLOBAL, e só', async () => {
    // ⚠️ O bucket GLOBAL (perfil de sistema, `tenant_id IS NULL`) CONTINUA
    // legível — e é por DESIGN: a policy de leitura de `profiles` aceita
    // `aceita_global`, e há um teste de acima que afirma isso ("o perfil
    // GLOBAL aparece — o bucket de sistema é legível").
    //
    // O que o #118 fecha é o bucket de EMPRESA: antes, o `'*'` concedia TUDO
    // — inclusive as empresas vizinhas. Agora ele concede só o global, e as
    // empresas exigem a credencial de sistema.
    const ids = await comEscopo(ESCOPO_DE_SISTEMA, async (tx) => {
      const r = await tx.profile.findMany({ select: { id: true } });
      return r.map((p) => p.id);
    });

    expect(ids).toEqual([perfilGlobal]);
  });

  it('#118: a sessão de RUNTIME não vê NENHUM USUÁRIO — o vetor medido pela issue', async () => {
    // ⚠️ ESTE É O VETOR QUE A ISSUE #118 MEDIU: uma sessão `app_runtime`
    // que fizesse `SET app.tenant_id = '*'` enxergava TODOS os usuários de
    // TODAS as empresas. A tabela `users` tem a policy mais fechada (ela
    // exige `usuario_no_escopo`, que pergunta pela MEMBERSHIP do alvo) — e
    // por isso ela é a prova mais dura: sem a credencial, a sessão de runtime
    // não vê NENHUM usuário.
    //
    // ⚠️ A fixture cria empresas e PERFIS, mas não usuários — e um teste
    // sobre a tabela `users` com a tabela vazia mede NADA. Por isso os
    // usuários são criados AQUI, um em cada empresa: sem eles, o veredito
    // seria "a sessão não vê ninguém" por falta de dado, e não por causa da
    // policy.
    const ana = await criarUsuario('ana');
    const bruno = await criarUsuario('bruno');
    await associar(ana, acmeId);
    await associar(bruno, globexId);

    const ids = await comEscopo(ESCOPO_DE_SISTEMA, async (tx) => {
      const r = await tx.user.findMany({ select: { id: true } });
      return r.map((u) => u.id);
    });

    expect(ids).toEqual([]);
  });

  it('#118: as DUAS credenciais veem coisas diferentes — é a separação que fecha o furo', async () => {
    // O par que prova que a correção é de CREDENCIAL e não de GUC: mesmo GUC,
    // mesmo dado, vereditos opostos.
    const ana = await criarUsuario('ana');
    const bruno = await criarUsuario('bruno');
    await associar(ana, acmeId);
    await associar(bruno, globexId);

    const comRuntime = await comEscopo(ESCOPO_DE_SISTEMA, async (tx) =>
      (await tx.user.findMany({ select: { id: true } })).map((u) => u.id),
    );
    const comSistema = await comEscopoDeSistema(async (tx) =>
      (await tx.user.findMany({ select: { id: true } })).map((u) => u.id),
    );

    // A sessão de RUNTIME: nenhum usuário. A de SISTEMA: os dois.
    expect(comRuntime).toEqual([]);
    expect(comSistema.sort()).toEqual([ana, bruno].sort());
  });

  it('#118: o LOGIN acha a conta — o repositório abre o bucket de SISTEMA na CREDENCIAL', async () => {
    // ⚠️ ESTE É O TESTE QUE FALTAVA, e a razão de o P0 ter passado.
    //
    // `findByEmail(email, null)` é o LOGIN: ele acontece ANTES de existir
    // empresa — não há header, e um usuário sem membership é invisível sob
    // qualquer outro escopo. `tenantId` nulo é o bucket de SISTEMA, e o
    // bucket de sistema é a CREDENCIAL de sistema.
    //
    // MEDIDO 2026-10-28: a #118 trocou o disjunto `escopo_atual() = '*'` da
    // policy por `current_user = 'app_system'`, e a sessão de RUNTIME com o
    // escopo `'*'` passou a ver ZERO usuários. O repositório, que abria o
    // escopo de SISTEMA pela sessão de RUNTIME, deixou de achar a conta — e o
    // login passaria a falhar em PRODUÇÃO com "credenciais inválidas", sem
    // erro em lugar nenhum.
    //
    // ⚠️ E NENHUM TESTE PEGOU: o e2e e a integração sobem a aplicação com a
    // URI do DONO (superusuário, que ignora a RLS por completo) — e a spec de
    // integração do repositório de usuários também. Aqui o REPOSITÓRIO roda
    // contra o Postgres de verdade, com a credencial que a aplicação usa.
    const ana = await criarUsuario('ana');
    const bruno = await criarUsuario('bruno');
    await associar(ana, acmeId);
    await associar(bruno, globexId);

    const { PrismaUserRepository } =
      await import('../../../modules/users/infrastructure/persistence/prisma-user.repository.js');
    const { Email } = await import('../../../modules/users/domain/value-objects/email.vo.js');
    // ⚠️ O repositório recebe a sessão de RUNTIME — a credencial que a
    // aplicação usa. E é o REPOSITÓRIO que escolhe a credencial do bucket de
    // sistema, pelo `tenantId` nulo.
    const repo = new PrismaUserRepository(runtime);

    // O LOGIN: achar pelo e-mail, sem escopo de empresa.
    const achado = await repo.findByEmail(Email.create('ana@teste.local'), null);
    expect(achado).not.toBeNull();
    expect(achado?.id().value).toBe(ana);

    // E o escopo de EMPRESA continua fechado para a sessão de runtime: a
    // conta da outra empresa não aparece.
    const alheio = await repo.findByEmail(Email.create('bruno@teste.local'), acmeId);
    expect(alheio).toBeNull();
  });

  it('#118: o runtime NÃO é membro do papel de sistema (o `SET ROLE` não serviria)', async () => {
    // Se `app_runtime` fosse membro de `app_system`, um `SET ROLE` bastaria e
    // o furo voltaria pela porta dos fundos.
    const membros = await runtime.$queryRaw<{ pg_get_userbyid: string }[]>`
      SELECT pg_get_userbyid(g.roleid) AS pg_get_userbyid
      FROM pg_auth_members g
      WHERE pg_get_userbyid(g.member) = 'app_runtime'
    `;
    expect(membros.map((m) => m.pg_get_userbyid)).not.toContain(PAPEL_DE_SISTEMA);
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
    const apagados = await comEscopoDeSistema(async (tx) => {
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

  // ─────────────── `users`: a tabela sem `tenant_id`, e a mais exposta ───────────────
  //
  // MEDIDO 2026-10-17, sessão `app_runtime` com escopo de empresa VÁLIDA, contra
  // a migration das outras 5 tabelas e SEM nenhuma policy em `users`:
  //   - enxergava os 3 usuários do banco, `password_hash` legível;
  //   - promovia usuário de outra empresa a admin global  (UPDATE 1);
  //   - reescrevia a senha de usuário de outra empresa    (UPDATE 1);
  //   - inseria usuário já nascendo admin global         (INSERT 1);
  //   - apagava (hard) usuário de outra empresa          (DELETE 1).
  // A §5 da migration chamava a ausência de "de propósito, são globais". A
  // ausência é de propósito; a consequência medida não é o que o texto vendia.

  it('com o escopo da ACME, o usuário da GLOBEX não aparece — nem o hash dele', async () => {
    const daAcme = await criarUsuario('alice');
    const daGlobex = await criarUsuario('bob');
    await associar(daAcme, acmeId);
    await associar(daGlobex, globexId);

    const vistos = await comEscopo(acmeId, async (tx) => {
      const r = await tx.user.findMany({ select: { id: true } });
      return r.map((u) => u.id);
    });

    expect(vistos).toContain(daAcme);
    // O vazamento de `password_hash` é o mais grave dos cinco:argon2id é caro
    // de quebrar, mas uma tabela inteira de hashes de senha é o que a escalada
    // de `profile_id` já pagava de UNIFIED — e ninguém estava olhando.
    expect(vistos).not.toContain(daGlobex);
  });

  it('SEM escopo definido a sessão não vê NENHUM usuário (fail-closed)', async () => {
    const daAcme = await criarUsuario('alice');
    await associar(daAcme, acmeId);

    const vistos = await semEscopo(async (tx) => {
      const r = await tx.user.findMany({ select: { id: true } });
      return r.map((u) => u.id);
    });

    expect(vistos).toEqual([]);
  });

  it('UPDATE que promoveria um usuário alheio a admin global é barrado', async () => {
    const daAcme = await criarUsuario('alice');
    const daGlobex = await criarUsuario('bob');
    await associar(daAcme, acmeId);
    await associar(daGlobex, globexId);

    const alterados = await comEscopo(acmeId, async (tx) => {
      const r = await tx.user.updateMany({
        where: { id: daGlobex },
        data: { profileId: perfilGlobal },
      });
      return r.count;
    });

    expect(alterados).toBe(0);
    await expect(ctx.prisma.user.findUnique({ where: { id: daGlobex } })).resolves.toMatchObject({
      profileId: null,
    });
  });

  it('UPDATE que REESCREVERIA a senha de um usuário alheio é barrado', async () => {
    const daAcme = await criarUsuario('alice');
    const daGlobex = await criarUsuario('bob');
    await associar(daAcme, acmeId);
    await associar(daGlobex, globexId);

    const alterados = await comEscopo(acmeId, async (tx) => {
      const r = await tx.user.updateMany({
        where: { id: daGlobex },
        data: { passwordHash: 'senha-escrita-pela-acme' },
      });
      return r.count;
    });

    expect(alterados).toBe(0);
    const intacto = await ctx.prisma.user.findUnique({ where: { id: daGlobex } });
    // o hash e' o da FIXTURE — a assercao e' "nao foi alterado", nao o valor
    expect(intacto?.passwordHash).toBe(HASH_COM_FORMA);
  });

  it('DELETE de um usuário alheio é barrado', async () => {
    const daAcme = await criarUsuario('alice');
    const daGlobex = await criarUsuario('bob');
    await associar(daAcme, acmeId);
    await associar(daGlobex, globexId);

    const apagados = await comEscopo(acmeId, async (tx) => {
      const r = await tx.user.deleteMany({ where: { id: daGlobex } });
      return r.count;
    });

    expect(apagados).toBe(0);
    await expect(ctx.prisma.user.findUnique({ where: { id: daGlobex } })).resolves.not.toBeNull();
  });

  it('INSERT de usuário já nascendo com perfil GLOBAL é barrado', async () => {
    // O cadastro legítimo grava `profile_id: null` (medido em
    // `prisma-tenant-onboarding.repository.ts`, os dois caminhos). Um usuário
    // que nasce apontando para o admin global nasce ADMIN de todas as empresas
    // — e por `isAdmin` isso é BYPASS TOTAL do `PermissionsGuard`.
    const id = 'ffffffff-0000-0000-0000-0000000000ff';

    await expect(
      comEscopo(acmeId, async (tx) => {
        await tx.user.create({
          data: {
            id,
            email: 'intruso@teste.local',
            name: 'Intruso',
            passwordHash: 'x',
            profileId: perfilGlobal,
          },
        });
      }),
    ).rejects.toThrow(/row-level security policy/);

    await expect(ctx.prisma.user.findUnique({ where: { id } })).resolves.toBeNull();
  });

  it('sessão SEM escopo também não INSERE — esquecer o `comEscopo` não abre a porta', async () => {
    // A primeira versão da policy de `INSERT` era `escopo_atual() IS NULL OR …`
    // para não quebrar o cadastro público. Isso é uma brecha com nome: uma
    // sessão que esqueceu de definir o escopo — exatamente o bug que o
    // `set_config(..., true)` local previne em todo o resto — ganhava INSERT
    // irrestrito, e [E] acima passaria dependendo do GUC. Fail-closed também
    // aqui: sem escopo não se escreve, e o cadastro abre sessão de SISTEMA.
    const id = 'dddddddd-0000-0000-0000-0000000000dd';

    await expect(
      semEscopo(async (tx) => {
        await tx.user.create({
          data: { id, email: 'sem-escopo@teste.local', name: 'Sem Escopo', passwordHash: 'x' },
        });
      }),
    ).rejects.toThrow(/row-level security policy/);

    await expect(ctx.prisma.user.findUnique({ where: { id } })).resolves.toBeNull();
  });

  // ─────────────── controles positivos: o conserto não pode virar "tudo fechado" ───────────────

  it('CONTROLE: com o escopo da ACME, o usuário DA ACME continua visível e gravável', async () => {
    const daAcme = await criarUsuario('alice');
    await associar(daAcme, acmeId);

    const alterados = await comEscopo(acmeId, async (tx) => {
      const r = await tx.user.updateMany({
        where: { id: daAcme },
        data: { passwordHash: 'senha-nova-da-acme' },
      });
      return r.count;
    });

    expect(alterados).toBe(1);
    await expect(ctx.prisma.user.findUnique({ where: { id: daAcme } })).resolves.toMatchObject({
      passwordHash: 'senha-nova-da-acme',
    });
  });

  it('CONTROLE: o escopo de SISTEMA ainda promove a perfil global (admin global não perde poder)', async () => {
    // O caminho legítimo de `users.profile_id` é o bucket de sistema — é onde
    // `profiles.use-cases.ts` grava quando o ator NÃO tem `X-Tenant-Id`. Se o
    // `WITH CHECK` não abrir para `'*'`, a admin de sistema perde a atribuição.
    const alvo = await criarUsuario('root');

    const alterados = await comEscopoDeSistema(async (tx) => {
      const r = await tx.user.updateMany({
        where: { id: alvo },
        data: { profileId: perfilGlobal },
      });
      return r.count;
    });

    expect(alterados).toBe(1);
    await expect(ctx.prisma.user.findUnique({ where: { id: alvo } })).resolves.toMatchObject({
      profileId: perfilGlobal,
    });
  });

  it('CONTROLE: o cadastro público (escopo de SISTEMA) ainda cria conta com perfil nulo', async () => {
    // A identidade é global por desenho (D4) e o cadastro acontece antes de
    // existir empresa. Fechar `users` não pode quebrar a porta de entrada.
    //
    // ⚠️ Este teste é do `POST /users` (rota `@Public()`, que passa `null`).
    // Os DOIS caminhos de onboarding NÃO são o mesmo caso e não são cobertos
    // aqui: MEDIDO 2026-10-17, eles abrem o escopo da EMPRESA antes do
    // `tx.user.create` e morriam em `42501` sob a sessão da aplicação. O que os
    // conserta é `prisma-tenant-onboarding.repository.integration.spec.ts`, no
    // bloco "com a sessão da aplicação (as policies valem)" — que é o único
    // lugar do repo onde o onboarding fala com um papel sem BYPASSRLS.
    const id = 'eeeeeeee-0000-0000-0000-0000000000ee';

    const criado = await comEscopoDeSistema(async (tx) => {
      const r = await tx.user.create({
        data: { id, email: 'nova@teste.local', name: 'Nova', passwordHash: 'x' },
      });
      return r.id;
    });

    expect(criado).toBe(id);
    await expect(ctx.prisma.user.findUnique({ where: { id } })).resolves.toMatchObject({
      profileId: null,
    });
  });

  it('o MESMO escopo em caixa alta enxerga o mesmo dado — o texto do GUC é canônico', async () => {
    // `no_escopo_atual` compara por TEXTO (`alvo::text = escopo_atual()`) porque
    // `escopo_atual()` pode valer `'*'` e `'*'::uuid` estoura. O Postgres
    // canoniza `uuid` para minúsculas ao converter para texto, então um escopo
    // em caixa alta NUNCA casa.
    //
    // O efeito não é erro: é ZERO LINHAS. Membro legítimo mandando o header em
    // caixa alta cai em 403 em todas as rotas de empresa, e nada no sintoma
    // aponta para a caixa — o dado existe, o escopo é válido, o token é válido.
    // É fail-closed (não vaza), e por isso mesmo assim é um defeito: o
    // `UUID_RE` do guard aceita a forma em caixa alta (flag `/i`) e a devolvia
    // sem canonizar.
    const maiusculo = acmeId.toUpperCase();
    // O dado do teste PRECISA ter letras: um uuid só de dígitos não distingue.
    expect(maiusculo).not.toBe(acmeId);
    expect(maiusculo).toMatch(/[A-F]/);

    const porMaiusculo = await comEscopo(maiusculo, (tx) =>
      tx.profile.findMany({ where: { slug: 'gestor-acme' } }),
    );

    expect(porMaiusculo).toHaveLength(1);

    // CONTROLE POSITIVO: em minúsculas continua igual, e o bucket de SISTEMA
    // (`'*'`) não passa pela comparação de uuid. Sem estes dois, "viu 1" pode
    // ser o conserto ter virado "liberar tudo".
    await expect(
      comEscopo(acmeId, (tx) => tx.profile.findMany({ where: { slug: 'gestor-acme' } })),
    ).resolves.toHaveLength(1);
    await expect(
      comEscopoDeSistema((tx) =>
        tx.profile.findMany({ where: { slug: { in: ['gestor-acme', 'gestor-globex'] } } }),
      ),
    ).resolves.toHaveLength(2);
  });

  /**
   * O mesmo que `tentarComo`, mas COM escopo de sessão.
   *
   * Existe porque a `20261020000005` barra `role`/`user_id`/`DELETE` por
   * PRIVILÉGIO, e privilégio recusado é uma EXCEÇÃO (`42501`), não uma linha a
   * menos — `updateMany` aqui não devolve `count: 0`, ele estoura. Sem esta
   * distinção o teste de bloqueio seria escrito na forma errada e mediria um
   * `count: 0` que a policy nunca produziu.
   */
  async function tentarComEscopo(
    escopo: string,
    fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
  ): Promise<{ ok: boolean; detalhe: string }> {
    return comEscopo(escopo, (tx) =>
      fn(tx)
        .then(() => ({ ok: true, detalhe: 'SUBIU' }))
        .catch((e: unknown) => {
          const mensagem = (e as Error).message;
          const sqlstate = /Code: `([0-9A-Z]{5})`/.exec(mensagem)?.[1];
          return {
            ok: false,
            detalhe: `${sqlstate ?? (e as { code?: string }).code ?? 'erro'}: ${mensagem}`,
          };
        }),
    );
  }

  // ─────────────── os verbos que sobraram em `tenant_memberships` ───────────────

  it('🔴 UPDATE do `role` na PRÓPRIA empresa é barrado — `memberships_atualizacao` só olha `tenant_id`', async () => {
    // A `20261020000004` fechou o `INSERT` e esqueceu os verbos ao lado. Aqui o
    // atacante é o dono da ACME agindo sobre a membership DELE: `USING` é
    // verdadeiro (o `tenant_id` é o do escopo) e `WITH CHECK` também (o
    // `tenant_id` não muda). Nenhum dos dois lados enxerga `role`.
    //
    // O efeito não é escalada: `emitirConvite` grava `role: 'member'` fixo, então
    // não há rota que devolva 'gerente'. É a ESCALA INVERTIDA — quem tem 'member'
    // vira gerente da empresa, e `findRole` é o que decide.
    const alice = await criarUsuario('alice');
    await associar(alice, acmeId);
    await ctx.prisma.tenantMembership.update({
      where: { userId_tenantId: { userId: alice, tenantId: acmeId } },
      data: { role: 'member' },
    });

    const tentativa = await tentarComEscopo(acmeId, (tx) =>
      tx
        .$executeRaw(
          Prisma.sql`UPDATE tenant_memberships SET role = 'gerente' WHERE user_id = ${alice}::uuid`,
        )
        .then((n) => n as unknown),
    );

    // As DUAS asserções. `ok: false` sozinho provaria que o banco recusou;
    // `findRole` intacto sozinho provaria que o `where` não casou. Juntas
    // dizem o que importa: houve uma tentativa e a linha não mudou.
    expect(tentativa.ok).toBe(false);
    // ⚠️ (PR #101) `ok: false` sozinho é cego DENTRE "o banco recusou por
    // PRIVILÉGIO" e "o banco recusou por outro motivo" (conexão, SQL malformado,
    // `where` que não casou). O que fixa a propriedade é o SQLSTATE: os três
    // testes vermelhos desta seção medem a `20261020000005`, que barra por
    // privilégio — se um dia voltassem a ser barrados pela POLICY, o furo
    // reabriria pelo caminho do privilégio e o teste passaria dizendo o
    // contrário. MEDIDO (não deduzido): `42501` +
    // `permission denied for table tenant_memberships`.
    expect(tentativa.detalhe).toMatch(/^42501:/);
    expect(tentativa.detalhe).toContain('permission denied for table tenant_memberships');
    const role = await ctx.prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: alice, tenantId: acmeId } },
      select: { role: true },
    });
    expect(role).toEqual({ role: 'member' });
  });

  it('🔴 UPDATE do `user_id` para um usuário de OUTRA empresa é barrado — a elevate-self com um verbo a menos', async () => {
    // O roteiro exato que a `20261020000004` mediu no `INSERT`, trocando o verbo:
    // a linha continua no `tenant_id` da ACME (passa nos dois lados da policy) e
    // passa a apontar para o Bruno da GLOBEX. Aí `usuario_no_escopo(<bruno>)` vale
    // TRUE, porque a membership que o statement acabou de gravar É a coisa que a
    // função mede.
    const alice = await criarUsuario('alice');
    const bruno = await criarUsuario('bruno');
    await associar(alice, acmeId);
    await associar(bruno, globexId);

    // ANTES: a sessão da ACME não enxerga o Bruno. Sem esta linha, "depois não
    // enxerga" não distingue "a escalada foi barrada" de "nunca esteve lá".
    await expect(
      comEscopo(acmeId, (tx) => tx.user.findMany({ select: { name: true } })),
    ).resolves.toEqual([{ name: 'alice' }]);

    const tentativa = await tentarComEscopo(acmeId, (tx) =>
      tx
        .$executeRaw(
          Prisma.sql`UPDATE tenant_memberships SET user_id = ${bruno}::uuid WHERE user_id = ${alice}::uuid`,
        )
        .then((n) => n as unknown),
    );

    expect(tentativa.ok).toBe(false);
    // (PR #101) Mesmo motivo do teste anterior: o SQLSTATE diz QUE classe de
    // falha foi. MEDIDO: `42501` + `permission denied for table
    // tenant_memberships`.
    expect(tentativa.detalhe).toMatch(/^42501:/);
    expect(tentativa.detalhe).toContain('permission denied for table tenant_memberships');
    // O efeito é o que importa, e é a MESMA leitura que a escalada da
    // `20261020000004` mediu como proibida.
    await expect(
      comEscopo(acmeId, (tx) => tx.user.findMany({ select: { name: true } })),
    ).resolves.toEqual([{ name: 'alice' }]);
    const memberships = await ctx.prisma.tenantMembership.findMany({
      where: { tenantId: acmeId },
      select: { userId: true },
    });
    expect(memberships).toEqual([{ userId: alice }]);
  });

  it('🔴 DELETE da membership da PRÓPRIA empresa é barrado, e o dono sobrevive', async () => {
    // `memberships_remocao` é `USING (no_escopo_atual(tenant_id, false))` e o
    // escopo é o da própria empresa: PASSA. Sem consumidor no código — o único
    // `tenantMembership.*` escrito em todo o app é o `updateMany` de
    // `atribuirPerfil`.
    const alice = await criarUsuario('alice');
    await associar(alice, acmeId);

    const tentativa = await tentarComEscopo(acmeId, (tx) =>
      tx
        .$executeRaw(Prisma.sql`DELETE FROM tenant_memberships WHERE tenant_id = ${acmeId}::uuid`)
        .then((n) => n as unknown),
    );

    expect(tentativa.ok).toBe(false);
    // (PR #101) Terceiro da série. Sem isto, um `DELETE` barrado por qualquer
    // outra coisa contaria como "o DELETE está barrado". MEDIDO: `42501` +
    // `permission denied for table tenant_memberships`.
    expect(tentativa.detalhe).toMatch(/^42501:/);
    expect(tentativa.detalhe).toContain('permission denied for table tenant_memberships');
    await expect(ctx.prisma.tenantMembership.count({ where: { tenantId: acmeId } })).resolves.toBe(
      1,
    );
  });

  it('🟢 UPDATE do `profile_id` — o caminho legítimo — continua funcionando com o privilégio por coluna', async () => {
    // ⚠️ CONTROLE POSITIVO, e ele é o motivo de os outros três existirem. Um
    // `REVOKE UPDATE ON tenant_memberships` sem o `GRANT` por coluna seguinte
    // deixaria os três vermelhos acima verdes E quebraria o `atribuirPerfil` — que
    // é a única escrita de membership que a aplicação faz. O conserto pareceria
    // certo e seria uma mentira maior que o defeito.
    const alice = await criarUsuario('alice');
    await associar(alice, acmeId);

    // Via Prisma, e não por SQL cru: é o `data` que o `atribuirPerfil` manda, e é
    // ele que traz o `updated_at` implícito do `@updatedAt` — a coluna que ficaria
    // de fora do `GRANT` quebraria aqui, não em produção.
    await comEscopo(acmeId, (tx) =>
      tx.tenantMembership.updateMany({
        where: { userId: alice, tenantId: acmeId },
        data: { profileId: perfilDaAcme },
      }),
    );
    const membership = await ctx.prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: alice, tenantId: acmeId } },
      select: { profileId: true },
    });
    expect(membership).toEqual({ profileId: perfilDaAcme });
  });

  it('a chave de assinatura tem RLS ligado, e não só um `REVOKE`', async () => {
    // A `20261020000004` protege `chaves_de_assinatura` com `REVOKE ALL`. Isso é
    // pontual: a `20261020000000` dá `SELECT` a `app_runtime` em `ON ALL TABLES IN
    // SCHEMA public`, e qualquer migration futura que repita esse padrão
    // re-concede a leitura do segredo — o atacante de injeção de SQL assina o que
    // quiser e a escalada inteira volta.
    //
    // O que fecha isso não é outro `REVOKE` (que o re-grant desfaz) e nem
    // `FORCE ROW LEVEL SECURITY` (que quebraria o boot, porque o leitor da chave
    // é o DONO): é RLS sem policy, que é o fail-closed do Postgres — qualquer
    // papel que não seja o dono lê ZERO linhas mesmo com o privilégio de volta.
    //
    // Perguntado ao DONO: perguntar ao runtime se ele tem privilégio responderia
    // "não" com ou sem o RLS, porque a falta de privilégio esconde a linha.
    const rls = await ctx.prisma.$queryRaw<Array<{ relrowsecurity: boolean }>>`
      SELECT c.relrowsecurity FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'chaves_de_assinatura'
    `;
    expect(rls).toEqual([{ relrowsecurity: true }]);
  });

  // ─────────────── a escalada que a §2 da 000002 dá por fechada ───────────────
  //
  // A `20261020000002` fecha o elo do `users_history` e o seu próprio texto diz
  // que `memberships_insercao` "confere SÓ o `tenant_id`, nunca o `user_id`" e
  // que o elo que falta fechar é o passo 1. Isso vale ENQUANTO o passo 1 for o
  // único caminho para o `user_id` alheio. Não é.
  //
  // `usuario_no_escopo(alvo)` é `EXISTS (… tenant_memberships WHERE user_id =
  // alvo AND tenant_id = escopo_atual())` — a membership É a credencial. E
  // `memberships_insercao` é `WITH CHECK (no_escopo_atual(tenant_id, false))`:
  // o `user_id` é dado do cliente e ninguém confere. Então o atacante escreve a
  // credencial que o guarda exige, e o guarda abre. Elevate-self: a linha que
  // o POLICY de escrita produz é a linha que a POLICY de leitura mede.

  it('🔴 escalada: inserir membership com `user_id` alheio NÃO pode conceder acesso à conta alheia', async () => {
    const alice = await criarUsuario('alice');
    const bruno = await criarUsuario('bruno');
    const carol = await criarUsuario('carol');
    await associar(alice, acmeId);
    await associar(bruno, globexId);

    // ── CONTROLE POSITIVO A (antes do ataque): a policy de `users` DEIXA passar
    // quem tem membership. Sem isto, `['alice']` no PASSO 2 seria
    // indistinguível de uma consulta que não devolve nada por outro motivo —
    // e a garantia toda seria vacuamente verdadeira. Consulta que só retorna
    // vazio é o pior tipo de controle.
    await expect(
      comEscopo(globexId, (tx) => tx.user.findMany({ select: { name: true } })),
    ).resolves.toEqual([{ name: 'bruno' }]);

    // PASSO 0 (premissa do ataque): a Alice, no escopo da ACME, só se vê.
    const antes = await comEscopo(acmeId, (tx) => tx.user.findMany({ select: { name: true } }));
    expect(antes.map((u) => u.name)).toEqual(['alice']);

    // PASSO 1: a Alice cria a membership do BRUNO na EMPRESA DELA. O
    // `user_id` é dado do cliente e o `tenant_id` é o escopo dela, que é
    // válido — `no_escopo_atual(tenant_id, false)` não tem o que reprovar.
    const subiu = await comEscopo(acmeId, (tx) =>
      tx.tenantMembership.create({ data: { userId: bruno, tenantId: acmeId } }),
    )
      .then(() => 'SUBIU')
      .catch((e: unknown) => `BARRADO: ${(e as { code?: string }).code ?? 'erro'}`);

    // PASSO 2: o Bruno NÃO pode ter aparecido. Este é o dente — a garantia é
    // sobre o EFEITO, não sobre a sintaticidade do INSERT: uma policy que
    // barra o INSERT mas deixa a leitura aberta daria a asserção do `subiu`
    // verde e esta vermelha.
    const depois = await comEscopo(acmeId, (tx) => tx.user.findMany({ select: { name: true } }));

    // ⚠️ As DUAS asserções juntas são a garantia; uma só delas é meio
    // conserto. `depois` mede o que o atacante GANHA. `subiu` mede por onde.
    expect(depois.map((u) => u.name)).toEqual(['alice']);
    expect(subiu).toMatch(/^BARRADO/);

    // CONTROLE POSITIVO B (depois do ataque): o INSERT é real e o efeito é
    // real. O DONO cria a membership da Carol na ACME — caminho legítimo, fora
    // do escopo do atacante — e ela APARECE para a Alice. Sem esta linha, um
    // `depois` igual a `['alice']` seria igualmente compatível com "a tabela
    // está fechada para todo mundo", que é um produto quebrado vestindo um
    // teste verde.
    await associar(carol, acmeId);
    await expect(
      comEscopo(acmeId, (tx) => tx.user.findMany({ select: { name: true } })),
    ).resolves.toEqual([{ name: 'alice' }, { name: 'carol' }]);
  });

  // ─────────────── o outro lado do REVOKE: a função tem que funcionar ───────────────

  /**
   * A assinatura que a aplicação produz.
   *
   * ⚠️ O corpo vem de `corpoDaAssinatura` — a FUNÇÃO DE PRODUÇÃO, importada, e
   * não uma segunda cópia escrita aqui. A 1ª versão deste arquivo montava o
   * corpo à mão com `\n`, e foi exatamente essa duplicação que deixou o formato
   * divergir do SQL sem nenhum sinal: dois lugares dizendo a mesma verdade, e
   * um teste verde dos dois lados enquanto a verdade era uma só. Aqui há um
   * lugar só; o SQL é o segundo, e o `🟢` abaixo é quem diz se os dois casam.
   */
  async function assinarMembership(
    userId: string,
    tenantId: string,
    role: string,
    profileId: string | null,
  ): Promise<string> {
    const [linha] = await ctx.prisma.$queryRaw<Array<{ segredo: Buffer }>>`
      SELECT segredo FROM chaves_de_assinatura WHERE nome = 'membership'
    `;
    return createHmac('sha256', linha!.segredo)
      .update(corpoDaAssinatura(userId, tenantId, role, profileId), 'utf8')
      .digest('hex');
  }

  /**
   * Executa a consulta como `app_runtime` e devolve como foi.
   *
   * ⚠️ Recebe `Prisma.Sql` e não string: o `$queryRaw` do Prisma não aceita
   * string crua (é o que impede injeção), e aqui os parâmetros são justamente
   * o que o atacante escolheria — `user_id`, `tenant_id` e a assinatura são
   * argumentos da chamada.
   *
   * ⚠️ Traz a MENSAGEM do erro junto do código, e isso não é capricho: com só o
   * código, uma chamada a uma função que NÃO EXISTE devolve `42883` e uma
   * recusa de assinatura devolve `42501` — mas um `toMatch(/BARRADO/)` aceitaria
   * as duas, e o teste ficaria verde **sem nenhuma função no banco**. Medido
   * nesta sessão: com a assinatura forjada, o teste só falhou porque a tabela da
   * chave não existia, e não porque a escalada foi barrada. Exigir a mensagem é
   * o que separa "a função existe e recusou" de "não havia o que chamar".
   */
  async function tentarComo(sql: Prisma.Sql): Promise<{ ok: boolean; detalhe: string }> {
    return semEscopo((tx) =>
      tx
        .$queryRaw(sql)
        .then(() => ({ ok: true, detalhe: 'SUBIU' }))
        .catch((e: unknown) => {
          // ⚠️ O Prisma re-embala erro do Postgres como `P2010` e DENTRO do texto
          // deixa o SQLSTATE em `Raw query failed. Code: \`42501\``. Ler só
          // `e.code` daria `P2010` para toda recusa — e `P2010` também é o que
          // sai quando a tabela não existe, então a asserção perderia o poder de
          // distinguir "a função recusou" de "não havia o que chamar". MEDIDO: sem
          // esta extração, `expect(...).toMatch(/^42501/)` falhou com o
          // comportamento CORRETO já funcionando.
          const mensagem = (e as Error).message;
          const sqlstate = /Code: `([0-9A-Z]{5})`/.exec(mensagem)?.[1];
          return {
            ok: false,
            detalhe: `${sqlstate ?? (e as { code?: string }).code ?? 'erro'}: ${mensagem}`,
          };
        }),
    );
  }

  it('🔴 a assinatura é o que separa "chamei" de "a aplicação me pediu"', async () => {
    const alice = await criarUsuario('alice');
    const bruno = await criarUsuario('bruno');
    await associar(alice, acmeId);
    await associar(bruno, globexId);

    // CONTROLE POSITIVO: a Alice só se vê. Sem isto, o `['alice']` do fim seria
    // compatível com uma consulta que não devolve nada por outro motivo.
    await expect(
      comEscopo(acmeId, (tx) => tx.user.findMany({ select: { name: true } })),
    ).resolves.toEqual([{ name: 'alice' }]);

    // ⚠️ A escalada, pela MESMA porta da aplicação: sessão `app_runtime`, no
    // escopo da ACME, nomeando o Bruno. É a chamada que `provisionarEmpresaPropria`
    // e `consumirEEntrar` fazem — e é a que a assinatura precisa travar.
    const forjada = await tentarComo(Prisma.sql`
      SELECT criar_membership(${bruno}::uuid, ${acmeId}::uuid, ${'gerente'}::text, NULL::uuid, ${'assinatura-forjada'}::text)
    `);
    expect(forjada.ok).toBe(false);
    expect(forjada.detalhe).toContain('assinatura invalida');

    const depois = await comEscopo(acmeId, (tx) => tx.user.findMany({ select: { name: true } }));
    expect(depois.map((u) => u.name)).toEqual(['alice']);

    // E a assinatura NÃO é transferível entre chamadas: a que a aplicação produz
    // para (bruno, acme, owner) não abre (bruno, globex, owner). Sem esta linha,
    // "a função confere a assinatura" provaria que ela confere *uma* assinatura.
    const paraAcme = await assinarMembership(bruno, acmeId, 'gerente', null);
    const cruzada = await tentarComo(Prisma.sql`
      SELECT criar_membership(${bruno}::uuid, ${globexId}::uuid, ${'gerente'}::text, NULL::uuid, ${paraAcme}::text)
    `);
    expect(cruzada.ok).toBe(false);
    expect(cruzada.detalhe).toContain('assinatura invalida');
  });

  it('🔴 `app_runtime` não lê a chave de assinatura — senão ela não prova nada', async () => {
    // ⚠️ Este é o teste que dá sentido ao anterior. Uma assinatura só prova
    // alguma coisa enquanto o material da chave está fora do alcance de quem a
    // está falsificando: se `app_runtime` lesse a chave, a injeção de SQL leria
    // junto e assinaria o que quisesse — e o teste anterior passaria medindo um
    // controle que não existe.
    //
    // A consulta é feita pelo DONO, e o que se mede é a AUSÊNCIA da linha para
    // o runtime: perguntar ao runtime se ele enxerga a própria lack de
    // privilégio devolveria "não" mesmo com o privilégio dado.
    const comoDono = await ctx.prisma.$queryRaw<Array<{ segredo: Buffer }>>`
      SELECT segredo FROM chaves_de_assinatura WHERE nome = 'membership'
    `;
    expect(comoDono).toHaveLength(1);
    expect(comoDono[0]?.segredo.byteLength).toBeGreaterThanOrEqual(32);

    const leaked = await tentarComo(Prisma.sql`SELECT segredo FROM chaves_de_assinatura`);
    expect(leaked.ok).toBe(false);
    // As duas linhas juntas: o SQLSTATE diz QUE classe de falha foi, e o nome
    // da tabela diz QUAL leitura foi negada. Uma sem a outra aceitaria
    // qualquer `42501` — inclusive o da assinatura, que é um `42501` legítimo e
    // totalmente diferente.
    expect(leaked.detalhe).toMatch(/^42501:/);
    expect(leaked.detalhe).toContain('permission denied for table chaves_de_assinatura');
  });

  it('🟢 `criar_membership` com assinatura da aplicação grava, e a gravação vale como vínculo', async () => {
    const alice = await criarUsuario('alice');
    const bruno = await criarUsuario('bruno');
    await associar(alice, acmeId);

    // ⚠️ Este teste existe porque o da escalada mede o BLOQUEIO, e um conserto
    // que fechasse a porta e deixasse o onboarding quebrado passaria lá inteiro.
    // Aqui a porta é a porta: a assinatura é a que a aplicação produz, e a
    // linha que a função grava CONCEDE acesso — medido pela MESMA leitura que a
    // escalada mediu como proibida.
    const assinatura = await assinarMembership(bruno, acmeId, 'member', null);
    const id = await comEscopo(acmeId, (tx) =>
      tx
        .$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
          SELECT criar_membership(${bruno}::uuid, ${acmeId}::uuid, ${'member'}::text, NULL::uuid, ${assinatura}::text) AS id
        `,
        )
        .then((r) => r[0]?.id as string),
    );
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-/);

    // O EFEITO: o Bruno apareceu para a Alice. É aqui que a função deixa de ser
    // "uma escrita que deu certo" e passa a ser "uma credencial que vale" — o
    // mesmo predicado (`usuario_no_escopo`) que a escalada tentou explorar.
    await expect(
      comEscopo(acmeId, (tx) => tx.user.findMany({ select: { name: true } })),
    ).resolves.toEqual([{ name: 'alice' }, { name: 'bruno' }]);

    // E o papel/tenant gravados são os pedidos, não defaults silenciosos.
    const gravado = await ctx.prisma.tenantMembership.findUnique({
      where: { id: id as string },
    });
    expect(gravado).toMatchObject({ userId: bruno, tenantId: acmeId, role: 'member' });
  });
});
