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
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
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
import type { TenantMembershipRepositoryPort } from '../../../tenancy/domain/ports/tenant-membership-repository.port.js';
import { TENANT_MEMBERSHIP_REPOSITORY_PORT } from '../../../tenancy/domain/ports/tenant-membership-repository.port.js';

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
    tenantId?: string | null;
    isAdmin?: boolean;
    permissions?: readonly string[];
  };
}

/** pt-BR (Fase 3): `tenant_id` é `@db.Uuid` em toda tabela de tenancy. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lê `X-Tenant-Id` — a empresa que o token está agindo (D2).
 *
 * Ausente → `null`. O bucket `null` é o do **perfil GLOBAL**
 * (`users.profile_id`), nunca o de uma empresa: sem header nenhuma empresa é
 * assumida e as rotas sem escopo de empresa seguem funcionando.
 *
 * ⚠️ "sem header" NÃO é "sem permissão": o perfil global é onde mora o
 * `isAdmin` (é o seed que o cria). Quem ler este comentário não pode concluir
 * que omitir o header derruba privilégio — derruba só o escopo. A Fase 4
 * troca a leitura por `tenant_memberships.profile_id`.
 *
 * Presente e malformado → 400. Sem esta validação, o valor desce cru até uma
 * coluna `@db.Uuid` e o cliente toma um 500 do Prisma que ele não tem como
 * corrigir. O header é entrada não confiável: valida na fronteira.
 */
function extractTenantId(raw: unknown): string | null {
  if (raw === undefined) {
    return null;
  }
  if (typeof raw !== 'string' || !UUID_RE.test(raw)) {
    throw new BadRequestException({
      code: 'INVALID_TENANT',
      detail: 'X-Tenant-Id deve ser um UUID de empresa válido.',
    });
  }
  // pt-BR: o `UUID_RE` acima tem flag `/i` — a forma em caixa alta é um uuid
  // VÁLIDO e não pode ser recusada. Mas ela não pode descer crua: o Postgres
  // canoniza `uuid` para minúsculas e a policy compara por texto, então a
  // caixa alta não casa com nada. Um validador que aceita a entrada e entrega
  // uma forma que significa outra coisa é o defeito, e a falha é silenciosa
  // (zero linhas, não erro). Canonicaliza na fronteira para que
  // `request.user.tenantId` — e a chave do cache de perfil, que é o par
  // (empresa, usuário) — tenham uma forma só. `abrirEscopo` normaliza de novo,
  // porque é o único escritor do GUC e o resto dos call sites não vem daqui.
  return raw.toLowerCase();
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
    // pt-BR (PR #101, 2026-10-17): a ÚNICA dependência que prova que o
    // requerente pertence à empresa que ele afirma no header. Sem ela, o
    // `X-Tenant-Id` é uma declaração auto-declarada que decide qual escopo de
    // RLS a sessão abre — e nenhuma policy do banco pergunta pelo requerente
    // (MEDIDO: todo predicado de tenancy compara uma COLUNA da linha contra
    // `escopo_atual()`, em todas as migrations).
    //
    // O token `@Inject` é redundante com o resto do arquivo, mas explícito
    // porque o parâmetro é uma INTERFACE: `tsx` (esbuild) não emite
    // `design:paramtypes` e o Nest resolveria `undefined` — em dev, no
    // primeiro request.
    @Inject(TENANT_MEMBERSHIP_REPOSITORY_PORT)
    private readonly memberships: TenantMembershipRepositoryPort,
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

    // ── 5. pt-BR (Fase 3 — tenancy, 2026-10-16): qual empresa o token
    // está agindo. Vem do header, NÃO do JWT: o `TokenSubject` é de 3
    // campos e o tenant muda dentro da mesma sessão (trocar de empresa
    // não é trocar de token).
    const tenantId = extractTenantId(request.headers?.['x-tenant-id']);

    // ── 5b. pt-BR (PR #101, 2026-10-17): a empresa AFIRMADA tem de ser uma
    // empresa de quem faz a afirmação. É o mesmo `sub` que o token acabou de
    // provar, então a afirmação está ligada a uma identidade, não ao header
    // solto.
    //
    // `tenantId === null` é o bucket GLOBAL (`users.profile_id`), onde mora o
    // `isAdmin` do seed — não é "empresa nenhuma", e por isso não exige
    // membership: exigir trancaria o admin global fora do próprio bucket.
    //
    // ⚠️ A ORDEM IMPORTA e é o que o teste "a recusa acontece ANTES da chave
    // de cache ser formada" trava. O `profileCache` é chaveado pelo par
    // (empresa, usuário) — uma empresa arbitrária viraria uma chave que
    // ninguém volta a procurar, e o `Map` só cresceria. Conferir a membership
    // antes de formar a chave fecha isso e economiza a consulta.
    if (tenantId !== null) {
      const role = await this.memberships.findRole(subject.sub, tenantId);
      if (role === null) {
        throw new ForbiddenException({
          code: 'TENANT_MEMBERSHIP_REQUIRED',
          detail: 'A conta autenticada não pertence à empresa informada em X-Tenant-Id.',
        });
      }
    }

    // ── 6. pt-BR (#93.1 — RBAC, 2026-10-16): hidrata `isAdmin` e
    // `permissions` do cache. Falha do cache NÃO bloqueia — se a key
    // não estiver cacheada (TTL expirou, user sem profile, etc) o
    // request passa com `isAdmin=false` e `permissions=[]`. O use case
    // `obterMeuPerfil` é quem re-popula na próxima chamada.
    //
    // A chave é o PAR (tenant, user): com só o usuário, a mesma conta em
    // duas empresas herdaria o `isAdmin` da anterior por até 5s.
    const cached = await this.profileCache.getUserProfileAndPermissions(tenantId, subject.sub);
    request.user = {
      ...subject,
      tenantId,
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
