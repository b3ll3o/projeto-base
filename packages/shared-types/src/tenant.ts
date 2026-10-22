/**
 * Tipos compartilhados do módulo de tenancy (empresa).
 *
 * pt-BR: cópia do WIRE FORMAT, como todo tipo deste pacote — um tipo aqui é o
 * que a API **realmente serializa**, não o modelo de domínio. A fonte da
 * verdade: `apps/api/src/modules/tenancy/infrastructure/http/`.
 *
 * A empresa é a TENANT. O `id` é um UUID (o `tenants.id` do banco) e o `slug` é
 * o identificador legível (o `tenants.slug`, único no banco).
 */

import type { UUID } from './user.js';

/** A empresa, como a API a devolve. */
export interface EmpresaDto {
  id: UUID;
  nome: string;
  slug: string;
}

/**
 * A empresa DO ATOR — a mesma empresa, mais o papel que ele veste nela.
 *
 * O `role` é o rótulo de tenant (`gerente`, `member`), e NÃO o RBAC: quem diz o
 * que a pessoa pode fazer é o PERFIL que ela veste na empresa
 * (`tenant_memberships.profile_id`), não este rótulo.
 */
export interface EmpresaDoUsuarioDto extends EmpresaDto {
  role: string;
}

/** Entrada de criação de empresa (`POST /tenants`). */
export interface CriarEmpresaInputDto {
  nome: string;
  /** Identificador legível e único: minúsculo, dígitos e hífens internos. */
  slug: string;
}

/**
 * Resposta do aceite de convite (`POST /invitations/accept`).
 *
 * O `tenantId` volta porque a empresa do convite é o que o web precisa para
 * apontar a sessão para ela (o cookie `tenant_id`). Sem ele, a conta entra na
 * empresa e fica com ZERO permissões na tela — membership sem escopo.
 */
export interface ConviteAceitoDto {
  aceito: true;
  tenantId: UUID;
}
