// apps/api/test/e2e/scenarios/11-tenant-isolation.e2e.spec.ts
//
// E2E 11 — o isolamento ENTRE empresas, medido por HTTP de verdade.
//
// Este é o teste que descreve a promessa inteira do trabalho: uma conta, duas
// empresas, DOIS perfis diferentes, e nenhuma das enxergando a outra. As specs
// das Fases anteriores mediram peça por peça (schema, leitura por membership,
// escrita por empresa); aqui as peças precisam fechar JUNTAS, e é o que só
// aparece na fronteira HTTP: header, guard, cache por empresa e banco.
//
// ⚠️ Sem cabeçalho `// FLUXO:` — igual aos cenários `01`-`10` e `12`. O
// inventário de fluxos (`.agents/specs/conventions/e2e-playwright.md`) é um
// artefato de TELAS (`apps/web/e2e`); um spec em `apps/api/test/e2e/` que nele
// aparecesse deixaria o `check-e2e-flow-coverage` vermelho por construção.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  bootstrapE2E,
  teardownE2E,
  cleanE2EDatabase,
  criarUsuarioAutenticado,
  tokenDe,
  SENHA_DE_TESTE,
  type E2EContext,
} from '../test-app.helper.js';

describe('E2E 11 — isolamento entre empresas', () => {
  let e2e: E2EContext;

  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });

  afterAll(async () => {
    await teardownE2E(e2e);
  });

  beforeEach(async () => {
    await cleanE2EDatabase(e2e);
  });

  /**
   * Abre uma empresa e devolve o owner autenticado COM o header dela.
   *
   * ⚠️ O e-mail é único por chamada (`dono+<n>@acme.dev`), nunca constante:
   * MEDIDO no cenário 12 — com e-mail fixo o oitavo `it()` morria com HTTP
   * 429 no login, porque o limitador é por conta (5/min). Vários vermelhos
   * por `tokenDe` são indistinguíveis de "a rota nova não funciona".
   */
  let donoSeq = 0;
  async function abrirEmpresa(slug: string) {
    donoSeq += 1;
    const email = `dono+${donoSeq}@acme.dev`;
    const cadastro = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: {
        nome: 'Dona',
        email,
        senha: SENHA_DE_TESTE,
        destino: { tipo: 'empresa', nome: slug.toUpperCase(), slug },
      },
    });
    expect(cadastro.statusCode).toBe(201);
    const token = await tokenDe(e2e.app, { email, senha: SENHA_DE_TESTE });
    const empresa = await e2e.ctx.prisma.tenant.findUniqueOrThrow({ where: { slug } });
    return {
      email,
      token,
      empresa,
      /** Dono autenticado no escopo da PRÓPRIA empresa. */
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': empresa.id },
    };
  }

  async function perfilDaEmpresa(tenantId: string, slug: string, permissionKey: string) {
    const perfil = await e2e.ctx.prisma.profile.create({
      data: { slug, name: slug, isAdmin: false, isSystem: false, tenantId },
    });
    await e2e.ctx.prisma.authorization.create({
      data: { profileId: perfil.id, permissionKey },
    });
    return perfil;
  }

  async function convidarEAceitar(
    empresaId: string,
    headers: Record<string, string>,
    email: string,
  ) {
    const convidado = await criarUsuarioAutenticado(e2e, { nome: 'Ana', email });
    const convite = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/tenants/${empresaId}/invitations`,
      headers,
      payload: { email },
    });
    expect(convite.statusCode).toBe(201);
    const { token } = JSON.parse(convite.body) as { token: string };
    const aceite = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/invitations/accept',
      headers: convidado.headers,
      payload: { token },
    });
    expect(aceite.statusCode).toBe(201);
    return convidado;
  }

  async function meuPerfil(headers: Record<string, string>) {
    const r = await e2e.injetar({ method: 'GET', url: '/api/v1/me/profile', headers });
    expect(r.statusCode).toBe(200);
    return JSON.parse(r.body) as { profileId: string | null; permissions: string[] };
  }

  /**
   * Recusa de empresa na fronteira (`JwtAuthGuard`, PR #101).
   *
   * Helper separado de `meuPerfil` porque o `code` faz parte do que se está
   * medindo: 403 genérico também é o que a camada de PERMISSÃO devolve, e essa
   * é outra propriedade. Conferir o `code` separa "o guard não reconheceu o
   * requerente na empresa" de "o guard reconheceu e a permissão faltou".
   */
  async function recusaDeEmpresa(headers: Record<string, string>) {
    const r = await e2e.injetar({ method: 'GET', url: '/api/v1/me/profile', headers });
    return {
      status: r.statusCode,
      body: JSON.parse(r.body) as { code?: string; detail?: string },
    };
  }

  // ───────────────── a promessa inteira ─────────────────

  it('a MESMA conta tem perfil DIFERENTE em cada empresa, e cada header devolve o seu', async () => {
    const acme = await abrirEmpresa('acme');
    const globex = await abrirEmpresa('globex');

    // A mesma pessoa é convidada nas DUAS empresas.
    const pessoa = await criarUsuarioAutenticado(e2e, {
      nome: 'Ana',
      email: 'ana+duas@acme.dev',
    });
    for (const empresa of [acme, globex]) {
      const convite = await e2e.injetar({
        method: 'POST',
        url: `/api/v1/tenants/${empresa.empresa.id}/invitations`,
        headers: empresa.headers,
        payload: { email: 'ana+duas@acme.dev' },
      });
      expect(convite.statusCode).toBe(201);
      const { token } = JSON.parse(convite.body) as { token: string };
      const aceite = await e2e.injetar({
        method: 'POST',
        url: '/api/v1/invitations/accept',
        headers: pessoa.headers,
        payload: { token },
      });
      expect(aceite.statusCode).toBe(201);
    }

    const daAcme = await perfilDaEmpresa(acme.empresa.id, 'operador-acme', 'users.read');
    const daGlobex = await perfilDaEmpresa(globex.empresa.id, 'operador-globex', 'users.write');

    for (const [empresa, perfil] of [
      [acme, daAcme],
      [globex, daGlobex],
    ] as const) {
      const atribuicao = await e2e.injetar({
        method: 'PUT',
        url: `/api/v1/admin/users/${pessoa.id}/profile`,
        headers: empresa.headers,
        payload: { profileId: perfil.id },
      });
      expect(atribuicao.statusCode).toBe(200);
    }

    const lidoNaAcme = await meuPerfil({ ...pessoa.headers, 'x-tenant-id': acme.empresa.id });
    const lidoNaGlobex = await meuPerfil({
      ...pessoa.headers,
      'x-tenant-id': globex.empresa.id,
    });

    // ⚠️ A propriedade que o cache por (usuário, empresa) precisa sustentar: as
    // duas leituras não podem se misturar. Com chave só por usuário, a segunda
    // devolveria o perfil da primeira.
    expect(lidoNaAcme.profileId).toBe(daAcme.id);
    expect(lidoNaAcme.permissions).toEqual(['users.read']);
    expect(lidoNaGlobex.profileId).toBe(daGlobex.id);
    expect(lidoNaGlobex.permissions).toEqual(['users.write']);
  });

  it('pessoa que NÃO é membro da empresa é recusada no header alheio', async () => {
    const acme = await abrirEmpresa('acme');
    await abrirEmpresa('globex');
    const intrusa = await criarUsuarioAutenticado(e2e, {
      nome: 'Intrusa',
      email: 'intrusa+acme@outra.dev',
    });

    // ⚠️ ESTE CENÁRIO MUDOU DE CONTRATO (PR #101, 2026-10-17). Ele afirmava
    // 200 com `permissions: []` — e essa resposta ERA o furo: zero permissões
    // numa empresa de que o requerente não participa mede que a camada de
    // RESOLUÇÃO estava certainíssima e a de AUTORIZAÇÃO, ausente. O resto do
    // cenário era o mesmo: o sintoma a evitar é herdar o admin do dono, e nem
    // `GET /me/profile` respondia mais alguma vez.
    const recusa = await recusaDeEmpresa({ ...intrusa.headers, 'x-tenant-id': acme.empresa.id });

    expect(recusa.status).toBe(403);
    expect(recusa.body.code).toBe('TENANT_MEMBERSHIP_REQUIRED');
  });

  // ───────────────── eixos trocados (header de uma, path da outra) ─────────────────

  it('dono da ACME não convida para a GLOBEX: o `role` é por empresa, não global', async () => {
    const acme = await abrirEmpresa('acme');
    const globex = await abrirEmpresa('globex');

    const convite = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/tenants/${globex.empresa.id}/invitations`,
      headers: acme.headers,
      payload: { email: 'alguem@acme.dev' },
    });

    // `role: 'owner'` na ACME não diz nada sobre a GLOBEX. Um dono de N empresas
    // seria dono de todas as outras se a autorização fosse por usuário.
    expect(convite.statusCode).toBe(403);
    expect(await e2e.ctx.prisma.invitation.count()).toBe(0);
  });

  it('dono da ACME não veste com perfil da GLOBEX, e a escrita não acontece', async () => {
    const acme = await abrirEmpresa('acme');
    const globex = await abrirEmpresa('globex');
    const daGlobex = await perfilDaEmpresa(globex.empresa.id, 'gestor-globex', 'users.read');
    const alvo = await convidarEAceitar(acme.empresa.id, acme.headers, 'alvo+troca@acme.dev');

    const resposta = await e2e.injetar({
      method: 'PUT',
      url: `/api/v1/admin/users/${alvo.id}/profile`,
      headers: acme.headers,
      payload: { profileId: daGlobex.id },
    });

    expect(resposta.statusCode).toBe(403);
    const membership = await e2e.ctx.prisma.tenantMembership.findUniqueOrThrow({
      where: { userId_tenantId: { userId: alvo.id, tenantId: acme.empresa.id } },
    });
    expect(membership.profileId).toBeNull();
  });

  it('dono da GLOBEX não escreve em membership de quem só é membro da ACME', async () => {
    const acme = await abrirEmpresa('acme');
    const globex = await abrirEmpresa('globex');
    const alvo = await convidarEAceitar(acme.empresa.id, acme.headers, 'alvo+fora@acme.dev');
    const daAcme = await perfilDaEmpresa(acme.empresa.id, 'operador-acme', 'users.read');

    // O dono da GLOBEX passa o guard dele (é admin lá), mas a pessoa não é
    // membro da GLOBEX — e é a ESCRITA que recusa, não a permissão.
    const resposta = await e2e.injetar({
      method: 'PUT',
      url: `/api/v1/admin/users/${alvo.id}/profile`,
      headers: globex.headers,
      payload: { profileId: daAcme.id },
    });

    expect(resposta.statusCode).toBe(403);
    const membership = await e2e.ctx.prisma.tenantMembership.findUniqueOrThrow({
      where: { userId_tenantId: { userId: alvo.id, tenantId: acme.empresa.id } },
    });
    expect(membership.profileId).toBeNull();
    expect(
      await e2e.ctx.prisma.tenantMembership.count({
        where: { userId: alvo.id, tenantId: globex.empresa.id },
      }),
    ).toBe(0);
  });

  it('header de empresa que não existe não é 500: o guard recusa com 403 nomeado', async () => {
    await abrirEmpresa('acme');
    const intrusa = await criarUsuarioAutenticado(e2e, {
      nome: 'Intrusa',
      email: 'intrusa+fantasma@outra.dev',
    });
    const tenantInexistente = '0190a8b6-0000-4000-8000-00000000ffff';

    const recusa = await recusaDeEmpresa({ ...intrusa.headers, 'x-tenant-id': tenantInexistente });

    // Um UUID de tenant que não está no banco não pode virar erro de banco. A
    // pergunta que este cenário fazia — "200 com zero permissões?" — deixou de
    // ser a resposta desejada: agora é 403, porque empresa que não existe não
    // tem membro, e o requerente não é ninguém lá dentro.
    expect(recusa.status).toBe(403);
    expect(recusa.body.code).toBe('TENANT_MEMBERSHIP_REQUIRED');

    const escrita = await e2e.injetar({
      method: 'PUT',
      url: `/api/v1/admin/users/${intrusa.id}/profile`,
      headers: { ...intrusa.headers, 'x-tenant-id': tenantInexistente },
      payload: { profileId: null },
    });
    // ⚠️ O 403 vem do GUARD, não da camada de permissão. A frase antiga — "sem
    // empresa não há permissão nenhuma" — continuaria verde medindo outra
    // coisa: a recusa acontece um passo antes, na fronteira. A negação pela
    // camada de permissão precisa de um requerente que SEJA membro, e empresa
    // inexistente não tem membro; quem mede essa ponta é o cenário logo acima,
    // "dono da ACME não veste com perfil da GLOBEX".
    expect(escrita.statusCode).toBe(403);
    expect((JSON.parse(escrita.body) as { code?: string }).code).toBe('TENANT_MEMBERSHIP_REQUIRED');
  });

  // ─────────── a superfície de GESTÃO de perfis, que é cross-tenant ───────────
  //
  // ⚠️ Por que estes 5 testes existem e por que não são repetição do bloco
  // acima. O bloco anterior mede o CAMINHO de atribuir perfil (Fase 6), que
  // tem dono checado em três camadas. A gestão de perfis — listar, renomear,
  // apagar e conceder permissão — era GLOBAL de fato, e nenhuma camada a
  // filtrava.
  //
  // A porta se abre sozinha, e é por isso que isto é P0 e não dívida antiga:
  // `provisionarEmpresaPropria` dá ao dono da empresa o perfil `admin` com
  // TODAS as permissões e `isAdmin: true`, e o catálogo de permissões
  // documenta que `is_admin` é BYPASS TOTAL do `PermissionsGuard` (não é
  // apenas um atalho entre permissões). Então qualquer pessoa que abra a
  // própria empresa — o caminho padrão do cadastro — chega a
  // `/admin/profiles` com poder de alcance GLOBAL, e podia ler, renomear,
  // apagar e injetar permissão em perfil de QUALQUER outra empresa.
  //
  // MEDIDO por HTTP antes do conserto (2026-10-17): `GET` devolvia o perfil da
  // GLOBEX para o ator da ACME; `PATCH` renomeava e persistia;
  // `DELETE` apagava; `POST .../authorizations` gravava `users.delete` no
  // perfil da vizinha. Todos 200/201. Os quatro primeiros viram 403 aqui; o
  // quinto é o que fecha a outra ponta (Achado 4: perfil de empresa não tinha
  // como ser criado).

  it('o dono da ACME não enxerga o perfil da GLOBEX na listagem', async () => {
    const acme = await abrirEmpresa('acme');
    const globex = await abrirEmpresa('globex');
    const daGlobex = await perfilDaEmpresa(globex.empresa.id, 'gestor-globex', 'users.read');
    const daAcme = await perfilDaEmpresa(acme.empresa.id, 'gestor-acme', 'users.read');

    const lista = await e2e.injetar({
      method: 'GET',
      url: '/api/v1/admin/profiles',
      headers: acme.headers,
    });
    expect(lista.statusCode).toBe(200);
    const items = JSON.parse(lista.body) as { id: string }[];

    expect(items.map((p) => p.id)).toContain(daAcme.id);
    // ⚠️ A propriedade: perfil de outra empresa não aparece. E o GLOBAL também
    // não — quem está dentro de uma empresa administra aquela empresa, e
    // deixar o global visível seria a outra ponta da escalada (o perfil `admin`
    // do seed é global).
    expect(items.map((p) => p.id)).not.toContain(daGlobex.id);
  });

  it('o dono da ACME não renomeia o perfil da GLOBEX', async () => {
    const acme = await abrirEmpresa('acme');
    const globex = await abrirEmpresa('globex');
    const daGlobex = await perfilDaEmpresa(globex.empresa.id, 'gestor-globex', 'users.read');

    const patch = await e2e.injetar({
      method: 'PATCH',
      url: `/api/v1/admin/profiles/${daGlobex.id}`,
      headers: acme.headers,
      payload: { name: 'INVADIDO PELA ACME' },
    });
    expect(patch.statusCode).toBe(403);

    // ⚠️ Não basta o status: o que importa é o BANCO. Um 403 com escrita
    // persistida seria um teste que passa com o defeito.
    const depois = await e2e.ctx.prisma.profile.findUniqueOrThrow({ where: { id: daGlobex.id } });
    expect(depois.name).toBe('gestor-globex');
  });

  it('o dono da ACME não apaga o perfil da GLOBEX', async () => {
    const acme = await abrirEmpresa('acme');
    const globex = await abrirEmpresa('globex');
    const daGlobex = await perfilDaEmpresa(globex.empresa.id, 'gestor-globex', 'users.read');

    const del = await e2e.injetar({
      method: 'DELETE',
      url: `/api/v1/admin/profiles/${daGlobex.id}`,
      headers: acme.headers,
    });
    expect(del.statusCode).toBe(403);
    // O perfil da vizinha tem de continuar lá. `deleteMany` contaria 1 e
    // passaria; é a existência que se mede.
    await expect(
      e2e.ctx.prisma.profile.findUnique({ where: { id: daGlobex.id } }),
    ).resolves.not.toBeNull();
  });

  it('o dono da ACME não injeta permissão em perfil da GLOBEX', async () => {
    const acme = await abrirEmpresa('acme');
    const globex = await abrirEmpresa('globex');
    const daGlobex = await perfilDaEmpresa(globex.empresa.id, 'gestor-globex', 'users.read');

    const injecao = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/admin/profiles/${daGlobex.id}/authorizations`,
      headers: acme.headers,
      payload: { permissionKey: 'users.delete' },
    });
    expect(injecao.statusCode).toBe(403);

    // A escalada real: `users.delete` no perfil da vizinha é a arma, não o
    // 403. Uma resposta de erro que deixasse a linha gravada seria o buraco
    // inteiro de pé.
    await expect(
      e2e.ctx.prisma.authorization.findFirst({
        where: { profileId: daGlobex.id, permissionKey: 'users.delete' },
      }),
    ).resolves.toBeNull();
  });

  it('o dono da empresa CRIA perfil da PRÓPRIA empresa, e ele é o que a listagem devolve', async () => {
    const acme = await abrirEmpresa('acme');

    // ⚠️ Este é o caminho que não existia (Achado 4): `Profile.criar` fixava
    // `tenantId: null`, então todo perfil nascido do `POST /admin/profiles`
    // era GLOBAL — e o dono, ao criar, estava fabricando perfil de sistema.
    const criado = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/admin/profiles',
      headers: acme.headers,
      payload: { slug: 'gestor-acme', name: 'Gestor da ACME', initialPermissions: ['users.read'] },
    });
    expect(criado.statusCode).toBe(201);
    const { id } = JSON.parse(criado.body) as { id: string };

    const noBanco = await e2e.ctx.prisma.profile.findUniqueOrThrow({ where: { id } });
    expect(noBanco.tenantId).toBe(acme.empresa.id);

    // E o perfil criado é vestível pelo caminho da Fase 6 — que é o que fecha
    // o ciclo: sem isto, a empresa só tinha o perfil `admin` do dono, e todo
    // convidado entrava como administrador.
    const convidado = await convidarEAceitar(acme.empresa.id, acme.headers, 'gestor+alvo@acme.dev');
    const atribuicao = await e2e.injetar({
      method: 'PUT',
      url: `/api/v1/admin/users/${convidado.id}/profile`,
      headers: acme.headers,
      payload: { profileId: id },
    });
    expect(atribuicao.statusCode).toBe(200);

    const lido = await meuPerfil({
      ...convidado.headers,
      'x-tenant-id': acme.empresa.id,
    });
    expect(lido.profileId).toBe(id);
    expect(lido.permissions).toEqual(['users.read']);
  });
});
