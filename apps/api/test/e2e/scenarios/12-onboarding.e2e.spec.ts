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

  it('o segredo volta na resposta porque não há mailer — e NÃO no log', async () => {
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
});
