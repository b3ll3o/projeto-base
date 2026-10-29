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

import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import {
  TENANT_ONBOARDING_PORT,
  type ConviteParaAceitar,
  type ConvitePendente,
  type EmpresaAberta,
  type EmpresaParaAbrir,
  type TenantOnboardingPort,
  type UsuarioParaProvisionar,
} from '../domain/ports/tenant-onboarding.port.js';
import {
  TENANT_MEMBERSHIP_REPOSITORY_PORT,
  type EmpresaDoUsuario,
  type TenantMembershipRepositoryPort,
} from '../domain/ports/tenant-membership-repository.port.js';
import {
  ADMIN_TENANCY_REPOSITORY_PORT,
  type AdminTenancyRepositoryPort,
  type InventarioAdminTenancy,
} from '../domain/ports/admin-tenancy-repository.port.js';
import {
  exigeAdministradorDeSistema,
  type AtorAutenticado,
} from '../../../shared/auth/eh-administrador-de-sistema.js';
import {
  ConviteInvalidoException,
  NaoAdministraEmpresaException,
} from '../domain/exceptions/tenancy.exceptions.js';
import { Email } from '../../users/domain/value-objects/email.vo.js';
import { UserId } from '../../users/domain/value-objects/user-id.vo.js';
import { UserNotFoundException } from '../../users/domain/exceptions/user.exceptions.js';
import {
  USER_REPOSITORY_PORT,
  type UserRepositoryPort,
} from '../../users/domain/ports/user-repository.port.js';

/** Validade do convite. Sem maileiro no repo, 7 dias é o prazo que a pessoa tem de verdade. */
const VALIDADE_CONVITE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * O registro da leitura do inventário — a leitura mais densa em PII do sistema.
 *
 * ⚠️ O nome do logger é o que separa este registro dos outros: quem lê o log
 * precisa saber que ali está "o administrador do sistema leu a base inteira".
 */
