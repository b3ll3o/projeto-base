// apps/api/src/modules/tenancy/infrastructure/persistence/prisma-tenant-membership.repository.spec.ts
//
// pt-BR (Fase 4 — tenancy, 2026-10-16): a resolução de perfil por empresa.
//
// O QUE ESTES TESTES SEGURAM, e por quê: a Fase 3 entregou o `tenantId` na
// fronteira e a chave de cache por empresa, mas o perfil efetivo ainda vinha
// de `users.profile_id` — GLOBAL. Este repositório é o ponto onde isso muda.
//
// A propriedade que não pode faltar é a DONA DO PERFIL: um `profile_id` que
// aponte para o perfil de outra empresa tem de resolver `null`. É
// verificável de duas formas, e as duas estão aqui de propósito:
//   - aqui, unitário, conferindo o `where` entregue ao Prisma;
//   - em `tenancy-migration.integration.spec.ts`, contra Postgres de verdade.
// A unitária pega a intenção errada no mesmo commit; a integração pega o
// `where` certo que o banco ignora.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaTenantMembershipRepository } from './prisma-tenant-membership.repository.js';

/**
 * #118: o bucket de SISTEMA e' aberto na CREDENCIAL de sistema — e a
 * credencial vem do ambiente, nao do client que o repositorio recebe. Numa
 * unit test nao ha `SYSTEM_DATABASE_URL`, e a costura e' mockada para usar o
 * MESMO duplo — que e' o que preserva as assercoes deste arquivo (elas leem
 * `prisma.tenantMembership.updateMany`, o mesmo `vi.fn` que o `tx` usa).
 *
 * ⚠️ A costura e' mockada AQUI, e nao no codigo de producao: um setter
 * global em `escopo.ts` seria um global mutavel no fonte, e um global
 * mutavel no fonte e' um caminho para o codigo de producao depender do
 * estado do teste.
 */
const sistema = vi.hoisted(() => ({
  cliente: null as unknown,
  escopo: '*',
}));
vi.mock('../../../../shared/infrastructure/prisma/escopo.js', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../../../shared/infrastructure/prisma/escopo.js')>();
  return {
    ...original,
    comEscopoDeSistema: (fn: (tx: never) => Promise<unknown>) =>
      (sistema.cliente as { $transaction: (f: typeof fn) => Promise<unknown> }).$transaction(fn),
    // #118: `comEscopoDeEmpresa` escolhe a CREDENCIAL pelo `tenantId` — e
    // `tenantId` nulo e' o bucket de SISTEMA. E' a `comEscopoDeEmpresa` que e'
    // mockada (e nao a `comEscopoDeSistema`): a primeira chama a segunda pelo
    // LIGAMENTO LOCAL do modulo, e um mock do export nao intercepta essa
    // chamada interna.
    comEscopoDeEmpresa: (async (
      prisma: never,
      tenantId: string | null,
      fn: (tx: never) => Promise<unknown>,
    ) => {
      if (tenantId !== null) {
        // o `fn` do duplo e' `(tx: never) => ...`: o `never` e' o que o torna
        // assignavel a qualquer `tx`, e o cast resolve a incompatibilidade do
        // parametro generico do `comEscopo`.
        return original.comEscopo(prisma, original.escopoDoTenant(tenantId), fn as never);
      }
      const cliente = sistema.cliente as {
        $transaction: (f: (tx: never) => Promise<unknown>) => Promise<unknown>;
      } | null;
      if (cliente === null) throw new Error('a spec nao definiu o cliente de SISTEMA');
      return cliente.$transaction(async (tx: never) => {
        await original.abrirEscopo(tx, sistema.escopo);
        return fn(tx);
      });
    }) as unknown as typeof original.comEscopoDeEmpresa,
  };
});

const USER = '0190a8b6-0000-4000-8000-00000000000a';
const ACME = '0190a8b6-0000-4000-8000-0000000000ac';
const PERFIL = '0190a8b6-0000-4000-8000-0000000000f1';

