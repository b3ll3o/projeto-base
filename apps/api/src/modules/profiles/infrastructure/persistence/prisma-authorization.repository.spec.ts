// apps/api/src/modules/profiles/infrastructure/persistence/prisma-authorization.repository.spec.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): smoke test do PrismaAuthorizationRepository.
// Cobre listByProfile/upsert/delete/syncForProfile/countByProfile.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaAuthorizationRepository } from './prisma-authorization.repository.js';
import { ESCOPO_DE_SISTEMA } from '../../../../shared/infrastructure/prisma/papel-de-runtime.js';

/**
 * #118 (a correção do LOGIN): `comEscopoDeEmpresa` escolhe a CREDENCIAL pelo
 * `tenantId` — e `tenantId` nulo é o bucket de SISTEMA, que é a CREDENCIAL de
 * sistema. Numa unit test não há `SYSTEM_DATABASE_URL`, e a costura é mockada
 * para usar o MESMO duplo — com o escopo aberto, que é o que as asserções deste
 * arquivo leem.
 *
 * ⚠️ A costura é mockada AQUI, e não no código de produção: um setter global
 * em `escopo.ts` seria um global mutável no fonte — e um global mutável no
 * fonte é um caminho para o código de produção depender do estado do teste.
 *
 * ⚠️ E é a `comEscopoDeEmpresa` que é mockada, e não a `comEscopoDeSistema`:
 * a primeira chama a segunda pelo LIGAMENTO LOCAL do módulo, e um mock do
 * export não intercepta essa chamada interna.
 */
const sistema = vi.hoisted(() => ({
  cliente: null as {
    $transaction: (f: (tx: never) => Promise<unknown>) => Promise<unknown>;
  } | null,
  escopo: '*',
}));
vi.mock('../../../../shared/infrastructure/prisma/escopo.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../../shared/infrastructure/prisma/escopo.js')>();
  return {
    ...original,
    comEscopoDeEmpresa: async (
      prisma: never,
      tenantId: string | null,
      fn: (tx: never) => Promise<unknown>,
    ) => {
      if (tenantId !== null) {
        return original.comEscopo(prisma, original.escopoDoTenant(tenantId), fn);
      }
      const cliente = sistema.cliente;
      if (cliente === null) throw new Error('a spec nao definiu o cliente de SISTEMA');
      return cliente.$transaction(async (tx: never) => {
        await original.abrirEscopo(tx, sistema.escopo);
        return fn(tx);
      });
    },
  };
});

class FakePrisma {
  #auths: Array<{
    id: string;
    profileId: string;
    permissionKey: string;
    createdAt: Date;
    updatedAt: Date;
    version: number;
  }> = [];
  #ids = 0;

  authorization = {
    findMany: async (args: { where: { profileId: string } }) =>
      this.#auths.filter((a) => a.profileId === args.where.profileId),
    findFirst: async (args: { where: { profileId: string; permissionKey: string } }) =>
      this.#auths.find(
        (a) => a.profileId === args.where.profileId && a.permissionKey === args.where.permissionKey,
      ) ?? null,
    count: async (args: { where: { profileId: string } }) =>
      this.#auths.filter((a) => a.profileId === args.where.profileId).length,
    upsert: async (args: {
      where: { profileId_permissionKey: { profileId: string; permissionKey: string } };
      update: Record<string, never>;
      create: { profileId: string; permissionKey: string };
    }) => {
      const existing = this.#auths.find(
        (a) =>
          a.profileId === args.where.profileId_permissionKey.profileId &&
          a.permissionKey === args.where.profileId_permissionKey.permissionKey,
      );
      if (existing !== undefined) {
        existing.updatedAt = new Date();
        return { ...existing };
      }
      const created = {
        id: `auth-${++this.#ids}`,
        profileId: args.create.profileId,
        permissionKey: args.create.permissionKey,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 0,
      };
      this.#auths.push(created);
      return { ...created };
    },
    delete: async (args: { where: { id: string } }) => {
      const idx = this.#auths.findIndex((a) => a.id === args.where.id);
      if (idx === -1) throw new Error('not found');
      this.#auths.splice(idx, 1);
      return {};
    },
    deleteMany: async (args: { where: { profileId: string; permissionKey?: string } }) => {
      const before = this.#auths.length;
      this.#auths = this.#auths.filter(
        (a) =>
          a.profileId !== args.where.profileId ||
          (args.where.permissionKey !== undefined && a.permissionKey !== args.where.permissionKey),
      );
      return { count: before - this.#auths.length };
    },
  };

  // pt-BR (Fase 9 — RLS): o repositório agora abre escopo em TODO acesso —
  // `authorizations` tem policy, e sem `app.tenant_id` a consulta volta vazia.

  async $transaction<T>(fn: (tx: FakePrisma) => Promise<T>): Promise<T> {
    return fn(this);
  }

  /**
   * O escopo abre por `set_config`, que é tagged template: `chunks[0]` é o
   * SQL e `chunks[1..]` são os valores interpolados — o escopo é o ÚLTIMO.
   */
  readonly $queryRaw = vi.fn().mockResolvedValue([]);

  /** Os escopos pedidos ao banco, em ordem. */
  escopos(): string[] {
    return this.$queryRaw.mock.calls.map((chamada) => chamada.at(-1) as string);
  }
}

