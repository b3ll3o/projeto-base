// apps/api/src/shared/auth/permissions-catalog.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): catálogo canônico de TODAS as
// permission keys usadas na API. É a fonte da verdade — qualquer nova
// permissão precisa entrar aqui antes de ser usada num decorator
// `@RequirePermission('...')`. Sem esse catálogo, chaves divergem entre
// decorator e seed/teste e o guard aceita strings que ninguém catalogou.
//
// Convenções:
//   - chave em kebab-case com pontos como separador hierárquico
//     ('users.read', 'admin.manage-profiles')
//   - 'admin.*' existe como namespace visual mas NÃO é curinga
//     (ter 'admin.manage-profiles' não dá 'admin.audit')
//   - o guard compara string exata; sem match, nega (deny-by-default)
//   - o flag `is_admin=true` em Profile é bypass TOTAL e INDEPENDENTE
//     de permissions (defesa em profundidade)
//
// Como adicionar uma permissão nova:
//   1) adicionar a string no array `PERMISSIONS` abaixo
//   2) usar `@RequirePermission('namespace.action')` no controller
//   3) (opcional) atribuir a um perfil via seed ou via endpoint admin
//
// Como auditar quem tem o quê:
//   SELECT permission_key, COUNT(*) FROM authorizations GROUP BY 1;

export const PERMISSIONS = [
  // Users (gestão de usuários)
  'users.read',
  'users.write',
  'users.delete',

  // Admin (gestão de perfis, autorizações e atribuição de perfis a users)
  'admin.manage-profiles',
  'admin.manage-authorizations',
  'admin.manage-users',
  'admin.manage-feature-flags',

  // Auditoria (leitura de audit log)
  'audits.read',
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

/**
 * Type guard: a string é uma PermissionKey catalogada?
 *
 * Usado pelo `@RequirePermission()` decorator para validar em tempo de
 * compilação que a string passada é uma chave conhecida — se passar uma
 * string que não está no catálogo, o guard dá erro 500 explícito em vez
 * de aceitar silenciosamente.
 */
export function isPermissionKey(value: string): value is PermissionKey {
  return (PERMISSIONS as readonly string[]).includes(value);
}

/**
 * Lista todas as chaves como string[] (para iteração em seeds, exports,
 * UI de admin). Não é `as const` aqui porque o consumidor espera
 * `string[]` para `.map()`.
 */
export function listAllPermissions(): string[] {
  return [...PERMISSIONS];
}