/** Prisma de mentira que só registra o `where` — ver nota sobre teeth no fim. */
function prismaFalso() {
  const duplo = {
    tenantMembership: {
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    // Fase 6: o pré-acerto de DONA lê o perfil antes de escrever.
    profile: { findFirst: vi.fn().mockResolvedValue({ id: PERFIL }) },
    user: { findFirst: vi.fn().mockResolvedValue(null) },
    // pt-BR (Fase 9 — RLS): o escopo é aberto por `set_config`, que é tagged
    // template. Resolver vazio é o comportamento do Postgres para um SELECT
    // que só executa um side effect.
    $queryRaw: vi.fn().mockResolvedValue([]),
  };
  return Object.assign(duplo, {
    // O `tx` é o PRÓPRIO duplo, e não uma cópia: as asserções do arquivo leem
    // `prisma.tenantMembership.updateMany`, que é o mesmo `vi.fn` que o `tx`
    // usa. Um `tx` separado obrigaria cada asserção a virar `tx.…` e o teste
    // passaria a medir um duplo que o repositório nunca vê.
    $transaction: vi.fn(async (fn: (tx: typeof duplo) => Promise<unknown>) => fn(duplo)),
  });
}

/** Os escopos que o repositório pediu ao banco: `set_config('app.tenant_id', …, true)`. */
function escoposAbertos(prisma: ReturnType<typeof prismaFalso>): string[] {
  return prisma.$queryRaw.mock.calls.map((chamada) => chamada[2] as string);
}

describe('PrismaTenantMembershipRepository.findProfileId', () => {
  let prisma: ReturnType<typeof prismaFalso>;
  let repo: PrismaTenantMembershipRepository;

  beforeEach(() => {
    prisma = prismaFalso();
    sistema.cliente = prisma;
    repo = new PrismaTenantMembershipRepository(prisma as never);
  });

  it('com empresa, resolve pela membership E exige que o perfil seja dela (ou global)', async () => {
    await repo.findProfileId(USER, ACME);

    const { where } = prisma.tenantMembership.findFirst.mock.calls[0]![0] as {
      where: Record<string, unknown>;
    };
    expect(where['userId']).toBe(USER);
    expect(where['tenantId']).toBe(ACME);
    // Membership sem perfil atribuído não pode devolver perfil nenhum: sem isto,
    // `profileId: null` resolveria o perfil "de sistema" e um convite aceito
    // nasceria com privilégio.
    expect(where['profileId']).toEqual({ not: null });
    // ⚠️ A propriedade de isolamento: o perfil tem de ser DAQUELA empresa ou
    // global. Sem este filtro, apontar `profile_id` para o perfil da vizinha
    // concede as permissões dela — e nada mais denuncia.
    expect(where['profile']).toEqual({ OR: [{ tenantId: null }, { tenantId: ACME }] });
    // A membership SOBREVIVE ao soft-delete do usuário. Sem este filtro, uma
    // conta apagada com access token ainda válido (15 min) voltaria a ter
    // permissões na empresa — o fail-closed do bucket `null` ficaria só pela
    // metade, e o defeito só apareceria como "usuário deletado ainda entra".
    expect(where['user']).toEqual({ deletedAt: null });
  });

  it('devolve o profileId da membership', async () => {
    prisma.tenantMembership.findFirst.mockResolvedValue({ profileId: PERFIL });
    await expect(repo.findProfileId(USER, ACME)).resolves.toBe(PERFIL);
  });

  it('membership sem perfil (convite aceito) resolve null', async () => {
    // O `findFirst` devolvendo `null` é o banco respondendo "nenhuma membership
    // casou"; o contrato é que isso vire perfil NENHUM, não perfil de sistema.
    await expect(repo.findProfileId(USER, ACME)).resolves.toBeNull();
  });

  it('sem empresa, cai no bucket GLOBAL (users.profile_id) e ignora a membership', async () => {
    prisma.user.findFirst.mockResolvedValue({ profileId: PERFIL });

    await expect(repo.findProfileId(USER, null)).resolves.toBe(PERFIL);

    // ⚠️ O filtro `deletedAt` é o fail-closed: usuário soft-deleted precisa
    // resolver `null`, senão a conta apagada continua autorizando até o TTL.
    // E `profile: { is: { tenantId: null } }` é a checagem de DONO do MESMO
    // jeito que no ramo por empresa (revisão v1.5.0, achado 2: só um dos dois
    // ramos a fazia, e o outro devolvia `users.profile_id` cru).
    expect(prisma.user.findFirst.mock.calls[0]![0]).toMatchObject({
      where: { id: USER, deletedAt: null, profile: { is: { tenantId: null } } },
    });
    expect(prisma.tenantMembership.findFirst).not.toHaveBeenCalled();
  });

  it('usuário que não existe resolve null, não exception', async () => {
    await expect(
      repo.findProfileId('0190a8b6-0000-4000-8000-00000000dead', null),
    ).resolves.toBeNull();
  });

  // ─── Por que o filtro de DONO não é vazoio ─────────────────────────────────
  //
  // A asserção acima compara `where['profile']` com o objeto inteiro. Se o
  // filtro saísse do código, o teste fica vermelho — MAS só porque o objeto
  // esperado é exato. O que prova que a propriedade importa: plantar a
  // membership de GLOBEX apontando para o perfil da ACME e pedir o perfil
  // efetivo na ACME tem de dar `null`. É o que o teste de integração mede
  // contra Postgres; aqui o limite é honesto — um `findFirst` de mentira não
  // avalia `where`, então este arquivo prova a INTENÇÃO, não o efeito.
});

describe('PrismaTenantMembershipRepository.countByProfile', () => {
  it('conta as memberships de qualquer empresa que vestem o perfil', async () => {
    const prisma = prismaFalso();
    // #118: este teste cria o proprio duplo (nao usa o do `beforeEach`), e o
    // bucket de sistema e' aberto na CREDENCIAL de sistema — entao o duplo
    // do sistema tem de ser ESTE.
    sistema.cliente = prisma;
    prisma.tenantMembership.count.mockResolvedValue(3);

    await expect(
      new PrismaTenantMembershipRepository(prisma as never).countByProfile(PERFIL),
    ).resolves.toBe(3);
    // Sem `tenantId`: a trava de `deletar` é global — um perfil usado na
    // empresa B não pode ser apagado só porque a empresa A não usa.
    expect(prisma.tenantMembership.count.mock.calls[0]![0]).toEqual({
      where: { profileId: PERFIL },
    });
  });
});

// pt-BR (Fase 6 — tenancy): a ESCRITA do perfil por empresa. É a peça que
// faltava desde a Fase 2 — até aqui ninguém escrevia `tenant_memberships.
// profile_id` fora do onboarding.
describe('PrismaTenantMembershipRepository.atribuirPerfil', () => {
  let prisma: ReturnType<typeof prismaFalso>;
  let repo: PrismaTenantMembershipRepository;

  beforeEach(() => {
    prisma = prismaFalso();
    prisma.tenantMembership.updateMany.mockResolvedValue({ count: 1 });
    repo = new PrismaTenantMembershipRepository(prisma as never);
  });

  function whereDaUltimaEscrita(): Record<string, unknown> {
    const chamada = prisma.tenantMembership.updateMany.mock.calls.at(-1)![0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    return chamada.where;
  }

  it('grava a membership DAQUELA empresa e devolve true', async () => {
    await expect(repo.atribuirPerfil(USER, ACME, PERFIL)).resolves.toBe(true);
    // ⚠️ `profileId` e `profile` AUSENTES do `where`, de propósito: o `where`
    // de `updateMany` filtra a linha pelo valor ANTIGO (o `profileId` novo
    // nunca casaria) e a linha pertence à MEMBERSHIP, não ao perfil que entra.
    // A DONA é conferida antes, em `profile.findFirst`.
    expect(whereDaUltimaEscrita()).toEqual({
      userId: USER,
      tenantId: ACME,
      user: { deletedAt: null },
    });
    expect(prisma.profile.findFirst).toHaveBeenCalledWith({
      where: { id: PERFIL, OR: [{ tenantId: null }, { tenantId: ACME }] },
      select: { id: true },
    });
  });

  it('conta zero = false, para o chamador recusar em vez de responder 200 à toa', async () => {
    prisma.tenantMembership.updateMany.mockResolvedValue({ count: 0 });
    await expect(repo.atribuirPerfil(USER, ACME, PERFIL)).resolves.toBe(false);
  });

  // Remover não tem perfil para conferir DONA, então o pré-acerto nem roda.
  // Um filtro de DONA no caminho da remoção (relação to-one anulável) daria
  // `count` 0 e a remoção viraria recusa falso — o usuário nunca consegue
  // limpar o perfil que o próprio dono lhe deu.
  it('remover (profileId null) dispensa o pré-acerto de DONA, senão vira recusa falsa', async () => {
    await expect(repo.atribuirPerfil(USER, ACME, null)).resolves.toBe(true);
    const where = whereDaUltimaEscrita();
    expect(where).toEqual({ userId: USER, tenantId: ACME, user: { deletedAt: null } });
    expect(where).not.toHaveProperty('profile');
    expect(where).not.toHaveProperty('profileId');
    expect(prisma.profile.findFirst).not.toHaveBeenCalled();
  });

  // O port promete que o filtro de DONA mora AQUI, e não no chamador. Sem isto,
  // a única checagem é a R1 do use case, e um chamador novo a_contornaria em
  // silêncio — concede as permissões da empresa vizinha e nada denuncia.
  it('perfil de OUTRA empresa é recusado sem chegar a escrever', async () => {
    prisma.profile.findFirst.mockResolvedValue(null);
    await expect(repo.atribuirPerfil(USER, ACME, PERFIL)).resolves.toBe(false);
    expect(prisma.tenantMembership.updateMany).not.toHaveBeenCalled();
  });

  it('conta deletedAt: null no filtro — conta apagada com token vivo não muda de perfil', async () => {
    await repo.atribuirPerfil(USER, ACME, PERFIL);
    expect(whereDaUltimaEscrita()).toHaveProperty('user.deletedAt', null);
  });

  it('NUNCA escreve em outra empresa: o tenantId do `where` é o da chamada', async () => {
    await repo.atribuirPerfil(USER, ACME, PERFIL);
    expect(whereDaUltimaEscrita().tenantId).toBe(ACME);
  });

  // pt-BR (Fase 9 — RLS): o filtro do `where` acima é o filtro da APLICAÇÃO; a
  // policy do Postgres é a segunda linha, e ela só existe se o GUC
  // `app.tenant_id` estiver posto na sessão. Sem esta aserção o arquivo inteiro
  // fica verde com o escopo nunca aberto — que é o estado em que a policy
  // fail-closed devolve ZERO linhas e a escrita "some" sem erro nenhum.
  it('abre o escopo da empresa ANTES de escrever, e é a empresa da chamada', async () => {
    await repo.atribuirPerfil(USER, ACME, PERFIL);
    expect(escoposAbertos(prisma)).toEqual([ACME]);
    // Ordem: o `set_config` é a primeira coisa da transação, para que a
    // leitura de DONA e o `updateMany` já leiam a policy.
    expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.tenantMembership.updateMany.mock.invocationCallOrder[0]!,
    );
  });

  it('recusa o perfil alheio ANTES de abrir qualquer escopo', async () => {
    // O `findFirst` devolvendo `null` é o banco dizendo "não existe perfil
    // assim NAQUELA empresa" — com a policy posposta, a resposta vira
    // indistinguível de "perfil não existe". O pré-acerto de DONA tem de rodar
    // DENTRO do escopo da empresa que se quer tocar, nunca de `'*'`.
    prisma.profile.findFirst.mockResolvedValue(null);
    await expect(repo.atribuirPerfil(USER, ACME, PERFIL)).resolves.toBe(false);
    expect(escoposAbertos(prisma)).toEqual([ACME]);
  });
});
