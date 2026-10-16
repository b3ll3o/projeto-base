// apps/api/src/modules/profiles/infrastructure/http/guards/permissions.guard.spec.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): smoke test do PermissionsGuard.
// Verifica que:
//
//   1. Sem `isAdmin` e sem `permissions`, nega.
//   2. Com `isAdmin=true`, libera QUALQUER `@RequirePermission` (bypass).
//   3. Com `permissions` contendo a key, libera.
//   4. Com `permissions` SEM a key, nega.
//
// Estes são os 4 caminhos que o usuário final pode encontrar; cada
// ramo está coberto.

import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard.js';

const KEY_GUARD = 'permissions.guard:key';

function makeCtx(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function makeGuard(meta: unknown): { guard: PermissionsGuard; reflector: Reflector } {
  // O Reflector mockado devolve `meta` para QUALQUER chave de metadata
  // (em runtime, o decorator seta a chave certa — `KEY_GUARD`).
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(meta),
  } as unknown as Reflector;
  return { guard: new PermissionsGuard(reflector), reflector };
}

describe('PermissionsGuard', () => {
  it('Nega (403) quando o user não tem `isAdmin` nem a permission', () => {
    const { guard } = makeGuard([KEY_GUARD]);
    expect(() =>
      guard.canActivate(makeCtx({ isAdmin: false, permissions: [] })),
    ).toThrow(ForbiddenException);
  });

  it('Libera quando `isAdmin=true` mesmo sem a permission (bypass total)', () => {
    const { guard } = makeGuard([KEY_GUARD]);
    expect(
      guard.canActivate(makeCtx({ isAdmin: true, permissions: [] })),
    ).toBe(true);
  });

  it('Libera quando `permissions` contém a key exigida', () => {
    const { guard } = makeGuard([KEY_GUARD]);
    expect(
      guard.canActivate(makeCtx({ isAdmin: false, permissions: [KEY_GUARD] })),
    ).toBe(true);
  });

  it('Nega (403) quando `permissions` é NÃO-vazio mas NÃO contém a key', () => {
    const { guard } = makeGuard([KEY_GUARD]);
    expect(() =>
      guard.canActivate(makeCtx({ isAdmin: false, permissions: ['other.thing'] })),
    ).toThrow(ForbiddenException);
  });

  it('Sem `@RequirePermission` no handler, libera qualquer user autenticado', () => {
    const { guard } = makeGuard(undefined);
    expect(
      guard.canActivate(makeCtx({ isAdmin: false, permissions: [] })),
    ).toBe(true);
  });
});
