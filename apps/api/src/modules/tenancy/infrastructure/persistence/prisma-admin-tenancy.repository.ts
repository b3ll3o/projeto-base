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
// ⚠️ #118 — O BUCKET DE SISTEMA É A CREDENCIAL, E NÃO O GUC.
//
// `comEscopoDeSistema` (e não `comEscopo(prisma, escopoDoTenant(null), fn)`):
// depois do #118 o bucket de SISTEMA é concedido pelo `current_user`, e quem
// abre a transação é a CREDENCIAL de sistema. MEDIDO na `main` (2026-10-28),
// no Postgres 16 real:
//
//   sessão de RUNTIME, escopo '*'  ->  empresas=0  usuarios=0
//   sessão de SISTEMA, escopo '*'  ->  empresas=2  usuarios=1
//
// A forma antiga (GUC `'*'` na sessão de runtime) devolve ZERO linhas — e a
// tela do admin ficaria VAZIA sem erro nenhum. É o mesmo P0 que o #118
// consertou, e a lista do admin o trazia de volta.
//
// Uma lista por vez, sem N+1: o `select` do Prisma emite uma query POR
// RELAÇÃO (3 por lista — tenants, memberships, profiles), e não uma por linha.
// O que seria N+1 aqui é buscar a membership de cada empresa dentro de um
// laço.

import { Injectable } from '@nestjs/common';
import { comEscopoDeSistema } from '../../../../shared/infrastructure/prisma/escopo.js';
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
  // ⚠️ Este repositório NÃO recebe o `PrismaService`: as DUAS leituras são do
  // bucket de SISTEMA, e o bucket de SISTEMA é aberto na CREDENCIAL de sistema
  // (#118) — que vem do ambiente (`SYSTEM_DATABASE_URL`), não do client
  // injetado. Injetar um client que a produção não usaria seria uma
  // dependência que mente sobre quem abre a transação.

  async listarEmpresasComMembros(): Promise<EmpresaComMembros[]> {
    const linhas = await comEscopoDeSistema((tx) =>
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
    const linhas = await comEscopoDeSistema((tx) =>
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
