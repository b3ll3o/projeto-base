// apps/api/src/modules/profiles/domain/authorization.entity.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): entidade Authorization (perfil TEM
// permissão). Modelada como entity e não como VO porque tem identidade
// (id) e ciclo de vida (assign/revoke) — o par (profileId, key) é
// único, então o id é gerado pelo DB mas existe no domínio.

import type { ProfileId } from './value-objects/profile-id.vo.js';
import { type AuthorizationKey } from './value-objects/authorization-key.vo.js';

export class Authorization {
  readonly #id: string;
  readonly #profileId: ProfileId;
  readonly #key: AuthorizationKey;
  readonly #createdAt: Date;
  #updatedAt: Date;

  private constructor(props: {
    id: string;
    profileId: ProfileId;
    key: AuthorizationKey;
    createdAt: Date;
    updatedAt: Date;
  }) {
    this.#id = props.id;
    this.#profileId = props.profileId;
    this.#key = props.key;
    this.#createdAt = props.createdAt;
    this.#updatedAt = props.updatedAt;
    Object.freeze(this);
  }

  static create(props: {
    id: string;
    profileId: ProfileId;
    key: AuthorizationKey;
    agora: Date;
  }): Authorization {
    return new Authorization({
      id: props.id,
      profileId: props.profileId,
      key: props.key,
      createdAt: props.agora,
      updatedAt: props.agora,
    });
  }

  static restore(props: {
    id: string;
    profileId: ProfileId;
    key: AuthorizationKey;
    createdAt: Date;
    updatedAt: Date;
  }): Authorization {
    return new Authorization(props);
  }

  get id(): string {
    return this.#id;
  }

  profileId(): ProfileId {
    return this.#profileId;
  }

  key(): AuthorizationKey {
    return this.#key;
  }

  createdAt(): Date {
    return this.#createdAt;
  }

  updatedAt(): Date {
    return this.#updatedAt;
  }
}
