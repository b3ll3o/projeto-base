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
// ⚠️ 2026-10-29 (revisão do PR #127): as DUAS leituras saem do MESMO
// `comEscopoDeSistema`. Antes eram DOIS, e o web disparava as duas em
// paralelo: cada transação via o banco num instante, e a tela podia mostrar
// uma empresa "sem membros" ao lado de uma pessoa numa empresa que a lista de
// empresas não conhecia — exatamente o par que este arquivo diz ser
// impossível. Uma transação, um inventário.
//
// Uma lista por vez, sem N+1: o `select` do Prisma emite uma query POR
// RELAÇÃO (3 por lista — tenants, memberships, profiles), e não uma por linha.
// O que seria N+1 aqui é buscar a membership de cada empresa dentro de um
// laço.

import { Injectable } from '@nestjs/common';
import { comEscopoDeSistema } from '../../../../shared/infrastructure/prisma/escopo.js';
import { temPerfilEfetivo } from '../../domain/perfil-efetivo.js';
import type {
  AdminTenancyRepositoryPort,
  InventarioAdminTenancy,
} from '../../domain/ports/admin-tenancy-repository.port.js';

/**
 * O slug do perfil EFETIVO — ou `null` quando o perfil não é efetivo aqui.
 *
 * ⚠️ O DONO do critério é `domain/perfil-efetivo.ts` — o mesmo que o
 * `findProfileId` e o `perfilEfetivoPorUsuario` importam. Uma cópia local do
 * critério envelheceria em silêncio: o defeito é invisível (todo o resto da
 * tela funciona, e a API resolve um perfil que ela não resolve para aquela
 * empresa).
 */
function slugEfetivo(
  profile: { slug: string; tenantId: string | null } | null,
  tenantId: string,
): string | null {
  if (profile === null) return null;
  return temPerfilEfetivo(profile, tenantId) ? profile.slug : null;
}

/**
 * O PRAZO da transação do inventário.
 *
 * ⚠️ O DEFAULT do Prisma é 5 s, e ele é implícito: nenhuma linha do repo
 * declarava o prazo, e a leitura — que é a ÚNICA do repo cujo custo cresce
 * com a base INTEIRA — é a que estoura nele. MEDIDO (2026-10-28, Prisma
 * 6.19.3): 6 s de transação morrem com `P2028`, que não é `HttpException` e
 * sai 500.
 *
 * 15 s é o prazo do BANCO, e ele é maior que o do CLIENTE (10 s, em
 * `apps/web/lib/api-client.ts`): quem corta primeiro é a pessoa, que vê a
 * tela de "serviço indisponível" — e a transação fecha sozinha logo depois,
 * sem transformar uma base grande em 500.
 *
 * shortcut: a leitura é a TABELA INTEIRA, sem `take` nem cursor — o
 * inventário do admin do sistema é uma tela de operação, não uma listagem
 * paginada. Quando o inventário precisar de paginação, o teto vai NO PORT
 * (como o `limitarPage` do `UserRepositoryPort`), e não um `limit` solto
 * aqui; até lá, este é o limite declarado.
 */
const PRAZO_DO_INVENTARIO_MS = 15_000;

/** A espera pela conexão do pool — o outro default implícito do Prisma. */
const ESPERA_PELA_CONEXAO_MS = 5_000;

@Injectable()
export class PrismaAdminTenancyRepository implements AdminTenancyRepositoryPort {
  // ⚠️ Este repositório NÃO recebe o `PrismaService`: as DUAS leituras são do
  // bucket de SISTEMA, e o bucket de SISTEMA é aberto na CREDENCIAL de sistema
  // (#118) — que vem do ambiente (`SYSTEM_DATABASE_URL`), não do client
  // injetado. Injetar um client que a produção não usaria seria uma
  // dependência que mente sobre quem abre a transação.

  async listarInventario(): Promise<InventarioAdminTenancy> {
    // ⚠️ UM `comEscopoDeSistema`, e não dois: as DUAS listas precisam contar a
    // mesma história, e a única forma de garantir isso é lê-las no MESMO
    // instante. Duas transações são dois instantes, e o web disparava as duas
    // em paralelo.
    return comEscopoDeSistema(
      async (tx) => {
        const linhas = await tx.tenant.findMany({
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
              // ⚠️ A ORDEM DOS MEMBROS É FUNCIONAL, não estética: o `orderBy` do
              // nível de cima não alcança a relação aninhada, e sem ele a ordem
              // dos membros sai na ordem que a query interna produzir (heap /
              // índice) — que não é garantida e MUDA depois de qualquer UPDATE
              // em `tenant_memberships` ou de um VACUUM. O spec depende da
              // posição, e hoje ele passa só porque a empresa do fixture tem
              // UM membro. O `id` desempata: `user.name` NÃO é único.
              orderBy: [{ user: { name: 'asc' } }, { id: 'asc' }],
              select: {
                role: true,
                user: { select: { id: true, name: true, email: true } },
                profile: { select: { slug: true, tenantId: true } },
              },
            },
          },
          // ⚠️ A ordem é FUNCIONAL, não estética: a tela lista as empresas por
          // nome, e uma ordem estável faz o e2e e o diff da tela valerem. E o
          // `id` desempata — `tenants.name` NÃO é único (`slug` que é), e sem
          // desempate duas empresas com o mesmo nome podem sair em qualquer
          // ordem, e a ordem PODE mudar entre chamadas (seq scan vs index
          // scan, parallel worker, HOT update, VACUUM).
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        });

        const usuarios = await tx.user.findMany({
          // Mesma regra de `GET /users` (default `includeDeleted=false`): a conta
          // apagada não é pessoa para o admin, e o filtro mora no `where` para
          // que a lista e a contagem contem a MESMA história.
          where: { deletedAt: null },
          select: {
            id: true,
            name: true,
            email: true,
            memberships: {
              // A mesma ordem dos MEMBROS, pelo mesmo motivo: a relação
              // aninhada não herda o `orderBy` do nível de cima.
              orderBy: [{ tenant: { name: 'asc' } }, { id: 'asc' }],
              select: {
                role: true,
                tenant: { select: { id: true, name: true, slug: true } },
                profile: { select: { slug: true, tenantId: true } },
              },
            },
          },
          // O mesmo desempate: `users.name` NÃO é único (`email` que é).
          orderBy: [{ name: 'asc' }, { id: 'asc' }],
        });

        return {
          empresas: linhas.map((linha) => ({
            id: linha.id,
            nome: linha.name,
            slug: linha.slug,
            membros: linha.memberships.map((membership) => ({
              id: membership.user.id,
              nome: membership.user.name,
              email: membership.user.email,
              role: membership.role,
              perfil: slugEfetivo(membership.profile, linha.id),
            })),
          })),
          usuarios: usuarios.map((linha) => ({
            id: linha.id,
            nome: linha.name,
            email: linha.email,
            empresas: linha.memberships.map((membership) => ({
              id: membership.tenant.id,
              nome: membership.tenant.name,
              slug: membership.tenant.slug,
              role: membership.role,
              perfil: slugEfetivo(membership.profile, membership.tenant.id),
            })),
          })),
        };
      },
      { timeout: PRAZO_DO_INVENTARIO_MS, maxWait: ESPERA_PELA_CONEXAO_MS },
    );
  }
}
