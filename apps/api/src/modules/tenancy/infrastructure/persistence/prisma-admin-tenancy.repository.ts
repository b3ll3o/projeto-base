// apps/api/src/modules/tenancy/infrastructure/persistence/prisma-admin-tenancy.repository.ts
//
// pt-BR (visão de admin, 2026-10-22): implementação Prisma do
// `AdminTenancyRepositoryPort` — o inventário do bucket de SISTEMA.
//
// ⚠️ O ESCOPO É O DE SISTEMA (`'*'`), e é uma DECISÃO, não um acidente:
//
//   - a lista atravessa empresas, e o que a restringe é o FILTRO da query (o
//     bucket de SISTEMA não é "sem filtro": a RLS segue valendo, e `'*'` é o
//     que a torna aberta para o administrador do sistema). É o mesmo motivo de
//     `listarEmpresasDoUsuario` e de `buscarConvitePorToken`;
//   - o escopo NUNCA vem do header `X-Tenant-Id`. O header é capacidade
//     declarada pelo cliente (issue #102), e uma leitura que abrange o
//     sistema inteiro não pode ter o alcance decidido por quem pergunta.
//
// Uma lista por vez, sem N+1: o `select` do Prisma emite uma query POR
// RELAÇÃO (3 por lista — tenants, memberships, profiles), e não uma por linha.
// O que seria N+1 aqui é buscar a membership de cada empresa dentro de um
// laço.

import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service.js';
import { comEscopo, escopoDoTenant } from '../../../../shared/infrastructure/prisma/escopo.js';
import type {
  AdminTenancyRepositoryPort,
  EmpresaComMembros,
  UsuarioComEmpresas,
} from '../../domain/ports/admin-tenancy-repository.port.js';

/** A membership, vista com o perfil que ela veste. */
interface MembershipComPerfil {
  profile: { slug: string; tenantId: string | null } | null;
}

/**
 * O slug do perfil EFETIVO da membership, ou `null`.
 *
 * ⚠️ É o MESMO critério de `findProfileId` (`prisma-tenant-membership.repository.ts`):
 * o perfil precisa ser GLOBAL (`tenant_id IS NULL`, que serve a qualquer
 * empresa por definição — D3) ou DAQUELA empresa. Um `profile_id` apontado
 * para o perfil de OUTRA empresa resolve `null` — mostrar o slug dele aqui
 * diria que a pessoa veste um perfil que a API não resolve para esta empresa,
 * e o defeito é invisível: todo o resto da tela funciona.
 */
function perfilEfetivo(membership: MembershipComPerfil, tenantId: string): string | null {
  const perfil = membership.profile;
  if (perfil === null) return null;
  if (perfil.tenantId === null || perfil.tenantId === tenantId) return perfil.slug;
  return null;
}

@Injectable()
export class PrismaAdminTenancyRepository implements AdminTenancyRepositoryPort {
  /** pt-BR: mesmo motivo de `PrismaTenantMembershipRepository` — o parâmetro é
   *  tipado como `PrismaClient`, apagado em runtime; sem o token o Nest
   *  LANÇA no boot. */
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  async listarEmpresasComMembros(): Promise<EmpresaComMembros[]> {
    const linhas = await comEscopo(this.prisma, escopoDoTenant(null), (tx) =>
      tx.tenant.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
          memberships: {
            // ⚠️ A membership SOBREVIVE ao soft-delete do usuário. Sem este
            // filtro, a empresa continuaria exibindo como membro uma conta
            // que não existe mais — e o usuário sumiria da lista de usuários
            // ao mesmo tempo. As DUAS listas precisam contar a mesma história.
            where: { user: { deletedAt: null } },
            select: {
              role: true,
              user: { select: { id: true, name: true, email: true } },
              profile: { select: { slug: true, tenantId: true } },
            },
          },
        },
        // A ordem é FUNCIONAL, não estética: a tela lista as empresas por nome,
        // e uma ordem estável faz o e2e e o diff da tela valerem.
        orderBy: { name: 'asc' },
      }),
    );

    return linhas.map((linha) => ({
      id: linha.id,
      nome: linha.name,
      slug: linha.slug,
      membros: linha.memberships.map((membership) => ({
        id: membership.user.id,
        nome: membership.user.name,
        email: membership.user.email,
        role: membership.role,
        perfil: perfilEfetivo(membership, linha.id),
      })),
    }));
  }

  async listarUsuariosComEmpresas(): Promise<UsuarioComEmpresas[]> {
    const linhas = await comEscopo(this.prisma, escopoDoTenant(null), (tx) =>
      tx.user.findMany({
        // Mesma regra de `GET /users` (default `includeDeleted=false`): a conta
        // apagada não é pessoa para o admin, e o filtro mora no `where` para
        // que a lista e a contagem contem a MESMA história.
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          email: true,
          memberships: {
            select: {
              role: true,
              tenant: { select: { id: true, name: true, slug: true } },
              profile: { select: { slug: true, tenantId: true } },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
    );

    return linhas.map((linha) => ({
      id: linha.id,
      nome: linha.name,
      email: linha.email,
      empresas: linha.memberships.map((membership) => ({
        id: membership.tenant.id,
        nome: membership.tenant.name,
        slug: membership.tenant.slug,
        role: membership.role,
        perfil: perfilEfetivo(membership, membership.tenant.id),
      })),
    }));
  }
}
