// apps/api/src/modules/tenancy/application/tenancy.use-cases.spec.ts
//
// pt-BR (Fase 5 — tenancy, 2026-10-16): a D5 — "empresa própria OU convite".
//
// O QUE ESTES TESTES SEGURAM, e o que eles NÃO seguram:
//
// - seguram as DECISÕES: quem pode convidar, quando um convite deixa de
//   valer, e que a conta nova e a conta existente seguem caminhos distintos
//   (a primeira cria `users` + membership; a segunda só a membership);
// - NÃO seguram a transação. Que as escritas da empresa própria caiam
//   juntas é propriedade do ADAPTADOR, provada contra Postgres de verdade —
//   um `mock` não tem rollback para provar.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TenancyUseCases } from './tenancy.use-cases.js';
import type {
  TenantOnboardingPort,
  ConviteParaEmitir,
  ConviteParaAceitar,
  UsuarioParaProvisionar,
  ConvitePendente,
} from '../domain/ports/tenant-onboarding.port.js';
import type { TenantMembershipRepositoryPort } from '../domain/ports/tenant-membership-repository.port.js';
import {
  ConviteInvalidoException,
  NaoAdministraEmpresaException,
} from '../domain/exceptions/tenancy.exceptions.js';
import { User } from '../../users/domain/user.aggregate.js';
import { UserNotFoundException } from '../../users/domain/exceptions/user.exceptions.js';
import { PasswordHash } from '../../users/domain/value-objects/password-hash.vo.js';
import type { UserRepositoryPort } from '../../users/domain/ports/user-repository.port.js';

/** Formato argon2id válido — `PasswordHash.create` recusa placeholder. */
const HASH =
  '$argon2id$v=19$m=65536,p=4,t=3$J44jLmMJtt8G/XqkZPHYvw$Rcrvt5L6qcKGn7pGzs24Vd3sEgXO6opF59XFUlcALoY';

// ⚠️ UUID **v7**, não v4: `UserId.create` valida a versão, e `aceitarConvite`
// passa o id da conta por ele. Um id v4 aqui não falharia por um motivo do
// código sob teste — falharia pela fixture, que é o jeito mais caro de
// descobrir que o teste não testava nada.
const DONO = '01a1486a-5992-73be-a0e5-08c8e5753f62';
const VISITANTE = '01a1486a-5993-707b-99ed-293863285f19';
const ACME = '01a1486a-5993-733a-99fe-f70ef5803c3b';
const CONVITE = '01a1486a-5993-71e9-8051-348524f542d2';
const TOKEN = 'a'.repeat(64);

const AGORA = new Date('2026-10-19T12:00:00.000Z');
const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

function usuario(id: string, email: string): UsuarioParaProvisionar {
  return { id, nome: 'Ana', email, senhaHash: 'hash', createdAt: AGORA };
}

function convite(over: Partial<ConvitePendente> = {}): ConvitePendente {
  return {
    id: CONVITE,
    tenantId: ACME,
    email: 'ana@acme.com',
    role: 'member',
    acceptedAt: null,
    expiresAt: new Date('2026-10-26T12:00:00.000Z'),
    ...over,
  };
}

function userFalso(id: string, email: string): User {
  return User.restaurarDePersistencia({
    id,
    nome: 'Ana',
    email,
    senhaHash: PasswordHash.create(HASH),
    profileId: null,
    createdAt: AGORA,
    updatedAt: AGORA,
    version: 1,
    deletedAt: null,
  });
}

/** A mesma conta, mas apagada — o soft-delete que precisa ser fail-closed. */
function userApagado(id: string, email: string): User {
  return User.restaurarDePersistencia({
    id,
    nome: 'Ana',
    email,
    senhaHash: PasswordHash.create(HASH),
    profileId: null,
    createdAt: AGORA,
    updatedAt: AGORA,
    version: 1,
    deletedAt: AGORA,
  });
}

