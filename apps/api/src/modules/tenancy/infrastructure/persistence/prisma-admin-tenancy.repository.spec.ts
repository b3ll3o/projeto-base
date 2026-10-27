// apps/api/src/modules/tenancy/infrastructure/persistence/prisma-admin-tenancy.repository.spec.ts
//
// pt-BR (visão de admin, 2026-10-22): o INVENTÁRIO do bucket de SISTEMA.
//
// O QUE ESTES TESTES SEGURAM, e por quê:
//
//   1. **O escopo é o de SISTEMA** (`'*'`), e não o da empresa do ator. A
//      leitura atravessa empresas, e o que a restringe é o filtro da query —
//      o mesmo motivo de `listarEmpresasDoUsuario`. Sem o escopo de SISTEMA,
//      a policy de RLS devolveria ZERO linhas e a tela do admin ficaria
//      vazia sem erro nenhum.
//   2. **O filtro de soft-delete** está no `where`, e não depois: a conta
//      apagada não aparece nem como membro nem como usuário.
//   3. **O perfil mostrado é o EFETIVO da membership** — e o perfil de OUTRA
//      empresa resolve `null`, como em `findProfileId`. Mostrar o slug do
//      perfil alheio diria que a pessoa veste um perfil que a API não resolve
//      para aquela empresa.
//   4. **A empresa sem membro aparece** com `members: []` — é um estado real.
//
// A integração com Postgres de verdade está no
// `prisma-admin-tenancy.repository.integration.spec.ts`: o unitário confere o
// `where` entregue ao Prisma, e o mock NÃO avalia `where` — o filtro só vira
// fato contra o banco.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaAdminTenancyRepository } from './prisma-admin-tenancy.repository.js';

const USUARIO = '0190a8b6-0000-4000-8000-00000000000a';
const ACME = '0190a8b6-0000-4000-8000-0000000000ac';
const GLOBEX = '0190a8b6-0000-4000-8000-0000000000b1';

