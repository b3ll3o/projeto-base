// apps/api/src/shared/infrastructure/security/user-profile-cache.service.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): cache in-memory com TTL de 5s para
// o resultado de `obterMeuPerfil(userId)`. Justificativa do TTL curto:
// o cache é invalidado em TODA escrita (Profile.update, Authorization.
// assign/revoke, User.atribuirPerfil), então 5s é teto de staleness
// aceitável. Trocar para Redis mais tarde se o sistema virar multi-instância.

import { Injectable } from '@nestjs/common';

interface CacheEntry {
  expiresAt: number;
  value: {
    profileId: string | null;
    profileSlug: string | null;
    profileName: string | null;
    isAdmin: boolean;
    permissions: string[];
  };
}

const TTL_MS = 5_000;

@Injectable()
export class UserProfileCacheService {
  readonly #store = new Map<string, CacheEntry>();

  async getUserProfileAndPermissions(userId: string): Promise<CacheEntry['value'] | null> {
    const entry = this.#store.get(userId);
    if (entry === undefined) {
      return null;
    }
    if (entry.expiresAt < Date.now()) {
      this.#store.delete(userId);
      return null;
    }
    return entry.value;
  }

  async setUserProfileAndPermissions(userId: string, value: CacheEntry['value']): Promise<void> {
    this.#store.set(userId, {
      expiresAt: Date.now() + TTL_MS,
      value,
    });
  }

  async invalidateUser(userId: string): Promise<void> {
    this.#store.delete(userId);
  }

  async invalidateAll(): Promise<void> {
    this.#store.clear();
  }
}
