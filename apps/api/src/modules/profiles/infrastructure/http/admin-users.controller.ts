// apps/api/src/modules/profiles/infrastructure/http/admin-users.controller.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): atribuir/limpar profile de um
// user. Montado em /api/v1/admin/users/:id/profile.

import { Body, Controller, Inject, Param, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { RequirePermission } from './decorators/require-permission.decorator.js';
import { UserProfileUseCases, type AtorAutenticado } from '../../application/profiles.use-cases.js';

/** `req.user` publicado pelo `JwtAuthGuard`. */
interface RequestComAtor {
  user: { sub: string; isAdmin?: boolean };
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    // pt-BR (#97): `@Inject` EXPLÍCITO — `tsx` (esbuild) não emite
    // `design:paramtypes`, então sem o token o Nest passa `undefined` e a rota
    // morre com 500 no primeiro request (MEDIDO 2026-10-16, cenário e2e 10).
    @Inject(UserProfileUseCases) private readonly useCases: UserProfileUseCases,
  ) {}

  @Put(':id/profile')
  @RequirePermission('admin.manage-users')
  async atribuirProfile(
    @Param('id') userId: string,
    @Body() body: { profileId: string | null },
    @Req() req: RequestComAtor,
  ): Promise<{ ok: true }> {
    const ator: AtorAutenticado = {
      userId: req.user.sub,
      isAdmin: req.user.isAdmin === true,
    };
    await this.useCases.atribuirProfileAoUser(userId, body.profileId, ator);
    return { ok: true };
  }
}
