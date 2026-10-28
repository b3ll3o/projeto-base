// apps/api/src/modules/profiles/infrastructure/http/admin-users.controller.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): atribuir/limpar profile de um
// user. Montado em /api/v1/admin/users/:id/profile.

import { Body, Controller, Inject, Param, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { RequirePermission } from './decorators/require-permission.decorator.js';
import { UserProfileUseCases, type AtorAutenticado } from '../../application/profiles.use-cases.js';

/** `req.user` publicado pelo `JwtAuthGuard`. */
interface RequestComAtor {
  user: { sub: string; tenantId?: string | null; isAdmin?: boolean };
}

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
@ApiTags('admin-users')
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    // pt-BR (#97): `@Inject` EXPLÍCITO — `tsx` (esbuild) não emite
    // `design:paramtypes`, então sem o token o Nest passa `undefined` e a rota
    // morre com 500 no primeiro request (MEDIDO 2026-10-16, cenário e2e 10).
    @Inject(UserProfileUseCases) private readonly useCases: UserProfileUseCases,
  ) {}

  @Put(':id/profile')
  @ApiOperation({ summary: 'Vestir um perfil em um usuário' })
  @RequirePermission('admin.manage-users')
  async atribuirProfile(
    @Param('id') userId: string,
    @Body() body: { profileId: string | null },
    @Req() req: RequestComAtor,
  ): Promise<{ ok: true }> {
    const ator: AtorAutenticado = {
      userId: req.user.sub,
      tenantId: req.user.tenantId ?? null,
      isAdmin: req.user.isAdmin === true,
    };
    await this.useCases.atribuirProfileAoUser(userId, body.profileId, ator);
    return { ok: true };
  }
}
