// apps/api/src/modules/tenancy/domain/ports/tenant-membership-repository.port.ts
//
// pt-BR (Fase 4 — tenancy, 2026-10-16): port da identidade do usuário NA
// empresa. É a peça que faz "1 conta, N empresas, N perfis" (D4) existir.

/** Token de injeção — a interface é apagada em runtime, sem token o Nest LANÇA. */
export const TENANT_MEMBERSHIP_REPOSITORY_PORT = Symbol('TenantMembershipRepositoryPort');

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
}