/** Prisma de mentira que registra o que o repositório pediu. */
function prismaFalso() {
  const duplo = {
    tenant: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    // pt-BR (Fase 9 — RLS): o escopo é aberto por `set_config`, que é tagged
    // template. Resolver vazio é o comportamento do Postgres para um SELECT
    // que só executa um side effect.
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  return Object.assign(duplo, {
    $transaction: vi.fn(async (fn: (tx: typeof duplo) => Promise<unknown>) => fn(duplo)),
  });
}

/** Os escopos que o repositório pediu ao banco: `set_config('app.tenant_id', …, true)`. */
function escoposAbertos(prisma: ReturnType<typeof prismaFalso>): string[] {
  return prisma.$queryRaw.mock.calls.map((chamada) => chamada[2] as string);
}

describe('PrismaAdminTenancyRepository.listarEmpresasComMembros', () => {
  let prisma: ReturnType<typeof prismaFalso>;
  let repo: PrismaAdminTenancyRepository;

  beforeEach(() => {
    prisma = prismaFalso();
    repo = new PrismaAdminTenancyRepository(prisma as never);
  });

  it('abre o escopo de SISTEMA — a lista atravessa empresas', async () => {
    await repo.listarEmpresasComMembros();

    expect(escoposAbertos(prisma)).toEqual(['*']);
  });

  it('devolve nome, slug e os membros da empresa', async () => {
    prisma.tenant.findMany.mockResolvedValue([
      {
        id: ACME,
        name: 'ACME',
        slug: 'acme',
        memberships: [
          {
            role: 'gerente',
            user: { id: USUARIO, name: 'Ana', email: 'ana@acme.com' },
            profile: { slug: 'gerente', tenantId: ACME },
          },
        ],
      },
    ]);

    await expect(repo.listarEmpresasComMembros()).resolves.toEqual([
      {
        id: ACME,
        nome: 'ACME',
        slug: 'acme',
        membros: [
          { id: USUARIO, nome: 'Ana', email: 'ana@acme.com', role: 'gerente', perfil: 'gerente' },
        ],
      },
    ]);
  });

  it('a conta apagada some da lista de membros', async () => {
    await repo.listarEmpresasComMembros();

    const { select } = prisma.tenant.findMany.mock.calls[0]![0] as {
      select: { memberships: { where: Record<string, unknown> } };
    };
    // A membership sobrevive ao soft-delete do usuário: sem este filtro, a
    // empresa continuaria exibindo um membro que não existe mais.
    expect(select.memberships.where).toEqual({ user: { deletedAt: null } });
  });

  it('a membership sem perfil aparece com perfil nulo — nunca com perfil de outra empresa', async () => {
    prisma.tenant.findMany.mockResolvedValue([
      {
        id: ACME,
        name: 'ACME',
        slug: 'acme',
        memberships: [
          {
            role: 'member',
            user: { id: USUARIO, name: 'Ana', email: 'ana@acme.com' },
            profile: { slug: 'gerente-da-globex', tenantId: GLOBEX },
          },
          {
            role: 'member',
            user: { id: 'b', name: 'Bia', email: 'bia@acme.com' },
            profile: null,
          },
        ],
      },
    ]);

    const [empresa] = await repo.listarEmpresasComMembros();

    expect(empresa!.membros.map((m) => m.perfil)).toEqual([null, null]);
  });

  it('o perfil GLOBAL vale para qualquer empresa', async () => {
    prisma.tenant.findMany.mockResolvedValue([
      {
        id: ACME,
        name: 'ACME',
        slug: 'acme',
        memberships: [
          {
            role: 'member',
            user: { id: USUARIO, name: 'Ana', email: 'ana@acme.com' },
            profile: { slug: 'admin', tenantId: null },
          },
        ],
      },
    ]);

    const [empresa] = await repo.listarEmpresasComMembros();

    expect(empresa!.membros[0]!.perfil).toBe('admin');
  });

  it('a empresa sem membro aparece com lista vazia', async () => {
    prisma.tenant.findMany.mockResolvedValue([
      { id: ACME, name: 'ACME', slug: 'acme', memberships: [] },
    ]);

    await expect(repo.listarEmpresasComMembros()).resolves.toEqual([
      { id: ACME, nome: 'ACME', slug: 'acme', membros: [] },
    ]);
  });
});

describe('PrismaAdminTenancyRepository.listarUsuariosComEmpresas', () => {
  let prisma: ReturnType<typeof prismaFalso>;
  let repo: PrismaAdminTenancyRepository;

  beforeEach(() => {
    prisma = prismaFalso();
    repo = new PrismaAdminTenancyRepository(prisma as never);
  });

  it('abre o escopo de SISTEMA', async () => {
    await repo.listarUsuariosComEmpresas();

    expect(escoposAbertos(prisma)).toEqual(['*']);
  });

  it('a conta apagada fica fora da lista de usuários', async () => {
    await repo.listarUsuariosComEmpresas();

    const { where } = prisma.user.findMany.mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    expect(where).toEqual({ deletedAt: null });
  });

  it('devolve o usuário com as empresas a que ele pertence', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: USUARIO,
        name: 'Ana',
        email: 'ana@acme.com',
        memberships: [
          {
            role: 'gerente',
            tenant: { id: ACME, name: 'ACME', slug: 'acme' },
            profile: { slug: 'gerente', tenantId: ACME },
          },
          {
            role: 'member',
            tenant: { id: GLOBEX, name: 'GLOBEX', slug: 'globex' },
            profile: { slug: 'coordenador', tenantId: GLOBEX },
          },
        ],
      },
    ]);

    await expect(repo.listarUsuariosComEmpresas()).resolves.toEqual([
      {
        id: USUARIO,
        nome: 'Ana',
        email: 'ana@acme.com',
        empresas: [
          { id: ACME, nome: 'ACME', slug: 'acme', role: 'gerente', perfil: 'gerente' },
          {
            id: GLOBEX,
            nome: 'GLOBEX',
            slug: 'globex',
            role: 'member',
            perfil: 'coordenador',
          },
        ],
      },
    ]);
  });

  it('o usuário sem empresa nenhuma aparece com a lista vazia — a conta do admin do sistema', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: USUARIO, name: 'Admin', email: 'admin@admin.com', memberships: [] },
    ]);

    await expect(repo.listarUsuariosComEmpresas()).resolves.toEqual([
      { id: USUARIO, nome: 'Admin', email: 'admin@admin.com', empresas: [] },
    ]);
  });

  it('o perfil de outra empresa resolve nulo — como em findProfileId', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: USUARIO,
        name: 'Ana',
        email: 'ana@acme.com',
        memberships: [
          {
            role: 'member',
            tenant: { id: ACME, name: 'ACME', slug: 'acme' },
            profile: { slug: 'gerente-da-globex', tenantId: GLOBEX },
          },
        ],
      },
    ]);

    const [usuario] = await repo.listarUsuariosComEmpresas();

    expect(usuario!.empresas[0]!.perfil).toBeNull();
  });

  it('o perfil da própria empresa e o global valem', async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        id: USUARIO,
        name: 'Ana',
        email: 'ana@acme.com',
        memberships: [
          {
            role: 'member',
            tenant: { id: ACME, name: 'ACME', slug: 'acme' },
            profile: { slug: 'coordenador', tenantId: ACME },
          },
          {
            role: 'member',
            tenant: { id: GLOBEX, name: 'GLOBEX', slug: 'globex' },
            profile: { slug: 'admin', tenantId: null },
          },
        ],
      },
    ]);

    const [usuario] = await repo.listarUsuariosComEmpresas();

    expect(usuario!.empresas.map((e) => e.perfil)).toEqual(['coordenador', 'admin']);
  });
});
