// apps/api/src/modules/tenancy/infrastructure/http/admin-tenancy.controller.ts
//
// pt-BR (visão de admin, 2026-10-22): o INVENTÁRIO da tenancy, para o
// administrador do SISTEMA.
//
//   GET /admin/tenancy → as empresas com os seus membros E os usuários com as
//                        suas empresas
//
// ⚠️ 2026-10-29 (revisão do PR #127): ERA DUAS ROTAS (`/admin/tenants` e
// `/admin/users`) e virou UMA. O motivo é um invariante do próprio repositório
// — "as DUAS listas precisam contar a mesma história" — que duas rotas HTTP
// não conseguem garantir: duas rotas são dois requests, e cada request é uma
// transação, e as duas lidas em instantes diferentes. O web disparava as duas
// em paralelo, e a tela podia mostrar uma empresa "sem membros" ao lado de uma
// pessoa numa empresa que a lista de empresas não conhecia.
//
// Uma rota, uma transação, um inventário. E o ganho de brinde: o wire format
// deixa de ser declarado DUAS vezes sem elo de compilação entre a API e o web
// (o controller tipava com o tipo da PORT e o web consumia um DTO escrito à
// mão; um rename passava pelos dois `tsc` e a tela renderizava `undefined`).
//
// ⚠️ `@RequirePermission` no handler, e não na CLASSE — o mesmo motivo das
// feature flags: handler novo sem o decorator continua ABERTO, porque o
// `PermissionsGuard` devolve `true` quando não há requisito.
//
// ⚠️ O `@RequirePermission` NÃO é o portão. Quem barra de fato é D2, dentro
// da use case (`ehAdministradorDeSistema`: bucket GLOBAL + `isAdmin`), e é o
// que barra o GERENTE de empresa — que tem `isAdmin: true` no perfil efetivo
// da empresa DELE e `admin.manage-users` no banco, e leria a base inteira se
// o portão fosse a permissão. O decorator é defense in depth e rastreabilidade.

import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { InventarioAdminTenancyDto } from '@projeto/shared-types';

import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { PermissionsGuard } from '../../../profiles/infrastructure/http/guards/permissions.guard.js';
import { RequirePermission } from '../../../profiles/infrastructure/http/decorators/require-permission.decorator.js';
import { TENANCY_USE_CASES, TenancyUseCases } from '../../application/tenancy.use-cases.js';
import { atorDe, type ReqComAtor } from '../../../../shared/auth/eh-administrador-de-sistema.js';

@ApiTags('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin')
export class AdminTenancyController {
  constructor(
    // pt-BR (#97): `@Inject` EXPLÍCITO — `tsx` (esbuild) não emite
    // `design:paramtypes`, então sem o token o Nest passa `undefined` e a rota
    // morre com 500 no PRIMEIRO request. Mesmo motivo dos outros controllers.
    @Inject(TENANCY_USE_CASES) private readonly useCases: TenancyUseCases,
  ) {}

  @Get('tenancy')
  @RequirePermission('admin.manage-users')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'O inventário da tenancy: as empresas com seus membros e os usuários com suas empresas',
  })
  @ApiResponse({
    status: 200,
    description:
      'As empresas do sistema com os seus membros, e os usuários do sistema com as suas empresas',
  })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 403, description: 'Só o administrador do sistema' })
  async inventario(@Req() req: ReqComAtor): Promise<InventarioAdminTenancyDto> {
    return this.useCases.listarInventarioDoSistema(atorDe(req));
  }
}
