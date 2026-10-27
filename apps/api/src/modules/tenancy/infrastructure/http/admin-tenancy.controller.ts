// apps/api/src/modules/tenancy/infrastructure/http/admin-tenancy.controller.ts
//
// pt-BR (visão de admin, 2026-10-22): o INVENTÁRIO da tenancy, para o
// administrador do SISTEMA.
//
//   GET /admin/tenants → todas as empresas, com os membros de cada uma
//   GET /admin/users   → todos os usuários, com as empresas de cada um
//
// ⚠️ É DUAS ROTAS e não UMA com os dois lados: um recurso por rota é o padrão
// do repositório (`/admin/profiles`, `/admin/feature-flags`), e cada lista
// responde a uma pergunta diferente ("quem está na ACME" e "de quais empresas
// o Bruno é").
//
// ⚠️ `@RequirePermission` em CADA handler, e não na CLASSE — o mesmo motivo
// das feature flags: handler novo sem o decorator continua ABERTO, porque o
// `PermissionsGuard` devolve `true` quando não há requisito.
//
// ⚠️ O `@RequirePermission` NÃO é o portão. Quem barra de fato é D2, dentro
// da use case (`ehAdministradorDeSistema`: bucket GLOBAL + `isAdmin`), e é o
// que barra o GERENTE de empresa — que tem `isAdmin: true` no perfil efetivo
// da empresa DELE e `admin.manage-users` no banco, e leria a base inteira se
// o portão fosse a permissão. O decorator é defense in depth e rastreabilidade.

import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { PermissionsGuard } from '../../../profiles/infrastructure/http/guards/permissions.guard.js';
import { RequirePermission } from '../../../profiles/infrastructure/http/decorators/require-permission.decorator.js';
import { TENANCY_USE_CASES, TenancyUseCases } from '../../application/tenancy.use-cases.js';
import type {
  EmpresaComMembros,
  UsuarioComEmpresas,
} from '../../domain/ports/admin-tenancy-repository.port.js';
import type { AtorAutenticado } from '../../../../shared/auth/eh-administrador-de-sistema.js';

/** O mínimo do `req.user` publicado pelo `JwtAuthGuard` — mesma forma local dos outros controllers. */
interface RequestComAtor {
  user: { sub: string; tenantId?: string | null; isAdmin?: boolean };
}

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

  /**
   * `req.user` → `AtorAutenticado`.
   *
   * `isAdmin === true` e não `isAdmin`: o ausente precisa virar `false`
   * (fail-closed), não `undefined` — que é falsy num `if` e verdadeiro num
   * `!== false`.
   *
   * `tenantId` viaja porque D2 o exige em `null` (bucket GLOBAL). Um ator
   * com empresa no header chega aqui com `tenantId` preenchido e é recusado
   * pela use case — que é o comportamento certo, e o mesmo das feature flags.
   */
  private atorDe(req: RequestComAtor): AtorAutenticado {
    return {
      userId: req.user.sub,
      tenantId: req.user.tenantId ?? null,
      isAdmin: req.user.isAdmin === true,
    };
  }

  @Get('tenants')
  @RequirePermission('admin.manage-users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar todas as empresas, com os membros de cada uma' })
  @ApiResponse({ status: 200, description: 'As empresas do sistema, com seus membros' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 403, description: 'Só o administrador do sistema' })
  async listarEmpresas(@Req() req: RequestComAtor): Promise<EmpresaComMembros[]> {
    return this.useCases.listarEmpresasDoSistema(this.atorDe(req));
  }

  @Get('users')
  @RequirePermission('admin.manage-users')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Listar todos os usuários, com as empresas de cada um' })
  @ApiResponse({ status: 200, description: 'Os usuários do sistema, com suas empresas' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 403, description: 'Só o administrador do sistema' })
  async listarUsuarios(@Req() req: RequestComAtor): Promise<UsuarioComEmpresas[]> {
    return this.useCases.listarUsuariosDoSistema(this.atorDe(req));
  }
}
