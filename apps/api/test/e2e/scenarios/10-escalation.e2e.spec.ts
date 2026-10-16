// apps/api/test/e2e/scenarios/10-escalation.e2e.spec.ts
//
// Cenário E2E 10: **escalada de privilégio e validação na fronteira HTTP**
// (2026-10-16, PR #97).
//
// ⚠️ Este arquivo existe porque o defeito que ele mede foi CONFIRMADO AO VIVO
// por leitura, e as correções (A1/A3/A4/A6) foram verificadas apenas em teste
// de unidade — que instancia as use cases com `new` e atravessa ZERO camada de
// HTTP. Três coisas só aparecem aqui:
//
//   1. A CADEIA inteira pela porta: antes do #97, um ator não-admin com
//      `admin.manage-profiles` + `admin.manage-authorizations` +
//      `admin.manage-users` criava um profile, enchia-o de `admin.*` e se dava
//      esse profile. Chegava a root sem nunca ser admin. Fechado só por
//      ACIDENTO: as duas use cases existentes protegiam eixos diferentes e
//      nenhuma delas vedava esta sequência.
//   2. O `ator` chega no controller. As três assinaturas passaram a exigir o
//      ator; um call-site que esquecesse passá-lo daria `undefined` e um 500 —
//      um teste de unidade não veria isso, porque instancia a use case direto.
//   3. O STATUS HTTP: slug malformado respondia 409 `PROFILE_SLUG_IN_USE`,
//      que é mentira (o slug não está em uso, é inválido). A distinção
//      400-vs-409 é contractual e ninguém a tinha observado atravessando o
//      Fastify.
//
// Banco REAL via Testcontainers; tokens REAIS por `POST /auth/login`. Nenhum
// guard é dublê. O ator escalador existe porque é o que a API permite criar
// hoje: um profile não-admin com as três chaves `admin.manage-*`.
//
// REGRA DE OURO deste arquivo: toda trava tem DOIS testes — um de RECUSA e um
// de LIBERDADE. Um `403` que passasse porque *tudo* recusa é indistinguível de
// uma trava que funciona, e é exatamente o tipo de verde que mente.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  bootstrapE2E,
  teardownE2E,
  cleanE2EDatabase,
  tokenDe,
  type E2EContext,
  SENHA_DE_TESTE,
} from '../test-app.helper.js';

/** O que o escalador tem: as três chaves de gestão + uma de negócio. */
const DO_ESCALADOR = [
  'admin.manage-profiles',
  'admin.manage-authorizations',
  'admin.manage-users',
  'users.read',
] as const;

