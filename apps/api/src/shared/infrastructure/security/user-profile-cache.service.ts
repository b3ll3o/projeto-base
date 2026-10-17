// apps/api/src/shared/infrastructure/security/user-profile-cache.service.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): cache in-memory com TTL de 5s para
// o resultado de `obterMeuPerfil(userId)`. Justificativa do TTL curto:
// o cache é invalidado em TODA escrita (Profile.update, Authorization.
// assign/revoke, User.atribuirPerfil), então 5s é teto de staleness
// aceitável. Trocar para Redis mais tarde se o sistema virar multi-instância.
//
// pt-BR (Fase 3 — tenancy, 2026-10-16): a chave passou de `userId` para o
// PAR `(tenantId, userId)`. Chavear só pelo usuário é **vazamento horizontal
// de privilégio**: a mesma conta em duas empresas herdaria o perfil — e o
// `isAdmin` — da empresa anterior por até 5s. `tenantId = null` (rota sem
// `X-Tenant-Id`) é um bucket próprio, que resolve o perfil GLOBAL
// (`users.profile_id`) e nunca o de uma empresa.
//
// ⚠️ Não confundir com deny-by-default: o bucket `null` NÃO é "sem
// permissão" — o perfil global é onde mora o `isAdmin`. O que a chave por
// tenant garante é que nenhuma empresa contamine a outra, não que sem header
// ninguém tenha poder.

import { Injectable } from '@nestjs/common';

interface CacheEntry {
  expiresAt: number;
  /** pt-BR: guardado para `invalidateUser` varrer por usuário sem fatiar a chave. */
  userId: string;
  value: {
    profileId: string | null;
    profileSlug: string | null;
    profileName: string | null;
    isAdmin: boolean;
    permissions: string[];
  };
}

const TTL_MS = 5_000;

/**
 * pt-BR: os dois lados são UUID em produção e `sem-tenant` quando ausente, e
 * nenhum dos dois é controlado por quem escreve a chave — `::` não colide.
 */
function chaveDe(tenantId: string | null, userId: string): string {
  return `${tenantId ?? 'sem-tenant'}::${userId}`;
}

@Injectable()
export class UserProfileCacheService {
  readonly #store = new Map<string, CacheEntry>();

  async getUserProfileAndPermissions(
    tenantId: string | null,
    userId: string,
  ): Promise<CacheEntry['value'] | null> {
    const chave = chaveDe(tenantId, userId);
    const entry = this.#store.get(chave);
    if (entry === undefined) {
      return null;
    }
    if (entry.expiresAt < Date.now()) {
      this.#store.delete(chave);
      return null;
    }
    return entry.value;
  }

  async setUserProfileAndPermissions(
    tenantId: string | null,
    userId: string,
    value: CacheEntry['value'],
  ): Promise<void> {
    this.#store.set(chaveDe(tenantId, userId), {
      expiresAt: Date.now() + TTL_MS,
      userId,
      value,
    });
  }

  /**
   * pt-BR (Fase 3): apaga o usuário em **todas** as empresas, não só numa.
   * Uma escrita de perfil numa empresa não deveria deixar a entrada da outra
   * pendurada, e o caminho seguro (limpar a mais) custa uma varredura num Map
   * pequeno em vez de acertar o tenant certo.
   */
  async invalidateUser(userId: string): Promise<void> {
    for (const [chave, entry] of this.#store) {
      if (entry.userId === userId) {
        this.#store.delete(chave);
      }
    }
  }

  async invalidateAll(): Promise<void> {
    this.#store.clear();
  }
}
