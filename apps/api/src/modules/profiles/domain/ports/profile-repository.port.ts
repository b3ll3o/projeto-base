// apps/api/src/modules/profiles/domain/ports/profile-repository.port.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): contrato de domínio para o
// repositório de Profile. Não conhece Prisma — a implementação fica
// em infrastructure/persistence/.
//
// Profile não tem soft-delete (config de admin, não dado de negócio).
// O repositório implementa hard delete. As Authorizations ficam
// DENTRO do agregado e são salvas em transação junto com o profile.

import type { Profile } from '../profile.aggregate.js';
import type { ProfileId } from '../value-objects/profile-id.vo.js';
import type { ProfileSlug } from '../value-objects/profile-slug.vo.js';

export const PROFILE_REPOSITORY_PORT = Symbol('ProfileRepositoryPort');

export interface ProfileRepositoryPort {
  /**
   * pt-BR (Fase 9 — RLS): `tenantId` é o ESCOPO DA SESSÃO, o mesmo `null` de
   * `list` — `null` = bucket de SISTEMA (escopo `'*'`, sem filtro), preenchido
   * = aquela empresa. Ele NÃO vai para o `where`: o `id` do perfil é único no
   * schema, e quem decide se a linha é legível é a policy (`profiles_leitura`,
   * que aceita a linha da empresa E a global). Filtrar aqui por `tenantId`
   * quebraria o caminho legítimo do perfil GLOBAL lido de dentro de uma
   * empresa — que é exatamente o perfil que o `PermissionsGuard` resolve pelo
   * `users.profile_id`.
   *
   * Por que o escopo é PARÂMETRO e não contexto implícito: quem esquece de
   * abrir o escopo num parâmetro é um erro de COMPILAÇÃO, e quem esquece num
   * contexto ambiente é um 404 em produção que ninguém sabe explicar.
   */
  findById(id: ProfileId, tenantId: string | null): Promise<Profile | null>;
  /**
   * `tenantId` é o escopo DENTRO do qual o slug tem de ser único, e é a
   * mesma noção dos dois índices parciais do banco: `null` = os perfis
   * globais, preenchido = os daquela empresa. Sem este escopo a checagem de
   * slug duplicado de `criar` não veria a empresa, e o `P2002` do índice
   * parcial viraria 500 no lugar do 409.
   */
  findBySlug(slug: ProfileSlug, tenantId: string | null): Promise<Profile | null>;
  /**
   * ⚠️ `tenantId` aqui tem o sentido OPOSTO de `findBySlug`: `null` significa
   * **sem filtro** (a lista inteira), não "só os globais". A diferença é
   * proposital — `null` no `findBySlug` é o escopo do índice parcial, e o
   * ator sem empresa é o admin global (conta do seed), que precisa ver tudo.
   * Passar `string` devolve só os perfis DAQUELA empresa.
   */
  list(tenantId: string | null): Promise<Profile[]>;
  save(profile: Profile): Promise<Profile>;
  /** Mesmo `tenantId` de `findById`: o escopo da sessão que apaga. */
  delete(id: ProfileId, tenantId: string | null): Promise<void>;
}
