// apps/api/src/modules/tenancy/infrastructure/persistence/prisma-tenant-onboarding.repository.spec.ts
//
// pt-BR (2026-10-22): a tradução do P2002 NÃO pode depender do nome da
// constraint.
//
// ── O DEFEITO QUE ESTE ARQUIVO EXISTE PARA PEGAR ────────────────────────────
//
// O `catch` do `provisionarEmpresaPropria` (e das outras escritas) decidia
// "colidiu o slug ou o e-mail?" lendo `erro.meta.target` — que é o nome do
// CAMPO, e que o Prisma devolve **NULL** quando o Postgres tem a unicidade
// como ÍNDICE e não como constraint, que é como as migrations deste repo
// criam o `@unique` do `users.email`.
//
// MEDIDO 2026-10-22 contra o banco local (o mesmo shape do de produção): o
// `meta` do P2002 é `{"modelName":"User","target":null}` e a mensagem é
// "Unique constraint failed on the (not available)". O `catch` casava com a
// string VAZIA, o P2002 subia cru, e o cadastro com e-mail repetido respondia
// **500** — "banco fora do ar" num pedido que era um CONFLITO (409).
//
// ⚠️ A SUÍTE DE INTEGRAÇÃO NÃO PEGAVA: no banco de testcontainers o `target`
// vem preenchido, e o mesmo código passava verde. Um discriminador que só
// funciona num dos dois bancos é pior do que nenhum.
//
// ── POR QUE ESTE ARQUIVO É UNITÁRIO E NÃO INTEGRAÇÃO ───────────────────────
//
// Porque o que está sob teste é a FORMA do erro que o Prisma devolve — e a
// forma que o banco de produção devolve é justamente a que o testcontainers
// NÃO produz. Um spec de integração mediria o banco de testcontainers (onde
// `target` vem preenchido) e passaria verde com o defeito de pé.
//
// ── O QUE ESTE ARQUIVO NÃO AFIRMA ───────────────────────────────────────────
//
// Que o Postgres devolva `target: null` em TODO banco. Ele devolve em uns e
// não em outros. O que este arquivo afirma é a única coisa que precisa ser
// verdade em QUALQUER um deles: a tradução não LÊ o nome da constraint.

import { describe, it, expect, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';

import { PrismaTenantOnboardingRepository } from './prisma-tenant-onboarding.repository.js';
import type { AssinaturaDeMembership } from '../../../../shared/infrastructure/prisma/assinatura-de-membership.js';
import { EmailAlreadyInUseException } from '../../../users/domain/exceptions/user.exceptions.js';
import {
  ConviteJaEmitidoException,
  EmpresaJaExisteException,
} from '../../domain/exceptions/tenancy.exceptions.js';

/**
 * O P2002 como o banco de PRODUÇÃO devolve: `target` nulo.
 *
 * ⚠️ O `target: null` é o ponto inteiro do arquivo — é o que o `meta` traz
 * quando o Postgres tem a unicidade como índice, e é o que quebrava o `catch`.
 */
function p2002(modelName: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the (not available)',
    { code: 'P2002', clientVersion: '6.19.3', meta: { modelName, target: null } },
  );
}

/** O `tx` de mentira: só o que o repositório toca nos caminhos medidos. */
function txFalso() {
  return {
    $queryRaw: vi.fn(async () => []),
    tenant: { create: vi.fn() },
    user: { create: vi.fn() },
    invitation: { create: vi.fn(), findUnique: vi.fn() },
  };
}

type Tx = ReturnType<typeof txFalso>;

