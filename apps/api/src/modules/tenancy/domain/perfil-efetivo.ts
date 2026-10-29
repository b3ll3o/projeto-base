// apps/api/src/modules/tenancy/domain/perfil-efetivo.ts
//
// pt-BR (visão de admin, 2026-10-29 — revisão do PR #127): a regra do "perfil
// efetivo" tem UM DONO.
//
// A REGUA
// O perfil efetivo de uma membership é o perfil que a API resolve para ela:
// o perfil GLOBAL (`tenant_id IS NULL`, que serve a qualquer empresa por
// definição — D3) ou o perfil DAQUELA empresa. Um `profile_id` apontado para
// o perfil de OUTRA empresa não resolve nada — a empresa seria escolhida pelo
// funil do login sem que a pessoa pudesse fazer nada nela.
//
// ⚠️ A REGRA TINHA TRÊS CASAS. `findProfileId`
// (`prisma-tenant-membership.repository.ts`), `perfilEfetivoPorUsuario`
// (`prisma-user.repository.ts`) e a visão de admin
// (`prisma-admin-tenancy.repository.ts`) reescreviam o mesmo critério, e
// nenhuma das três via o mesmo dono. O custo é o que o dono descreve: se a
// regra evoluir, quem corrigir uma deixa as outras duas em silêncio — e o
// sintoma é invisível (todo o resto da tela funciona, e a API resolve um
// perfil que ela não resolve para aquela empresa).
//
// ⚠️ O QUE ESTE ARQUIVO NÃO DONA: o FILTRO Prisma (`profile: { OR: [...] }`)
// continua na query, e é de propósito — o filtro que ninguém pode esquecer
// porque está no `where` é a forma como o repositório garante a DONA do
// perfil. O que mora AQUI é o predicado, que é o mesmo conhecimento escrito
// em TypeScript.

/** O perfil que uma membership veste — no recorte que a regra precisa. */
export interface PerfilComDono {
  /** A empresa dona do perfil. `null` = perfil GLOBAL (D3). */
  tenantId: string | null;
}

/**
 * O perfil `profile` é o perfil EFETIVO no bucket `tenantId`?
 *
 * - `profile === null` → **não**: membership sem perfil não resolve perfil
 *   nenhum (o `?? null` de quem chama).
 * - `tenantId === null` (bucket GLOBAL) → **só** o perfil global vale: no
 *   bucket de sistema o perfil de uma EMPRESA não é alcançável.
 * - `tenantId` preenchido (bucket de EMPRESA) → o perfil global **ou** o da
 *   empresa valem.
 */
export function temPerfilEfetivo(profile: PerfilComDono | null, tenantId: string | null): boolean {
  if (profile === null) return false;
  if (tenantId === null) return profile.tenantId === null;
  return profile.tenantId === null || profile.tenantId === tenantId;
}
