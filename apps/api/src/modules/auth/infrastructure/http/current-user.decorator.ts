// apps/api/src/modules/auth/infrastructure/http/current-user.decorator.ts
//
// `@CurrentUser()` — injeta o `TokenSubject` publicado pelo `JwtAuthGuard`.
//
// ── POR QUE LER DE `request.user` E NÃO DE VOLTA AO EMISSOR ─────────────────
//
// O guard JÁ validou assinatura, expiração e `typ` neste request. O
// controller que usa `@CurrentUser()` está atrás do guard, então revalidar
// ali seria jogar fora a validação e paying o custo de criptografia duas
// vezes por request. `request.user` é o resultado único da validação.
//
// ── O QUE ELE DEVOLVE NA PRÁTICA ────────────────────────────────────────────
//
// `TokenSubject | undefined`. O `undefined` é o caso REAL: `GET /auth/me`
// fica atrás do guard, mas qualquer rota marcada `@Public()` que use o
// decorator recebe `undefined` em vez de um subject. Tipar como
// `TokenSubject` (non-null) seria mentir para o compilador e esconder um
// `TypeError` em runtime. Os handlers que exigem sessão narrowing explícito.

import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { TokenSubject } from '../../domain/ports/token-issuer.port.js';

interface RequestWithUser {
  user?: TokenSubject;
}

/**
 * @example
 * ```ts
 * @Get('me')
 * async me(@CurrentUser() user: TokenSubject | undefined) { ... }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TokenSubject | undefined =>
    ctx.switchToHttp().getRequest<RequestWithUser>().user,
);