describe('PrismaAuthorizationRepository', () => {
  let repo: PrismaAuthorizationRepository;
  let fake: FakePrisma;

  beforeEach(() => {
    fake = new FakePrisma();
    // #118: o bucket de SISTEMA e' a credencial de sistema — o duplo dela
    // e' o MESMO.
    sistema.cliente = fake as never;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repo = new PrismaAuthorizationRepository(fake as any);
  });

  it('listByProfile retorna vazio para profile sem authorizations', async () => {
    const result = await repo.listByProfile({ value: 'p-1' } as never, null);
    expect(result).toEqual([]);
  });

  it('upsert cria nova authorization', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const key = { value: 'users.read' } as any;
    await repo.upsert({
      profileId: { value: 'p-1' } as never,
      key,
      agora: new Date(),
      tenantId: null,
    });
    const list = await repo.listByProfile({ value: 'p-1' } as never, null);
    expect(list).toHaveLength(1);
  });

  it('upsert duplicado não cria segundo', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const key = { value: 'users.read' } as any;
    await repo.upsert({
      profileId: { value: 'p-1' } as never,
      key,
      agora: new Date(),
      tenantId: null,
    });
    await repo.upsert({
      profileId: { value: 'p-1' } as never,
      key,
      agora: new Date(),
      tenantId: null,
    });
    const list = await repo.listByProfile({ value: 'p-1' } as never, null);
    expect(list).toHaveLength(1);
  });

  it('delete remove authorization existente', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const key = { value: 'users.read' } as any;
    await repo.upsert({
      profileId: { value: 'p-1' } as never,
      key,
      agora: new Date(),
      tenantId: null,
    });
    await repo.delete({ profileId: { value: 'p-1' } as never, key, tenantId: null });
    const list = await repo.listByProfile({ value: 'p-1' } as never, null);
    expect(list).toHaveLength(0);
  });

  it('countByProfile retorna 0 quando vazio', async () => {
    const count = await repo.countByProfile({ value: 'p-1' } as never, null);
    expect(count).toBe(0);
  });

  // ─────────────── Fase 9 — o escopo é o motivo do resto existir ───────────────

  describe('todo acesso abre o escopo da sessão (Fase 9 — RLS)', () => {
    /**
     * `authorizations` não tem `tenant_id`: quem resolve a dona é a policy,
     * e ela só existe para quem tem `app.tenant_id` posto. Sem escopo a
     * consulta volta com ZERO linhas — o sintoma é "as permissões do perfil
     * sumiram", nenhum erro. Por isso a afirmação é sobre o ESCOPO PEDIDO, e
     * não sobre o retorno (que o duplo não filtra).
     */
    it('os quatro métodos abrem exatamente um escopo cada, com o tenantId recebido', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const key = { value: 'users.read' } as any;
      const perfil = { value: 'p-1' } as never;

      await repo.listByProfile(perfil, 't-acme');
      await repo.countByProfile(perfil, 't-acme');
      await repo.upsert({ profileId: perfil, key, agora: new Date(), tenantId: 't-acme' });
      await repo.delete({ profileId: perfil, key, tenantId: 't-acme' });

      // `toHaveLength(4)` segura a contagem; o `toEqual` segura o VALOR. Um
      // `toContain` passaria com os quatro virados para `'*'`.
      expect(fake.escopos()).toEqual(['t-acme', 't-acme', 't-acme', 't-acme']);
    });

    it('tenantId nulo abre o bucket de SISTEMA, e a empresa abre a empresa', async () => {
      // A assimetria que o `'*'` representa: `null` não é "sem escopo", é o
      // bucket que VÊ TUDO. Se `escopoDoTenant(null)` voltasse vazio, o
      // sistema parava de listar perfis de sistema.
      await repo.listByProfile({ value: 'p-1' } as never, null);
      await repo.listByProfile({ value: 'p-1' } as never, 't-globex');

      expect(fake.escopos()).toEqual([ESCOPO_DE_SISTEMA, 't-globex']);
    });
  });
});
