// apps/api/src/shared/auth/eh-administrador-de-sistema.ts
//
// pt-BR (feature-flags, 2026-10-18 — decisão D11 do plano): a regra saiu de
// `profiles.use-cases.ts`, onde era função de arquivo (não exportada) porque as
// classes daquele arquivo a usavam. O módulo de feature flags precisa da MESMA
// regra, e "administrador do sistema" não pode ter duas escritas.
//
// pt-BR (visão de admin, 2026-10-29 — revisão do PR #127): este arquivo passou
// a ser o dono de TRÊS coisas, e não de uma. A revisão mediu cinco cópias do
// mapeamento `req.user` → `AtorAutenticado` e duas do portão D2 — todas
// idênticas, todas com o mesmo nome de método, e nenhuma com um gate que
// apontasse a divergência. "Administrador do sistema" é UMA decisão: ela tem
// um dono, e este é ele.

import { ForbiddenException } from '@nestjs/common';

/**
 * Identidade do ator autenticado, o mínimo que as travas de escalada
 * precisam: QUEM é e SE é admin. Vem do `req.user` publicado pelo
 * `JwtAuthGuard` (que hidrata `isAdmin` do cache de profile).
 */
export interface AtorAutenticado {
  readonly userId: string;
  /**
   * pt-BR (Fase 3): empresa em que o ato acontece. `null` = rota sem
   * `X-Tenant-Id`.
   *
   * **Obrigatório** (não `?`) para que nenhuma chamada possa omitir a empresa
   * em silêncio. Desde a Fase 4 ele é lido de verdade: o perfil efetivo do ator
   * vem de `tenant_memberships.profile_id` quando há empresa, e do perfil
   * GLOBAL (`users.profile_id`) quando não há.
   *
   * ⚠️ `null` NÃO é "sem permissão nenhuma": é o bucket dos perfis de sistema
   * (D3, `profiles.tenant_id IS NULL`), onde mora o único `isAdmin`.
   */
  readonly tenantId: string | null;
  readonly isAdmin: boolean;
}

/**
 * pt-BR (Fase 9, 2026-10-17): o bucket de SISTEMA tem dono, e o dono é `isAdmin`
 * — não o bucket.
 *
 * `ator.tenantId === null` significa "rota sem `X-Tenant-Id`", e a Fase 8 leu
 * isso como "sou o admin global, então vejo tudo". A leitura é falsa: o bucket
 * de SISTEMA tem DOIS perfis no seed — `admin` (com `isAdmin`) e `viewer` (sem
 * nada) — e o que dá bypass total no `PermissionsGuard` é o `isAdmin`, nunca o
 * bucket. MEDIDO 2026-10-17 contra Postgres real: um perfil global **não-admin**
 * com `admin.manage-*` listava, renomeava, apagava e injetava permissão em perfil
 * de empresa vizinha sem header nenhum, e vestia perfil de empresa em conta
 * alheia. O alvo do último caso perdia o perfil inteiro, porque
 * `findProfileId(_, null)` só aceita `tenant_id IS NULL`.
 *
 * A contrapartida que não pode regredir: o admin de SISTEMA continua vendo
 * tudo. Sem ele o seed volta a ser a única porta de administração, que é a
 * dependência que a Fase 5 removeu de propósito.
 *
 * É a MESMA regra que `findProfileId` já aplica no ramo global do bucket
 * (`profile: { is: { tenantId: null } }`, em
 * `prisma-tenant-membership.repository.ts:49`): o bucket de sistema resolve o
 * bucket de sistema. A leitura sempre teve a trava; a escrita não.
 */
export function ehAdministradorDeSistema(ator: AtorAutenticado): boolean {
  return ator.tenantId === null && ator.isAdmin;
}

/**
 * O `req.user` publicado pelo `JwtAuthGuard` — o mínimo que o ator precisa.
 *
 * ⚠️ Este tipo é o MESMO nos cinco controllers que montam o ator, e ele é
 * exportado para que não haja uma cópia por controller: o `atorDe` abaixo
 * depende dele, e um controller que declarar o seu próprio `RequestComAtor`
 * pode declarar um `user` DIFERENTE — e o `atorDe` aceitaria os dois em
 * silêncio.
 */
export interface ReqComAtor {
  user: { sub: string; tenantId?: string | null; isAdmin?: boolean };
}

/**
 * `req.user` → `AtorAutenticado`.
 *
 * ⚠️ `isAdmin === true` e não `isAdmin`: o ausente precisa virar `false`
 * (fail-closed), não `undefined` — que é falsy num `if` e verdadeiro num
 * `!== false`. O `undefined` só apareceria num ator sem `isAdmin` no token, e
 * é exatamente ali que o esquecimento apareceria.
 *
 * `tenantId` viaja porque D2 o exige em `null` (bucket GLOBAL). Um ator com
 * empresa no header chega aqui com `tenantId` preenchido e é recusado pela use
 * case — que é o comportamento certo, e o mesmo das feature flags.
 */
export function atorDe(req: ReqComAtor): AtorAutenticado {
  return {
    userId: req.user.sub,
    tenantId: req.user.tenantId ?? null,
    isAdmin: req.user.isAdmin === true,
  };
}

/**
 * O portão D2 — e a RECUSA que ele produz.
 *
 * ⚠️ O `detail` é o que separa "a permissão faltou" (o `PermissionsGuard`
 * recusa antes, com outro texto) de "você não é o administrador do sistema" —
 * e o e2e da visão de admin mede essa diferença. Por isso o texto é parâmetro
 * e não constante: as DUAS use cases que usam este portão nomeiam o que o
 * ator não pode fazer, e um texto único diria a mesma coisa para o inventário
 * e para as feature flags.
 *
 * `ForbiddenException` do Nest e não uma exceção de domínio nova: o
 * `GlobalExceptionFilter` resolve `HttpException` ANTES do mapper de domínio
 * (`global-exception.filter.ts:77`), e a recusa sai 403 RFC 7807 sem uma
 * linha nova — e é a mesma exceção que os guards do repositório já lançam.
 */
export function exigeAdministradorDeSistema(ator: AtorAutenticado, detalhe: string): void {
  if (!ehAdministradorDeSistema(ator)) {
    throw new ForbiddenException({ code: 'FORBIDDEN', detail: detalhe });
  }
}
