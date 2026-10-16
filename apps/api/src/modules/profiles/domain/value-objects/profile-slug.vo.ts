// apps/api/src/modules/profiles/domain/value-objects/profile-slug.vo.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): o slug é o identificador canônico e
// imutável do Profile — kebab-case, 3-40 chars, ^[a-z0-9-]+$, sem
// underscores, sem espaços. Imutável após criação: renomear quebraria
// referências em audit logs e caches.

import { UserValidationException } from '../../../users/domain/exceptions/user.exceptions.js';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_LENGTH = 3;
const MAX_LENGTH = 40;

export class ProfileSlug {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  static create(value: unknown): ProfileSlug {
    if (typeof value !== 'string') {
      throw new UserValidationException('slug', 'deve ser uma string');
    }
    const trimmed = value.trim().toLowerCase();
    if (trimmed.length < MIN_LENGTH) {
      throw new UserValidationException('slug', `deve ter ao menos ${MIN_LENGTH} caracteres`);
    }
    if (trimmed.length > MAX_LENGTH) {
      throw new UserValidationException('slug', `deve ter no máximo ${MAX_LENGTH} caracteres`);
    }
    if (!SLUG_REGEX.test(trimmed)) {
      throw new UserValidationException(
        'slug',
        'deve ser kebab-case (apenas letras minúsculas, números e hífens)',
      );
    }
    return new ProfileSlug(trimmed);
  }

  get value(): string {
    return this.#value;
  }

  toString(): string {
    return this.#value;
  }

  equals(other: ProfileSlug): boolean {
    return this.#value === other.value;
  }
}

export function isValidProfileSlug(value: string): boolean {
  return (
    typeof value === 'string' &&
    value.trim().length >= MIN_LENGTH &&
    value.trim().length <= MAX_LENGTH &&
    SLUG_REGEX.test(value.trim().toLowerCase())
  );
}

export function profileSlug(value: string): ProfileSlug {
  return ProfileSlug.create(value);
}
