// apps/api/src/shared/infrastructure/security/user-profile-cache.service.spec.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): smoke test do UserProfileCacheService.
// Garante que o cache de 5s TTL para user→{isAdmin, permissions[]} funciona.

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { UserProfileCacheService } from './user-profile-cache.service.js';

describe('UserProfileCacheService', () => {
  let svc: UserProfileCacheService;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    svc = new UserProfileCacheService();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retorna null para userId não cacheado', async () => {
    expect(await svc.getUserProfileAndPermissions('user-1')).toBeNull();
  });

  it('set + get retorna valor armazenado', async () => {
    await svc.setUserProfileAndPermissions('user-1', { isAdmin: true, permissions: ['users.read'], profileId: 'p1', profileSlug: 'admin', profileName: 'Admin' });
    expect(await svc.getUserProfileAndPermissions('user-1')).toEqual({
      isAdmin: true,
      permissions: ['users.read'],
      profileId: 'p1',
      profileSlug: 'admin',
      profileName: 'Admin',
    });
  });

  it('valor expira após 5s (TTL)', async () => {
    await svc.setUserProfileAndPermissions('user-1', { isAdmin: false, permissions: [], profileId: null, profileSlug: null, profileName: null });
    expect(await svc.getUserProfileAndPermissions('user-1')).not.toBeNull();
    vi.advanceTimersByTime(5_001);
    expect(await svc.getUserProfileAndPermissions('user-1')).toBeNull();
  });

  it('valor persiste antes de 5s', async () => {
    await svc.setUserProfileAndPermissions('user-1', { isAdmin: true, permissions: [], profileId: null, profileSlug: null, profileName: null });
    vi.advanceTimersByTime(4_999);
    expect(await svc.getUserProfileAndPermissions('user-1')).not.toBeNull();
  });

  it('invalidateUser remove apenas o userId', async () => {
    await svc.setUserProfileAndPermissions('user-1', { isAdmin: true, permissions: [], profileId: null, profileSlug: null, profileName: null });
    await svc.setUserProfileAndPermissions('user-2', { isAdmin: false, permissions: [], profileId: null, profileSlug: null, profileName: null });
    await svc.invalidateUser('user-1');
    expect(await svc.getUserProfileAndPermissions('user-1')).toBeNull();
    expect(await svc.getUserProfileAndPermissions('user-2')).not.toBeNull();
  });

  it('invalidateAll limpa tudo', async () => {
    await svc.setUserProfileAndPermissions('user-1', { isAdmin: true, permissions: [], profileId: null, profileSlug: null, profileName: null });
    await svc.setUserProfileAndPermissions('user-2', { isAdmin: true, permissions: [], profileId: null, profileSlug: null, profileName: null });
    await svc.invalidateAll();
    expect(await svc.getUserProfileAndPermissions('user-1')).toBeNull();
    expect(await svc.getUserProfileAndPermissions('user-2')).toBeNull();
  });
});
