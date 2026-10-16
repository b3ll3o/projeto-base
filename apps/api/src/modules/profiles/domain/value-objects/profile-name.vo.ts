// apps/api/src/modules/profiles/domain/value-objects/profile-name.vo.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): nome legível do Profile (rótulo
// editável). Diferente do slug (imutável, kebab-case), o name aceita
// acentos, espaços e até 80 chars — é o que aparece na UI.

import { UserValidationException } from '../../../users/domain/exceptions/user.exceptions.js';

const MIN_LENGTH = 2;
const MAX_LENGTH = 80;

export class ProfileName {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  static create(value: unknown): ProfileName {
    if (typeof value !== 'string') {
      throw new UserValidationException('name', 'deve ser uma string');
    }
    const trimmed = value.trim();
    if (trimmed.length < MIN_LENGTH) {
      throw new UserValidationException(
        'name',
        `deve ter ao menos ${MIN_LENGTH} caracteres`,
      );
    }
    if (trimmed.length > MAX_LENGTH) {
      throw new UserValidationException(
        'name',
        `deve ter no máximo ${MAX_LENGTH} caracteres`,
      );
    }
    return new ProfileName(trimmed);
  }

  get value(): string {
    return this.#value;
  }

  toString(): string {
    return this.#value;
  }

  equals(other: ProfileName): boolean {
    return this.#value === other.value;
  }
}

export function profileName(value: string): ProfileName {
  return ProfileName.create(value);
}
