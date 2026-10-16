// apps/api/src/modules/profiles/domain/value-objects/profile-id.vo.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): UUID v4 do Profile. Cria com
// `crypto.randomUUID()` (formato canônico do BC Users). Mesmo padrão
// do `UserId` para manter a fronteira de tipos.

import { randomUUID } from 'node:crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class ProfileId {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  static create(value?: string): ProfileId {
    if (value === undefined) {
      return new ProfileId(randomUUID());
    }
    if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
      throw new Error(`ProfileId inválido: ${typeof value === 'string' ? '[REDACTED]' : typeof value}`);
    }
    return new ProfileId(value);
  }

  get value(): string {
    return this.#value;
  }

  toString(): string {
    return this.#value;
  }

  equals(other: ProfileId): boolean {
    return this.#value === other.value;
  }
}

export function profileId(value?: string): ProfileId {
  return ProfileId.create(value);
}
