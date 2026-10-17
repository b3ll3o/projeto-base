// apps/api/src/modules/tenancy/infrastructure/persistence/prisma-tenant-onboarding.repository.integration.spec.ts
//
// pt-BR (Fase 5 — tenancy, 2026-10-16): a D5 contra Postgres de verdade.
//
// O QUE ESTE ARQUIVO PROVA E O UNITÁRIO NÃO PROVE
//
// O unitário (`tenancy.use-cases.spec.ts`) fixa as decisões; ele roda contra
// `mock`, e `mock` não tem rollback. A propriedade de que a Fase 5 realmente
// entrega é TRANSACIONAL: uma empresa própria deixa de existir por inteiro —
// sem `users` órfão, sem `tenants` sem dono, sem `profiles` sem membership —
// quando a última escrita falha. Isso só se mede em banco de verdade, e é a
// razão de este arquivo existir.
//
// O que a rollback prova de concreto: `slug` duplicado é a falha que o banco
// resolve por último (a `users` e a `profiles` são as primeiras escritas), e
// sem `$transaction` o banco ficaria com o usuário criado e a empresa não.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  setupTestDatabase,
  cleanDatabase,
  type TestContext,
} from '../../../../../test/testcontainers-helper.js';
import { PrismaTenantOnboardingRepository } from './prisma-tenant-onboarding.repository.js';
import { PrismaTenantMembershipRepository } from './prisma-tenant-membership.repository.js';
import {
  ConviteInvalidoException,
  ConviteJaEmitidoException,
  EmpresaJaExisteException,
} from '../../domain/exceptions/tenancy.exceptions.js';
import { listAllPermissions } from '../../../../shared/auth/permissions-catalog.js';

const AGORA = new Date('2026-10-19T12:00:00.000Z');

function usuario(email: string) {
  return {
    id: randomUUID(),
    nome: 'Ana',
    email,
    senhaHash: '$argon2id$v=19$m=65536,p=4,t=3$J44j$digest',
    createdAt: AGORA,
  };
}

