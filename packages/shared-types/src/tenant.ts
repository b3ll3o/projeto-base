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

/**
 * pt-BR (visão de admin, 2026-10-22): o INVENTÁRIO da tenancy, visto pelo
 * ADMINISTRADOR DO SISTEMA — as duas direções.
 *
 * São cópias do WIRE FORMAT (`GET /admin/tenants` e `GET /admin/users`), e
 * não do modelo de domínio: o que a API devolve nestas duas rotas é o que
 * está declarado aqui.
 */

/**
 * Um membro de uma empresa, visto pelo administrador do sistema.
 *
 * `perfil` é o SLUG do perfil efetivo **naquela empresa** (o
 * `tenant_memberships.profile_id`), e `null` quando a membership não tem
 * perfil — ou quando o perfil é de OUTRA empresa (é o mesmo critério de
 * `findProfileId`, na API).
 */
export interface MembroDaEmpresaDto {
  id: UUID;
  nome: string;
  email: string;
  /** Rótulo do vínculo: `'gerente'` ou `'member'`. NÃO é o RBAC. */
  role: string;
  perfil: string | null;
}

/** Uma empresa e os usuários que a vestem (o inventário do admin). */
export interface EmpresaComMembrosDto extends EmpresaDto {
  membros: MembroDaEmpresaDto[];
}

/** Uma empresa a que um usuário pertence, com o papel e o perfil que ele veste nela. */
export interface EmpresaComPerfilDto extends EmpresaDoUsuarioDto {
  perfil: string | null;
}

/**
 * Um usuário e as empresas a que ele pertence (o inventário do admin).
 *
 * `empresas` vazia é uma RESPOSTA legítima — e não um defeito: a conta do
 * administrador do sistema vive no bucket GLOBAL e não pertence a empresa
 * nenhuma.
 */
export interface UsuarioComEmpresasDto {
  id: UUID;
  nome: string;
  email: string;
  empresas: EmpresaComPerfilDto[];
}

/**
 * O INVENTÁRIO da tenancy, visto pelo administrador do SISTEMA — as DUAS
 * direções, numa resposta só (`GET /admin/tenancy`).
 *
 * ⚠️ As duas listas viajam JUNTAS porque elas precisam contar a mesma
 * história: em duas respostas seriam dois instantes do banco, e a tela
 * poderia discordar de si mesma.
 *
 * ⚠️ E o tipo é o WIRE FORMAT — o que a API REALMENTE serializa. O
 * controller da API tipa a resposta com ESTE tipo (e não com o da porta de
 * domínio), que é o elo de compilação entre as duas pontas: um rename no wire
 * agora quebra o `tsc` dos DOIS lados.
 */
export interface InventarioAdminTenancyDto {
  empresas: EmpresaComMembrosDto[];
  usuarios: UsuarioComEmpresasDto[];
}
