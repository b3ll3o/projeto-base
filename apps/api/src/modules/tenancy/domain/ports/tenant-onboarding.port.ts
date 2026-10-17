// apps/api/src/modules/tenancy/domain/ports/tenant-onboarding.port.ts
//
// pt-BR (Fase 5 — tenancy, 2026-10-16): port da ENTRADA na empresa — a D5,
// "empresa própria OU convite".
//
// POR QUE UM PORT NOVO, E NÃO REUSO DO `UserRepositoryPort`
//
// `POST /users` precisa gravar `users` + `tenants` + `profiles` +
// `tenant_memberships` numa transação só. Duas portas, dois adaptadores, duas
// transações — e o estado intermediário é observável: um usuário sem
// empresa, uma empresa sem dono, um convite aceito sem membership. É
// exatamente o tipo de furo que ninguém acha na revisão, porque cada
// repositório sozinho está correto.
//
// Por isso a fronteira transacional mora AQUI, no port, e não espalhada em
// dois repositórios: quem promete "tudo ou nada" é uma interface só, e o
// adaptador é o único lugar que conhece `$transaction`.

/** Token de injeção — sem token o Nest LANÇA (a interface é apagada em runtime). */
export const TENANT_ONBOARDING_PORT = Symbol('TenantOnboardingPort');

/**
 * Colunas de `users` que a entrada precisa escrever.
 *
 * Deliberadamente PRIMITIVAS, e não o agregado `User`: `tenancy` e `users`
 * são BCs separados, e um port que carrega o agregado obrigaria o adaptador a
 * importar `users/domain`. O agregado continua sendo o dono das invariantes
 * (VOs de email/nome/senha) — este tipo recebe o que JÁ validou.
 */
export interface UsuarioParaProvisionar {
  id: string;
  nome: string;
  email: string;
  senhaHash: string;
  createdAt: Date;
}

export interface EmpresaParaAbrir {
  nome: string;
  slug: string;
}

export interface ConviteParaAceitar {
  userId: string;
  invitationId: string;
}

/** Convite lido do banco — o que o caso de uso precisa para decidir o aceite. */
export interface ConvitePendente {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  acceptedAt: Date | null;
  expiresAt: Date | null;
}

export interface ConviteParaEmitir {
  tenantId: string;
  email: string;
  role: string;
  /** Secreto do convite: 32 bytes em hex (`randomBytes`), não o id da linha. */
  token: string;
  expiresAt: Date;
}

export interface TenantOnboardingPort {
  /**
   * `users` + `tenants` + perfil admin da empresa + `tenant_memberships`,
   * tudo ou nada.
   *
   * O perfil admin é criado **daqui, com `tenant_id` da empresa nova** — e
   * não buscado entre os perfis globais do seed. Duas razões, e a segunda é
   * a que importa:
   *
   * 1. O seed roda à mão (`pnpm exec tsx prisma/seed.ts`), e a suíte de
   *    integração sobe Postgres em container **sem** seed. Um `findFirst` pelo
   *    slug global acharia nada e a empresa própria nasceria sem dono.
   * 2. Mesmo quando existe, ele é de outra empresa. Um perfil global `admin`
   *    vestindo a membership de uma empresa recém-criada é um perfil com TODAS
   *    as permissões do catálogo morando dentro dela — a D3 existe para que
   *    a empresa controle os próprios perfis.
   */
  provisionarEmpresaPropria(
    usuario: UsuarioParaProvisionar,
    empresa: EmpresaParaAbrir,
  ): Promise<void>;

  /**
   * `tenant_memberships` + `invitations.accepted_at`, tudo ou nada.
   *
   * `profile_id` fica `NULL` de propósito: quem entra por convite não tem
   * perfil nenhum até o admin da empresa atribuir. A Fase 4 já documentou e
   * testado que membership sem perfil resolve para ZERO permissões — que é o
   * estado certo para quem acabou de ser convidado.
   */
  entrarPorConvite(convite: ConviteParaAceitar): Promise<void>;

  /**
   * O MESMO de `entrarPorConvite`, mais a CONTA — para quem ainda não tem
   * uma (`destino: 'convite'` no cadastro).
   *
   * Método separado e não um campo opcional em `ConviteParaAceitar`: quem já
   * tem conta não tem `senhaHash` para gravar, e um `if (novaConta)` dentro
   * de `entrarPorConvite` tornaria o nome do método falso em metade dos
   * callers. MEDIDO 2026-10-17: o caminho de conta nova reusava
   * `entrarPorConvite` e morria com `tenant_memberships_user_id_fkey` — o
   * `users` nunca tinha sido gravado naquele caminho.
   */
  criarContaPorConvite(convite: ConviteParaAceitar, usuario: UsuarioParaProvisionar): Promise<void>;

  /**
   * Emite o convite (produtor: `POST /tenants/:id/invitations`).
   *
   * Não é transacional com nada: um convite é uma linha só. Mora aqui
   * porque é a única outra escrita de `invitations` que existe, e um segundo
   * adaptador para a mesma tabela seria um binding a mais para carregar.
   */
  emitirConvite(convite: ConviteParaEmitir): Promise<void>;

  /**
   * Lê o convite pelo seu segredo, ou `null` se o token não existe.
   *
   * Por token e nunca por `(tenantId, email)`: o aceite precisa funcionar sem
   * que o convidado saiba o id da empresa, e com o par os dois campos seriam
   * adivinháveis/triviais para quem já foi da empresa.
   */
  buscarConvitePorToken(token: string): Promise<ConvitePendente | null>;
}
