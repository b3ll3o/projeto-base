// apps/api/src/modules/profiles/infrastructure/http/admin-authorizations.controller.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): gerenciamento de autorizações
// (permissões dentro de um perfil). Montado em
// /api/v1/admin/profiles/:id/authorizations.
//
// POST   /api/v1/admin/profiles/:id/authorizations  body={permissionKey} → atribui
// DELETE /api/v1/admin/profiles/:id/authorizations/:key → revoga
// GET    /api/v1/admin/permissions → lista o catálogo (para o dropdown do admin)

import { Body, Controller, Delete, Get, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { RequirePermission } from './decorators/require-permission.decorator.js';
import { AuthorizationUseCases, type ProfileDetail } from '../../application/profiles.use-cases.js';
import { atorDe, type ReqComAtor } from '../../../../shared/auth/eh-administrador-de-sistema.js';

// ⚠️ `@ApiBearerAuth()` NA CLASSE, e não em cada handler: no documento
// OpenAPI a rota protegida é a que declara `security`, e a rota PÚBLICA é a
// ÚNICA que não declara (o inverso disso é defeito medido: uma rota com
// guard e sem `security` sai pública no contrato).
//
// ⚠️ Aqui todas as rotas são protegidas — não há uma pública neste
// controller — então o decorator na CLASSE é o que fecha a classe: uma rota
// NOVA herda a proteção do contrato, em vez de depender de alguém lembrar
// de declarar o decorator no handler.
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('authorizations')
@Controller()
export class AdminAuthorizationsController {
  constructor(
    // pt-BR (#97): `@Inject` EXPLÍCITO — `tsx` (esbuild) não emite
    // `design:paramtypes`, então sem o token o Nest passa `undefined` e a rota
    // morre com 500 no primeiro request (MEDIDO 2026-10-16, cenário e2e 10).
    @Inject(AuthorizationUseCases) private readonly useCases: AuthorizationUseCases,
  ) {}

  @Post('admin/profiles/:id/authorizations')
  @ApiOperation({ summary: 'Conceder uma permissão a um perfil' })
  @RequirePermission('admin.manage-authorizations')
  async atribuir(
    @Param('id') id: string,
    @Body() body: { permissionKey: string },
    @Req() req: ReqComAtor,
  ): Promise<ProfileDetail> {
    return this.useCases.atribuir(id, body.permissionKey, atorDe(req));
  }

  @Delete('admin/profiles/:id/authorizations/:key')
  @ApiOperation({ summary: 'Revogar uma permissão de um perfil' })
  @RequirePermission('admin.manage-authorizations')
  async revogar(
    @Param('id') id: string,
    @Param('key') key: string,
    @Req() req: ReqComAtor,
  ): Promise<ProfileDetail> {
    return this.useCases.revogar(id, key, atorDe(req));
  }

  @Get('admin/permissions')
  @ApiOperation({ summary: 'Listar as permissões do catálogo' })
  @RequirePermission('admin.manage-authorizations')
  async listar(): Promise<string[]> {
    return this.useCases.listarPermissoes();
  }
}