describe('PrismaTenantOnboardingRepository — entrada na empresa (Fase 5)', () => {
  let ctx: TestContext;
  let repo: PrismaTenantOnboardingRepository;
  let memberships: PrismaTenantMembershipRepository;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
    repo = new PrismaTenantOnboardingRepository(ctx.prisma);
    memberships = new PrismaTenantMembershipRepository(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.stop();
  });

  // ───────────────────────── empresa própria ─────────────────────────

  it('empresa própria grava users + tenants + profiles + membership', async () => {
    await cleanDatabase(ctx.prisma);
    const u = usuario('dono@acme.dev');

    await repo.provisionarEmpresaPropria(u, { nome: 'ACME', slug: 'acme' });

    const empresa = await ctx.prisma.tenant.findUnique({ where: { slug: 'acme' } });
    expect(empresa).not.toBeNull();

    const conta = await ctx.prisma.user.findUnique({ where: { id: u.id } });
    expect(conta?.email).toBe('dono@acme.dev');
    // `users.profile_id` fica NULL de propósito: a empresa é o escopo do
    // perfil, e sem header a pessoa não está em empresa nenhuma. Verificar
    // aqui impede que um "atalho" futuro encha a coluna global e faça a
    // Fase 4 voltar a resolver perfil sem empresa.
    expect(conta?.profileId).toBeNull();

    const vinculo = await ctx.prisma.tenantMembership.findFirst({
      where: { userId: u.id },
      include: { profile: true },
    });
    expect(vinculo?.role).toBe('owner');
    expect(vinculo?.tenantId).toBe(empresa!.id);
    expect(vinculo?.profile?.tenantId).toBe(empresa!.id);
    expect(vinculo?.profile?.isAdmin).toBe(true);
  });

  it('o admin da empresa nova recebe TODAS as permissões do catálogo', async () => {
    await cleanDatabase(ctx.prisma);
    const u = usuario('dono@acme.dev');
    await repo.provisionarEmpresaPropria(u, { nome: 'ACME', slug: 'acme' });

    const perfil = await ctx.prisma.profile.findFirst({
      where: { tenantId: { not: null }, slug: 'admin' },
      include: { authorizations: true },
    });

    // `isAdmin` já é bypass total, então as permissões são defesa em
    // profundidade — mas é a defesa que sobrevive a alguém desligar o bypass.
    expect(perfil?.authorizations).toHaveLength(listAllPermissions().length);
  });

  it('NENHUM perfil global é criado ao abrir empresa (o admin é DA empresa)', async () => {
    await cleanDatabase(ctx.prisma);
    await repo.provisionarEmpresaPropria(usuario('dono@acme.dev'), { nome: 'ACME', slug: 'acme' });

    const globais = await ctx.prisma.profile.count({ where: { tenantId: null } });
    expect(globais).toBe(0);
  });

  it('slug repetido NÃO deixa conta nem empresa pela metade (é o rollback)', async () => {
    await cleanDatabase(ctx.prisma);
    await ctx.prisma.tenant.create({ data: { name: 'ACME', slug: 'acme' } });
    const u = usuario('dono@acme.dev');

    await expect(
      repo.provisionarEmpresaPropria(u, { nome: 'ACME', slug: 'acme' }),
    ).rejects.toBeInstanceOf(EmpresaJaExisteException);

    // As três primeiras escritas do `$transaction` já tinham passado. Sem
    // rollback, o usuário e o perfil admin existiriam para uma empresa que
    // nunca foi criada — e um `users` sem membership é exatamente a conta
    // que a Fase 4 resolve para zero permissões sem ninguém entender por quê.
    expect(await ctx.prisma.user.count({ where: { id: u.id } })).toBe(0);
    expect(await ctx.prisma.profile.count()).toBe(0);
    expect(await ctx.prisma.tenantMembership.count()).toBe(0);
  });

  it('o dono de uma empresa NÃO ganha perfil na empresa alheia', async () => {
    await cleanDatabase(ctx.prisma);
    await repo.provisionarEmpresaPropria(usuario('dono@acme.dev'), { nome: 'ACME', slug: 'acme' });

    const membership = await ctx.prisma.tenantMembership.findFirstOrThrow({
      include: { profile: true },
    });
    const empresaDoPerfil = await ctx.prisma.tenant.findUniqueOrThrow({
      where: { id: membership.profile!.tenantId! },
    });

    expect(empresaDoPerfil.slug).toBe('acme');
  });

  // ───────────────────────── convite ─────────────────────────

  async function empresaComDono(slug: string, email: string) {
    const u = usuario(email);
    await repo.provisionarEmpresaPropria(u, { nome: slug, slug });
    return { dono: u, tenant: await ctx.prisma.tenant.findUniqueOrThrow({ where: { slug } }) };
  }

  it('o convite emitido volta pelo token, e não por (empresa, email)', async () => {
    await cleanDatabase(ctx.prisma);
    const { tenant } = await empresaComDono('acme', 'dono@acme.dev');

    await repo.emitirConvite({
      tenantId: tenant.id,
      email: 'ana@acme.dev',
      role: 'member',
      token: 'secreto',
      expiresAt: new Date('2026-10-26T12:00:00.000Z'),
    });

    const achado = await repo.buscarConvitePorToken('secreto');
    expect(achado).toMatchObject({ tenantId: tenant.id, email: 'ana@acme.dev', acceptedAt: null });
  });

  it('token que ninguém emitiu não acha convite nenhum', async () => {
    await cleanDatabase(ctx.prisma);
    expect(await repo.buscarConvitePorToken('chute')).toBeNull();
  });

  it('mesmo token em duas empresas NÃO vira "convite já emitido" — é outra constraint', async () => {
    await cleanDatabase(ctx.prisma);
    const acme = await empresaComDono('acme', 'dono@acme.dev');
    const globex = await empresaComDono('globex', 'dono@globex.dev');

    await repo.emitirConvite({
      tenantId: acme.tenant.id,
      email: 'ana@acme.dev',
      role: 'member',
      token: 'mesmo',
      expiresAt: new Date('2026-10-26T12:00:00.000Z'),
    });

    await expect(
      repo.emitirConvite({
        tenantId: globex.tenant.id,
        email: 'ana@globex.dev',
        role: 'member',
        token: 'mesmo',
        expiresAt: new Date('2026-10-26T12:00:00.000Z'),
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('convidar a mesma pessoa duas vezes na mesma empresa é 409, não 500', async () => {
    await cleanDatabase(ctx.prisma);
    const { tenant } = await empresaComDono('acme', 'dono@acme.dev');
    const convite = {
      tenantId: tenant.id,
      email: 'ana@acme.dev',
      role: 'member',
      token: 't1',
      expiresAt: new Date('2026-10-26T12:00:00.000Z'),
    };

    await repo.emitirConvite(convite);
    // Antes isto afirmava `code: 'P2002'` — ou seja, **travava o 500 no
    // lugar**. O P2002 cru não tem tradução e chega ao cliente como
    // "Erro interno", indistinguível de banco fora do ar.
    await expect(repo.emitirConvite({ ...convite, token: 't2' })).rejects.toBeInstanceOf(
      ConviteJaEmitidoException,
    );
  });

  // ───────────────────────── aceite ─────────────────────────

  it('o aceite cria a membership SEM perfil e marca o convite como usado', async () => {
    await cleanDatabase(ctx.prisma);
    const { tenant } = await empresaComDono('acme', 'dono@acme.dev');
    await repo.emitirConvite({
      tenantId: tenant.id,
      email: 'ana@acme.dev',
      role: 'member',
      token: 'secreto',
      expiresAt: new Date('2026-10-26T12:00:00.000Z'),
    });
    const convite = await repo.buscarConvitePorToken('secreto');
    const ana = await ctx.prisma.user.create({
      data: { id: randomUUID(), email: 'ana@acme.dev', name: 'Ana', passwordHash: 'x' },
    });

    await repo.entrarPorConvite({ userId: ana.id, invitationId: convite!.id });

    const membership = await ctx.prisma.tenantMembership.findUniqueOrThrow({
      where: { userId_tenantId: { userId: ana.id, tenantId: tenant.id } },
    });
    // `profile_id` NULL: quem entra por convite não tem perfil até o admin da
    // empresa atribuir. A Fase 4 já mediu que NULL resolve para zero permissões.
    expect(membership.role).toBe('member');
    expect(membership.profileId).toBeNull();

    const usado = await repo.buscarConvitePorToken('secreto');
    expect(usado?.acceptedAt).toBeInstanceOf(Date);
  });

  it('o aceite VESTE o papel do convite, e o convite NÃO promove a owner', async () => {
    await cleanDatabase(ctx.prisma);
    const { tenant } = await empresaComDono('acme', 'dono@acme.dev');
    await repo.emitirConvite({
      tenantId: tenant.id,
      email: 'ana@acme.dev',
      role: 'owner',
      token: 'secreto',
      expiresAt: new Date('2026-10-26T12:00:00.000Z'),
    });
    const convite = await repo.buscarConvitePorToken('secreto');
    const ana = await ctx.prisma.user.create({
      data: { id: randomUUID(), email: 'ana@acme.dev', name: 'Ana', passwordHash: 'x' },
    });

    await repo.entrarPorConvite({ userId: ana.id, invitationId: convite!.id });

    // O papel vem do convite, não do chamador. Um port que aceitasse `role`
    // do lado de fora transformaria o aceite em escalada: qualquer um com
    // um token propio criaria o próprio owner.
    const membership = await ctx.prisma.tenantMembership.findUniqueOrThrow({
      where: { userId_tenantId: { userId: ana.id, tenantId: tenant.id } },
    });
    expect(membership.role).toBe('owner');
    expect(membership.profileId).toBeNull();
  });

  it('aceitar o MESMO convite duas vezes falha e não duplica membership', async () => {
    await cleanDatabase(ctx.prisma);
    const { tenant } = await empresaComDono('acme', 'dono@acme.dev');
    await repo.emitirConvite({
      tenantId: tenant.id,
      email: 'ana@acme.dev',
      role: 'member',
      token: 'secreto',
      expiresAt: new Date('2026-10-26T12:00:00.000Z'),
    });
    const convite = await repo.buscarConvitePorToken('secreto');
    const ana = await ctx.prisma.user.create({
      data: { id: randomUUID(), email: 'ana@acme.dev', name: 'Ana', passwordHash: 'x' },
    });

    await repo.entrarPorConvite({ userId: ana.id, invitationId: convite!.id });

    // O `updateMany` condicionado a `accepted_at IS NULL` é a trava de
    // corrida: dois convites com o mesmo token aceitos em paralelo — o
    // segundo encontra 0 linhas e não pode criar a membership.
    await expect(
      repo.entrarPorConvite({ userId: ana.id, invitationId: convite!.id }),
    ).rejects.toBeInstanceOf(ConviteInvalidoException);
    expect(
      await ctx.prisma.tenantMembership.count({ where: { userId: ana.id, tenantId: tenant.id } }),
    ).toBe(1);
  });

  it('a membership criada por convite NÃO herda perfil de empresa nenhuma', async () => {
    await cleanDatabase(ctx.prisma);
    const { tenant } = await empresaComDono('acme', 'dono@acme.dev');
    await repo.emitirConvite({
      tenantId: tenant.id,
      email: 'ana@acme.dev',
      role: 'member',
      token: 'secreto',
      expiresAt: new Date('2026-10-26T12:00:00.000Z'),
    });
    const convite = await repo.buscarConvitePorToken('secreto');
    const ana = await ctx.prisma.user.create({
      data: { id: randomUUID(), email: 'ana@acme.dev', name: 'Ana', passwordHash: 'x' },
    });

    await repo.entrarPorConvite({ userId: ana.id, invitationId: convite!.id });

    expect(await memberships.findProfileId(ana.id, tenant.id)).toBeNull();
  });

  // ───────────────────────── conta nova por convite ─────────────────────────

  it('conta nova por convite grava `users` E a membership, e consome o convite', async () => {
    await cleanDatabase(ctx.prisma);
    const { tenant } = await empresaComDono('acme', 'dono@acme.dev');
    await repo.emitirConvite({
      tenantId: tenant.id,
      email: 'ana@acme.dev',
      role: 'member',
      token: 'secreto',
      expiresAt: new Date('2026-10-26T12:00:00.000Z'),
    });
    const convite = await repo.buscarConvitePorToken('secreto');
    const id = randomUUID();
    const criado = new Date('2026-10-19T12:00:00.000Z');

    // Nenhum `users` existe ainda — é a conta nova do `destino: 'convite'`.
    await repo.criarContaPorConvite(
      { userId: id, invitationId: convite!.id },
      { id, nome: 'Ana', email: 'ana@acme.dev', senhaHash: 'x', createdAt: criado },
    );

    const conta = await ctx.prisma.user.findUniqueOrThrow({ where: { id } });
    expect(conta.email).toBe('ana@acme.dev');
    // Sem header a pessoa não está em empresa nenhuma: a Fase 4 resolve esse
    // bucket para zero permissões, então encher isto seria desfazer a Fase 4.
    expect(conta.profileId).toBeNull();

    const membership = await ctx.prisma.tenantMembership.findUniqueOrThrow({
      where: { userId_tenantId: { userId: id, tenantId: tenant.id } },
    });
    expect(membership.role).toBe('member');
    expect(membership.profileId).toBeNull();
    expect((await repo.buscarConvitePorToken('secreto'))?.acceptedAt).toBeInstanceOf(Date);
  });

  it('email já em uso NÃO deixa nem a conta, nem a membership, nem o convite consumido', async () => {
    await cleanDatabase(ctx.prisma);
    const { tenant } = await empresaComDono('acme', 'dono@acme.dev');
    await repo.emitirConvite({
      tenantId: tenant.id,
      email: 'dono@acme.dev',
      role: 'member',
      token: 'secreto',
      expiresAt: new Date('2026-10-26T12:00:00.000Z'),
    });
    const convite = await repo.buscarConvitePorToken('secreto');
    const id = randomUUID();

    // O e-mail do convite é o de quem JÁ tem conta: o `tx.user.create` estoura
    // o índice único de `users.email` no MEIO da transação. Se a transação
    // não desfizesse tudo, o convite ficaria queimado (irrecuperável) sem
    // que ninguém tivesse entrado.
    //
    // shortcut: aqui o `P2002` de `users.email` NÃO é traduzido, e chegaria
    // como 500. Ele só é alcançável sob CORRIDA — o caminho comum já devolve
    // 409 por `findByEmail`, antes de chegar aqui (`user-use-cases.ts`) —, e a
    // tradução exigiria importar a exceção de `users` para um adaptador de
    // `tenancy`. Se a corrida aparecer em produção, o conserto é a
    // `EmailAlreadyInUseException` de `users/domain`, que tenancy já importa.
    await expect(
      repo.criarContaPorConvite(
        { userId: id, invitationId: convite!.id },
        {
          id,
          nome: 'Dona',
          email: 'dono@acme.dev',
          senhaHash: 'x',
          createdAt: new Date('2026-10-19T12:00:00.000Z'),
        },
      ),
    ).rejects.toMatchObject({ code: 'P2002' });

    expect(await ctx.prisma.user.findUnique({ where: { id } })).toBeNull();
    expect(
      await ctx.prisma.tenantMembership.count({ where: { userId: id, tenantId: tenant.id } }),
    ).toBe(0);
    // O convite continua valendo — o rollback leva o `accepted_at` junto.
    expect((await repo.buscarConvitePorToken('secreto'))?.acceptedAt).toBeNull();
  });

  // ───────────────────────── findRole ─────────────────────────

  it('findRole devolve o papel na empresa certa, e null fora dela', async () => {
    await cleanDatabase(ctx.prisma);
    const { dono, tenant } = await empresaComDono('acme', 'dono@acme.dev');
    const outra = await ctx.prisma.tenant.create({ data: { name: 'Globex', slug: 'globex' } });

    expect(await memberships.findRole(dono.id, tenant.id)).toBe('owner');
    expect(await memberships.findRole(dono.id, outra.id)).toBeNull();
  });

  it('findRole não acha usuário inexistente (e não devolve papel de outro)', async () => {
    await cleanDatabase(ctx.prisma);
    const { tenant } = await empresaComDono('acme', 'dono@acme.dev');

    expect(await memberships.findRole(randomUUID(), tenant.id)).toBeNull();
  });
});
