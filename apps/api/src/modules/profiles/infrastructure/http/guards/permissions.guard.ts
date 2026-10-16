// apps/api/src/modules/profiles/infrastructure/http/guards/permissions.guard.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): guard que decide se a request tem
// permissão. Lê metadata `rbac.permissionKeys` (Set pelo
// `@RequirePermission()`) e compara com `req.user.permissions`.
//
// Lógica:
//  - se `req.user.isAdmin === true`: passa sempre (bypass total)
//  - senão, verifica se o user tem ao menos uma das keys requeridas (OR)
//  - se nenhuma: 403 FORBIDDEN com mensagem específica
//
// O fluxo é JwtAuthGuard → PermissionsGuard. O `JwtAuthGuard` autentica e
// publica `req.user`, mas o `permissions`/`isAdmin` que ele escreve vem de um
// CACHE que ele só lê — e o produtor desse cache é `GET /me/profile`. Por isso
// este guard HIDRATA (read-through via `UserProfileUseCases.obterMeuPerfil`) e
// escreve de volta em `req.user`: sem isso, todo request a uma rota `admin.*`
// com cache frio seria 403, inclusive para quem tem a permissão. Ver o
// comentário do construtor e o teste "cache FRIO" no spec.

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEYS_METADATA } from '../decorators/require-permission.decorator.js';
import { UserProfileUseCases } from '../../../application/profiles.use-cases.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  // pt-BR (#97): `@Inject(Reflector)` EXPLÍCITO, mesmo sendo classe concreta
  // — o mesmo motivo e o mesmo defeito do `JwtAuthGuard` (ver o comentário
  // dele). MEDIDO 2026-10-16: sem o token, o `tsx` (esbuild) não emite
  // `design:paramtypes`, o Nest passa `undefined`, e TODO request autenticado
  // a qualquer rota de profiles morre com
  // `Cannot read properties of undefined (reading 'getAllAndOverride')`.
  // Nenhuma spec unitária pega: `permissions.guard.spec.ts:37` monta o guard
  // com `new PermissionsGuard(reflector)` e passa a dependência na mão. Foi o
  // cenário e2e 10, atravessando a porta HTTP, que mediu.
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    // pt-BR (#97): a hidratação mora AQUI, e não no `JwtAuthGuard`, por dois
    // motivos que o DI impõe: (1) os repos de profile são provider do
    // `ProfilesModule`, que JÁ IMPORTA o `AuthModule` — dar a eles ao guard do
    // Auth criaria o ciclo que o cabeçalho daquele arquivo descreve; (2) este
    // guard mora no `ProfilesModule`, ao lado dos repos.
    //
    // `@Inject` explícito pela mesma razão do `Reflector` acima: `tsx`
    // (esbuild) não emite `design:paramtypes`.
    @Inject(UserProfileUseCases) private readonly useCases: UserProfileUseCases,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<readonly string[] | undefined>(
      PERMISSION_KEYS_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (required === undefined || required.length === 0) {
      return true; // sem requisito = passa
    }
    const req = context.switchToHttp().getRequest<{
      user?: { sub?: string; isAdmin?: boolean; permissions?: readonly string[] };
    }>();
    const user = req.user;
    if (user === undefined) {
      throw new ForbiddenException('autenticação requerida');
    }

    // pt-BR (#97): MEDIDO 2026-10-16. O `JwtAuthGuard` só LÊ o cache, e o
    // ÚNICO produtor dele é o `obterMeuPerfil` — chamado por `GET /me/profile`.
    // Cache frio ⇒ `JwtAuthGuard` entrega `permissions: []` e `isAdmin: false`
    // (os `??` dele), e TODO request a uma rota `admin.*` recebia 403 — inclusive
    // um admin de profile `isAdmin`, porque o bypass depende do `isAdmin`
    // hidratado. O front não via o defeito porque cada Server Component chama
    // `/me/profile` antes de listar qualquer coisa, aquecendo o cache; um
    // cliente que chama a API direto (curl, outro app, e2e) recebia 403 sem
    // ter nenhuma permissão negada de fato.
    //
    // `obterMeuPerfil` já É read-through (cache → banco → popula), então chamar
    // sempre custa Map lookup quando quente e 2 queries + popula quando frio.
    // O `empty` de quem legitimamente não tem nada também é cacheado, então não
    // há Storm de queries para usuário sem permissão.
    const perfil =
      typeof user.sub === 'string' ? await this.useCases.obterMeuPerfil(user.sub) : null;
    if (perfil !== null) {
      // Escreve de volta em `req.user` porque os controllers leem
      // `req.user.isAdmin` para montar o `AtorAutenticado` (o `atorDe`) — e é
      // essa flag que decide o bypass e a trava de escalada de privilégio.
      req.user = { ...user, isAdmin: perfil.isAdmin, permissions: perfil.permissions };
    }

    if ((perfil?.isAdmin ?? user.isAdmin) === true) {
      return true; // bypass total
    }
    const userPerms = new Set(perfil?.permissions ?? user.permissions ?? []);
    const hasAny = required.some((k) => userPerms.has(k));
    if (!hasAny) {
      throw new ForbiddenException(
        `permissão requerida ausente: precisa de uma de [${required.join(', ')}]`,
      );
    }
    return true;
  }
}