function clienteDe(tx: Tx): PrismaClient {
  return {
    $transaction: vi.fn(async (fn: (t: Tx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaClient;
}

function assinaturaFalsa(): AssinaturaDeMembership {
  return { assinar: vi.fn(() => 'assinatura') } as unknown as AssinaturaDeMembership;
}

function usuario(email: string) {
  return {
    id: '0190a8b6-0000-7000-8000-000000000001',
    nome: 'Ana',
    email,
    senhaHash: 'x',
    createdAt: new Date('2026-10-22T12:00:00.000Z'),
  };
}

const EMPRESA = { nome: 'ACME', slug: 'acme' };

describe('PrismaTenantOnboardingRepository — a tradução do P2002', () => {
  it('slug repetido vira EMPRESA_JA_EXISTE (409), com o `meta` do P2002 vazio', async () => {
    const tx = txFalso();
    tx.tenant.create.mockRejectedValue(p2002('Tenant'));
    const repo = new PrismaTenantOnboardingRepository(clienteDe(tx), assinaturaFalsa());

    await expect(
      repo.provisionarEmpresaPropria(usuario('ana@acme.dev'), EMPRESA),
    ).rejects.toBeInstanceOf(EmpresaJaExisteException);
  });

  it('e-mail repetido vira EMAIL_IN_USE (409), com o `meta` do P2002 vazio', async () => {
    const tx = txFalso();
    tx.tenant.create.mockResolvedValue({ id: 't1', slug: 'acme' });
    tx.user.create.mockRejectedValue(p2002('User'));
    const repo = new PrismaTenantOnboardingRepository(clienteDe(tx), assinaturaFalsa());

    await expect(
      repo.provisionarEmpresaPropria(usuario('ana@acme.dev'), EMPRESA),
    ).rejects.toBeInstanceOf(EmailAlreadyInUseException);
  });

  it('e-mail repetido pela CORRIDA também vira EMAIL_IN_USE (409)', async () => {
    // A mesma escrita, agora pela outra porta: o `tx.user.create` dentro do
    // `consumirEEntrar` (o cadastro por convite). A tradução mora NO LUGAR da
    // escrita, e as duas portas a compartilham.
    const tx = txFalso();
    tx.invitation.findUnique.mockResolvedValue({
      id: 'i1',
      tenantId: 't1',
      email: 'ana@acme.dev',
      role: 'member',
      acceptedAt: null,
      expiresAt: null,
    });
    tx.user.create.mockRejectedValue(p2002('User'));
    const repo = new PrismaTenantOnboardingRepository(clienteDe(tx), assinaturaFalsa());

    await expect(
      repo.criarContaPorConvite({ userId: 'u1', invitationId: 'i1' }, usuario('ana@acme.dev')),
    ).rejects.toBeInstanceOf(EmailAlreadyInUseException);
  });

  it('convite repetido na MESMA empresa vira CONVITE_JA_EMITIDO (409)', async () => {
    const tx = txFalso();
    tx.invitation.create.mockRejectedValue(p2002('Invitation'));
    // A pergunta que decide: o convite para (empresa, e-mail) EXISTE?
    tx.invitation.findUnique.mockResolvedValue({
      id: 'i1',
      tenantId: 't1',
      email: 'ana@acme.dev',
      role: 'member',
      acceptedAt: null,
      expiresAt: null,
    });
    const repo = new PrismaTenantOnboardingRepository(clienteDe(tx), assinaturaFalsa());

    await expect(
      repo.emitirConvite({
        tenantId: 't1',
        email: 'ana@acme.dev',
        role: 'member',
        token: 'a'.repeat(64),
        expiresAt: new Date('2026-10-29T12:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(ConviteJaEmitidoException);
  });

  it('a colisão de TOKEN continua crua — e NÃO vira "convite já emitido"', async () => {
    // A distinção que o nome da constraint fazia, e que a LEITURA também faz:
    // se o convite para (empresa, e-mail) NÃO existe, o que colidiu foi o
    // `token` — e o token está no corpo da resposta de quem emite, então
    // dizer "convite já emitido" apontaria o cliente para o campo errado.
    const tx = txFalso();
    tx.invitation.create.mockRejectedValue(p2002('Invitation'));
    tx.invitation.findUnique.mockResolvedValue(null);
    const repo = new PrismaTenantOnboardingRepository(clienteDe(tx), assinaturaFalsa());

    await expect(
      repo.emitirConvite({
        tenantId: 't1',
        email: 'ana@acme.dev',
        role: 'member',
        token: 'a'.repeat(64),
        expiresAt: new Date('2026-10-29T12:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });
});
