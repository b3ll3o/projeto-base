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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
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
@ApiTags('profiles')
@Controller('admin/profiles')
export class AdminProfilesController {
  constructor(
    // pt-BR (#97): `@Inject` EXPLÍCITO — `tsx` (esbuild) não emite
    // `design:paramtypes`, então sem o token o Nest passa `undefined` e a rota
    // morre com 500 no PRIMEIRO request. MEDIDO 2026-10-16 pelo cenário e2e 10;
    // `admin-profiles.controller.spec.ts` não viu porque monta com `new`.
    @Inject(ProfileUseCases) private readonly useCases: ProfileUseCases,
  ) {}

  /**
   * pt-BR (Fase 8): a EMPRESA do ator viaja nas 5 rotas, não só na de criação.
   * Sem ela o `PermissionsGuard` via `admin.manage-profiles` — que a Fase 5
   * dá a todo dono de empresa — abria o alcance GLOBAL destas rotas: MEDIDO,
   * o dono da ACME listava, renomeava, apagava e injetava permissão em perfil
   * da GLOBEX, todos 200/201.
   */
  private atorDe(req: RequestComAtor) {
    return {
      userId: req.user.sub,
      tenantId: req.user.tenantId ?? null,
      isAdmin: req.user.isAdmin === true,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Listar os perfis' })
  @RequirePermission('admin.manage-profiles')
  async list(@Req() req: RequestComAtor): Promise<ProfileSummary[]> {
    return this.useCases.listar(this.atorDe(req));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ler um perfil' })
  @RequirePermission('admin.manage-profiles')
  async getById(@Param('id') id: string, @Req() req: RequestComAtor): Promise<ProfileDetail> {
    return this.useCases.obterPorId(id, this.atorDe(req));
  }

  @Post()
  @ApiOperation({ summary: 'Criar um perfil' })
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
    return this.useCases.criar(input, this.atorDe(req));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Atualizar um perfil' })
  @RequirePermission('admin.manage-profiles')
  async update(
    @Param('id') id: string,
    @Body() body: UpdateProfileBody,
    @Req() req: RequestComAtor,
  ): Promise<ProfileDetail> {
    const input: UpdateProfileInput = {
      name: body.name,
      ...(body.description !== undefined ? { description: body.description } : {}),
    };
    return this.useCases.atualizar(id, input, this.atorDe(req));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Excluir um perfil' })
  @RequirePermission('admin.manage-profiles')
  async delete(@Param('id') id: string, @Req() req: RequestComAtor): Promise<void> {
    await this.useCases.deletar(id, this.atorDe(req));
  }
}
