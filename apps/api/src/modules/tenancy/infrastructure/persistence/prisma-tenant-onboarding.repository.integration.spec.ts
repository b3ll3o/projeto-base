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
// O que a rollback prova de concreto: a ÚLTIMA escrita falhar depois de as
// outras três terem passado. Por isso o teste derruba `users.email`, que é a
// quarta escrita — `slug` duplicado é a PRIMEIRA (`tx.tenant.create`), e uma
// colisão ali não tem o que desfazer, então o teste passaria com o
// `$transaction` apagado. MEDIDO: removendo o `$transaction`, `slug` repetido
// deixa users=0 profiles=0 auth=0 memb=0; `email` repetido deixa
// users(dup)=1 profiles=1 auth=7 memb=0.

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
import { EmailAlreadyInUseException } from '../../../users/domain/exceptions/user.exceptions.js';
import { uriComoPapelDeRuntime } from '../../../../shared/infrastructure/prisma/papel-de-runtime.js';
import { AssinaturaDeMembership } from '../../../../shared/infrastructure/prisma/assinatura-de-membership.js';

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
  /** Sessão da APLICAÇÃO (Fase 10): papel sem BYPASSRLS, onde a RLS vale. */
  let runtime: InstanceType<typeof import('@prisma/client').PrismaClient>;
  /**
   * A assinatura REAL, com a chave lida do banco — e não um dublê.
   *
   * ⚠️ Um dublê aqui mediria o repository com uma assinatura que o banco
   * aceitaria por acidente, e a primeira versão deste arquivo era exatamente
   * isso: nenhum teste checava que a chave de verdade produz a assinatura de
   * verdade. Instanciar o signer de produção e rodar o `onModuleInit` contra a
   * conexão de DONO (que `setupTestDatabase` publica em
   * `DIRECT_DATABASE_URL`) é o que garante que o corpo assinado que o
   * repository monta bate com o que `criar_membership` recalcula.
   */
  let assinatura: AssinaturaDeMembership;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
    assinatura = new AssinaturaDeMembership();
    await assinatura.onModuleInit();
    repo = new PrismaTenantOnboardingRepository(ctx.prisma, assinatura);
    memberships = new PrismaTenantMembershipRepository(ctx.prisma);
    const { PrismaClient } = await import('@prisma/client');
    runtime = new PrismaClient({ datasourceUrl: uriComoPapelDeRuntime(ctx.uriDoBanco) });
  });

  afterAll(async () => {
    await runtime.$disconnect();
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
    expect(vinculo?.role).toBe('gerente');
    expect(vinculo?.tenantId).toBe(empresa!.id);
    expect(vinculo?.profile?.tenantId).toBe(empresa!.id);
    expect(vinculo?.profile?.isAdmin).toBe(true);
  });

  it('o DONO da empresa nova recebe TODAS as permissões do catálogo', async () => {
    await cleanDatabase(ctx.prisma);
    const u = usuario('dono@acme.dev');
    await repo.provisionarEmpresaPropria(u, { nome: 'ACME', slug: 'acme' });

    const perfil = await ctx.prisma.profile.findFirst({
      where: { tenantId: { not: null }, slug: 'gerente' },
      include: { authorizations: true },
    });

    // `isAdmin` já é bypass total, então as permissões são defesa em
    // profundidade — mas é a defesa que sobrevive a alguém desligar o bypass.
    expect(perfil?.authorizations).toHaveLength(listAllPermissions().length);
  });

  it('a empresa nova nasce com TRÊS perfis — dono, gestor e funcionário', async () => {
    await cleanDatabase(ctx.prisma);
    const u = usuario('dono@acme.dev');
    await repo.provisionarEmpresaPropria(u, { nome: 'ACME', slug: 'acme' });

    const empresa = await ctx.prisma.tenant.findUniqueOrThrow({ where: { slug: 'acme' } });
    const perfis = await ctx.prisma.profile.findMany({
      where: { tenantId: empresa.id },
      include: { authorizations: true },
      orderBy: { slug: 'asc' },
    });

    // O conjunto é o que o DONO precisa para executar: quem cria a empresa
    // administra a empresa, quem éGestor administra pessoas, e quem é
    // funcionário só olha o diretório.
    // ⚠️ A ordem é a da QUERY (`orderBy: { slug: 'asc' }`), e por isso é
    // alfabética — com `gerente`/`coordenador`/`funcionario` ela é
    // c < f < g. A expectativa antiga fixava a posição do primeiro nome, e o
    // rename trocou a posição no alfabeto.
    expect(perfis.map((p) => p.slug)).toEqual(['coordenador', 'funcionario', 'gerente']);
    expect(perfis.map((p) => p.name)).toEqual(['Coordenador', 'Funcionário', 'Gerente']);

    // O `isAdmin` é do DONO só — o gestor administra PESSOAS, não o sistema
    // de permissões (com `admin.manage-authorizations` ele se daria
    // `admin.manage-profiles` e editaria o perfil do dono).
    expect(perfis.find((p) => p.slug === 'gerente')?.isAdmin).toBe(true);
    expect(perfis.find((p) => p.slug === 'coordenador')?.isAdmin).toBe(false);
    expect(perfis.find((p) => p.slug === 'funcionario')?.isAdmin).toBe(false);

    // E as permissões são as do conjunto, não "todas" para os três.
    const chavesDe = (slug: string): string[] =>
      (perfis.find((p) => p.slug === slug)?.authorizations ?? [])
        .map((a) => a.permissionKey)
        .sort();
    expect(chavesDe('coordenador')).toEqual(['audits.read', 'users.read', 'users.write']);
    expect(chavesDe('funcionario')).toEqual(['users.read']);
  });

  it('os TRÊS perfis são DELE e de sistema (não podem ser apagados)', async () => {
    await cleanDatabase(ctx.prisma);
    await repo.provisionarEmpresaPropria(usuario('dono@acme.dev'), { nome: 'ACME', slug: 'acme' });

    const empresa = await ctx.prisma.tenant.findUniqueOrThrow({ where: { slug: 'acme' } });
    const perfis = await ctx.prisma.profile.findMany({ where: { tenantId: empresa.id } });

    expect(perfis).toHaveLength(3);
    expect(perfis.every((p) => p.isSystem)).toBe(true);
  });

  it('NENHUM perfil global é criado ao abrir empresa (o admin é DA empresa)', async () => {
    await cleanDatabase(ctx.prisma);
    await repo.provisionarEmpresaPropria(usuario('dono@acme.dev'), { nome: 'ACME', slug: 'acme' });

    const globais = await ctx.prisma.profile.count({ where: { tenantId: null } });
    expect(globais).toBe(0);
  });

  it('slug repetido NÃO deixa conta nem empresa pela metade', async () => {
    await cleanDatabase(ctx.prisma);
    await ctx.prisma.tenant.create({ data: { name: 'ACME', slug: 'acme' } });
    const u = usuario('dono@acme.dev');

    await expect(
      repo.provisionarEmpresaPropria(u, { nome: 'ACME', slug: 'acme' }),
    ).rejects.toBeInstanceOf(EmpresaJaExisteException);

    expect(await ctx.prisma.tenant.count()).toBe(1);
    expect(await ctx.prisma.user.count({ where: { id: u.id } })).toBe(0);
    expect(await ctx.prisma.profile.count()).toBe(0);
    expect(await ctx.prisma.tenantMembership.count()).toBe(0);
  });

  // pt-BR (Fase 5, revisão): ESTE é o teste que sustenta a transação, e o
  // primeiro NÃO sustentava. A colisão do `slug` é a primeira escrita do
  // `$transaction`, então o `P2002` chega antes de `profile.create`,
  // `authorization.createMany` e `tenantMembership.create` existirem — e um
  // teste que passa com o `$transaction` removido não está medindo rollback,
  // está medindo que a falha veio cedo demais para ter estragado alguma coisa.
  // MEDIDO: com o `$transaction` virando IIFE sobre `this.prisma`, este teste
  // abaixo fica VERMelho e o do `slug` continua verde.
  it('email repetido NA QUARTA escrita não deixa tenant, perfil, autorizações nem membership (é o rollback)', async () => {
    await cleanDatabase(ctx.prisma);
    // A conta que já existe é a de outra pessoa — é ela que faz o
    // `users.email` estourar, e o estourar é na 4ª escrita.
    await ctx.prisma.user.create({
      data: {
        id: randomUUID(),
        name: 'Outra',
        email: 'dono@acme.dev',
        passwordHash: 'x',
        version: 1,
      },
    });
    const u = usuario('dono@acme.dev');

    // Uma chamada só para as duas propriedades: o erro NÃO é
    // `EmpresaJaExisteException` (o `catch` discrimina a constraint, senão o
    // cliente recebe 409 EMPRESA_JA_EXISTE apontando o campo errado) E nada
    // sobrou no banco.
    const erro = await repo.provisionarEmpresaPropria(u, { nome: 'ACME', slug: 'acme' }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(erro).toBeInstanceOf(Error);
    // ⚠️ A TRADUÇÃO: o `P2002` de `users.email` vira
    // `EmailAlreadyInUseException` — a exceção do PRÓPRIO módulo de `users`
    // (que `tenancy` já importa), e o `GlobalExceptionFilter` já a traduz em
    // 409 `EMAIL_IN_USE`. MEDIDO 2026-10-21: sem o ramo, o `P2002` cru subia
    // como **500** — "banco fora do ar" num cadastro que era um CONFLITO, e o
    // retry devolvia 500 para sempre.
    expect(erro).toBeInstanceOf(EmailAlreadyInUseException);
    // E o `catch` discrimina a constraint: o cliente NÃO recebe 409
    // EMPRESA_JA_EXISTE, que apontaria o campo errado (o SLUG).
    expect(erro).not.toBeInstanceOf(EmpresaJaExisteException);

    // As três escritas ANTERIORES passaram. Sem rollback sobrariam um tenant
    // sem dono, um perfil `dono` com TODAS as permissões do catálogo e uma
    // membership órfã — o estado "conta sem empresa / perfil sem dono" que o
    // cabeçalho deste arquivo diz que a transação impede. `authorization` é
    // a assertion mais afiada: são 7 linhas que nenhuma das outras mede.
    expect(await ctx.prisma.tenant.count()).toBe(0);
    expect(await ctx.prisma.profile.count()).toBe(0);
    expect(await ctx.prisma.authorization.count()).toBe(0);
    expect(await ctx.prisma.tenantMembership.count()).toBe(0);
    // A conta preexistente é de outra pessoa e não pode ser tocada.
    expect(await ctx.prisma.user.count()).toBe(1);
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

  it('a conta que JÁ é membro da empresa não aceita outro convite dela', async () => {
    // ⚠️ O dono pode se convidar, e aí o `INSERT` da membership bate no
    // `@@unique([userId, tenantId])`. MEDIDO 2026-10-21: sem a tradução, isto
    // saía como **500** — o `P2010` da query crua (`criar_membership`), com o
    // `23505` no `meta` — indistinguível de banco fora do ar, num pedido que
    // é um CONFLITO.
    await cleanDatabase(ctx.prisma);
    const { dono, tenant } = await empresaComDono('acme', 'dono@acme.dev');
    await repo.emitirConvite({
      tenantId: tenant.id,
      email: 'dono@acme.dev',
      role: 'member',
      token: 'secreto',
      expiresAt: new Date('2026-10-26T12:00:00.000Z'),
    });
    const convite = await ctx.prisma.invitation.findFirstOrThrow({ where: { token: 'secreto' } });

    const erro = await repo.entrarPorConvite({ userId: dono.id, invitationId: convite.id }).then(
      () => null,
      (e: unknown) => e,
    );

    expect(erro).toBeInstanceOf(ConviteInvalidoException);
    expect((erro as ConviteInvalidoException).motivo).toBe('ja-membro');
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

  it('convite VENCIDO não entra — a validade é revalidada DENTRO da transação', async () => {
    await cleanDatabase(ctx.prisma);
    const { tenant } = await empresaComDono('acme', 'dono@acme.dev');
    await repo.emitirConvite({
      tenantId: tenant.id,
      email: 'ana@acme.dev',
      role: 'member',
      token: 'secreto',
      // VENCIDO: a data está no passado.
      expiresAt: new Date('2026-10-18T12:00:00.000Z'),
    });
    const convite = await repo.buscarConvitePorToken('secreto');
    const ana = await ctx.prisma.user.create({
      data: { id: randomUUID(), email: 'ana@acme.dev', name: 'Ana', passwordHash: 'x' },
    });

    // O caso de uso (`exigirConviteValido`) recusa o convite vencido ANTES de
    // chegar aqui — mas essa checagem é de FORA da transação, numa conexão
    // diferente. O repositório revalida por conta própria: sem isso, um convite
    // que vence NA JANELA entre as duas é aceito por uma transação já
    // VENCIDA, e o convite fica CONSUMIDO (irrecuperável para as outras
    // tentativas).
    const erro = await repo.entrarPorConvite({ userId: ana.id, invitationId: convite!.id }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(erro).toBeInstanceOf(ConviteInvalidoException);
    // O motivo é o de "vencido" — o cliente recebe 410, não 409.
    expect((erro as ConviteInvalidoException).motivo).toBe('expirado');

    // E nada sobrou: a pessoa NÃO entrou, e o convite continua valendo.
    expect(
      await ctx.prisma.tenantMembership.count({ where: { userId: ana.id, tenantId: tenant.id } }),
    ).toBe(0);
    expect((await repo.buscarConvitePorToken('secreto'))?.acceptedAt).toBeNull();
  });

  it('o aceite VESTE o papel do convite, e o convite NÃO promove a gerente', async () => {
    await cleanDatabase(ctx.prisma);
    const { tenant } = await empresaComDono('acme', 'dono@acme.dev');
    await repo.emitirConvite({
      tenantId: tenant.id,
      email: 'ana@acme.dev',
      role: 'gerente',
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
    // um token propio criaria o próprio gerente.
    const membership = await ctx.prisma.tenantMembership.findUniqueOrThrow({
      where: { userId_tenantId: { userId: ana.id, tenantId: tenant.id } },
    });
    expect(membership.role).toBe('gerente');
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
    // MEDIDO 2026-10-21: o `P2002` é traduzido em `EmailAlreadyInUseException`
    // — a exceção do PRÓPRIO módulo de `users` (que `tenancy` já importa), e
    // não uma nova aqui. O `GlobalExceptionFilter` já sabe traduzir aquela em
    // 409 `EMAIL_IN_USE`, que é a mensagem que o formulário sabe mostrar. O
    // `shortcut:` que existia aqui ("chegaria como 500") não existe mais.
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
    ).rejects.toBeInstanceOf(EmailAlreadyInUseException);

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

    expect(await memberships.findRole(dono.id, tenant.id)).toBe('gerente');
    expect(await memberships.findRole(dono.id, outra.id)).toBeNull();
  });

  it('findRole não acha usuário inexistente (e não devolve papel de outro)', async () => {
    await cleanDatabase(ctx.prisma);
    const { tenant } = await empresaComDono('acme', 'dono@acme.dev');

    expect(await memberships.findRole(randomUUID(), tenant.id)).toBeNull();
  });

  // ─────────── Fase 10: a entrada na empresa com a sessão da APLICAÇÃO ───────────
  //
  // MEDIDO 2026-10-17: a `users_insercao` da Fase 10 exige `escopo_atual() = '*'`,
  // e as DUAS escritas de `tx.user.create` do onboarding rodavam DEPOIS de
  // `abrirEscopo(tx, <empresa>)`. Sob a sessão da aplicação isso é `42501` —
  // virando 500 no `POST /users` com destino 'empresa' e no cadastro por
  // convite, as DUAS portas de entrada do produto.
  //
  // Por que estes dois testes são os únicos que enxergam: todo o resto do
  // arquivo fala com `ctx.prisma`, que é o DONO das tabelas e ignora RLS.
  // Nenhum e2e veria também — a API sobe como dono do container. O papel sem
  // BYPASSRLS só existe aqui.
  describe('com a sessão da aplicação (as policies valem)', () => {
    it('provisionarEmpresaPropria conclui — o gerente da empresa nova entra', async () => {
      await cleanDatabase(ctx.prisma);
      const app = new PrismaTenantOnboardingRepository(runtime, assinatura);
      const u = usuario('dono-runtime@acme.dev');

      await app.provisionarEmpresaPropria(u, { nome: 'ACME', slug: 'acme-rt' });

      // Verificado pelo DONO: quem mede precisa ver o banco inteiro, senão
      // "a escrita não aconteceu" só é checável pela policy que deveria
      // tê-la barrado.
      expect(await ctx.prisma.user.findUnique({ where: { id: u.id } })).toMatchObject({
        email: 'dono-runtime@acme.dev',
        profileId: null,
      });
      const empresa = await ctx.prisma.tenant.findUnique({ where: { slug: 'acme-rt' } });
      expect(empresa).not.toBeNull();
      const vinculo = await ctx.prisma.tenantMembership.findFirst({
        where: { userId: u.id },
        include: { profile: true },
      });
      expect(vinculo?.role).toBe('gerente');
      expect(vinculo?.profile?.isAdmin).toBe(true);
    });

    it('criarContaPorConvite conclui — a conta nova entra e o convite é consumido', async () => {
      await cleanDatabase(ctx.prisma);
      const { tenant } = await empresaComDono('acme', 'dono@acme.dev');
      await repo.emitirConvite({
        tenantId: tenant.id,
        email: 'nova@acme.dev',
        role: 'member',
        token: 'token-runtime',
        expiresAt: new Date('2026-10-26T12:00:00.000Z'),
      });
      const convite = await repo.buscarConvitePorToken('token-runtime');

      const app = new PrismaTenantOnboardingRepository(runtime, assinatura);
      const nova = usuario('nova@acme.dev');
      await app.criarContaPorConvite({ userId: nova.id, invitationId: convite!.id }, nova);

      expect(await ctx.prisma.user.findUnique({ where: { id: nova.id } })).toMatchObject({
        email: 'nova@acme.dev',
        profileId: null,
      });
      expect(
        await ctx.prisma.tenantMembership.count({
          where: { userId: nova.id, tenantId: tenant.id },
        }),
      ).toBe(1);
      expect((await repo.buscarConvitePorToken('token-runtime'))?.acceptedAt).not.toBeNull();
    });
  });

  // ─────────── empresa de quem JÁ tem conta (a página de criação de empresa) ───────────
  //
  // O caminho do `POST /users { destino: 'empresa' }` grava a CONTA e a EMPRESA
  // na mesma transação. Quem já tem conta não tem esse caminho: a página de
  // criação de empresa é a segunda etapa do onboarding, e ela precisa abrir a
  // empresa para uma conta EXISTENTE — sem tocar em `users`.
  describe('abrirEmpresaParaUsuario — a empresa de quem já tem conta', () => {
    async function contaExistente(email: string) {
      const u = usuario(email);
      await ctx.prisma.user.create({
        data: {
          id: u.id,
          name: u.nome,
          email: u.email,
          passwordHash: u.senhaHash,
          profileId: null,
          createdAt: u.createdAt,
        },
      });
      return u;
    }

    it('cria a empresa, os TRÊS perfis DELA e a membership de gerente no perfil `gerente`', async () => {
      await cleanDatabase(ctx.prisma);
      const u = await contaExistente('dono@acme.dev');

      const empresa = await repo.abrirEmpresaParaUsuario(u.id, { nome: 'ACME', slug: 'acme' });

      expect(empresa).toMatchObject({ nome: 'ACME', slug: 'acme' });
      const linha = await ctx.prisma.tenant.findUnique({ where: { slug: 'acme' } });
      expect(linha?.id).toBe(empresa.id);

      const vinculo = await ctx.prisma.tenantMembership.findFirst({
        where: { userId: u.id },
        include: { profile: true },
      });
      expect(vinculo?.role).toBe('gerente');
      expect(vinculo?.tenantId).toBe(empresa.id);
      // O DONO é DA empresa — mesmo contrato de `provisionarEmpresaPropria`.
      expect(vinculo?.profile?.tenantId).toBe(empresa.id);
      expect(vinculo?.profile?.slug).toBe('gerente');
      expect(vinculo?.profile?.isAdmin).toBe(true);

      const perfis = await ctx.prisma.profile.findMany({ where: { tenantId: empresa.id } });
      expect(perfis.map((p) => p.slug).sort()).toEqual(['coordenador', 'funcionario', 'gerente']);

      const dono = await ctx.prisma.profile.findFirst({
        where: { tenantId: empresa.id, slug: 'gerente' },
        include: { authorizations: true },
      });
      expect(dono?.authorizations).toHaveLength(listAllPermissions().length);
    });

    it('NÃO mexe na conta — `users.profile_id` continua NULL (o perfil é o da empresa)', async () => {
      await cleanDatabase(ctx.prisma);
      const u = await contaExistente('dono@acme.dev');

      await repo.abrirEmpresaParaUsuario(u.id, { nome: 'ACME', slug: 'acme' });

      expect(await ctx.prisma.user.findUnique({ where: { id: u.id } })).toMatchObject({
        email: 'dono@acme.dev',
        profileId: null,
      });
    });

    it('slug repetido NÃO deixa empresa, perfil, permissões nem membership pela metade', async () => {
      await cleanDatabase(ctx.prisma);
      await ctx.prisma.tenant.create({ data: { name: 'ACME', slug: 'acme' } });
      const u = await contaExistente('dono@acme.dev');

      await expect(
        repo.abrirEmpresaParaUsuario(u.id, { nome: 'ACME', slug: 'acme' }),
      ).rejects.toBeInstanceOf(EmpresaJaExisteException);

      expect(await ctx.prisma.tenant.count()).toBe(1);
      expect(await ctx.prisma.profile.count()).toBe(0);
      expect(await ctx.prisma.authorization.count()).toBe(0);
      expect(await ctx.prisma.tenantMembership.count()).toBe(0);
    });

    it('conclui sob a sessão da APLICAÇÃO (as policies valem)', async () => {
      await cleanDatabase(ctx.prisma);
      const u = await contaExistente('dono-runtime@acme.dev');
      const app = new PrismaTenantOnboardingRepository(runtime, assinatura);

      const empresa = await app.abrirEmpresaParaUsuario(u.id, { nome: 'ACME', slug: 'acme-rt' });

      const vinculo = await ctx.prisma.tenantMembership.findFirst({
        where: { userId: u.id },
        include: { profile: true },
      });
      expect(vinculo?.role).toBe('gerente');
      expect(vinculo?.tenantId).toBe(empresa.id);
      expect(vinculo?.profile?.isAdmin).toBe(true);
    });
  });

  // ─────────── as empresas do ator ───────────
  describe('listarEmpresasDoUsuario — as empresas de quem está logado', () => {
    it('devolve as empresas com o papel, e nada das empresas alheias', async () => {
      await cleanDatabase(ctx.prisma);
      const { dono, tenant } = await empresaComDono('acme', 'dono@acme.dev');
      const outro = await ctx.prisma.user.create({
        data: { id: randomUUID(), name: 'Bia', email: 'bia@acme.dev', passwordHash: 'x' },
      });

      const empresas = await memberships.listarEmpresasDoUsuario(dono.id);

      // O nome vem da empresa como foi criada — `empresaComDono` usa o slug
      // como nome, então o campo é 'acme', não 'ACME'.
      expect(empresas).toEqual([{ id: tenant.id, nome: 'acme', slug: 'acme', role: 'gerente' }]);
      expect(await memberships.listarEmpresasDoUsuario(outro.id)).toEqual([]);
    });

    it('a conta sem empresa nenhuma devolve lista vazia (e não a empresa do outro)', async () => {
      await cleanDatabase(ctx.prisma);
      await empresaComDono('acme', 'dono@acme.dev');
      const solta = await ctx.prisma.user.create({
        data: { id: randomUUID(), name: 'Sem', email: 'sem@acme.dev', passwordHash: 'x' },
      });

      expect(await memberships.listarEmpresasDoUsuario(solta.id)).toEqual([]);
    });
  });
});
