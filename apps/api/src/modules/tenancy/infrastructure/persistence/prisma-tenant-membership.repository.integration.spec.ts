// apps/api/src/modules/tenancy/infrastructure/persistence/prisma-tenant-membership.repository.integration.spec.ts
//
// pt-BR (Fase 6 — tenancy, 2026-10-16): a ESCRITA do perfil por empresa,
// contra Postgres de verdade.
//
// POR QUE O UNITÁRIO NÃO CHEGA (e por que este arquivo não é redundância)
// `prisma-tenant-membership.repository.spec.ts` confere o `where` entregue ao
// Prisma com um `updateMany` de mentira — que NÃO avalia `where`. Tudo que o
// filtro promete só vira fato aqui:
//
//   1. `profile: { OR: [...] }` sobre relação to-one ANULÁVEL: o unitário
//      documenta que o filtro não casa com `profileId === null`, mas um mock
//      responde `count: 1` para qualquer `where`. A remoção real é a que
//      importa: sem o filtro dispensado, o `count` dá 0 e o usuário nunca
//      limpa o perfil que o próprio dono lhe deu.
//   2. `tenantId` no `where` é o isolamento entre empresas, e a prova é que a
//      membership da OUTRA empresa da mesma pessoa continua intacta. Com um
//      `where: { userId }` (mutação abaixo) isso quebra.
//   3. `user.deletedAt: null` contra soft-delete real.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  setupTestDatabase,
  cleanDatabase,
  type TestContext,
} from '../../../../../test/testcontainers-helper.js';
import { PrismaTenantMembershipRepository } from './prisma-tenant-membership.repository.js';

const AGORA = new Date('2026-10-19T12:00:00.000Z');

