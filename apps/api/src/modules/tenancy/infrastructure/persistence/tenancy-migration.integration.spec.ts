// apps/api/src/modules/tenancy/infrastructure/persistence/tenancy-migration.integration.spec.ts
//
// pt-BR (Fase 2 do plano 2026-10-16-multi-tenant): o schema de tenancy, testado
// contra um Postgres de verdade (Testcontainers), não contra a geração do Prisma.
//
// POR QUE ESSE ARQUIVO EXISTE — e por que não é um spec de repositório:
// os invariantes da D3 **não são garantidos pelo schema.prisma**. O Prisma não
// tem índice parcial, então a unicidade de `profiles.slug` por tenant é SQL puro
// dentro da migration. Um spec que só perguntasse "o Prisma gerou?" ficaria verde
// com a migration errada. Aqui a migration é aplicada e o banco responde.
//
// O que é verificado:
//   1. `tenants` + `tenant_memberships` + `invitations` existem e aceitam as
//      linhas que a Fase 4 vai ler.
//   2. D3: dois tenants PODEM ter slug "manager" ao mesmo tempo (é o que a
//      customização por empresa promete), e o slug GLOBAL continua único.
//   3. `tenant_memberships` rejeita a segunda membership do mesmo (user, tenant)
//      — o `@@unique([userId, tenantId])` virando constraint de verdade.
//   4. profiles de tenant NÃO vazam para o escopo global: um `slug` global e um
//      de tenant com o mesmo texto coexistem, porque as duas regras são
//      independentes (é a razão de existirem dois índices e não um).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  setupTestDatabase,
  cleanDatabase,
  type TestContext,
} from '../../../../../test/testcontainers-helper.js';
import { PrismaTenantMembershipRepository } from './prisma-tenant-membership.repository.js';

// pt-BR: o caminho do arquivo de migration, resolvido a partir do próprio spec
// (não de `process.cwd()`) — o mesmo motivo de `apps/api/src/main.ts.spec.ts`:
// `pnpm test:integration` (via turbo/CI) roda com CWD=apps/api/, enquanto
// `pnpm vitest run` direto roda com CWD=monorepo root.
const specDir = dirname(fileURLToPath(import.meta.url));

