// apps/api/src/modules/profiles/infrastructure/http/admin-profiles.controller.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): CRUD de perfis para admin.
// Montado em /api/v1/admin/profiles. Protegido por JwtAuthGuard +
// PermissionsGuard com `@RequirePermission('admin.manage-profiles')`.

import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
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
  isAdmin?: boolean;
  isSystem?: boolean;
  description?: string;
  initialPermissions?: string[];
}

interface UpdateProfileBody {
  name: string;
  description?: string;
}

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('api/v1/admin/profiles')
export class AdminProfilesController {
  constructor(private readonly useCases: ProfileUseCases) {}

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
  async create(@Body() body: CreateProfileBody): Promise<ProfileDetail> {
    const input: CreateProfileInput = {
      slug: body.slug,
      name: body.name,
      ...(body.isAdmin !== undefined ? { isAdmin: body.isAdmin } : {}),
      ...(body.isSystem !== undefined ? { isSystem: body.isSystem } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.initialPermissions !== undefined ? { initialPermissions: body.initialPermissions } : {}),
    };
    return this.useCases.criar(input);
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
