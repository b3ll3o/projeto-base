// apps/api/src/modules/tenancy/application/tenancy.use-cases.ts
//
// pt-BR (Fase 5 — tenancy, 2026-10-16): a D5 — a entrada na empresa.
//
// Um branch na cabeça, dois destinos, como o plano diz:
//
//   POST /users { nome, email, senha, destino? }
//     destino = { tipo: 'empresa', nome, slug }  -> provisionarEmpresaPropria
//     destino = { tipo: 'convite', token }       -> criarContaPorConvite
//     (sem destino)                              -> o usuário solto de hoje
//
// E o caminho do quem JÁ tem conta, que é o comum sob D4 (1 conta, N
// empresas): `POST /invitations/accept` → aceitaConvite.

import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import {
  TENANT_ONBOARDING_PORT,
  type ConviteParaAceitar,
  type ConvitePendente,
  type EmpresaParaAbrir,
  type TenantOnboardingPort,
  type UsuarioParaProvisionar,
} from '../domain/ports/tenant-onboarding.port.js';
import {
  TENANT_MEMBERSHIP_REPOSITORY_PORT,
  type TenantMembershipRepositoryPort,
} from '../domain/ports/tenant-membership-repository.port.js';
import {
  ConviteInvalidoException,
  NaoAdministraEmpresaException,
} from '../domain/exceptions/tenancy.exceptions.js';
import { Email } from '../../users/domain/value-objects/email.vo.js';
import { UserId } from '../../users/domain/value-objects/user-id.vo.js';
import {
  USER_REPOSITORY_PORT,
  type UserRepositoryPort,
} from '../../users/domain/ports/user-repository.port.js';

/** Validade do convite. Sem maileiro no repo, 7 dias é o prazo que a pessoa tem de verdade. */
const VALIDADE_CONVITE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Token de DI.
 *
 * pt-BR: `UserUseCases` injeta este token (e não a classe) porque é o que
 * quebra o ciclo de arquivos — `tenancy.use-cases.ts` importa VOs de
 * `users/domain`, então o import de runtime de `users/application` para cá
 * fecharia a volta. `TenancyUseCases` só é usado como TIPO lá.
 */
export const TENANCY_USE_CASES = Symbol.for('@projeto/api/tenancy/TenancyUseCases');

@Injectable()
export class TenancyUseCases {
  constructor(
    @Inject(TENANT_ONBOARDING_PORT) private readonly onboarding: TenantOnboardingPort,
    @Inject(TENANT_MEMBERSHIP_REPOSITORY_PORT)
    private readonly memberships: TenantMembershipRepositoryPort,
    @Inject(USER_REPOSITORY_PORT) private readonly users: UserRepositoryPort,
  ) {}

  // ───────────────────────── empresa própria ─────────────────────────

  async provisionarEmpresaPropria(input: {
    usuario: UsuarioParaProvisionar;
    empresa: EmpresaParaAbrir;
  }): Promise<void> {
    await this.onboarding.provisionarEmpresaPropria(input.usuario, input.empresa);
  }

  // ───────────────────────── emitir convite ─────────────────────────

  async emitirConvite(input: {
    tenantId: string;
    convidadorId: string;
    email: string;
  }): Promise<{ token: string; expiresAt: Date }> {
    const role = await this.memberships.findRole(input.convidadorId, input.tenantId);
    if (role !== 'owner') {
      throw new NaoAdministraEmpresaException(input.tenantId);
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + VALIDADE_CONVITE_MS);

    await this.onboarding.emitirConvite({
      tenantId: input.tenantId,
      email: Email.create(input.email).value,
      role: 'member',
      token,
      expiresAt,
    });

    return { token, expiresAt };
  }

  // ───────────────────────── conta nova, por convite ─────────────────────────

  async criarContaPorConvite(input: {
    usuario: UsuarioParaProvisionar;
    token: string;
  }): Promise<void> {
    const convite = await this.exigirConviteValido(input.token, input.usuario.email);
    await this.onboarding.criarContaPorConvite(
      this.entrada(convite, input.usuario.id),
      input.usuario,
    );
  }

  // ───────────────────────── conta existente ─────────────────────────

  async aceitarConvite(input: { userId: string; token: string }): Promise<void> {
    // O email vem da CONTA, não da entrada: o token prova que o convite foi
    // emitido para alguém, e a conta prova que essa alguém é você.
    const user = await this.users.findById(UserId.create(input.userId));
    if (user === null || user.isDeleted()) {
      throw new ConviteInvalidoException('nao-encontrado');
    }

    const convite = await this.exigirConviteValido(input.token, user.email().value);
    await this.onboarding.entrarPorConvite(this.entrada(convite, user.id().value));
  }

  // ───────────────────────── interno ─────────────────────────

  private entrada(convite: ConvitePendente, userId: string): ConviteParaAceitar {
    return { userId, invitationId: convite.id };
  }

  /**
   * A ordem das três verificações é do plano, não desta implementação:
   * existe → venceu → já foi usado.
   *
   * "Venceu" antes de "já foi usado" porque um convite usado há 40 dias
   * satisfaz as duas, e responder `ja-aceito` a quem só tem o token diria
   * que ESTE convite já foi usado — o que é verdade, mas também entrega a
   * quem está sondando que o token existe.
   */
  private async exigirConviteValido(
    token: string,
    emailDaPessoa: string,
  ): Promise<ConvitePendente> {
    const convite = await this.onboarding.buscarConvitePorToken(token);
    if (convite === null) {
      throw new ConviteInvalidoException('nao-encontrado');
    }
    if (convite.expiresAt !== null && convite.expiresAt.getTime() <= Date.now()) {
      throw new ConviteInvalidoException('expirado');
    }
    if (convite.acceptedAt !== null) {
      throw new ConviteInvalidoException('ja-aceito');
    }
    if (convite.email !== Email.create(emailDaPessoa).value) {
      throw new ConviteInvalidoException('outro-email');
    }
    return convite;
  }
}