describe('Migration de tenancy (Fase 2)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
  });

  afterAll(async () => {
    await ctx.stop();
  });

  /** Cria um tenant. `slug` é global por definição (D3). */
  async function criarTenant(slug: string): Promise<string> {
    const t = await ctx.prisma.tenant.create({
      data: { name: `Empresa ${slug}`, slug },
    });
    return t.id;
  }

  /**
   * Cria um user direto no Prisma.
   *
   * pt-BR: `User.id` é `@id @db.Uuid` SEM `@default(uuid())` — o id é gerado
   * pelo agregado (`User.criar`), não pelo banco. Quem escreve direto precisa
   * do `id` na mão, senão o typecheck acusa `UserCreateInput`.
   */
  async function criarUser(email: string, nome = 'Alguém') {
    return ctx.prisma.user.create({
      data: { id: randomUUID(), email, name: nome, passwordHash: 'x' },
    });
  }

  describe('tabelas novas', () => {
    it('cria tenant e devolve id', async () => {
      await cleanDatabase(ctx.prisma);
      const id = await criarTenant('acme');
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('vincula um user a uma membership (1 conta, N empresas — D4)', async () => {
      await cleanDatabase(ctx.prisma);
      const user = await criarUser('multi@acme.dev');
      const t1 = await criarTenant('acme');
      const t2 = await criarTenant('globex');

      await ctx.prisma.tenantMembership.create({
        data: { userId: user.id, tenantId: t1, role: 'gerente' },
      });
      await ctx.prisma.tenantMembership.create({
        data: { userId: user.id, tenantId: t2, role: 'member' },
      });

      const membresias = await ctx.prisma.tenantMembership.findMany({
        where: { userId: user.id },
      });
      expect(membresias).toHaveLength(2);
      expect(new Set(membresias.map((m) => m.tenantId))).toEqual(new Set([t1, t2]));
    });

    it('recusa a segunda membership do mesmo (user, tenant)', async () => {
      await cleanDatabase(ctx.prisma);
      const user = await criarUser('dup@acme.dev');
      const t = await criarTenant('acme');

      await ctx.prisma.tenantMembership.create({
        data: { userId: user.id, tenantId: t, role: 'gerente' },
      });
      // A constraint é o que a Fase 4 vai consultar para responder "já sou membro?"
      // sem distinguir "não existe" de "já existe" por consulta.
      //
      // `code: 'P2002'` e não `toThrow()` nu: QUALQUER erro satisfaz `toThrow()`,
      // inclusive `P2021` (tabela não existe) — se a migration fosse aplicada pela
      // metade, este teste, sendo o ÚNICO guard do `@@unique([userId, tenantId])`,
      // ficaria verde sem a constraint nunca ter sido exercida.
      await expect(
        ctx.prisma.tenantMembership.create({
          data: { userId: user.id, tenantId: t, role: 'member' },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('cria invitation (D5 — entrada por convite)', async () => {
      await cleanDatabase(ctx.prisma);
      const t = await criarTenant('acme');
      const inv = await ctx.prisma.invitation.create({
        data: {
          tenantId: t,
          email: 'convidado@acme.dev',
          role: 'member',
          // pt-BR (Fase 5): `token` é `@unique` e obrigatório — a coluna
          // nasceu na migration `20261019000000_invitation_token` com `SET
          // NOT NULL`, que falha alto em vez de aceitar convite sem segredo.
          token: 'token-de-teste-da-fase-2',
        },
      });
      expect(inv.email).toBe('convidado@acme.dev');

      const lida = await ctx.prisma.invitation.findFirst({
        where: { tenantId: t, email: 'convidado@acme.dev' },
      });
      expect(lida).not.toBeNull();
      // Sem `acceptedAt`, o convite está pendente — é o estado em que a Fase 3
      // encontra antes de consumi-lo.
      expect(lida?.acceptedAt).toBeNull();
    });
  });

  describe('D3 — perfis globais + customizados por tenant', () => {
    it('permite o mesmo slug em dois tenants diferentes', async () => {
      await cleanDatabase(ctx.prisma);
      const t1 = await criarTenant('acme');
      const t2 = await criarTenant('globex');

      await ctx.prisma.profile.create({
        data: { slug: 'manager', name: 'Gestor Acme', tenantId: t1 },
      });
      await ctx.prisma.profile.create({
        data: { slug: 'manager', name: 'Gestor Globex', tenantId: t2 },
      });

      const managers = await ctx.prisma.profile.findMany({ where: { slug: 'manager' } });
      expect(managers).toHaveLength(2);
    });

    it('mantém o slug GLOBAL único entre si (profiles_slug_global_uniq)', async () => {
      await cleanDatabase(ctx.prisma);
      await ctx.prisma.profile.create({ data: { slug: 'admin', name: 'Admin' } });
      // `tenant_id IS NULL` nos dois: o índice parcial global tem de barrar.
      await expect(
        ctx.prisma.profile.create({ data: { slug: 'admin', name: 'Admin 2' } }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('mantém o slug único DENTRO do mesmo tenant', async () => {
      await cleanDatabase(ctx.prisma);
      const t = await criarTenant('acme');
      await ctx.prisma.profile.create({ data: { slug: 'manager', name: 'A', tenantId: t } });
      await expect(
        ctx.prisma.profile.create({ data: { slug: 'manager', name: 'B', tenantId: t } }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });

    it('deixa um slug global e um de tenant com o mesmo texto coexistir', async () => {
      await cleanDatabase(ctx.prisma);
      const t = await criarTenant('acme');
      await ctx.prisma.profile.create({ data: { slug: 'viewer', name: 'Global' } });
      await ctx.prisma.profile.create({ data: { slug: 'viewer', name: 'Da Acme', tenantId: t } });

      const viewers = await ctx.prisma.profile.findMany({ where: { slug: 'viewer' } });
      expect(viewers).toHaveLength(2);
      expect(viewers.filter((p) => p.tenantId === null)).toHaveLength(1);
      expect(viewers.filter((p) => p.tenantId === t)).toHaveLength(1);
    });

    it('preserva os perfis globais do RBAC do #97 (isSystem sem tenant)', async () => {
      await cleanDatabase(ctx.prisma);
      // `admin`/`viewer` do seed são globais por construção — se a Fase 2
      // inventasse um tenant default, estes deixariam de ser globais e a
      // proteção dos perfis de sistema (lock-out) mudaria de semântica.
      const admin = await ctx.prisma.profile.create({
        data: { slug: 'admin', name: 'Administrador', isAdmin: true, isSystem: true },
      });
      expect(admin.tenantId).toBeNull();
      expect(admin.isSystem).toBe(true);
    });
  });

  describe('RLS ainda NÃO é ativado nesta fase', () => {
    it('sem RLS, uma query sem SET LOCAL ainda enxerga tudo', async () => {
      await cleanDatabase(ctx.prisma);
      const t1 = await criarTenant('acme');
      await ctx.prisma.profile.create({ data: { slug: 'manager', name: 'M', tenantId: t1 } });

      // Guarda contra a classe "RLS ligado sem produtor": se este teste
      // começar a devolver 0 linhas, a Fase 2 ligou RLS cedo demais e a Fase 3
      // precisa do produtor antes de destravar.
      const todos = await ctx.prisma.profile.findMany({ where: { slug: 'manager' } });
      expect(todos).toHaveLength(1);
    });
  });

  describe('constraints que o SQL precisa garantir (o Prisma não)', () => {
    it('o índice parcial global rejeita duplicata que um @@unique aceitaria', async () => {
      await cleanDatabase(ctx.prisma);
      // `@@unique([tenantId, slug])` sozinho NÃO barraria isto: no Postgres
      // NULL != NULL, então dois perfis de sistema com o mesmo slug passariam.
      // A rejeição abaixo é o que prova que o índice parcial é que barra.
      await ctx.prisma.profile.create({ data: { slug: 'admin', name: 'A' } });
      const erro = await ctx.prisma.profile
        .create({ data: { slug: 'admin', name: 'B' } })
        .then(() => null)
        .catch((e: unknown) => e);

      expect(erro).not.toBeNull();
      expect(erro).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      const code = (erro as Prisma.PrismaClientKnownRequestError).code;
      // P2002 = unique constraint. Se vier outra coisa (P3018 = constraint do
      // schema não aplicada), o teste passou pelo motivo errado.
      expect(code).toBe('P2002');
    });
  });
});

/**
 * pt-BR (Fase 4, 2026-10-16): `tenant_memberships.profile_id` — a coluna que
 * torna a D4 ("um perfil por empresa") representável no banco.
 *
 * POR QUE ESTE BLOCO EXISTE E NÃO ESTÁ NO SPEC UNITÁRIO: o filtro de DONO do
 * perfil mora num `where` do Prisma, e um `findFirst` de mentira não avalia
 * `where`. O spec unitário confirma a INTENÇÃO; só o Postgres real confirma o
 * EFEITO. A prova que vale é a da classe 4: plantar uma membership cujo
 * `profile_id` aponta para o perfil da EMPRESA VIZINHA e pedir o perfil efetivo
 * na Acme. Se o filtro `profile: { OR: [...] }` sumisse, isto devolveria o perfil
 * alheio — e o sintoma (uma permissão a mais) é indistinguível de um perfil
 * corretamente configurado.
 */
describe('Perfil por empresa na membership (Fase 4 — D4)', () => {
  let ctx: TestContext;
  let repo: PrismaTenantMembershipRepository;

  beforeAll(async () => {
    ctx = await setupTestDatabase();
    repo = new PrismaTenantMembershipRepository(ctx.prisma as never);
  });

  afterAll(async () => {
    await ctx.stop();
  });

  async function criarUser(email: string, deletado = false) {
    return ctx.prisma.user.create({
      data: {
        id: randomUUID(),
        email,
        name: 'Alguém',
        passwordHash: 'x',
        ...(deletado ? { deletedAt: new Date() } : {}),
      },
    });
  }

  async function criarPerfil(slug: string, tenantId: string | null) {
    return ctx.prisma.profile.create({
      data: { slug, name: slug, ...(tenantId ? { tenantId } : {}) },
    });
  }

  it('a coluna profile_id aceita valor e devolve o perfil da membership', async () => {
    await cleanDatabase(ctx.prisma);
    const user = await criarUser('fase4@acme.dev');
    const acme = await ctx.prisma.tenant.create({ data: { name: 'Acme', slug: 'acme' } });
    const perfil = await criarPerfil('gestor-acme', acme.id);

    await ctx.prisma.tenantMembership.create({
      data: { userId: user.id, tenantId: acme.id, role: 'gerente', profileId: perfil.id },
    });

    await expect(repo.findProfileId(user.id, acme.id)).resolves.toBe(perfil.id);
  });

  it('FK RESTRICT barra apagar um perfil que uma empresa ainda usa', async () => {
    await cleanDatabase(ctx.prisma);
    const user = await criarUser('fk@acme.dev');
    const acme = await ctx.prisma.tenant.create({ data: { name: 'Acme', slug: 'acme' } });
    const perfil = await criarPerfil('gestor-acme', acme.id);
    await ctx.prisma.tenantMembership.create({
      data: { userId: user.id, tenantId: acme.id, role: 'gerente', profileId: perfil.id },
    });

    // ⚠️ `P2003`, e não `toThrow()` nu: qualquer erro satisfaz `toThrow()`.
    // Se a coluna tivesse saído com `ON DELETE CASCADE` (o default do
    // `migrate dev`), este teste passaria com a empresa perdendo o perfil de
    // todos os seus membros em silêncio — a forma de falha que a trava
    // `deletar` do use case existe para impedir.
    await expect(ctx.prisma.profile.delete({ where: { id: perfil.id } })).rejects.toMatchObject({
      code: 'P2003',
    });
    await expect(repo.findProfileId(user.id, acme.id)).resolves.toBe(perfil.id);
  });

  it('membership apontando para o perfil de OUTRA empresa resolve null', async () => {
    await cleanDatabase(ctx.prisma);
    const user = await criarUser('vazamento@acme.dev');
    const acme = await ctx.prisma.tenant.create({ data: { name: 'Acme', slug: 'acme' } });
    const globex = await ctx.prisma.tenant.create({ data: { name: 'Globex', slug: 'globex' } });
    const daGlobex = await criarPerfil('leitor-globex', globex.id);

    // membership LEGAL (o usuário é membro da Acme), com `profile_id` apontando
    // para o perfil que é da Globex. O banco não barra: nenhuma constraint
    // cross-tenant existe, e é por isso que a checagem é da aplicação.
    await ctx.prisma.tenantMembership.create({
      data: { userId: user.id, tenantId: acme.id, role: 'member', profileId: daGlobex.id },
    });
    // O mesmo usuário, o MESMO perfil, mas numa membership onde ele é dono.
    // Sem esta segunda linha o `null` abaixo seria vacuously correto — a
    // ausência de membership e o isolamento ficariam indistinguíveis, e um
    // repositório que devolvesse sempre `null` passaria.
    await ctx.prisma.tenantMembership.create({
      data: { userId: user.id, tenantId: globex.id, role: 'gerente', profileId: daGlobex.id },
    });

    await expect(repo.findProfileId(user.id, acme.id)).resolves.toBeNull();
    // O filtro não é "a empresa não existe": na GLOBEX o mesmo perfil resolve,
    // porque lá ele é dono. Uma checagem que recusasse os dois seria um
    // falso-positivo difícil de distinguir deste bug.
    await expect(repo.findProfileId(user.id, globex.id)).resolves.toBe(daGlobex.id);
  });

  it('perfil GLOBAL na membership da empresa resolve (D3 serve a qualquer)', async () => {
    await cleanDatabase(ctx.prisma);
    const user = await criarUser('global@acme.dev');
    const acme = await ctx.prisma.tenant.create({ data: { name: 'Acme', slug: 'acme' } });
    const global = await criarPerfil('admin', null);

    await ctx.prisma.tenantMembership.create({
      data: { userId: user.id, tenantId: acme.id, role: 'gerente', profileId: global.id },
    });

    await expect(repo.findProfileId(user.id, acme.id)).resolves.toBe(global.id);
  });

  it('no bucket GLOBAL, um `users.profile_id` apontado para perfil DE EMPRESA resolve null', async () => {
    await cleanDatabase(ctx.prisma);
    const user = await criarUser('global-vazado@acme.dev');
    const acme = await ctx.prisma.tenant.create({ data: { name: 'Acme', slug: 'acme' } });
    const daAcme = await criarPerfil('gestor-acme', acme.id);

    // ⚠️ A linha que `PUT /admin/users/:id/profile` produz hoje: ela escreve
    // `users.profile_id` sem olhar o dono do perfil. Sem o filtro
    // `profile: { is: { tenantId: null } }`, este perfil resolveria em TODA
    // requisição sem header — as permissões da Acme valendo fora dela, que é o
    // oposto do que a coluna promete. Com o filtro, resolve `null` (zero
    // permissões), que é o fail-closed correto.
    await ctx.prisma.user.update({ where: { id: user.id }, data: { profileId: daAcme.id } });

    // A premissa, medida: a linha existe e TEM o id do perfil da Acme. Sem
    // isto, um `update` que não escrevesse (ou um filtro novo que esvaziasse a
    // coluna) deixaria o `null` abaixo verde por ausência de dado — e o teste
    // passaria sem nunca ter exercitado o filtro.
    const gravado = await ctx.prisma.user.findFirst({
      where: { id: user.id },
      select: { profileId: true },
    });
    expect(gravado?.profileId).toBe(daAcme.id);

    await expect(repo.findProfileId(user.id, null)).resolves.toBeNull();
    // Controle positivo: o MESMO usuário, na empresa dona, resolve. Sem isto o
    // `null` acima seria indistinguível de "a coluna não foi lida".
    await ctx.prisma.tenantMembership.create({
      data: { userId: user.id, tenantId: acme.id, role: 'gerente', profileId: daAcme.id },
    });
    await expect(repo.findProfileId(user.id, acme.id)).resolves.toBe(daAcme.id);
  });

  it('membership sem perfil (convite aceito) resolve null, não o perfil de sistema', async () => {
    await cleanDatabase(ctx.prisma);
    const user = await criarUser('convite@acme.dev');
    const acme = await ctx.prisma.tenant.create({ data: { name: 'Acme', slug: 'acme' } });

    await ctx.prisma.tenantMembership.create({
      data: { userId: user.id, tenantId: acme.id, role: 'member' },
    });

    await expect(repo.findProfileId(user.id, acme.id)).resolves.toBeNull();
  });

  it('conta soft-deleted resolve null nos DOIS buckets (fail-closed imediato)', async () => {
    await cleanDatabase(ctx.prisma);
    const user = await criarUser('apagado@acme.dev', true);
    const acme = await ctx.prisma.tenant.create({ data: { name: 'Acme', slug: 'acme' } });
    const daAcme = await criarPerfil('gestor-acme', acme.id);
    const global = await criarPerfil('viewer', null);
    await ctx.prisma.tenantMembership.create({
      data: { userId: user.id, tenantId: acme.id, role: 'gerente', profileId: daAcme.id },
    });
    // ⚠️ `viewer` é GLOBAL de propósito. Se este teste apontasse
    // `users.profile_id` para o perfil da Acme, o `null` do bucket global
    // viria do filtro de DONO e não do `deletedAt` — o teste passaria pelo
    // motivo errado, que é a forma mais barata de um guard virá decorativo.
    // O filtro de DONO do bucket global tem spec próprio, acima.
    await ctx.prisma.user.update({ where: { id: user.id }, data: { profileId: global.id } });

    await expect(repo.findProfileId(user.id, acme.id)).resolves.toBeNull();
    await expect(repo.findProfileId(user.id, null)).resolves.toBeNull();
  });

  it('countByProfile conta a membership de qualquer empresa (a trava é global)', async () => {
    await cleanDatabase(ctx.prisma);
    const user = await criarUser('conta@acme.dev');
    const acme = await ctx.prisma.tenant.create({ data: { name: 'Acme', slug: 'acme' } });
    const globex = await ctx.prisma.tenant.create({ data: { name: 'Globex', slug: 'globex' } });
    const daAcme = await criarPerfil('gestor-acme', acme.id);
    const daGlobex = await criarPerfil('gestor-globex', globex.id);

    await ctx.prisma.tenantMembership.create({
      data: { userId: user.id, tenantId: acme.id, role: 'gerente', profileId: daAcme.id },
    });
    await ctx.prisma.tenantMembership.create({
      data: { userId: user.id, tenantId: globex.id, role: 'member', profileId: daAcme.id },
    });

    // 2: a mesma conta veste `daAcme` nas DUAS empresas. Se `countByProfile`
    // filtrasse por `tenantId`, a empresa B "não usaria" o perfil e a trava de
    // `deletar` o apagaria debaixo dos pés da empresa A.
    await expect(repo.countByProfile(daAcme.id)).resolves.toBe(2);
    await expect(repo.countByProfile(daGlobex.id)).resolves.toBe(0);
  });
});

/**
 * pt-BR (onboarding de empresa, 2026-10-22): o PAPEL da membership mudou de
 * nome, e o dado gravado ANTES do rename ficou com o nome VELHO.
 *
 * POR QUE ESTE BLOCO EXISTE
 * `tenancy.use-cases.ts` exige `role = 'gerente'` para convidar alguém, e o
 * `provisionarEmpresaPropria` que existia em `main` gravava `role = 'owner'`.
 * Sem backfill, o dono de uma empresa criada ANTES do rename recebe 403 ao
 * convidar — o mesmo dono que antes podia, e que a empresa sem dono não pode
 * substituir. Um rename de VALOR que quebra dado gravado é backfill (a linha
 * "RENAME COLUMN que quebra dado já gravado" da convenção `migracao-de-dados.md`
 * §1), e o backfill é uma migration.
 *
 * O QUE ESTE TESTE PROVA (e o que ele NÃO prova)
 * A migration é um ARQUIVO, e o que se prova é que o arquivo, aplicado no
 * banco, converte a linha legada. Por isso o teste LÊ o `.sql` do disco e o
 * executa contra o Postgres: uma cópia do `UPDATE` dentro do spec mediria a
 * cópia, e não o artefato — a classe "spec que re-deriva o esperado da
 * implementação".
 *
 * ⚠️ `setupTestDatabase` já aplicou TODAS as migrations — inclusive esta —
 * num banco que NÃO tinha linha legada. Por isso o `UPDATE` não teria nada
 * para converter, e a linha legada é plantada DEPOIS, à mão, para que o
 * arquivo tenha o que transformar. É a diferença entre "a migration roda sem
 * erro" (medido pela suíte inteira, que sobe o banco com ela) e "a migration
 * FAZ O QUE PROMETE" (medido aqui).
 */
describe('O rename do papel e o backfill (2026-10-22)', () => {
  let ctx: TestContext;
  let memberships: PrismaTenantMembershipRepository;

  const CAMINHO_DA_MIGRATION = resolve(
    specDir,
    '../../../../../prisma/migrations/20261022000001_papel_gerente_legado/migration.sql',
  );

  beforeAll(async () => {
    ctx = await setupTestDatabase();
    memberships = new PrismaTenantMembershipRepository(ctx.prisma as never);
  });

  afterAll(async () => {
    await ctx.stop();
  });

  it('a membership com o papel VELHO ("owner") volta a ser "gerente"', async () => {
    await cleanDatabase(ctx.prisma);
    const user = await ctx.prisma.user.create({
      data: {
        id: randomUUID(),
        email: 'legado@acme.dev',
        name: 'Dona',
        passwordHash: 'x',
      },
    });
    const acme = await ctx.prisma.tenant.create({ data: { name: 'Acme', slug: 'acme' } });

    // A linha LEGADA, como o `provisionarEmpresaPropria` de `main` gravava.
    await ctx.prisma.tenantMembership.create({
      data: { userId: user.id, tenantId: acme.id, role: 'owner' },
    });

    // A PREMISSA, medida: a linha existe e tem o papel VELHO. Sem esta
    // conferência, a asserção final seria verde por AUSÊNCIA DE DADO — o
    // mesmo vácuo que um spec sem fixture mede em silêncio.
    await expect(memberships.findRole(user.id, acme.id)).resolves.toBe('owner');

    // O artefato, lido do disco e aplicado no banco de verdade.
    const sql = await readFile(CAMINHO_DA_MIGRATION, 'utf8');
    const afetadas = await ctx.prisma.$executeRawUnsafe(sql);

    // O `UPDATE` afetou EXATAMENTE a linha legada — e não zero (a migration
    // vazia, que passaria no "sem erro"), e não duas (a que apaga papel de
    // alguém que não deveria).
    expect(afetadas).toBe(1);
    await expect(memberships.findRole(user.id, acme.id)).resolves.toBe('gerente');
  });

  it('a membership que NÃO é legada não é tocada', async () => {
    await cleanDatabase(ctx.prisma);
    const user = await ctx.prisma.user.create({
      data: {
        id: randomUUID(),
        email: 'convidade@acme.dev',
        name: 'Convidado',
        passwordHash: 'x',
      },
    });
    const acme = await ctx.prisma.tenant.create({ data: { name: 'Acme', slug: 'acme' } });
    await ctx.prisma.tenantMembership.create({
      data: { userId: user.id, tenantId: acme.id, role: 'member' },
    });

    const sql = await readFile(CAMINHO_DA_MIGRATION, 'utf8');
    const afetadas = await ctx.prisma.$executeRawUnsafe(sql);

    // O backfill é idempotente E não é indiscriminado: o convidado, que
    // entrou por convite, continua `member`.
    expect(afetadas).toBe(0);
    await expect(memberships.findRole(user.id, acme.id)).resolves.toBe('member');
  });
});
