// apps/api/src/modules/profiles/infrastructure/http/admin-authorizations.controller.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): gerenciamento de autorizações
// (permissões dentro de um perfil). Montado em
// /api/v1/admin/profiles/:id/authorizations.
//
// POST   /api/v1/admin/profiles/:id/authorizations  body={permissionKey} → atribui
// DELETE /api/v1/admin/profiles/:id/authorizations/:key → revoga
// GET    /api/v1/admin/permissions → lista o catálogo (para o dropdown do admin)

import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { RequirePermission } from './decorators/require-permission.decorator.js';
import { AuthorizationUseCases, type ProfileDetail } from '../../application/profiles.use-cases.js';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class AdminAuthorizationsController {
  constructor(private readonly useCases: AuthorizationUseCases) {}

  @Post('api/v1/admin/profiles/:id/authorizations')
  @RequirePermission('admin.manage-authorizations')
  async atribuir(
    @Param('id') id: string,
    @Body() body: { permissionKey: string },
  ): Promise<ProfileDetail> {
    return this.useCases.atribuir(id, body.permissionKey);
  }

  @Delete('api/v1/admin/profiles/:id/authorizations/:key')
  @RequirePermission('admin.manage-authorizations')
  async revogar(@Param('id') id: string, @Param('key') key: string): Promise<ProfileDetail> {
    return this.useCases.revogar(id, key);
  }

  @Get('api/v1/admin/permissions')
  @RequirePermission('admin.manage-authorizations')
  async listar(): Promise<string[]> {
    return this.useCases.listarPermissoes();
  }
}
