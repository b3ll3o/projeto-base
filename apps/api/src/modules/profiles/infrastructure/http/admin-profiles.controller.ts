// apps/api/src/modules/profiles/infrastructure/http/admin-profiles.controller.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): CRUD de perfis para admin.
// Montado em /api/v1/admin/profiles. Protegido por JwtAuthGuard +
// PermissionsGuard com `@RequirePermission('admin.manage-profiles')`.

import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { RequirePermission } from './decorators/require-permission.decorator.js';
import {
  ProfileUseCases,
  type CreateProfileInput,
  type UpdateProfileInput,
  type ProfileDetail,
  type ProfileSummary,
} from '../../application/profiles.use-cases.js';

interface CreateProfileBody {
  slug: string;
  name: string;
  description?: string;
  initialPermissions?: string[];
}

interface UpdateProfileBody {
  name: string;
  description?: string;
}

/**
 * O mínimo do `req.user` publicado pelo `JwtAuthGuard`. Mesma forma do
 * `RequestComAtor` de `admin-authorizations.controller.ts` e
 * `admin-users.controller.ts` — declarado localmente em cada controller em vez
 * de extraído porque os três nunca são usados juntos.
 */
interface RequestComAtor {
  user: { sub: string; tenantId?: string | null; isAdmin?: boolean };
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/profiles')
export class AdminProfilesController {
  constructor(
    // pt-BR (#97): `@Inject` EXPLÍCITO — `tsx` (esbuild) não emite
    // `design:paramtypes`, então sem o token o Nest passa `undefined` e a rota
    // morre com 500 no PRIMEIRO request. MEDIDO 2026-10-16 pelo cenário e2e 10;
    // `admin-profiles.controller.spec.ts` não viu porque monta com `new`.
    @Inject(ProfileUseCases) private readonly useCases: ProfileUseCases,
  ) {}

  @Get()
  @RequirePermission('admin.manage-profiles')
  async list(): Promise<ProfileSummary[]> {
    return this.useCases.listar();
  }

  @Get(':id')
  @RequirePermission('admin.manage-profiles')
  async getById(@Param('id') id: string): Promise<ProfileDetail> {
    return this.useCases.obterPorId(id);
  }

  @Post()
  @RequirePermission('admin.manage-profiles')
  async create(
    @Body() body: CreateProfileBody,
    @Req() req: RequestComAtor,
  ): Promise<ProfileDetail> {
    // pt-BR (#97): `isAdmin`/`isSystem` NÃO são repassados do body, mesmo
    // que o cliente os mande — um ator com `admin.manage-profiles` criaria
    // profile de bypass total. As flags vêm só do seed/migration
    // (`apps/api/prisma/seed.ts`), que escreve direto no Prisma.
    //
    // pt-BR (#97, A1.3): o ator vai junto porque `initialPermissions` é uma
    // CONCESSÃO. `admin.manage-profiles` autoriza gerir perfis, não inventar
    // permissão — o mesmo critério que `AuthorizationUseCases.atribuir` aplica.
    const input: CreateProfileInput = {
      slug: body.slug,
      name: body.name,
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.initialPermissions !== undefined
        ? { initialPermissions: body.initialPermissions }
        : {}),
    };
    return this.useCases.criar(input, {
      userId: req.user.sub,
      tenantId: req.user.tenantId ?? null,
      isAdmin: req.user.isAdmin === true,
    });
  }

  @Patch(':id')
  @RequirePermission('admin.manage-profiles')
  async update(@Param('id') id: string, @Body() body: UpdateProfileBody): Promise<ProfileDetail> {
    const input: UpdateProfileInput = {
      name: body.name,
      ...(body.description !== undefined ? { description: body.description } : {}),
    };
    return this.useCases.atualizar(id, input);
  }

  @Delete(':id')
  @RequirePermission('admin.manage-profiles')
  async delete(@Param('id') id: string): Promise<void> {
    await this.useCases.deletar(id);
  }
}
