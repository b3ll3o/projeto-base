// apps/api/src/modules/tenancy/domain/ports/tenant-membership-repository.port.ts
//
// pt-BR (Fase 4 — tenancy, 2026-10-16): port da identidade do usuário NA
// empresa. É a peça que faz "1 conta, N empresas, N perfis" (D4) existir.

/** Token de injeção — a interface é apagada em runtime, sem token o Nest LANÇA. */
export const TENANT_MEMBERSHIP_REPOSITORY_PORT = Symbol('TenantMembershipRepositoryPort');

/** Uma empresa a que o usuário pertence, com o papel que ele tem NELA. */
export interface EmpresaDoUsuario {
  id: string;
  nome: string;
  slug: string;
  /** `owner` ou `member` — o mesmo rótulo de `findRole`. */
  role: string;
}

export interface TenantMembershipRepositoryPort {
  /**
   * **Perfil efetivo** do usuário no escopo informado, ou `null`.
   *
   * Os dois escopos, e por que um método só:
   *
   * - `tenantId` presente → o perfil vem da **membership** daquela empresa
   *   (`tenant_memberships.profile_id`). É aqui que "perfil diferente por
   *   empresa" acontece. `null` quando não há membership, ou quando a
   *   membership ainda não tem perfil atribuído (convite aceito) — nos dois
   *   casos o resultado é **zero permissões**, nunca um perfil de sistema.
   * - `tenantId === null` → o bucket **GLOBAL** (`users.profile_id`), que é o
   *   que existe para os perfis de sistema do seed (`tenant_id IS NULL`, D3).
   *   Usuário soft-deleted resolve `null` aqui também (fail-closed).
   *
   * ⚠️ A checagem de DONO do perfil é do implementador, não do chamador: um
   * `profile_id` que aponte para o perfil de OUTRA empresa tem de resolver
   * `null`. Sem isso, atribuir o id errado na UI concede as permissões da
   * empresa vizinha — e o bug é invisível, porque todo o resto funciona.
   */
  findProfileId(userId: string, tenantId: string | null): Promise<string | null>;

  /**
   * Quantas memberships vestem este perfil — em QUALQUER empresa.
   *
   * Usado por `ProfileUseCases.deletar` junto com `countByProfile` de
   * `UserRepositoryPort`: as duas somas dão o total de usos, e é o que
   * devolve 409 em vez de deixar o `ON DELETE RESTRICT` estourar um 500.
   */
  countByProfile(profileId: string): Promise<number>;

  /**
   * Rótulo de tenant do usuário naquela empresa, ou `null` se não pertence.
   *
   * ⚠️ Este é o portão GROSSO de administração da empresa, não o RBAC fino.
   * `role` responde "esta pessoa administra esta empresa?" (e o único valor
   * que concede é `'gerente'`); a autorização por permissão continua em
   * `profiles.authorizations`, lida pelo `PermissionsGuard` como em qualquer
   * outra rota. Usar `role` aqui em vez do `isAdmin` do perfil efetivo é uma
   * escolha de tamanho: `findRole` é UMA query nesta tabela, enquanto
   * `isAdmin` seria duas, em duas BCs, para responder a uma pergunta de
   * escopo mais estreito — "administra ESTA empresa".
   */
  findRole(userId: string, tenantId: string): Promise<string | null>;

  /**
   * **Grava** o perfil efetivo do usuário NA membership daquela empresa.
   *
   * É a escrita que faltava desde a Fase 2: até aqui os únicos escritores eram
   * `provisionarEmpresaPropria` e `consumirEEntrar`, que gravam o dono/admin na
   * própria transação ou `null`. Sem este método a conta criada pelo convite
   * entrava na empresa com `profile_id` NULL — resolvido pela leitura como
   * ZERO permissões, e a conta não podia fazer nada.
   *
   * `profileId` é o mesmo conjunto que a LEITURA aceita: perfil da própria
   * empresa ou global (`null` = "sem perfil", para remover).
   *
   * ⚠️ A checagem de DONA do valor NOVO **não pode** morar no `where` de um
   * `updateMany`, e é uma armadilha de ORM, não de regra: o `where` casaria
   * linhas que JÁ têm aquele `profile_id` (toda escrita nova daria `count: 0`)
   * e, filtrando pela relação `profile`, protegeria o perfil que a membership
   * JÁ carrega — nada a ver com o que está entrando. MEDIDO contra Postgres:
   * as duas formas passavam o spec unitário e uma delas escrevia o perfil da
   * empresa vizinha. Por isso o implementador confere a dona ANTES e só então
   * escreve.
   *
   * ⚠️ `true` = gravou; `false` = **não gravou**, e o chamador decide o que
   * dizer. `false` cobre os dois casos em que a escrita não pode acontecer
   * (a pessoa não é membro da empresa, ou o perfil é de outra empresa), e a
   * casa é DELIBERADAMENTE a mesma: distinguish os dois no retorno seria
   * entregar ao cliente a existência de um perfil alheio. O status HTTP é do
   * use case.
   */
  atribuirPerfil(userId: string, tenantId: string, profileId: string | null): Promise<boolean>;

  /**
   * As empresas a que o usuário pertence, com o papel dele em cada uma.
   *
   * Lista VAZIA é uma resposta legítima — e é a que a conta sem empresa recebe
   * (ainda em onboarding) e a que o administrador de SISTEMA recebe (que pode
   * não pertencer a empresa nenhuma).
   *
   * ⚠️ O filtro é `userId`, e a query o carrega dentro do `where`: o id do ator
   * vem do token de sessão, e a linha devolvida é só a dele. O escopo de
   * leitura é o de SISTEMA pelo mesmo motivo de `buscarConvitePorToken` — a
   * lista atravessa empresas, e o que a restringe é o filtro, não a RLS.
   */
  listarEmpresasDoUsuario(userId: string): Promise<EmpresaDoUsuario[]>;
}
