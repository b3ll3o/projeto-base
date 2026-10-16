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
// O guard depende APENAS de `req.user` estar populado — quem popula é
// o JwtAuthGuard (camada anterior). O fluxo é JwtAuthGuard → PermissionsGuard.

import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSION_KEYS_METADATA } from '../decorators/require-permission.decorator.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<readonly string[] | undefined>(
      PERMISSION_KEYS_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (required === undefined || required.length === 0) {
      return true; // sem requisito = passa
    }
    const req = context.switchToHttp().getRequest<{
      user?: { isAdmin?: boolean; permissions?: readonly string[] };
    }>();
    const user = req.user;
    if (user === undefined) {
      throw new ForbiddenException('autenticação requerida');
    }
    if (user.isAdmin === true) {
      return true; // bypass total
    }
    const userPerms = new Set(user.permissions ?? []);
    const hasAny = required.some((k) => userPerms.has(k));
    if (!hasAny) {
      throw new ForbiddenException(
        `permissão requerida ausente: precisa de uma de [${required.join(', ')}]`,
      );
    }
    return true;
  }
}