describe('E2E 10: escalada de privilégio e validação na fronteira HTTP', () => {
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

  // ⚠️ O login é limitado a 5/minuto POR CONTA (`LIMITE_LOGIN_POR_MINUTO`, com
  // `getTracker` por e-mail). Reusar um e-mail fixo aqui faz o 6º login da
  // suíte responder 429 — e a falha aparece como "spec quebrado", não como
  // limite de taxa, que é a assinatura clássica do verde que mente. Subir o
  // teto está fora de questão: é o controle que o cenário 09 existe para medir.
  let contas = 0;
  const emailNovo = (papel: string): string => `${papel}-${(contas += 1)}@projeto.test`;

  /** Cria um profile DIRETO no Prisma, como faz o seed. */
  async function perfil(
    slug: string,
    chaves: readonly string[] = [],
    flags: { isAdmin?: boolean } = {},
  ): Promise<string> {
    const criado = await e2e.ctx.prisma.profile.create({
      data: { slug, name: slug, isAdmin: flags.isAdmin ?? false, isSystem: false },
      select: { id: true },
    });
    if (chaves.length > 0) {
      await e2e.ctx.prisma.authorization.createMany({
        data: chaves.map((permissionKey) => ({ profileId: criado.id, permissionKey })),
      });
    }
    return criado.id;
  }

  /** Conta real (POST público) com um profile, e token real de login. */
  async function contaCom(
    email: string,
    profileId: string | null,
  ): Promise<{ id: string; token: string }> {
    const cadastro = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Escalador', email, senha: SENHA_DE_TESTE },
    });
    expect(cadastro.statusCode).toBe(201);
    const { id } = JSON.parse(cadastro.body) as { id: string };
    // O profile é ligado DEPOIS do cadastro e ANTES do login: o `JwtAuthGuard`
    // hidrata `isAdmin`/permissões no primeiro request, então seed tardio
    // entraria com o cache já frio do jeito errado.
    await e2e.ctx.prisma.user.update({ where: { id }, data: { profileId } });
    return { id, token: await tokenDe(e2e.app, { email, senha: SENHA_DE_TESTE }) };
  }

  /** Monta o ator do ataque e o profile-vazio que ele tenta cunha. */
  async function cenarioDoAtaque() {
    const alvo = await perfil('alvo');
    const ator = await contaCom(emailNovo('escalador'), await perfil('escalador', DO_ESCALADOR));
    return { alvo, ator };
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  // ─── A4: o status do slug, observado atravessando o Fastify ─────────────────

  it('slug MALFORMADO responde 400, não 409 de "já está em uso"', async () => {
    const ator = await contaCom(emailNovo('escalador'), await perfil('escalador', DO_ESCALADOR));

    const res = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/admin/profiles',
      headers: auth(ator.token),
      payload: { slug: 'Slug Inválido', name: 'X' },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('VALIDATION_ERROR');
    // 409 era o status anterior e mentia: o slug não está em uso, é inválido.
    // A linha abaixo é a que quebra se alguém voltar a mapear isto como 409.
    expect(res.statusCode).not.toBe(409);
  });

  it('slug bem formado JÁ EXISTENTE continua 409 (o 409 não foi perdido)', async () => {
    const ator = await contaCom(emailNovo('escalador'), await perfil('escalador', DO_ESCALADOR));

    const res = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/admin/profiles',
      headers: auth(ator.token),
      payload: { slug: 'escalador', name: 'Outro' },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).code).toBe('PROFILE_SLUG_IN_USE');
  });

  // ─── A3: `isAdmin` só via seed, medido na fronteira ────────────────────────

  it('isAdmin:true no body é ignorado na criação (o perfil nasce não-admin)', async () => {
    const ator = await contaCom(emailNovo('escalador'), await perfil('escalador', DO_ESCALADOR));

    const res = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/admin/profiles',
      headers: auth(ator.token),
      payload: { slug: 'forjado', name: 'Forjado', isAdmin: true, isSystem: true },
    });

    expect(res.statusCode).toBe(201);
    // A resposta E o banco: responder `isAdmin:false` só no JSON deixaria a
    // linha do Prisma como `true`, que é o que o guard realmente lê.
    expect(JSON.parse(res.body).isAdmin).toBe(false);
    const linha = await e2e.ctx.prisma.profile.findUnique({
      where: { slug: 'forjado' },
      select: { isAdmin: true, isSystem: true },
    });
    expect(linha).toEqual({ isAdmin: false, isSystem: false });
  });

  // ─── A1.1: não conceder o que não se tem ────────────────────────────────────

  it('A1.1 RECUSA: conceder a si mesmo, via profile cunhado, uma chave que não tem', async () => {
    const { alvo, ator } = await cenarioDoAtaque();

    const res = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/admin/profiles/${alvo}/authorizations`,
      headers: auth(ator.token),
      payload: { permissionKey: 'users.delete' },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('PRIVILEGE_ESCALATION');
    // O estado tem que continuar intocado: um 403 que gravou a autorização
    // seria verde aqui e uma escalada viva em produção.
    const gravou = await e2e.ctx.prisma.authorization.count({
      where: { profileId: alvo, permissionKey: 'users.delete' },
    });
    expect(gravou).toBe(0);
  });

  it('A1.1 LIBERTA: conceder a OUTRO profile uma chave que o ator TEM', async () => {
    const { alvo, ator } = await cenarioDoAtaque();

    const res = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/admin/profiles/${alvo}/authorizations`,
      headers: auth(ator.token),
      payload: { permissionKey: 'users.read' },
    });

    // Controle negativo: se a trava recusasse TUDO, o teste de recusa acima
    // passaria sozinho. Delegar para baixo é o uso legítimo de
    // `admin.manage-authorizations` e tem de continuar funcionando.
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).permissions).toContain('users.read');
  });

  // ─── A1.2: auto-atribuição é concessão ──────────────────────────────────────

  it('A1.2 RECUSA: tomar para si um profile cujas permissões excedem as suas', async () => {
    const rico = await perfil('rico', ['users.delete']); // o ator NÃO tem esta
    const ator = await contaCom(emailNovo('escalador'), await perfil('escalador', DO_ESCALADOR));

    const res = await e2e.injetar({
      method: 'PUT',
      url: `/api/v1/admin/users/${ator.id}/profile`,
      headers: auth(ator.token),
      payload: { profileId: rico },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('PRIVILEGE_ESCALATION');
    const user = await e2e.ctx.prisma.user.findUnique({
      where: { id: ator.id },
      select: { profileId: true },
    });
    expect(user?.profileId).not.toBe(rico);
  });

  it('A1.2 LIBERTA: auto-atribuição de subconjunto legítimo continua passando', async () => {
    const modesto = await perfil('modesto', ['users.read']); // subconjunto do ator
    const ator = await contaCom(emailNovo('escalador'), await perfil('escalador', DO_ESCALADOR));

    const res = await e2e.injetar({
      method: 'PUT',
      url: `/api/v1/admin/users/${ator.id}/profile`,
      headers: auth(ator.token),
      payload: { profileId: modesto },
    });

    expect(res.statusCode).toBe(200);
    const user = await e2e.ctx.prisma.user.findUnique({
      where: { id: ator.id },
      select: { profileId: true },
    });
    expect(user?.profileId).toBe(modesto);
  });

  it('A1.2 RECUSA: atribuir a OUTRO usuário profile mais largo que o do ator', async () => {
    // MEDIDO 2026-10-16 (revisão de segurança, achado B1). O alvo não pode ser
    // o ator: `POST /users` é público, então "outro usuário" é um boneco que o
    // próprio escalador cria e autentica. Atribuir a ele um profile mais largo
    // que o do ator era a escalada completa por DELEGAÇÃO — e o teste que
    // antes afirmava o contrário ("delegação") é o que mantinha a cadeia aberta.
    const amplo = await perfil('amplo', ['users.delete']);
    const colega = await contaCom(emailNovo('colega'), null);
    const ator = await contaCom(emailNovo('escalador'), await perfil('escalador', DO_ESCALADOR));

    const res = await e2e.injetar({
      method: 'PUT',
      url: `/api/v1/admin/users/${colega.id}/profile`,
      headers: auth(ator.token),
      payload: { profileId: amplo },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('PRIVILEGE_ESCALATION');
    const boneco = await e2e.ctx.prisma.user.findUnique({
      where: { id: colega.id },
      select: { profileId: true },
    });
    expect(boneco?.profileId).toBeNull();
  });

  it('A1.2 LIBERTA: atribuir a OUTRO usuário um subconjunto do que o ator tem', async () => {
    // O par LIBERDADE do teste acima: sem ele, "recusa sempre" também ficaria
    // verde. Delegar para baixo — o que `admin.manage-users` realmente serve
    // para — continua funcionando.
    const modesto = await perfil('modesto-2', ['users.read']);
    const colega = await contaCom(emailNovo('colega'), null);
    const ator = await contaCom(emailNovo('escalador'), await perfil('escalador', DO_ESCALADOR));

    const res = await e2e.injetar({
      method: 'PUT',
      url: `/api/v1/admin/users/${colega.id}/profile`,
      headers: auth(ator.token),
      payload: { profileId: modesto },
    });

    expect(res.statusCode).toBe(200);
    const boneco = await e2e.ctx.prisma.user.findUnique({
      where: { id: colega.id },
      select: { profileId: true },
    });
    expect(boneco?.profileId).toBe(modesto);
  });

  it('atribuir profile isAdmin a si mesmo é recusado (o bypass não é delegável)', async () => {
    const root = await perfil('root', [], { isAdmin: true });
    const ator = await contaCom(emailNovo('escalador'), await perfil('escalador', DO_ESCALADOR));

    const res = await e2e.injetar({
      method: 'PUT',
      url: `/api/v1/admin/users/${ator.id}/profile`,
      headers: auth(ator.token),
      payload: { profileId: root },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).code).toBe('PRIVILEGE_ESCALATION');
  });

  // ─── A6: fail-closed quando o ator não resolve no banco ────────────────────

  it('A6: ator soft-deleted é RECUSADO, não aceito por ausência (fail-closed)', async () => {
    const { alvo, ator } = await cenarioDoAtaque();
    // O token é stateless e o guard não consulta o usuário — então o pedido
    // chega "autenticado" com um `sub` que não resolve mais. O `?.` antigo
    // transformava "não sei quem eu sou" em "não sou eu" e deixava passar o
    // pedido mais privilegiado do sistema.
    await e2e.ctx.prisma.user.update({
      where: { id: ator.id },
      data: { deletedAt: new Date() },
    });

    const res = await e2e.injetar({
      method: 'POST',
      url: `/api/v1/admin/profiles/${alvo}/authorizations`,
      headers: auth(ator.token),
      payload: { permissionKey: 'users.read' },
    });

    expect(res.statusCode).toBe(403);
    const gravou = await e2e.ctx.prisma.authorization.count({
      where: { profileId: alvo, permissionKey: 'users.read' },
    });
    expect(gravou).toBe(0);
  });
});