describe('PrismaTenantMembershipRepository.atribuirPerfil — Postgres (Fase 6)', () => {
  let ctx: TestContext;
  let repo: PrismaTenantMembershipRepository;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
    repo = new PrismaTenantMembershipRepository(ctx.prisma);
  });

  afterAll(async () => {
    await ctx.stop();
  });

  async function criarConta(email: string, nome = 'Ana'): Promise<string> {
    const id = randomUUID();
    await ctx.prisma.user.create({
      data: { id, name: nome, email, passwordHash: 'x', createdAt: AGORA, version: 1 },
    });
    return id;
  }

  async function criarEmpresa(slug: string): Promise<string> {
    const t = await ctx.prisma.tenant.create({ data: { name: slug, slug } });
    return t.id;
  }

  /** Perfil DONO de uma empresa (`tenantId` preenchido), ou global se `null`. */
  async function criarPerfil(
    tenantId: string | null,
    slug: string,
    isAdmin = false,
  ): Promise<string> {
    const p = await ctx.prisma.profile.create({
      data: { slug, name: slug, isAdmin, isSystem: isAdmin, tenantId },
    });
    return p.id;
  }

  /**
   *CENÁRIO DE REFERÊNCIA: a mesma pessoa em DUAS empresas, cada uma com seu
   * perfil. É o que "perfil diferente por empresa" significa, e é por isso que
   * a segunda empresa não é enfeite: é o contraexemplo de qualquer escrita sem
   * `tenantId` no `where`.
   */
  async function cenarioDuasEmpresas() {
    await cleanDatabase(ctx.prisma);
    const pessoa = await criarConta('dono@acme.dev');
    const acme = await criarEmpresa('acme');
    const globex = await criarEmpresa('globex');
    const gestorAcme = await criarPerfil(acme, 'gestor-acme');
    const gestorGlobex = await criarPerfil(globex, 'gestor-globex');
    await ctx.prisma.tenantMembership.create({
      data: { userId: pessoa, tenantId: acme, role: 'owner', profileId: gestorAcme },
    });
    await ctx.prisma.tenantMembership.create({
      data: { userId: pessoa, tenantId: globex, role: 'member', profileId: gestorGlobex },
    });
    return { pessoa, acme, globex, gestorAcme, gestorGlobex };
  }

  it('grava o perfil na membership DAQUELA empresa e a leitura devolve esse id', async () => {
    const { pessoa, acme, globex } = await cenarioDuasEmpresas();
    const outro = await criarPerfil(acme, 'operador-acme');

    await expect(repo.atribuirPerfil(pessoa, acme, outro)).resolves.toBe(true);

    await expect(repo.findProfileId(pessoa, acme)).resolves.toBe(outro);
    // ⚠️ A propriedade que a mutação `where: { userId }` quebraria: a empresa
    // vizinha não é tocado. Sem `tenantId` no filtro, `updateMany` pega a
    // linha do outro tenant (a ordem das linhas não é garantida) ou atualiza
    // as duas.
    await expect(repo.findProfileId(pessoa, globex)).resolves.not.toBe(outro);
  });

  it('NÃO atravessa para outra empresa: o filtro de DONO do perfil é do banco, não do chamador', async () => {
    const { pessoa, acme, gestorGlobex } = await cenarioDuasEmpresas();

    // O perfil é da GLOBEX e a escrita é na ACME. O unitário viu o `where`
    // certo; só o banco diz que a conta dá 0 e a casa é `false`.
    await expect(repo.atribuirPerfil(pessoa, acme, gestorGlobex)).resolves.toBe(false);
    await expect(repo.findProfileId(pessoa, acme)).resolves.not.toBe(gestorGlobex);
  });

  it('perfil GLOBAL é vestível em qualquer empresa (o admin do sistema precisa entrar em uma)', async () => {
    const { pessoa, acme } = await cenarioDuasEmpresas();
    const adminGlobal = await criarPerfil(null, 'admin-sistema', true);

    await expect(repo.atribuirPerfil(pessoa, acme, adminGlobal)).resolves.toBe(true);
    await expect(repo.findProfileId(pessoa, acme)).resolves.toBe(adminGlobal);
  });

  // O erro que o unitário SÓ pode comentar: `profile` é relação to-one
  // anulável, então `profile: { OR: [...] }` não casa com `profileId === null`.
  // Aqui o fato é medido — a remoção tem de funcionar, e é o que a pessoa usa
  // para devolver alguém a zero permissões dentro da empresa.
  it('REMOVER (profileId null) funciona de verdade — o filtro de dona não pode virar no-op', async () => {
    const { pessoa, acme } = await cenarioDuasEmpresas();

    await expect(repo.atribuirPerfil(pessoa, acme, null)).resolves.toBe(true);

    const linha = await ctx.prisma.tenantMembership.findFirst({
      where: { userId: pessoa, tenantId: acme },
      select: { profileId: true },
    });
    expect(linha?.profileId).toBeNull();
    await expect(repo.findProfileId(pessoa, acme)).resolves.toBeNull();
  });

  it('pessoa que não é membro da empresa: false, e nenhuma linha criada', async () => {
    const { acme } = await cenarioDuasEmpresas();
    const stranger = await criarConta('ninguem@acme.dev');
    const gestor = await criarPerfil(acme, 'operario-acme');

    await expect(repo.atribuirPerfil(stranger, acme, gestor)).resolves.toBe(false);
    await expect(ctx.prisma.tenantMembership.count({ where: { userId: stranger } })).resolves.toBe(
      0,
    );
  });

  it('conta soft-deleted não muda de perfil — membership sobrevive ao usuário', async () => {
    const { acme } = await cenarioDuasEmpresas();
    const alvo = await criarConta('saindo@acme.dev');
    const gestor = await criarPerfil(acme, 'operador-acme');
    await ctx.prisma.tenantMembership.create({
      data: { userId: alvo, tenantId: acme, role: 'member', profileId: null },
    });
    await ctx.prisma.user.update({ where: { id: alvo }, data: { deletedAt: AGORA } });

    await expect(repo.atribuirPerfil(alvo, acme, gestor)).resolves.toBe(false);
    const linha = await ctx.prisma.tenantMembership.findFirst({
      where: { userId: alvo, tenantId: acme },
      select: { profileId: true },
    });
    expect(linha?.profileId).toBeNull();
  });

  // ─────────── a ORDEM da lista de empresas ───────────
  //
  // ⚠️ A ordem é FUNCIONAL: o funil do login (no web) leva a pessoa para a
  // PRIMEIRA empresa da lista. E a chave que decide é a DATA da membership.
  //
  // ⚠️ O `profileId` NÃO pode ser a chave: ele é um UUID DISTINTO por
  // membership, e como chave entregava a ordem ao ALEATÓRIO do UUID. Os ids
  // de perfil abaixo são ESCOLHIDOS (o menor e o maior possíveis) para que a
  // ordem antiga fosse deterministicamente errada — com o `profileId` na
  // frente, 'antiga' (uuid menor) viria antes de 'recente' (uuid maior), o
  // contrário do que a recência manda.
  it('entre as empresas onde a pessoa tem perfil, a MAIS RECENTE vem primeiro', async () => {
    await cleanDatabase(ctx.prisma);
    const pessoa = await criarConta('ana@acme.dev');
    const antiga = await criarEmpresa('antiga');
    const recente = await criarEmpresa('recente');
    const perfilAntigo = await ctx.prisma.profile.create({
      data: {
        id: '00000000-0000-0000-0000-000000000001',
        slug: 'gestor-antiga',
        name: 'Gestor',
        tenantId: antiga,
      },
    });
    const perfilRecente = await ctx.prisma.profile.create({
      data: {
        id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
        slug: 'gestor-recente',
        name: 'Gestor',
        tenantId: recente,
      },
    });
    await ctx.prisma.tenantMembership.create({
      data: {
        userId: pessoa,
        tenantId: antiga,
        role: 'member',
        profileId: perfilAntigo.id,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await ctx.prisma.tenantMembership.create({
      data: {
        userId: pessoa,
        tenantId: recente,
        role: 'member',
        profileId: perfilRecente.id,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    });

    const empresas = await repo.listarEmpresasDoUsuario(pessoa);

    expect(empresas.map((empresa) => empresa.slug)).toEqual(['recente', 'antiga']);
  });

  it('a membership SEM perfil efetivo vai para o FIM, mesmo sendo a mais recente', async () => {
    // ⚠️ Quem ainda não recebeu perfil não pode fazer nada na empresa, e o
    // funil não pode levá-lo para lá. A data sozinha colocaria a empresa
    // vazia na frente — que é a origem do 403 sem causa nomeada.
    await cleanDatabase(ctx.prisma);
    const pessoa = await criarConta('ana@acme.dev');
    const comPerfil = await criarEmpresa('com-perfil');
    const semPerfil = await criarEmpresa('sem-perfil');
    const perfil = await criarPerfil(comPerfil, 'gestor');
    await ctx.prisma.tenantMembership.create({
      data: {
        userId: pessoa,
        tenantId: comPerfil,
        role: 'owner',
        profileId: perfil,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });
    await ctx.prisma.tenantMembership.create({
      data: {
        userId: pessoa,
        tenantId: semPerfil,
        role: 'member',
        profileId: null,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    });

    const empresas = await repo.listarEmpresasDoUsuario(pessoa);

    expect(empresas.map((empresa) => empresa.slug)).toEqual(['com-perfil', 'sem-perfil']);
  });

  it('a membership apontada para o perfil de OUTRA empresa vai para o FIM', async () => {
    // ⚠️ A coluna CRUA (`profile_id` não nulo) não é perfil EFETIVO: o perfil
    // de outra empresa não resolve nada na API — o filtro de DONA do
    // `findProfileId` recusa. Uma lista que contasse a coluna crua
    // colocaria essa empresa na FRENTE (é a mais recente aqui), e o funil do
    // login escolheria uma empresa onde a pessoa não pode fazer nada.
    await cleanDatabase(ctx.prisma);
    const pessoa = await criarConta('ana@acme.dev');
    const acme = await criarEmpresa('acme');
    const globex = await criarEmpresa('globex');
    const perfilDaGlobex = await criarPerfil(globex, 'gestor-globex');
    // A membership na ACME aponta para o perfil da GLOBEX — o estado que o
    // port admite ter existido.
    await ctx.prisma.tenantMembership.create({
      data: {
        userId: pessoa,
        tenantId: acme,
        role: 'member',
        profileId: perfilDaGlobex,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
      },
    });
    // E a membership da GLOBEX, com o perfil da PRÓPRIA empresa, mais antiga.
    await ctx.prisma.tenantMembership.create({
      data: {
        userId: pessoa,
        tenantId: globex,
        role: 'member',
        profileId: perfilDaGlobex,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    });

    const empresas = await repo.listarEmpresasDoUsuario(pessoa);

    expect(empresas.map((empresa) => empresa.slug)).toEqual(['globex', 'acme']);
  });
});
