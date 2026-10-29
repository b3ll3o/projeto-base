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
//   5. **AS DUAS LISTAS SAEM DA MESMA TRANSAÇÃO** (2026-10-29) — é o que
//      garante que o inventário conte a mesma história dos dois lados.
//   6. **O PRAZO DA TRANSAÇÃO É DECLARADO** (2026-10-29) — o default do Prisma
//      (5 s) é implícito, e a leitura que cresce com a base inteira é a que
//      estoura nele (P2028 → 500).
//   7. **A ORDEM É ESTÁVEL** (2026-10-29) — `name` não é única, e a relação
//      aninhada não herda o `orderBy` do nível de cima.
//
// A integração com Postgres de verdade está no
// `prisma-admin-tenancy.repository.integration.spec.ts`: o unitário confere o
// `where` entregue ao Prisma, e o mock NÃO avalia `where` — o filtro só vira
// fato contra o banco.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaAdminTenancyRepository } from './prisma-admin-tenancy.repository.js';

/**
 * #118: o bucket de SISTEMA é aberto na CREDENCIAL de sistema — que vem do
 * ambiente (`SYSTEM_DATABASE_URL`), e não do client que o repositório recebe.
 * Numa unit test não há `SYSTEM_DATABASE_URL`, e a costura é mockada: o
 * cliente de SISTEMA é o MESMO duplo do repositório — que é o que preserva as
 * asserções deste arquivo (elas leem `prisma.tenant.findMany`, o mesmo
 * `vi.fn` que o `tx` usa).
 *
 * ⚠️ A costura é mockada AQUI, e não no código de produção: um setter global
 * em `escopo.ts` seria um global mutável no fonte, e um global mutável no
 * fonte é um caminho para o código de produção depender do estado do teste.
 */
const sistema = vi.hoisted(() => ({
  cliente: null as unknown,
  /** Quantas vezes o repositório ABRIU uma transação de escopo. */
  aberturas: 0,
  /** O `transactionOptions` da ÚLTIMA abertura. */
  opcoes: undefined as { timeout?: number; maxWait?: number } | undefined,
}));
vi.mock('../../../../shared/infrastructure/prisma/escopo.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../../shared/infrastructure/prisma/escopo.js')>();
  const { ESCOPO_DE_SISTEMA } =
    await import('../../../../shared/infrastructure/prisma/papel-de-runtime.js');
  return {
    ...original,
    // A `comEscopoDeSistema` REAL abre o escopo DENTRO da transação, e é esse
    // `set_config` que a asserção "abre o escopo de SISTEMA" deste arquivo
    // mede. Um mock que só executasse o `fn` deixaria essa asserção sem
    // sujidade — e ela passaria com o repositório errado.
    comEscopoDeSistema: (
      fn: (tx: never) => Promise<unknown>,
      opcoes?: { timeout?: number; maxWait?: number },
    ) => {
      sistema.aberturas += 1;
      sistema.opcoes = opcoes;
      return (
        sistema.cliente as {
          $transaction: (f: (tx: never) => Promise<unknown>) => Promise<unknown>;
        }
      ).$transaction(async (tx: never) => {
        await original.abrirEscopo(tx, ESCOPO_DE_SISTEMA);
        return fn(tx);
      });
    },
  };
});

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

