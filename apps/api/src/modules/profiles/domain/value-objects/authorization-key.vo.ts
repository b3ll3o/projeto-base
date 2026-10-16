// apps/api/src/modules/profiles/domain/value-objects/authorization-key.vo.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): chave de permissão canônica.
// Formato: `recurso.acao` em kebab-case snake_hybrid (admin.manage_all,
// users.read, profiles.write). Valida que existe no catalog — caso
// contrário é typo ou permissão fantasma que o guard não vai reconhecer.

import {
  isPermissionKey,
  listAllPermissions,
  type PermissionKey,
} from '../../../../shared/auth/permissions-catalog.js';

export class InvalidPermissionKeyException extends Error {
  readonly code = 'INVALID_PERMISSION_KEY' as const;
  constructor(public readonly key: string) {
    super(`Permission key inválida: '${key}'. Keys válidas: ${listAllPermissions().join(', ')}`);
    Object.setPrototypeOf(this, InvalidPermissionKeyException.prototype);
  }
}

export class AuthorizationKey {
  readonly #value: PermissionKey;

  private constructor(value: PermissionKey) {
    this.#value = value;
  }

  static create(raw: string): AuthorizationKey {
    if (!isValidPermissionKey(raw)) {
      throw new InvalidPermissionKeyException(raw);
    }
    return new AuthorizationKey(raw as PermissionKey);
  }

  static restore(raw: string): AuthorizationKey {
    // usado em hidratação — não valida (assume que o DB é fonte da verdade)
    return new AuthorizationKey(raw as PermissionKey);
  }

  get value(): PermissionKey {
    return this.#value;
  }

  equals(other: AuthorizationKey): boolean {
    return this.#value === other.#value;
  }
}

export function isValidPermissionKey(raw: string): boolean {
  return isPermissionKey(raw);
}

export function authorizationKey(raw: string): AuthorizationKey {
  return AuthorizationKey.create(raw);
}