describe('TenancyUseCases — entrada na empresa (D5)', () => {
  let onboarding: {
    provisionarEmpresaPropria: ReturnType<typeof vi.fn>;
    abrirEmpresaParaUsuario: ReturnType<typeof vi.fn>;
    entrarPorConvite: ReturnType<typeof vi.fn>;
    criarContaPorConvite: ReturnType<typeof vi.fn>;
    emitirConvite: ReturnType<typeof vi.fn>;
    buscarConvitePorToken: ReturnType<typeof vi.fn>;
  };
  let memberships: {
    findRole: ReturnType<typeof vi.fn>;
    listarEmpresasDoUsuario: ReturnType<typeof vi.fn>;
  };
  let users: { findById: ReturnType<typeof vi.fn> };
  let useCases: TenancyUseCases;
  let agora: Date;

  beforeEach(() => {
    vi.useFakeTimers();
    agora = new Date('2026-10-19T12:00:00.000Z');
    vi.setSystemTime(agora);

    onboarding = {
      provisionarEmpresaPropria: vi.fn().mockResolvedValue(undefined),
      abrirEmpresaParaUsuario: vi.fn().mockResolvedValue({
        id: ACME,
        nome: 'ACME',
        slug: 'acme',
      }),
      entrarPorConvite: vi.fn().mockResolvedValue(undefined),
      criarContaPorConvite: vi.fn().mockResolvedValue(undefined),
      emitirConvite: vi.fn().mockResolvedValue(undefined),
      buscarConvitePorToken: vi.fn().mockResolvedValue(convite()),
    };
    memberships = {
      findRole: vi.fn().mockResolvedValue('gerente'),
      listarEmpresasDoUsuario: vi.fn().mockResolvedValue([]),
    };
    users = { findById: vi.fn().mockResolvedValue(userFalso(VISITANTE, 'ana@acme.com')) };

    useCases = new TenancyUseCases(
      onboarding as unknown as TenantOnboardingPort,
      memberships as unknown as TenantMembershipRepositoryPort,
      users as unknown as UserRepositoryPort,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ───────────────────────── empresa própria ─────────────────────────

  it('empresa própria entrega o usuário e a empresa ao port, numa chamada só', async () => {
    await useCases.provisionarEmpresaPropria({
      usuario: usuario(DONO, 'dono@acme.com'),
      empresa: { nome: 'ACME', slug: 'acme' },
    });

    expect(onboarding.provisionarEmpresaPropria).toHaveBeenCalledTimes(1);
    const [quem, empresa] = onboarding.provisionarEmpresaPropria.mock.calls[0]!;
    expect(quem).toMatchObject({ id: DONO, email: 'dono@acme.com' });
    expect(empresa).toMatchObject({ nome: 'ACME', slug: 'acme' });
  });

  it('empresa própria NÃO cria convite (o convite é o outro ramo da D5)', async () => {
    await useCases.provisionarEmpresaPropria({
      usuario: usuario(DONO, 'dono@acme.com'),
      empresa: { nome: 'ACME', slug: 'acme' },
    });

    expect(onboarding.emitirConvite).not.toHaveBeenCalled();
    expect(onboarding.entrarPorConvite).not.toHaveBeenCalled();
  });

  // ───────────────────────── emitir convite ─────────────────────────

  it('convite sai com token de 64 hex e 7 dias de validade', async () => {
    const emitido = await useCases.emitirConvite({
      tenantId: ACME,
      convidadorId: DONO,
      email: 'ana@acme.com',
    });

    expect(emitido.token).toMatch(/^[0-9a-f]{64}$/);
    expect(emitido.expiresAt.getTime() - agora.getTime()).toBe(SEMANA_MS);

    const gravado = onboarding.emitirConvite.mock.calls[0]![0] as ConviteParaEmitir;
    expect(gravado.token).toBe(emitido.token);
    expect(gravado).toMatchObject({ tenantId: ACME, email: 'ana@acme.com', role: 'member' });
  });

  it('dois convites para a MESMA pessoa saem com tokens diferentes', async () => {
    const primeiro = await useCases.emitirConvite({
      tenantId: ACME,
      convidadorId: DONO,
      email: 'ana@acme.com',
    });
    const segundo = await useCases.emitirConvite({
      tenantId: ACME,
      convidadorId: DONO,
      email: 'ana@acme.com',
    });

    expect(primeiro.token).not.toBe(segundo.token);
  });

  it('quem NÃO é gerente da empresa não emite convite — e nada é gravado', async () => {
    memberships.findRole.mockResolvedValue('member');

    await expect(
      useCases.emitirConvite({ tenantId: ACME, convidadorId: VISITANTE, email: 'ana@acme.com' }),
    ).rejects.toBeInstanceOf(NaoAdministraEmpresaException);

    expect(onboarding.emitirConvite).not.toHaveBeenCalled();
  });

  it('quem não pertence à empresa alguma não emite convite para ela', async () => {
    memberships.findRole.mockResolvedValue(null);

    await expect(
      useCases.emitirConvite({ tenantId: ACME, convidadorId: VISITANTE, email: 'ana@acme.com' }),
    ).rejects.toBeInstanceOf(NaoAdministraEmpresaException);
  });

  it('o convite é emitido para o email NORMALIZADO (minúsculo)', async () => {
    await useCases.emitirConvite({ tenantId: ACME, convidadorId: DONO, email: 'Ana@Acme.COM' });

    expect((onboarding.emitirConvite.mock.calls[0]![0] as ConviteParaEmitir).email).toBe(
      'ana@acme.com',
    );
  });

  // ───────────────────────── conta nova, por convite ─────────────────────────

  it('conta nova por convite entrega o convite E a conta ao port, que grava os dois numa transação', async () => {
    await useCases.criarContaPorConvite({
      usuario: usuario(DONO, 'ana@acme.com'),
      token: TOKEN,
    });

    expect(onboarding.entrarPorConvite).not.toHaveBeenCalled();
    const [chamado, quem] = onboarding.criarContaPorConvite.mock.calls[0]! as [
      ConviteParaAceitar,
      UsuarioParaProvisionar,
    ];
    expect(chamado).toMatchObject({ userId: DONO });
    // Passar o tenantId pelo chamador deixaria o cliente escolher a empresa —
    // que é o furo inteiro que o token veio fechar.
    expect(chamado).not.toHaveProperty('tenantId');
    // A conta vai JUNTO: um port que só cria membership deixaria o `users`
    // de fora (MEDIDO: `tenant_memberships_user_id_fkey`).
    expect(quem).toMatchObject({ id: DONO, email: 'ana@acme.com' });
  });

  it('conta nova com token que não existe não escreve nada', async () => {
    onboarding.buscarConvitePorToken.mockResolvedValue(null);

    await expect(
      useCases.criarContaPorConvite({ usuario: usuario(DONO, 'ana@acme.com'), token: TOKEN }),
    ).rejects.toMatchObject({ motivo: 'nao-encontrado' });

    expect(onboarding.criarContaPorConvite).not.toHaveBeenCalled();
  });

  it('conta nova NÃO escreve nada quando o convite já foi usado', async () => {
    // O port de escrita é quem faz `users` + `tenant_memberships` na mesma
    // transação, então a validação do convite acontece ANTES de qualquer
    // escrita — se falhasse depois, a transação do port já desfazia tudo.
    onboarding.buscarConvitePorToken.mockResolvedValue(convite({ acceptedAt: AGORA }));

    await expect(
      useCases.criarContaPorConvite({ usuario: usuario(DONO, 'ana@acme.com'), token: TOKEN }),
    ).rejects.toBeInstanceOf(ConviteInvalidoException);
    expect(onboarding.criarContaPorConvite).not.toHaveBeenCalled();
  });

  // ───────────────────────── conta existente ─────────────────────────

  it('conta existente aceita convite sem criar usuário novo', async () => {
    await useCases.aceitarConvite({ userId: VISITANTE, token: TOKEN });

    expect(users.findById).toHaveBeenCalledTimes(1);
    expect(onboarding.provisionarEmpresaPropria).not.toHaveBeenCalled();
    expect(onboarding.entrarPorConvite.mock.calls[0]![0]).toMatchObject({ userId: VISITANTE });
  });

  it('o aceite compara o email da CONTA com o do convite, não com o da entrada', async () => {
    users.findById.mockResolvedValue(userFalso(VISITANTE, 'outro@acme.com'));

    await expect(
      useCases.aceitarConvite({ userId: VISITANTE, token: TOKEN }),
    ).rejects.toMatchObject({ motivo: 'outro-email' });

    expect(onboarding.entrarPorConvite).not.toHaveBeenCalled();
  });

  it('o aceite de um token já consumido é rejeitado como `ja-aceito`', async () => {
    onboarding.buscarConvitePorToken.mockResolvedValue(convite({ acceptedAt: AGORA }));

    await expect(
      useCases.aceitarConvite({ userId: VISITANTE, token: TOKEN }),
    ).rejects.toMatchObject({ motivo: 'ja-aceito' });
  });

  // ───────────────────────── validade ─────────────────────────

  it('convite vencido é rejeitado, e "vencido" vem ANTES de "já aceito"', async () => {
    // Ordem importa: um convite usado há 40 dias está os dois ao mesmo
    // tempo. Responder `ja-aceito` seria dar informação que o caller não tem.
    onboarding.buscarConvitePorToken.mockResolvedValue(
      convite({ acceptedAt: AGORA, expiresAt: new Date('2026-10-18T12:00:00.000Z') }),
    );

    await expect(
      useCases.aceitarConvite({ userId: VISITANTE, token: TOKEN }),
    ).rejects.toMatchObject({ motivo: 'expirado' });
  });

  it('convite expira exatamente no instante declarado, não um segundo depois', async () => {
    const limite = new Date(agora.getTime() + 1);
    onboarding.buscarConvitePorToken.mockResolvedValue(convite({ expiresAt: limite }));

    await expect(useCases.aceitarConvite({ userId: VISITANTE, token: TOKEN })).resolves.toEqual({
      tenantId: ACME,
    });

    vi.setSystemTime(limite);
    onboarding.buscarConvitePorToken.mockResolvedValue(convite({ expiresAt: limite }));

    await expect(
      useCases.aceitarConvite({ userId: VISITANTE, token: TOKEN }),
    ).rejects.toMatchObject({
      motivo: 'expirado',
    });
  });

  it('convite sem prazo não vence nunca (`expiresAt` null = sem validade)', async () => {
    onboarding.buscarConvitePorToken.mockResolvedValue(convite({ expiresAt: null }));

    await expect(useCases.aceitarConvite({ userId: VISITANTE, token: TOKEN })).resolves.toEqual({
      tenantId: ACME,
    });
  });

  // ───────────────────────── a empresa de quem já tem conta ─────────────────────────

  it('criar empresa entrega a conta e a empresa ao port, e devolve a empresa aberta', async () => {
    const empresa = await useCases.criarEmpresa({
      userId: DONO,
      nome: 'ACME',
      slug: 'acme',
    });

    expect(onboarding.abrirEmpresaParaUsuario).toHaveBeenCalledTimes(1);
    const [userId, dados] = onboarding.abrirEmpresaParaUsuario.mock.calls[0]!;
    expect(userId).toBe(DONO);
    expect(dados).toMatchObject({ nome: 'ACME', slug: 'acme' });
    expect(empresa).toMatchObject({ id: ACME, nome: 'ACME', slug: 'acme' });
  });

  it('criar empresa para uma conta que NÃO existe não escreve nada', async () => {
    users.findById.mockResolvedValue(null);

    await expect(
      useCases.criarEmpresa({ userId: DONO, nome: 'ACME', slug: 'acme' }),
    ).rejects.toBeInstanceOf(UserNotFoundException);

    expect(onboarding.abrirEmpresaParaUsuario).not.toHaveBeenCalled();
  });

  it('criar empresa para uma conta APAGADA não escreve nada', async () => {
    users.findById.mockResolvedValue(userApagado(VISITANTE, 'ana@acme.com'));

    await expect(
      useCases.criarEmpresa({ userId: VISITANTE, nome: 'ACME', slug: 'acme' }),
    ).rejects.toBeInstanceOf(UserNotFoundException);

    expect(onboarding.abrirEmpresaParaUsuario).not.toHaveBeenCalled();
  });

  it('listar empresas devolve o que o port devolve, sem filtrar nada', async () => {
    const lista = [{ id: ACME, nome: 'ACME', slug: 'acme', role: 'gerente' }];
    memberships.listarEmpresasDoUsuario.mockResolvedValue(lista);

    expect(await useCases.listarEmpresas(DONO)).toEqual(lista);
    expect(memberships.listarEmpresasDoUsuario).toHaveBeenCalledWith(DONO);
  });

  it('listar empresas de quem não tem nenhuma devolve lista vazia', async () => {
    memberships.listarEmpresasDoUsuario.mockResolvedValue([]);

    expect(await useCases.listarEmpresas(DONO)).toEqual([]);
  });

  // ───────────────────────── o aceite diz QUAL empresa ─────────────────────────

  it('o aceite devolve a empresa QUE CONVIDOU — sem isso o web não sabe onde gravar o cookie', async () => {
    const aceite = await useCases.aceitarConvite({ userId: VISITANTE, token: TOKEN });

    expect(aceite).toEqual({ tenantId: ACME });
  });
});
