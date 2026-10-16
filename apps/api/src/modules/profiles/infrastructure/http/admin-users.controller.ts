// apps/api/src/modules/profiles/infrastructure/http/admin-users.controller.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): atribuir/limpar profile de um
// user. Montado em /api/v1/admin/users/:id/profile.

import { Body, Controller, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { RequirePermission } from './decorators/require-permission.decorator.js';
import { UserProfileUseCases } from '../../application/profiles.use-cases.js';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/admin/users')
export class AdminUsersController {
  constructor(private readonly useCases: UserProfileUseCases) {}

  @Put(':id/profile')
  @RequirePermission('admin.manage-users')
  async atribuirProfile(
    @Param('id') userId: string,
    @Body() body: { profileId: string | null },
  ): Promise<{ ok: true }> {
    await this.useCases.atribuirProfileAoUser(userId, body.profileId);
    return { ok: true };
  }
}
