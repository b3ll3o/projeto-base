// apps/api/src/modules/profiles/domain/value-objects/profile-id.vo.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): UUID v4 do Profile. Cria com
// `crypto.randomUUID()` (formato canônico do BC Users). Mesmo padrão
// do `UserId` para manter a fronteira de tipos.

import { randomUUID } from 'node:crypto';
// pt-BR (PR #101, 2026-10-17): `UserValidationException` é a exceção que o
// `domain-exception-to-http.ts:218` mapeia para 400 com `errors[].field`. Os VOs
// gêmeos (`profile-name.vo.ts:7`, `profile-slug.vo.ts:8`) já importam daqui.
import { UserValidationException } from '../../../users/domain/exceptions/user.exceptions.js';
// pt-BR (#136): o dono único da FORMA "é um UUID" no repo. Este VOs usa
// `randomUUID()` — que é v4 — e a forma não impõe versão.
import { UUID_RE_QUALQUER_VERSAO } from '../../../../shared/domain/uuid.js';

export class ProfileId {
  readonly #value: string;

  private constructor(value: string) {
    this.#value = value;
  }

  static create(value?: string): ProfileId {
    if (value === undefined) {
      return new ProfileId(randomUUID());
    }
    if (typeof value !== 'string' || !UUID_RE_QUALQUER_VERSAO.test(value)) {
      // ⚠️ Antes era `new Error(...)`, e o mapper não tem caso para `Error` cru:
      // o fall-through devolve 500. O `motivo` é ESTÁTICO de propósito — a
      // versão anterior interpolava o valor recebido (redigido, mas ainda
      // presente) numa mensagem que pode acabar em log.
      throw new UserValidationException('profileId', 'deve ser um UUID válido');
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
