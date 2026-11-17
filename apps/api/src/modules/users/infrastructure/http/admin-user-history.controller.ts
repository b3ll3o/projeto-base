// apps/api/src/modules/users/infrastructure/http/admin-user-history.controller.ts
//
// pt-BR (visão de admin, 2026-11-17): o HISTÓRICO de auditoria de uma
// pessoa, lido pelo ADMINISTRADOR DO SISTEMA.
//
//   GET /api/v1/admin/users/:id/history → as versões da pessoa, paginadas
//
// POR QUE ESTA ROTA EXISTE, e por que a do DONO não serve.
//
// A rota do DONO (`GET /users/:id/history`) é barrada pelo
// `UserOwnershipGuard`: o `:id` da rota tem de ser o `sub` do token. A tela
// `/users/[id]` do web é do ADMIN do SISTEMA — e ele não é dono de ninguém.
// Sem esta rota, o administrador do sistema não conseguia ler o histórico de
// NINGUÉM.
//
// ⚠️ `@ApiBearerAuth()` NA CLASSE, e não em cada handler: no documento OpenAPI
// a rota protegida é a que declara `security`, e a rota PÚBLICA é a ÚNICA que
// não declara (o inverso disso é defeito medido: uma rota com guard e sem
// `security` sai pública no contrato).
//
// ⚠️ `@RequirePermission` no HANDLER, e não na classe — o mesmo motivo das
// feature flags: handler novo sem o decorator continua ABERTO, porque o
// `PermissionsGuard` devolve `true` quando não há requisito.
//
// ⚠️ O `@RequirePermission` NÃO é o portão. Quem barra de fato é D2, dentro
// da use case (`exigeAdministradorDeSistema`: bucket GLOBAL + `isAdmin`), e é
// o que barra o DONO DE EMPRESA — que tem `isAdmin: true` no perfil efetivo
// DA EMPRESA DELE e `admin.manage-users` no banco. O decorator é defense in
// depth e rastreabilidade.
//
// ⚠️ Este controller e o `AdminUsersController` (do BC Profiles, que veste
// perfil) são controllers DIFERENTES com o MESMO prefixo (`admin/users`) — e
// as rotas não se cruzam: `PUT :id/profile` e `GET :id/history`. O prefixo
// compartilhado é de propósito: as duas rotas são do mesmo ator (o admin do
// sistema) e da mesma tela.
//
// ⚠️ E A TAG é a do IRMÃO (`admin-users`), e não `admin`: MEDIDO 2026-11-17 no
// contrato gerado, as DUAS rotas de `/admin/users` caíam em tags diferentes
// (`admin` e `admin-users`) — e quem agrupa o contrato por tag via a rota do
// histórico para o bucket do inventário de tenancy, longe da rota que veste o
// perfil da mesma pessoa.

import { Controller, Get, Inject, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { UserHistoryPageDto } from '@projeto/shared-types';

import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { PermissionsGuard } from '../../../profiles/infrastructure/http/guards/permissions.guard.js';
import { RequirePermission } from '../../../profiles/infrastructure/http/decorators/require-permission.decorator.js';
import { atorDe, type ReqComAtor } from '../../../../shared/auth/eh-administrador-de-sistema.js';
import { validarComZod } from '../../../../shared/infrastructure/http/zod-validation.pipe.js';

import { UserUseCases, USER_USE_CASES } from '../../application/user-use-cases.js';
import type { ListUserHistoryInput } from '../../application/dto/list-user-history.input.js';
import { PaginacaoQuerySchema } from './users.schemas.js';

@ApiTags('admin-users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/users')
export class AdminUserHistoryController {
  constructor(
    // pt-BR (#97): `@Inject` EXPLÍCITO — `tsx` (esbuild) não emite
    // `design:paramtypes`, então sem o token o Nest passa `undefined` e a rota
    // morre com 500 no PRIMEIRO request. Mesmo motivo dos outros controllers.
    @Inject(USER_USE_CASES) private readonly userUseCases: UserUseCases,
  ) {}

  @Get(':id/history')
  @RequirePermission('admin.manage-users')
  @ApiOperation({ summary: 'Histórico de auditoria de um usuário (admin do sistema)' })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Histórico paginado da pessoa' })
  @ApiResponse({
    status: 400,
    description:
      'Query inválida (limit fora da faixa, cursor malformado ou cursor de outra trilha), ou id que não é um UUID v7',
  })
  @ApiResponse({ status: 403, description: 'Só o administrador do sistema' })
  @ApiResponse({ status: 404, description: 'Pessoa inexistente' })
  async history(
    // ⚠️ O `@Req()` vem PRIMEIRO porque os parâmetros de query são
    // opcionais — e o TypeScript não aceita um obrigatório depois de um
    // opcional. O Nest resolve por decorator, não por posição.
    @Req() req: ReqComAtor,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit = '20',
  ): Promise<UserHistoryPageDto> {
    // ⚠️ A query é validada no CORPO do método, e não num
    // `@Query(new ZodValidationPipe(…))` — o mesmo motivo do `GET /users`:
    // o pipe não roda quando o handler é chamado direto, e a validação que a
    // spec mede tem de rodar no caminho que a spec exercita.
    //
    // O schema é o MESMO da paginação das outras duas surfaces
    // (`PaginacaoQuerySchema`) — um `limit` aceito numa rota e recusado na
    // outra é a mesma regra escrita duas vezes.
    const consulta = validarComZod(PaginacaoQuerySchema, { cursor, limit });

    const input: ListUserHistoryInput = {
      id,
      cursor: consulta.cursor ?? null,
      limit: consulta.limit,
    };
    return this.userUseCases.listarHistoricoDeUsuarioNoSistema(input, atorDe(req));
  }
}
