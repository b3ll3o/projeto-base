// apps/api/src/modules/auth/infrastructure/http/jwt-auth.guard.tenant.spec.ts
//
// pt-BR (PR #101, 2026-10-17): o `X-Tenant-Id` é uma DECLARAÇÃO, e o guard a
// aceitava sem conferir nada.
//
// ── O FURO, MEDIDO LINHA A LINHA ANTES DE ESCREVER ESTE TESTE ───────────────
//
//   1. `extractTenantId` (o próprio `jwt-auth.guard.ts:103`) valida o FORMATO
//      do uuid. O comentário dela diz isso na cara: "o FORMATO do uuid, não a
//      existência da empresa".
//   2. `users.controller.ts:108` (`empresaDoAtor`) devolve o header cru.
//   3. `users.controller.ts:162` — a rota `GET /users` não tem
//      `@RequirePermission`; `grep` não acha nenhum no controller inteiro.
//   4. `users.controller.ts:228` — `somenteUsuarioId` só é preenchido quando
//      `empresa === null`. Com header presente, vira `null`: a restrição
//      some.
//   5. `usuario_no_escopo(alvo)` (migration `20261020000001:45`) pergunta "o
//      ALVO pertence à empresa afirmada?" — e NUNCA pergunta se o REQUERENTE
//      pertence.
//
// ⇒ Qualquer conta autenticada, sem permissão nenhuma e sem ser da empresa,
// manda `X-Tenant-Id: <uuid alheio>` e recebe o diretório inteiro daquela
// empresa. `passwordHash` não vaza (o `UserOutput` é literal de chaves
// fixas), o que não é o mesmo que isolamento.
//
// ── POR QUE ESTE É O LUGAR DO CONSERTO ─────────────────────────────────────
// A política de RLS mede a linha ALVO. Nenhuma função do banco pergunta pelo
// requerente — medido por `grep` em TODAS as migrations: todo predicado de
// tenancy compara uma COLUNA da linha contra `escopo_atual()`. Fechar isso
// dentro do RLS exigiria um fato sobre o requerente que o banco não tem; e
// `set_config('app.tenant_id', …, true)` é transacional e auto-declarado. A
// fronteira que sabe quem é o requerente é o guard: é ali que a empresa é
// AFIRMADA, e é ali que o token prova quem fez a afirmação.
//
// ── POR QUE 403 E NÃO 401 ───────────────────────────────────────────────────
// O requerente ESTÁ autenticado — o token é válido. Devolver 401 faria o
// cliente entrar em laço de re-login sem remédio possível. E não pode ser o
// mesmo corpo do 401 de token: "sem sessão" e "sessão válida, empresa errada"
// são fatos diferentes, e o cliente age diferente em cada um.

import { describe, it, expect, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import type { UserProfileCacheService } from '../../../../shared/infrastructure/security/user-profile-cache.service.js';
import type { TenantMembershipRepositoryPort } from '../../../tenancy/domain/ports/tenant-membership-repository.port.js';
import type { TokenIssuerPort, TokenSubject } from '../../domain/ports/token-issuer.port.js';

const SUB = '0190a8b6-0000-7000-8000-000000000001';
const ACME = '0190a8b6-0000-7000-8000-00000000aaaa';
const GLOBEX = '0190a8b6-0000-7000-8000-00000000bbbb';

const SUBJECT: TokenSubject = { sub: SUB, email: 'joao@example.com', typ: 'access' };

class DummyController {
  findOne(): void {}
}

function makeContext(headers: Record<string, unknown>): {
  ctx: ExecutionContext;
  request: { headers: Record<string, unknown>; user?: { tenantId?: string | null } };
} {
  const request = { headers: { authorization: 'Bearer valido', ...headers } };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => DummyController.prototype.findOne,
    getClass: () => DummyController,
  } as unknown as ExecutionContext;
  return { ctx, request };
}

/** `role` = o que `findRole` devolve: `null` é "não é membro". */
function makeGuard(role: string | null) {
  const issuer = {
    validarAccessToken: vi.fn(async () => SUBJECT),
  } as unknown as TokenIssuerPort;

  const findRole = vi.fn(async () => role);
  const memberships = { findRole } as unknown as TenantMembershipRepositoryPort;

  const getUserProfileAndPermissions = vi.fn(async () => null);
  const cache = { getUserProfileAndPermissions } as unknown as UserProfileCacheService;

  return {
    guard: new JwtAuthGuard(issuer, new Reflector(), cache, memberships),
    findRole,
    getUserProfileAndPermissions,
  };
}

