// apps/api/src/modules/auth/infrastructure/http/jwt-auth.guard.ts
//
// JwtAuthGuard — fronteira de autenticação das rotas de `/users` (Fase 6).
//
// Contrato: `Authorization: Bearer <accessToken>` → `request.user = TokenSubject`.
// Falta de header, header malformado, token inválido/expirado, ou refresh
// token no lugar de access → 401 `UNAUTHORIZED`.
//
// ── AS DUAS BARREIRAS CONTRA REFRESH VIRAR ACCESS ───────────────────────────
//
// 1. `validarAccessToken` (port) — a implementação rejeita `typ !== 'access'`.
// 2. Este guard — revalida `subject.typ === 'access'` antes de liberar.
//
// A segunda existe porque a primeira é uma promessa de outra classe: um
// emissor futureiramente reescrito que devolva o `TokenSubject` sem filtrar
// abriria 7 dias de acesso a partir de um token de 15 minutos. Um guard que
// confia na boa-fé do collaborators não é fronteira; é convenção.
//
// ── POR QUE `UnauthorizedException` COM OBJETO, E NÃO `false` ────────────────
//
// `canActivate` devolvendo `false` produz 403 sem corpo pelo Nest, e o
// cliente não distingue "sem token" de "token sem permissão". O payload
// `{ code, detail }` é preservado pelo `GlobalExceptionFilter`
// (`domain-exception-to-http` não é acionado: `HttpException` é resolvida
// antes, lendo `code`/`detail` do response-object).
//
// ── POR QUE UM `detail` ÚNICO ───────────────────────────────────────────────
//
// "Header ausente" ≠ "token expirado" ≠ "refresh no lugar de access" são três
// motivos que o cliente não pode distinguir. O cliente JÁ POSSUI o token: dizer
// qual parte dele falhou só serve a quem está sondando um token roubado. O
// motivo fica na exception (stack/log interno do servidor), não no payload.
//
// ── `@Inject(TOKEN_ISSUER_PORT)` EXPLÍCITO ──────────────────────────────────
//
// Os parâmetros do construtor são interfaces, apagadas em runtime. Sem o
// token explícito o Nest resolve a dependência como `undefined` — e o
// defeito só se manifesta em `dev` (tsx/esbuild não emite
// `design:paramtypes`), nunca no build. Mesma razão que obriga
// `@Inject(USER_USE_CASES)` no `UsersController`.

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  TOKEN_ISSUER_PORT,
  type TokenIssuerPort,
  type TokenSubject,
} from '../../domain/ports/token-issuer.port.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { UserProfileCacheService } from '../../../../shared/infrastructure/security/user-profile-cache.service.js';

/**
 * Extrai o token do header `Authorization`.
 *
 * RFC 7235 §2.1: o esquema (`Bearer`) é case-insensitive. O que NÃO é
 * tolerado é token vazio — `"Bearer "` sem credencial é header malformado,
 * não "token em branco que o emissor vai recusar".
 */
function extractBearerToken(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }
  const match = /^Bearer[ \t]+(\S+)[ \t]*$/i.exec(raw);
  return match?.[1] ?? null;
}

/** Request Fastify com o campo `user` que este guard publica. */
interface RequestWithUser {
  headers?: Record<string, unknown>;
  user?: TokenSubject & {
    isAdmin?: boolean;
    permissions?: readonly string[];
  };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(TOKEN_ISSUER_PORT) private readonly tokenIssuer: TokenIssuerPort,
    // pt-BR: `@Inject(Reflector)` EXPLÍCITO, mesmo sendo uma classe
    // concreta. `Reflector` seria resolvida por `design:paramtypes` — e o
    // `tsx` (esbuild) NÃO emite essa metadata, então sem o token o Nest
    // passa `undefined` e o primeiro request morre com
    // `Cannot read properties of undefined (reading 'getAllAndOverride')`.
    //
    // MEDIDO 2026-10-13: o teste unitário do guard (que instancia com
    // `new JwtAuthGuard(issuer, new Reflector())`) ficava VERDE com este
    // defeito — o problema só existe quando o CONTAINER constrói o guard.
    // Só a spec que sobe o controller de verdade via `app.inject` mediu.
    @Inject(Reflector) private readonly reflector: Reflector,
    // pt-BR (#93.1 — RBAC, 2026-10-16): injeta o cache para popular
    // `req.user.isAdmin` e `req.user.permissions` em CADA request.
    // O cache é invalidado em writes (Profile update, Authorization
    // assign/revoke, User atribuirPerfil) — TTL 5s é teto de staleness.
    @Inject(UserProfileCacheService)
    private readonly profileCache: UserProfileCacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // ── 1. Rota pública? (@Public() no handler vence o guard de classe) ────
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic === true) {
      return true;
    }

    // ── 2. Header ausente ou malformado ────────────────────────────────────
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = extractBearerToken(request?.headers?.['authorization']);
    if (token === null) {
      throw this.unauthorized();
    }

    // ── 3. Validação criptográfica (assinatura + expiração + typ) ─────────
    let subject: TokenSubject;
    try {
      subject = await this.tokenIssuer.validarAccessToken(token);
    } catch {
      // pt-BR: a mensagem original ("jwt expired", "invalid signature") NÃO
      // vaza para o payload — ela distingue os casos para quem sondar um
      // token roubado. O log do servidor já registra a exception.
      throw this.unauthorized();
    }

    // ── 4. Segunda barreira: `typ` tem que ser 'access' ───────────────────
    if (subject?.typ !== 'access') {
      throw this.unauthorized();
    }

    // ── 5. pt-BR (#93.1 — RBAC, 2026-10-16): hidrata `isAdmin` e
    // `permissions` do cache. Falha do cache NÃO bloqueia — se a key
    // não estiver cacheada (TTL expirou, user sem profile, etc) o
    // request passa com `isAdmin=false` e `permissions=[]`. O use case
    // `obterMeuPerfil` é quem re-popula na próxima chamada.
    const cached = await this.profileCache.getUserProfileAndPermissions(subject.sub);
    request.user = {
      ...subject,
      isAdmin: cached?.isAdmin ?? false,
      permissions: cached?.permissions ?? [],
    };
    return true;
  }

  /**
   * 401 único para toda falha de autenticação.
   *
   * O `code` é `UNAUTHORIZED` e não `INVALID_CREDENTIALS`: este guard trata
   * de token AUSENTE/INVÁLIDO numa rota protegida. `INVALID_CREDENTIALS`
   * (contrato E) é do login — e-mail/senha errados, onde a mensagem também
   * é genérica por enumeração de contas.
   */
  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'UNAUTHORIZED',
      detail: 'Sessão ausente ou inválida. Autentique-se para acessar este recurso.',
    });
  }
}