describe('PrismaAdminTenancyRepository.listarInventario', () => {
  let prisma: ReturnType<typeof prismaFalso>;
  let repo: PrismaAdminTenancyRepository;

  beforeEach(() => {
    prisma = prismaFalso();
    // O cliente de SISTEMA é o duplo do repositório — a costura do #118.
    sistema.cliente = prisma;
    sistema.aberturas = 0;
    sistema.opcoes = undefined;
    repo = new PrismaAdminTenancyRepository();
  });

  it('abre o escopo de SISTEMA — a lista atravessa empresas', async () => {
    await repo.listarInventario();

    expect(escoposAbertos(prisma)).toEqual(['*']);
  });

  // ⚠️ O DENTE DO ACHADO "DUAS TRANSAÇÕES": as DUAS listas precisam contar a
  // mesma história, e isso só é garantível se saírem do MESMO instante.
  it('as DUAS listas saem da MESMA transação — uma só abertura', async () => {
    await repo.listarInventario();

    expect(sistema.aberturas).toBe(1);
  });

  // ⚠️ E o prazo é DECLARADO: o default do Prisma (5 s) é implícito, e uma
  // leitura que cresce com a base inteira estoura nele com P2028 → 500.
  it('declara o PRAZO da transação — o default implícito do Prisma estoura a leitura', async () => {
    await repo.listarInventario();

    expect(sistema.opcoes?.timeout).toBe(15_000);
    expect(sistema.opcoes?.maxWait).toBe(5_000);
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

    const { empresas } = await repo.listarInventario();

    expect(empresas).toEqual([
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
    await repo.listarInventario();

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

    const { empresas } = await repo.listarInventario();

    expect(empresas[0]!.membros.map((m) => m.perfil)).toEqual([null, null]);
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

    const { empresas } = await repo.listarInventario();

    expect(empresas[0]!.membros[0]!.perfil).toBe('admin');
  });

  it('a empresa sem membro aparece com lista vazia', async () => {
    prisma.tenant.findMany.mockResolvedValue([
      { id: ACME, name: 'ACME', slug: 'acme', memberships: [] },
    ]);

    const { empresas } = await repo.listarInventario();

    expect(empresas).toEqual([{ id: ACME, nome: 'ACME', slug: 'acme', membros: [] }]);
  });

  // ⚠️ A ORDEM É FUNCIONAL, e `name` NÃO é única: sem desempate, duas
  // empresas com o mesmo nome saem em qualquer ordem — e a ordem PODE mudar
  // entre chamadas (seq scan vs index scan, VACUUM).
  it('a ordem das empresas desempata pelo id — `name` não é única', async () => {
    await repo.listarInventario();

    const { orderBy } = prisma.tenant.findMany.mock.calls[0]![0] as {
      orderBy: unknown;
    };
    expect(orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }]);
  });

  // ⚠️ E a relação ANINHADA não herda o `orderBy` do nível de cima: sem um
  // `orderBy` próprio, a ordem dos MEMBROS sai na ordem que a query interna
  // produzir (heap/índice) — que não é garantida e muda depois de qualquer
  // UPDATE em `tenant_memberships`.
  it('a ordem dos MEMBROS é declarada na relação aninhada', async () => {
    await repo.listarInventario();

    const { select } = prisma.tenant.findMany.mock.calls[0]![0] as {
      select: { memberships: { orderBy: unknown } };
    };
    expect(select.memberships.orderBy).toEqual([{ user: { name: 'asc' } }, { id: 'asc' }]);
  });

  it('a conta apagada fica fora da lista de usuários', async () => {
    await repo.listarInventario();

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

    const { usuarios } = await repo.listarInventario();

    expect(usuarios).toEqual([
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

    const { usuarios } = await repo.listarInventario();

    expect(usuarios).toEqual([
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

    const { usuarios } = await repo.listarInventario();

    expect(usuarios[0]!.empresas[0]!.perfil).toBeNull();
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

    const { usuarios } = await repo.listarInventario();

    expect(usuarios[0]!.empresas.map((e) => e.perfil)).toEqual(['coordenador', 'admin']);
  });

  it('a ordem dos usuários desempata pelo id — `name` não é única', async () => {
    await repo.listarInventario();

    const { orderBy } = prisma.user.findMany.mock.calls[0]![0] as {
      orderBy: unknown;
    };
    expect(orderBy).toEqual([{ name: 'asc' }, { id: 'asc' }]);
  });

  it('a ordem das EMPRESAS de um usuário é declarada na relação aninhada', async () => {
    await repo.listarInventario();

    const { select } = prisma.user.findMany.mock.calls[0]![0] as {
      select: { memberships: { orderBy: unknown } };
    };
    expect(select.memberships.orderBy).toEqual([{ tenant: { name: 'asc' } }, { id: 'asc' }]);
  });
});