const loggerInventario = new Logger('AdminTenancyInventory');

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
    // pt-BR (visão de admin, 2026-10-22): o inventário do bucket de SISTEMA.
    // É a ÚNICA porta daqui que atravessa empresas — e a que o portão D2
    // protege.
    @Inject(ADMIN_TENANCY_REPOSITORY_PORT)
    private readonly admin: AdminTenancyRepositoryPort,
  ) {}

  // ───────────────────────── empresa própria ─────────────────────────

  async provisionarEmpresaPropria(input: {
    usuario: UsuarioParaProvisionar;
    empresa: EmpresaParaAbrir;
  }): Promise<void> {
    await this.onboarding.provisionarEmpresaPropria(input.usuario, input.empresa);
  }

  // ───────────────────────── empresa de quem já tem conta ─────────────────────────

  /**
   * Abre a empresa de uma conta que JÁ EXISTE — a segunda etapa do onboarding
   * (a página de criação de empresa).
   *
   * A conta é conferida ANTES de qualquer escrita: quem não existe não pode
   * deixar uma empresa órfã com o dono apontando para o nada. E a conferência
   * é em `null` (bucket de SISTEMA) pelo mesmo motivo do aceite de convite —
   * a conta pode não ter membership nenhuma ainda, que é justamente o caso de
   * quem está criando a primeira empresa.
   */
  async criarEmpresa(input: {
    userId: string;
    nome: string;
    slug: string;
  }): Promise<EmpresaAberta> {
    const user = await this.users.findById(UserId.create(input.userId), null);
    if (user === null || user.isDeleted()) {
      throw new UserNotFoundException(input.userId);
    }

    return this.onboarding.abrirEmpresaParaUsuario(input.userId, {
      nome: input.nome,
      slug: input.slug,
    });
  }

  /** As empresas a que o ator pertence — lista vazia é uma resposta válida. */
  async listarEmpresas(userId: string): Promise<EmpresaDoUsuario[]> {
    return this.memberships.listarEmpresasDoUsuario(userId);
  }

  // ───────────────────── a visão do administrador do SISTEMA ─────────────────────

  /**
   * O INVENTÁRIO do bucket de SISTEMA — as DUAS listas, num instante só.
   *
   * ⚠️ É o INVENTÁRIO, e não a lista de empresas do ator (`listarEmpresas`).
   * A diferença é o alcance: esta atravessa empresas, e o que a autoriza é
   * D2 — o bucket GLOBAL (`tenantId === null`) com `isAdmin`.
   *
   * ⚠️ Por que as DUAS listas SAEM JUNTAS: o repositório diz que "as DUAS
   * listas precisam contar a mesma história", e isso só é garantível se as
   * duas forem lidas na MESMA transação. Duas listas em duas requisições são
   * dois instantes — e a tela podia discordar de si mesma.
   *
   * Lista VAZIA é uma resposta legítima: um sistema sem empresa aberta ainda
   * é um sistema, e a tela do admin precisa mostrar isso.
   */
  async listarInventarioDoSistema(ator: AtorAutenticado): Promise<InventarioAdminTenancy> {
    // ⚠️ A lista de PERMISSÕES não segura nada aqui, e é o mesmo motivo das
    // feature flags: o cadastro de empresa concede `listAllPermissions()` ao
    // dono (`perfis-da-empresa.ts`), e o `gerente` tem `isAdmin: true` no
    // perfil efetivo DA EMPRESA DELE. Quem decide é o bucket: `tenantId ===
    // null` (o bucket GLOBAL, onde mora o `isAdmin` do seed) — a mesma regra de
    // `ehAdministradorDeSistema`, que a Fase 9 escreveu para matar a escalada
    // do bucket global.
    exigeAdministradorDeSistema(
      ator,
      'só o administrador do sistema vê as empresas e os usuários do sistema',
    );

    const inventario = await this.admin.listarInventario();

    // ⚠️ O REGISTRO DA LEITURA. Esta é a leitura mais densa em dado pessoal do
    // sistema — ela entrega o e-mail de TODAS as contas. O `AuditContext` do
    // repo é auditoria de ESCRITA (INSERT/UPDATE/DELETE/RESTORE, com o
    // snapshot da entidade), e uma leitura não é uma entidade: o precedente
    // para operação sensível é o `Logger` dedicado (`ProfilePrivilegeEscalation`,
    // `FeatureFlagBloqueio`), e é o que está aqui.
    //
    // O ATOR entra no registro — sem ele, o log diz que a base foi lida, e
    // não por quem.
    loggerInventario.log(
      `inventário lido: ${inventario.empresas.length} empresa(s), ` +
        `${inventario.usuarios.length} usuário(s) — ator ${ator.userId}`,
    );

    return inventario;
  }

  // ───────────────────────── emitir convite ─────────────────────────

  async emitirConvite(input: {
    tenantId: string;
    convidadorId: string;
    email: string;
  }): Promise<{ token: string; expiresAt: Date }> {
    const role = await this.memberships.findRole(input.convidadorId, input.tenantId);
    if (role !== 'gerente') {
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

  /**
   * Aceita o convite de uma conta que já existe — e devolve a empresa que
   * CONVIDOU.
   *
   * O `tenantId` no retorno não é enfeite: sem ele o web não sabe em qual
   * empresa a pessoa entrou, e o cookie de empresa (`X-Tenant-Id`) fica sem
   * valor — o resultado é uma conta com membership e ZERO permissões na tela.
   */
  async aceitarConvite(input: { userId: string; token: string }): Promise<{ tenantId: string }> {
    // O email vem da CONTA, não da entrada: o token prova que o convite foi
    // emitido para alguém, e a conta prova que essa alguém é você.
    // `null` = bucket de SISTEMA: a pergunta é "esta conta existe?", e a conta
    // pode não ter membership nenhuma ainda — é justamente o caso de quem está
    // aceitando o primeiro convite. Sob escopo de empresa ela seria invisível.
    const user = await this.users.findById(UserId.create(input.userId), null);
    if (user === null || user.isDeleted()) {
      throw new ConviteInvalidoException('nao-encontrado');
    }

    const convite = await this.exigirConviteValido(input.token, user.email().value);
    await this.onboarding.entrarPorConvite(this.entrada(convite, user.id().value));
    return { tenantId: convite.tenantId };
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
