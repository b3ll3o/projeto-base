// apps/api/src/modules/profiles/infrastructure/http/guards/permissions.guard.spec.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): smoke test do PermissionsGuard.
// Verifica que:
//   1. Sem `isAdmin` e sem `permissions`, nega.
//   2. Com `isAdmin=true`, libera QUALQUER `@RequirePermission` (bypass).
//   3. Com `permissions` contendo a key, libera.
//   4. Com `permissions` SEM a key, nega.
//   5. Com o cache FRIO, hidrata do `obterMeuPerfil` (read-through) antes de
//      decidir — e escreve o resultado de volta em `req.user`.
//
// (5) é o teste de regressão do #97: sem ele, remover a hidratação deixa a
// suíte VERDE e o módulo volta a 403ar todo mundo que tem a permissão.

import { describe, it, expect, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard.js';
import type { UserProfileUseCases } from '../../../application/profiles.use-cases.js';

const KEY_GUARD = 'permissions.guard:key';

/** O que o `obterMeuPerfil` resolve — o subset que o guard consome. */
type Perfil = { isAdmin: boolean; permissions: string[] };

interface Ctx {
  ctx: ExecutionContext;
  req: { user: unknown };
}

function makeCtx(user: unknown): Ctx {
  // O MESMO objeto de request em toda chamada: o guard escreve de volta em
  // `req.user` e o teste precisa ler o que sobrou, não uma cópia nova.
  const req = { user };
  const ctx = {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { ctx, req };
}

function makeGuard(
  meta: unknown,
  perfil: Perfil = { isAdmin: false, permissions: [] },
): { guard: PermissionsGuard; useCases: UserProfileUseCases } {
  // O Reflector mockado devolve `meta` para QUALQUER chave de metadata
  // (em runtime, o decorator seta a chave certa — `KEY_GUARD`).
  const reflector = {
    getAllAndOverride: vi.fn().mockReturnValue(meta),
  } as unknown as Reflector;
  const useCases = {
    obterMeuPerfil: vi.fn().mockResolvedValue(perfil),
  } as unknown as UserProfileUseCases;
  return { guard: new PermissionsGuard(reflector, useCases), useCases };
}

describe('PermissionsGuard', () => {
  it('Nega (403) quando o user não tem `isAdmin` nem a permission', async () => {
    const { guard } = makeGuard([KEY_GUARD]);
    const { ctx } = makeCtx({ isAdmin: false, permissions: [] });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('Libera quando `isAdmin=true` mesmo sem a permission (bypass total)', async () => {
    const { guard } = makeGuard([KEY_GUARD]);
    const { ctx } = makeCtx({ isAdmin: true, permissions: [] });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('Libera quando `permissions` contém a key exigida', async () => {
    const { guard } = makeGuard([KEY_GUARD]);
    const { ctx } = makeCtx({ isAdmin: false, permissions: [KEY_GUARD] });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('Nega (403) quando `permissions` é NÃO-vazio mas NÃO contém a key', async () => {
    const { guard } = makeGuard([KEY_GUARD]);
    const { ctx } = makeCtx({ isAdmin: false, permissions: ['other.thing'] });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('Sem `@RequirePermission` no handler, libera qualquer user autenticado', async () => {
    const { guard } = makeGuard(undefined);
    const { ctx } = makeCtx({ isAdmin: false, permissions: [] });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  // ─── O read-through (o defeito que o #97 corrigiu) ─────────────────────────

  it('cache FRIO: hidrata do `obterMeuPerfil` e libera quem tem a permissão', async () => {
    // O `JwtAuthGuard` chega aqui com `permissions: []` — ele só LÊ o cache e
    // o único produtor é `GET /me/profile`. Sem hidratar aqui, este caso é um
    // 403 para um ator que TEM `admin.manage-profiles`.
    const { guard } = makeGuard([KEY_GUARD], { isAdmin: false, permissions: [KEY_GUARD] });
    const { ctx } = makeCtx({ sub: 'user-1', isAdmin: false, permissions: [] });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('cache FRIO: o `isAdmin` hidratado também vale (o bypass não some)', async () => {
    const { guard } = makeGuard([KEY_GUARD], { isAdmin: true, permissions: [] });
    const { ctx } = makeCtx({ sub: 'user-1', isAdmin: false, permissions: [] });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('escreve o perfil hidratado de volta em `req.user` (o `atorDe` lê dali)', async () => {
    // Os controllers montam o `AtorAutenticado` a partir de `req.user.isAdmin`
    // (`atorDe`). Sem a escrita de volta, a escalada checaria um `isAdmin`
    // congelado em `false` e recusaria até o admin legítimo.
    const { guard } = makeGuard([KEY_GUARD], {
      isAdmin: true,
      permissions: ['admin.manage-users'],
    });
    const { ctx, req } = makeCtx({ sub: 'user-1', isAdmin: false, permissions: [] });

    await guard.canActivate(ctx);

    expect(req.user).toEqual({
      sub: 'user-1',
      isAdmin: true,
      permissions: ['admin.manage-users'],
    });
  });

  it('NÃO hidrata quando o handler não exige permissão (rota livre de `@RequirePermission`)', async () => {
    const { guard, useCases } = makeGuard(undefined);
    const { ctx } = makeCtx({ sub: 'user-1', isAdmin: false, permissions: [] });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);

    expect(useCases.obterMeuPerfil).not.toHaveBeenCalled();
  });

  it('sem `sub` no token, não hidrata e decide só pelo que o `JwtAuthGuard` deixou', async () => {
    const { guard, useCases } = makeGuard([KEY_GUARD]);
    const { ctx } = makeCtx({ isAdmin: true, permissions: [] });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);

    expect(useCases.obterMeuPerfil).not.toHaveBeenCalled();
  });
});
