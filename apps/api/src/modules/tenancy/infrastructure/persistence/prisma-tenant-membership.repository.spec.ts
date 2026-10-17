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

const USER = '0190a8b6-0000-4000-8000-00000000000a';
const ACME = '0190a8b6-0000-4000-8000-0000000000ac';
const PERFIL = '0190a8b6-0000-4000-8000-0000000000f1';

/** Prisma de mentira que só registra o `where` — ver nota sobre teeth no fim. */
function prismaFalso() {
  return {
    tenantMembership: { findFirst: vi.fn().mockResolvedValue(null), count: vi.fn() },
    user: { findFirst: vi.fn().mockResolvedValue(null) },
  };
}

describe('PrismaTenantMembershipRepository.findProfileId', () => {
  let prisma: ReturnType<typeof prismaFalso>;
  let repo: PrismaTenantMembershipRepository;

  beforeEach(() => {
    prisma = prismaFalso();
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
