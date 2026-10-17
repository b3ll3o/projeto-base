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
import {
  setupTestDatabase,
  cleanDatabase,
  type TestContext,
} from '../../../../../test/testcontainers-helper.js';

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
        data: { userId: user.id, tenantId: t1, role: 'owner' },
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
        data: { userId: user.id, tenantId: t, role: 'owner' },
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
        data: { tenantId: t, email: 'convidado@acme.dev', role: 'member' },
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
