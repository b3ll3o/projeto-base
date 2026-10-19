// apps/api/test/e2e/scenarios/12-onboarding.e2e.spec.ts
//
// E2E 12 — a D5 ponta a ponta: "empresa própria OU convite".
//
// pt-BR: este é o ÚNICO lugar onde a entrada é medida por HTTP de verdade,
// atravessando o guard, o `X-Tenant-Id`, o cache por empresa e o banco. Os
// specs das Fases 2-5 mediram cada pedaço separadamente; o que só aparece
// aqui é se as peças juntas fecham — em especial a PermissionsGuard, que
// deriva o perfil efetivo da membership, e o cache, que é populado no
// primeiro `GET /me/profile` e re-lido no segundo.
//
// ⚠️ Sem cabeçalho `// FLUXO:` — igual aos cenários `01`-`10`. O inventário de
// fluxos (`.agents/specs/conventions/e2e-playwright.md`) é um artefato de
// TELAS (`apps/web/e2e`), e um spec que mora em `apps/api/test/e2e/` e nele
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

describe('E2E 12 — entrada na empresa (D5)', () => {
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
   * Cadastra a conta já criando a empresa — o ramo "empresa própria".
   *
   * ⚠️ O e-mail é ÚNICO por `it()` (`dona+<n>@acme.dev`), e não uma constante.
   * MEDIDO 2026-10-17: com um e-mail fixo, o oitavo `it()` desta suíte morria
   * com HTTP 429 no login — o limitador é por conta (5/min), então a suíte
   * batia no próprio limite antes de chegar no código. O sintoma (vários
   * vermelhos por `tokenDe`) era indistinguível de "a rota nova não existe".
   */
  let donoSeq = 0;
  async function abrirEmpresa(slug: string) {
    donoSeq += 1;
    const email = `dona+${donoSeq}@acme.dev`;
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
    const { id } = JSON.parse(cadastro.body) as { id: string };
    const token = await tokenDe(e2e.app, { email, senha: SENHA_DE_TESTE });
    const empresa = await e2e.ctx.prisma.tenant.findUniqueOrThrow({ where: { slug } });
    return {
      email,
      headers: { authorization: `Bearer ${token}`, 'x-tenant-id': empresa.id },
      conta: { id },
      empresa,
    };
  }

  // ───────────────────────── empresa própria ─────────────────────────

  it('cadastro com `destino: empresa` cria conta, empresa, membership e admin DA empresa', async () => {
    const { conta, empresa } = await abrirEmpresa('acme');

    const membership = await e2e.ctx.prisma.tenantMembership.findFirstOrThrow({
      where: { userId: conta.id },
      include: { profile: true },
    });

    expect(membership.tenantId).toBe(empresa.id);
    expect(membership.role).toBe('owner');
    // O admin é DA empresa, não global: um perfil global aqui daria a uma
    // empresa recém-criada um perfil com todas as permissões do catálogo.
    expect(membership.profile?.tenantId).toBe(empresa.id);
    expect(membership.profile?.isAdmin).toBe(true);
  });

  it('o dono da empresa nova tem as permissões quando manda o X-Tenant-Id', async () => {
    const { headers } = await abrirEmpresa('acme');

    const perfil = await e2e.injetar({
      method: 'GET',
      url: '/api/v1/me/profile',
      headers,
    });
    expect(perfil.statusCode).toBe(200);
    const { permissions } = JSON.parse(perfil.body) as { permissions: string[] };
    expect(permissions).toContain('users.read');
  });

  it('a MESMA conta, SEM o header de empresa, não tem permissão nenhuma', async () => {
    const { headers } = await abrirEmpresa('acme');
    const semEmpresa = { authorization: headers.authorization };

    const perfil = await e2e.injetar({
      method: 'GET',
      url: '/api/v1/me/profile',
      headers: semEmpresa,
    });

    // A Fase 4 mediu que o bucket GLOBAL é `users.profile_id`, e a empresa
    // própria NÃO escreve nessa coluna. Então sem header, o dono da ACME é
    // uma pessoa sem empresa — que é o comportamento correto da D2, e o
    // que impede que o header vire opcional.
    expect(JSON.parse(perfil.body).permissions).toEqual([]);
  });

  // ───────────────────────── convites ─────────────────────────

  it('o dono convida, e o convidado aceita pela rota de conta existente', async () => {
    const { headers, empresa } = await abrirEmpresa('acme');
    const convidado = await criarUsuarioAutenticado(e2e, {
      nome: 'Ana',
      email: 'ana@acme.dev',
    });

    const convite = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/tenants/${empresa.id}/invitations`,
      headers,
      payload: { email: 'ana@acme.dev' },
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

    const membership = await e2e.ctx.prisma.tenantMembership.findUniqueOrThrow({
      where: {
        userId_tenantId: { userId: convidado.id, tenantId: empresa.id },
      },
    });
    expect(membership.role).toBe('member');
    expect(membership.profileId).toBeNull();
  });

  it('quem não é owner da empresa recebe 403 e nenhum convite é criado', async () => {
    const { empresa } = await abrirEmpresa('acme');
    const intrusa = await criarUsuarioAutenticado(e2e, {
      nome: 'Intrusa',
      email: 'intrusa@outra.dev',
    });

    const convite = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/tenants/${empresa.id}/invitations`,
      headers: intrusa.headers,
      payload: { email: 'ana@acme.dev' },
    });

    expect(convite.statusCode).toBe(403);
    expect(await e2e.ctx.prisma.invitation.count()).toBe(0);
  });

  // pt-BR (Fase 5, review): os dois 409 abaixo traduzem `P2002` cru. Sem a
  // tradução, `slug` repetido e convite repetido respondiam **500 Erro interno**
  // — indistinguível de banco fora do ar, e o cliente sem como saber que a
  // resposta era "escolha outro slug" / "já convidou essa pessoa". O 500 é
  // medido aqui pelo status, não pelo `code`: é o status que a tela trata.
  it('slug repetido é 409 EMPRESA_JA_EXISTE — e não 500', async () => {
    await abrirEmpresa('acme');

    const repetido = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: {
        nome: 'Outra',
        // E-mail novo de propósito: com o MESMO e-mail o `users.email` estouraria
        // primeiro e o teste mediria outra constraint.
        email: 'outra-dona@acme.dev',
        senha: SENHA_DE_TESTE,
        destino: { tipo: 'empresa', nome: 'ACME', slug: 'acme' },
      },
    });

    expect(repetido.statusCode).toBe(409);
    expect((JSON.parse(repetido.body) as { code: string }).code).toBe('EMPRESA_JA_EXISTE');
    // A empresa original não foi tocada: o rollback não pode ter deixado
    // uma segunda empresa pelo mesmo slug.
    expect(await e2e.ctx.prisma.tenant.count()).toBe(1);
  });

  it('convidar a mesma pessoa duas vezes é 409 CONVITE_JA_EMITIDO — e não 500', async () => {
    const { headers, empresa } = await abrirEmpresa('acme');
    const convidar = () =>
      e2e.injetar({
        method: 'POST',
        url: `/api/v1/tenants/${empresa.id}/invitations`,
        headers,
        payload: { email: 'ana@acme.dev' },
      });

    expect((await convidar()).statusCode).toBe(201);
    const segundo = await convidar();

    expect(segundo.statusCode).toBe(409);
    expect((JSON.parse(segundo.body) as { code: string }).code).toBe('CONVITE_JA_EMITIDO');
    // O segundo NÃO pode ter criado um convite paralelo: a constraint impede,
    // e um convite pendente a mais é um e-mail que a pessoa receberia depois.
    expect(await e2e.ctx.prisma.invitation.count()).toBe(1);
  });

  // pt-BR (Fase 5, revisão — achado 4): o título anterior dizia "e NÃO no
  // log", e o corpo não tinha NENHUMA assertion sobre log — o harness e2e não
  // captura `Logger`, então a propriedade era vacuamente verdadeira e um
  // `Logger.log(token)` futuro manteria o teste verde. Renomeei para o que o
  // corpo afirma. Medir "o token não aparece no log" é uma tarefa de e2e com
  // captura de log, não uma linha de assertion.
  it('o segredo volta na resposta porque não há mailer', async () => {
    const { headers, empresa } = await abrirEmpresa('acme');

    const convite = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/tenants/${empresa.id}/invitations`,
      headers,
      payload: { email: 'ana@acme.dev' },
    });
    const { token, expiresAt } = JSON.parse(convite.body) as { token: string; expiresAt: string };

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('conta nova entra pelo convite, e a empresa é a do convite — não a do payload', async () => {
    const { headers, empresa } = await abrirEmpresa('acme');
    const convite = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/tenants/${empresa.id}/invitations`,
      headers,
      payload: { email: 'nova@acme.dev' },
    });
    const { token } = JSON.parse(convite.body) as { token: string };

    const cadastro = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: {
        nome: 'Nova',
        email: 'nova@acme.dev',
        senha: SENHA_DE_TESTE,
        destino: { tipo: 'convite', token },
      },
    });
    expect(cadastro.statusCode).toBe(201);
    const { id } = JSON.parse(cadastro.body) as { id: string };

    const membership = await e2e.ctx.prisma.tenantMembership.findUniqueOrThrow({
      where: { userId_tenantId: { userId: id, tenantId: empresa.id } },
    });
    expect(membership.role).toBe('member');
  });

  it('token de convite de NINGUÉM é 404 e não cria membership', async () => {
    const conta = await criarUsuarioAutenticado(e2e, { nome: 'Ana', email: 'ana@acme.dev' });

    const aceite = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/invitations/accept',
      headers: conta.headers,
      payload: { token: 'a'.repeat(64) },
    });

    expect(aceite.statusCode).toBe(404);
    expect(await e2e.ctx.prisma.tenantMembership.count()).toBe(0);
  });

  it('o token de outra pessoa é recusado — e o motivo NÃO diz qual dos dois falhou', async () => {
    const { headers, empresa } = await abrirEmpresa('acme');
    const outra = await criarUsuarioAutenticado(e2e, { nome: 'Outra', email: 'outra@dev.io' });
    const convite = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/tenants/${empresa.id}/invitations`,
      headers,
      payload: { email: 'ana@acme.dev' },
    });
    const { token } = JSON.parse(convite.body) as { token: string };

    const aceite = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/invitations/accept',
      headers: outra.headers,
      payload: { token },
    });

    expect(aceite.statusCode).toBe(403);
    expect(await e2e.ctx.prisma.tenantMembership.count({ where: { userId: outra.id } })).toBe(0);
  });

  it('o mesmo token não serve duas vezes', async () => {
    const { headers, empresa } = await abrirEmpresa('acme');
    const primeiro = await criarUsuarioAutenticado(e2e, { nome: 'Ana', email: 'ana@acme.dev' });
    const convite = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/tenants/${empresa.id}/invitations`,
      headers,
      payload: { email: 'ana@acme.dev' },
    });
    const { token } = JSON.parse(convite.body) as { token: string };

    const um = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/invitations/accept',
      headers: primeiro.headers,
      payload: { token },
    });
    const dois = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/invitations/accept',
      headers: primeiro.headers,
      payload: { token },
    });

    expect(um.statusCode).toBe(201);
    expect(dois.statusCode).toBe(409);
  });

  it('cadastrar sem `destino` continua funcionando (a rota aberta não regride)', async () => {
    const cadastro = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Solto', email: 'solto@dev.io', senha: SENHA_DE_TESTE },
    });

    expect(cadastro.statusCode).toBe(201);
    expect(await e2e.ctx.prisma.tenant.count()).toBe(0);
    expect(await e2e.ctx.prisma.tenantMembership.count()).toBe(0);
  });

  // ─────────────── atribuir perfil DENTRO da empresa (Fase 6) ───────────────
  //
  // Fecha a funcionalidade: até aqui a empresa recém-aberta tinha o dono com
  // perfil e todo convidado entrava com ZERO permissões sem caminho para sair
  // disso. Este bloco mede a escrita pela rota de verdade — guard, header,
  // membership e CACHE — que nenhuma spec unitária mede.
  //
  // ⚠️ O perfil da empresa é semeado por Prisma direto, e não por HTTP:
  // `Profile.criar` fixa `tenantId: null`, então não existe rota que crie
  // perfil de empresa (medido; comentário em `profile.aggregate.ts`).
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

  /** Perfil DONO de uma empresa, com UMA permissão — assim o efeito é visível. */
  async function perfilDaEmpresa(tenantId: string, slug: string, permissionKey: string) {
    const perfil = await e2e.ctx.prisma.profile.create({
      data: { slug, name: slug, isAdmin: false, isSystem: false, tenantId },
    });
    await e2e.ctx.prisma.authorization.create({
      data: { profileId: perfil.id, permissionKey },
    });
    return perfil;
  }

  it('o dono da empresa dá perfil ao convidado, e a PRÓXIMA requisição já vê', async () => {
    const { headers, empresa } = await abrirEmpresa('acme');
    const convidado = await convidarEAceitar(empresa.id, headers, 'ana+perfil@acme.dev');
    const operador = await perfilDaEmpresa(empresa.id, 'operador-acme', 'users.read');

    // ⚠️ O `x-tenant-id` é ADDICIONADO aqui, e não herdado do helper:
    // `criarUsuarioAutenticado` devolve só o `authorization`. Sem o header as
    // três leituras abaixo caem no bucket GLOBAL (`users.profile_id`, vazio)
    // e o teste passaria inteiro sem nunca tocar a membership da empresa.
    const naEmpresa = { ...convidado.headers, 'x-tenant-id': empresa.id };

    // Antes: o convidado entrou com zero permissões.
    const antes = await e2e.injetar({
      method: 'GET',
      url: '/api/v1/me/profile',
      headers: naEmpresa,
    });
    expect(JSON.parse(antes.body).permissions).toEqual([]);

    const atribuicao = await e2e.injetar({
      method: 'PUT',
      url: `/api/v1/admin/users/${convidado.id}/profile`,
      headers,
      payload: { profileId: operador.id },
    });
    expect(atribuicao.statusCode).toBe(200);

    // ⚠️ Esta leitura é a que pega a AUSÊNCIA do `invalidateUser`: o cache é
    // por (usuário, empresa) e já foi aquecido pela chamada `antes`. MEDIDO:
    // sem a invalidação, esta resposta volta com `[]`.
    const depois = await e2e.injetar({
      method: 'GET',
      url: '/api/v1/me/profile',
      headers: naEmpresa,
    });
    expect(depois.statusCode).toBe(200);
    const lido = JSON.parse(depois.body) as { profileId: string; permissions: string[] };
    expect(lido.profileId).toBe(operador.id);
    expect(lido.permissions).toEqual(['users.read']);

    // O `header` é o que decide o bucket: a MESMA conta, sem header, continua
    // sem permissão nenhuma.
    const semEmpresa = await e2e.injetar({
      method: 'GET',
      url: '/api/v1/me/profile',
      headers: { authorization: convidado.headers.authorization },
    });
    expect(JSON.parse(semEmpresa.body).permissions).toEqual([]);
  });

  it('o dono da empresa NÃO veste o convidado com o admin GLOBAL (403, e nada é gravado)', async () => {
    const { headers, empresa } = await abrirEmpresa('acme');
    const convidado = await convidarEAceitar(empresa.id, headers, 'ana+admin@acme.dev');
    // Perfil admin GLOBAL (`tenant_id IS NULL`), que é o do seed.
    const adminGlobal = await e2e.ctx.prisma.profile.create({
      data: {
        slug: 'admin-global',
        name: 'admin-global',
        isAdmin: true,
        isSystem: true,
        tenantId: null,
      },
    });

    const resposta = await e2e.injetar({
      method: 'PUT',
      url: `/api/v1/admin/users/${convidado.id}/profile`,
      headers,
      payload: { profileId: adminGlobal.id },
    });

    // R2: o `PermissionsGuard` aceitaria esse perfil em QUALQUER empresa, o
    // que faria do admin global um bypass de tenant inteiro.
    expect(resposta.statusCode).toBe(403);
    const membership = await e2e.ctx.prisma.tenantMembership.findUniqueOrThrow({
      where: { userId_tenantId: { userId: convidado.id, tenantId: empresa.id } },
    });
    expect(membership.profileId).toBeNull();
  });

  // ─────────────── a flag que o admin do sistema desliga (Fase 4) ───────────────
  //
  // MEDIDO 2026-10-18: estes 3 testes são o que fecha o orçamento da Fase 4. Sem
  // eles, TIRAR o `@RequireFeatureFlag` do `convidar`, ou tirar o
  // `FeatureFlagGuard` do `@UseGuards`, ou trocar o 404 por 403, ou mover o
  // decorator para a CLasse — tudo deixa a suíte inteira verde. A spec do
  // guard prova a decisão; a spec do container prova a instanciação; nenhuma
  // das duas sabe se o decorator está no handler.
  //
  // A linha da flag é semeada por Prisma direto, e não pelo PUT admin: o que
  // está sob teste aqui é o CONSUMIDOR, e o PUT já é medido no cenário 13.
  async function desligarChave(chave: string, ativada: boolean) {
    await e2e.ctx.prisma.featureFlag.upsert({
      where: { chave },
      create: { chave, ativada },
      update: { ativada },
    });
  }

  it('flag DESLIGADA => 404 em `convidar`, e nenhum convite é gravado', async () => {
    const { headers, empresa } = await abrirEmpresa('acme');
    await desligarChave('tenancy.invites', false);

    const resposta = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/tenants/${empresa.id}/invitations`,
      headers,
      payload: { email: 'ana@acme.dev' },
    });

    // 404 e não 403: para o cliente a funcionalidade não existe. E 403 diria
    // "você não pode", que é uma informação que o dono da empresa não tem.
    expect(resposta.statusCode).toBe(404);

    // ⚠️ O CORPO também é a afirmação, e MEDIDO 2026-10-18 (revisão
    // adversarial, achado F1) ele não tinha dente: trocar o throw por um corpo
    // que ANUNCIA a flag (`code: 'FEATURE_FLAG_DESLIGADA'`, `detail: 'a
    // funcionalidade tenancy.invites está desligada'`) deixava os 18 testes
    // verdes. A justificativa do 404 existia só como comentário do guard. O
    // `detail` genérico é o que faz o 404 indistinguível do 404 de uma rota
    // que não existe (`Cannot POST …`, medido pelo revisor) — nenhum dos dois
    // diz que existe uma flag.
    const corpo = await resposta.json();
    expect(corpo.code).toBe('NOT_FOUND');
    expect(corpo.detail).toBe('Not Found');

    expect(await e2e.ctx.prisma.invitation.count()).toBe(0);
  });

  it('a MESMA chamada com a flag ligada => 201 — o 404 acima veio da flag', async () => {
    // Controle positivo: sem ele, um 404 por qualquer outra causa (empresa
    // errada, header, token) passaria no teste de cima com a flag desligada.
    const { headers, empresa } = await abrirEmpresa('acme');
    await desligarChave('tenancy.invites', false);
    const desligada = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/tenants/${empresa.id}/invitations`,
      headers,
      payload: { email: 'ana@acme.dev' },
    });
    expect(desligada.statusCode).toBe(404);

    await desligarChave('tenancy.invites', true);
    const ligada = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/tenants/${empresa.id}/invitations`,
      headers,
      payload: { email: 'ana@acme.dev' },
    });

    expect(ligada.statusCode).toBe(201);
  });

  it('flag DESLIGADA tranca o ACEITE — 404, e o convite continua pendente', async () => {
    // INVERTIDO 2026-10-19. Este teste afirmava o contrário ("não tranca o
    // aceite"), e a inversão é o pedido: *"a aplicação n pode ter bypass"*.
    // Aceitar convite era uma segunda porta de entrada com a flag desligada —
    // desligar `tenancy.invites` e ainda deixar alguém entrar por ela não era
    // desligar nada.
    //
    // O token é emitido com a flag LIGADA, para que o 404 abaixo seja atribuível
    // à flag e não a um convite que nunca existiu.
    const { headers, empresa } = await abrirEmpresa('acme');
    const convidado = await criarUsuarioAutenticado(e2e, {
      nome: 'Ana',
      email: 'ana@acme.dev',
    });

    const convite = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/tenants/${empresa.id}/invitations`,
      headers,
      payload: { email: 'ana@acme.dev' },
    });
    expect(convite.statusCode).toBe(201);
    const { token } = JSON.parse(convite.body) as { token: string };

    await desligarChave('tenancy.invites', false);

    const aceite = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/invitations/accept',
      headers: convidado.headers,
      payload: { token },
    });

    expect(aceite.statusCode).toBe(404);
    const corpo = await aceite.json();
    expect(corpo.code).toBe('NOT_FOUND');
    expect(corpo.detail).toBe('Not Found');

    // O corpo não basta: um `accept` que respondesse 404 MAS consumisse o
    // convite passaria verde, e a membership nunca apareceria.
    const membership = await e2e.ctx.prisma.tenantMembership.findUnique({
      where: { userId_tenantId: { userId: convidado.id, tenantId: empresa.id } },
    });
    expect(membership).toBeNull();
  });

  it('a MESMA requisição com a flag ligada => 201 — o 404 acima veio da flag', async () => {
    // Controle positivo do teste acima, pela mesma razão do par de `convidar`:
    // um 404 por qualquer outra causa (token inválido, sessão) passaria lá
    // acima sem este aqui.
    const { headers, empresa } = await abrirEmpresa('acme');
    const convidado = await criarUsuarioAutenticado(e2e, {
      nome: 'Ana',
      email: 'ana@acme.dev',
    });

    const convite = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/tenants/${empresa.id}/invitations`,
      headers,
      payload: { email: 'ana@acme.dev' },
    });
    const { token } = JSON.parse(convite.body) as { token: string };

    await desligarChave('tenancy.invites', false);
    const bloqueado = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/invitations/accept',
      headers: convidado.headers,
      payload: { token },
    });
    expect(bloqueado.statusCode).toBe(404);

    await desligarChave('tenancy.invites', true);
    const ligado = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/invitations/accept',
      headers: convidado.headers,
      payload: { token },
    });

    expect(ligado.statusCode).toBe(201);
  });

  it('flag DESLIGADA tranca `POST /users` com `destino.convite` — 404, e a conta NÃO nasce', async () => {
    // A terceira porta. MEDIDO 2026-10-18 (achado F8): `POST /users` com
    // `destino: {tipo: 'convite', token}` criava conta e membership COM A FLAG
    // DESLIGADA — resposta 201. Era a porta mais silenciosa das três, porque
    // não passa pelo `TenancyController` e nada no módulo `users` falava de
    // flag nenhuma.
    //
    // O token é emitido com a flag LIGADA: o 404 tem que ser atribuível à flag,
    // não a um convite inexistente. E `invitations/accept` fica de fora do
    // recorte porque é o `POST /users` que cria a conta.
    const { headers, empresa } = await abrirEmpresa('acme');

    const convite = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/tenants/${empresa.id}/invitations`,
      headers,
      payload: { email: 'carla@acme.dev' },
    });
    expect(convite.statusCode).toBe(201);
    const { token } = JSON.parse(convite.body) as { token: string };

    await desligarChave('tenancy.invites', false);

    const resposta = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: {
        nome: 'Carla',
        email: 'carla@acme.dev',
        senha: 'senha-super-secreta',
        destino: { tipo: 'convite', token },
      },
    });

    expect(resposta.statusCode).toBe(404);
    const corpo = await resposta.json();
    expect(corpo.code).toBe('NOT_FOUND');
    expect(corpo.detail).toBe('Not Found');

    // ⚠️ Sem estas duas, um 404 depois de criar a conta passaria verde: o
    // usuário existe mas "não entrou na empresa", que é o bypass que o teste
    // precisa fechar.
    expect(await e2e.ctx.prisma.user.count({ where: { email: 'carla@acme.dev' } })).toBe(0);
    expect(await e2e.ctx.prisma.invitation.count({ where: { email: 'carla@acme.dev' } })).toBe(1);
  });

  it('a MESMA requisição com a flag ligada => 201 — o 404 acima veio da flag', async () => {
    const { headers, empresa } = await abrirEmpresa('acme');

    const convite = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/tenants/${empresa.id}/invitations`,
      headers,
      payload: { email: 'dani@acme.dev' },
    });
    const { token } = JSON.parse(convite.body) as { token: string };

    await desligarChave('tenancy.invites', false);
    const bloqueado = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: {
        nome: 'Dani',
        email: 'dani@acme.dev',
        senha: 'senha-super-secreta',
        destino: { tipo: 'convite', token },
      },
    });
    expect(bloqueado.statusCode).toBe(404);

    await desligarChave('tenancy.invites', true);
    const ligado = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: {
        nome: 'Dani',
        email: 'dani@acme.dev',
        senha: 'senha-super-secreta',
        destino: { tipo: 'convite', token },
      },
    });

    expect(ligado.statusCode).toBe(201);
    const membership = await e2e.ctx.prisma.tenantMembership.findFirst({
      where: { user: { email: 'dani@acme.dev' }, tenantId: empresa.id },
    });
    expect(membership).not.toBeNull();
  });

  it('`destino.tipo === "empresa"` NÃO é convite — continua 201 com a flag desligada', async () => {
    // O corte é `tipo === 'convite'`, e este teste é o que impede que ele vire
    // "POST /users inteiro". `empresa` não usa token de convite: cria owner.
    await desligarChave('tenancy.invites', false);

    const resposta = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: {
        nome: 'Eli',
        email: 'eli@acme.dev',
        senha: 'senha-super-secreta',
        destino: { tipo: 'empresa', nome: 'Acme Eli', slug: 'acme-eli' },
      },
    });

    expect(resposta.statusCode).toBe(201);
  });
});