describe('JwtAuthGuard — a empresa afirmada no header é conferida', () => {
  it('🔴 recusa a empresa de quem NÃO é membro, e o `tenantId` não é publicado', async () => {
    const { guard, findRole } = makeGuard(null);
    const { ctx, request } = makeContext({ 'x-tenant-id': GLOBEX });

    // MEDIDO antes da correção: isto PASSAVA, e `request.user.tenantId` ficava
    // com o uuid alheio — que é o que `empresaDoAtor` devolvia e o que abria
    // `comEscopo(prisma, escopoDoTenant(tenantId))` na listagem.
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(findRole).toHaveBeenCalledWith(SUB, GLOBEX);
    // O valor NÃO pode ter descido: publicar o tenant recusado é o que faria
    // um handler futuro confiar nele.
    expect(request.user?.tenantId).not.toBe(GLOBEX);
  });

  it('a recusa carrega `code` próprio, e não o 401 de sessão ausente', async () => {
    const { guard } = makeGuard(null);
    const { ctx } = makeContext({ 'x-tenant-id': GLOBEX });

    const erro = await guard.canActivate(ctx).then(
      () => null,
      (e: unknown) => e as ForbiddenException & { getResponse: () => { code?: string } },
    );
    expect(erro).toBeInstanceOf(ForbiddenException);
    expect(erro?.getStatus()).toBe(403);
    expect(erro?.getResponse()).toMatchObject({ code: 'TENANT_MEMBERSHIP_REQUIRED' });
  });

  it('🔴 a recusa acontece ANTES da chave de cache ser formada', async () => {
    // Este é o preço que a correção paga por escolher o guard. Sem esta ordem,
    // um tenant-header arbitrário ainda viraria uma chave no
    // `UserProfileCacheService` — exatamente o crescimento que o comentário de
    // `varreExpiradas` (`user-profile-cache.service.ts:81`) descreve: "cada
    // tentativa vira uma chave nova e nenhuma volta a ser procurada".
    const { guard, getUserProfileAndPermissions } = makeGuard(null);
    const { ctx } = makeContext({ 'x-tenant-id': GLOBEX });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(getUserProfileAndPermissions).not.toHaveBeenCalled();
  });

  it('um membro legítimo atravessa, com o `tenantId` publicado', async () => {
    const { guard, findRole } = makeGuard('gerente');
    const { ctx, request } = makeContext({ 'x-tenant-id': ACME });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(findRole).toHaveBeenCalledWith(SUB, ACME);
    expect(request.user?.tenantId).toBe(ACME);
  });

  it('SEM header não há consulta de membership — o bucket global não é empresa', async () => {
    // `null` não é "empresa nenhuma": é o perfil GLOBAL (`users.profile_id`),
    // onde mora o `isAdmin` do seed. Se este teste exigisse membership aqui,
    // o admin global seria trancado fora do próprio bucket.
    const { guard, findRole } = makeGuard(null);
    const { ctx, request } = makeContext({});

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(findRole).not.toHaveBeenCalled();
    expect(request.user?.tenantId).toBeNull();
  });

  it('um id de empresa em CAIXA ALTA é conferido contra o uuid canonicalizado', async () => {
    // O `UUID_RE` tem flag `/i` e `extractTenantId` devolve minúsculo, porque
    // a policy compara por TEXTO. Conferir a membership com a forma original
    // mediria uma empresa que não existe em minúscula.
    const { guard, findRole } = makeGuard('member');
    const { ctx } = makeContext({ 'x-tenant-id': ACME.toUpperCase() });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(findRole).toHaveBeenCalledWith(SUB, ACME);
  });

  // ── O LIMITE DA GARANTIA (achado do revisor no PR #101) ────────────────────
  //
  // A garantia que o C0 dá é "no INÍCIO do request", não "durante o request".
  // Se a membership é removida com um request em voo, aquele request termina
  // como começou — nenhuma autorização por request pode evitar isso sem
  // revogar o escopo no meio da execução, e o escopo é transacional.
  //
  // Esta spec fixa a perna que sustenta a garantia: a decisão é refeita a CADA
  // request. Com o veredito cacheado, a remoção levaria o TTL do cache (5s)
  // para valer e a janela deixaria de ser "o request em voo" para ser "o TTL" —
  // e a única prova de que isso não acontece é um segundo request, porque o
  // primeiro já tinha dado verde.
  it('🔴 a decisão NÃO é cacheada: a remoção vale já no request seguinte', async () => {
    const { guard, findRole } = makeGuard('member');
    findRole.mockReset();
    findRole.mockResolvedValueOnce('member').mockResolvedValueOnce(null);

    await expect(guard.canActivate(makeContext({ 'x-tenant-id': ACME }).ctx)).resolves.toBe(true);

    // Mesmo token, mesma empresa, nada mudou no cliente: só a membership. Se
    // este segundo request passasse, a remoção teria levado o TTL do cache.
    await expect(
      guard.canActivate(makeContext({ 'x-tenant-id': ACME }).ctx),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(findRole).toHaveBeenCalledTimes(2);
  });
});
