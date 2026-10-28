// apps/api/src/modules/tenancy/infrastructure/http/tenancy-empresas.controller.ts
//
// pt-BR (onboarding de empresa, 2026-10-21): as DUAS rotas que fecham o
// onboarding de empresa.
//
//   POST /tenants     → a empresa de quem JÁ tem conta (a página de criação)
//   GET  /me/tenants  → as empresas do ator (o que o login consulta)
//
// ⚠️ SEM `PermissionsGuard` e SEM `@RequirePermission`, e isso é deliberado —
// o mesmo motivo de `tenancy-invitations.controller.ts`: o `PermissionsGuard`
// resolve as permissões pelo tenant do HEADER (`X-Tenant-Id`), e aqui o ator
// pode ainda não pertencer a empresa nenhuma (é justamente quem vai criar a
// primeira). A autorização é "é a SUA conta" — o `sub` do token — que é uma
// pergunta de um eixo só.
//
// ⚠️ SEM feature flag, e isso também é deliberado: a flag `tenancy.invites`
// é do CONVITE, e o convite é o que traz a conta para uma empresa que já
// existe. Criar a PRIMEIRA empresa é o outro lado da regra — sem ela, a
// conta que entrou por conta própria fica sem empresa nenhuma, que é
// justamente o que a regra proíbe. Fechar a criação de empresa seria
// trancar o onboarding inteiro. (Uma flag própria, para desligar o
// onboarding, é produto — e não foi pedida.)

import { Body, Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe.js';
import { TENANCY_USE_CASES, TenancyUseCases } from '../../application/tenancy.use-cases.js';
import type { EmpresaDoUsuario } from '../../domain/ports/tenant-membership-repository.port.js';
import {
  MIN_LENGTH as NOME_MIN,
  MAX_LENGTH as NOME_MAX,
} from '../../../users/domain/value-objects/user-name.vo.js';

/** `req.user` publicado pelo `JwtAuthGuard`. */
interface RequestComAtor {
  user: { sub: string };
}

/**
 * Os limites do `slug` e do `nome` são os MESMOS de `DestinoSchema` (o ramo
 * `empresa` do `POST /users`) — a página de criação de empresa abre a mesma
 * empresa que o cadastro abriria, e duas regras para o mesmo dado divergem
 * sozinhas.
 *
 * ⚠️ O `.trim()` ANTES do `min`: sem ele, `"   "` (três espaços) passa o
 * `min(2)` — e a empresa nasce com o nome em branco. O web já aparava
 * (MEDIDO), mas a API é a fronteira de confiança: quem valida é ela.
 *
 * ⚠️ O `.trim()` do `slug` fecha a ÚLTIMA divergência entre as duas cópias
 * da regra: o formulário (`empresa-schema.ts`) aparava o identificador e a
 * API não. Sem ele, `" acme "` era RECUSADO com a mensagem de FORMATO
 * ("slug em minúsculo…") — a mensagem errada para o problema real (espaço em
 * volta) — e a divergência não era vista por nenhum teste, porque a spec de
 * paridade comparava `min`, `max` e a expressão, e não o `trim`, que era a
 * única das diferenças com comportamento observável.
 */
const CriarEmpresaSchema = z.object({
  nome: z.string().trim().min(NOME_MIN).max(NOME_MAX),
  slug: z
    .string()
    .trim()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug em minúsculo, com dígitos e hífens internos'),
});

@UseGuards(JwtAuthGuard)
@ApiTags('tenancy')
@Controller()
export class TenancyEmpresasController {
  constructor(
    // `@Inject` EXPLÍCITO: `tsx` (esbuild) não emite `design:paramtypes`, então
    // sem o token o Nest resolveria `undefined` e a rota morreria com 500 no
    // primeiro request. Mesmo motivo de `TenancyInvitationsController`.
    @Inject(TENANCY_USE_CASES) private readonly useCases: TenancyUseCases,
  ) {}

  @Post('tenants')
  @ApiOperation({ summary: 'Criar a própria empresa' })
  // pt-BR: `@ApiBearerAuth()` é OBRIGATÓRIO aqui. No documento OpenAPI a rota
  // PÚBLICA é a única que não declara `security` — e estas duas exigem JWT
  // (`JwtAuthGuard` na classe). Sem o decorator, um cliente gerado do
  // documento não manda `Authorization` e leva 401 na primeira chamada
  // (MEDIDO no `openapi.json` gerado: `security` ausente nestas duas rotas).
  @ApiBearerAuth()
  // O `201` é declarado JUNTO do `409`: um `@ApiResponse` único SUBSTITUI o
  // default do `@Post` (MEDIDO 2026-10-19: declarar só o 404 fez o `201`
  // sumir do documento).
  @ApiResponse({ status: 201, description: 'Empresa criada' })
  @ApiResponse({ status: 400, description: 'Payload inválido' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 409, description: 'Já existe uma empresa com este identificador' })
  // pt-BR: o 404 é o `USER_NOT_FOUND` — a conta foi APAGADA (soft-delete)
  // entre o token ser emitido e este pedido, e o `findById` do caso de uso
  // filtra conta apagada. O documento não o anunciava: um cliente gerado do
  // documento não tem ramo para ele.
  @ApiResponse({ status: 404, description: 'Conta não encontrada' })
  async criar(
    @Body(new ZodValidationPipe(CriarEmpresaSchema)) body: z.infer<typeof CriarEmpresaSchema>,
    @Req() req: RequestComAtor,
  ): Promise<{ id: string; nome: string; slug: string }> {
    return this.useCases.criarEmpresa({
      userId: req.user.sub,
      nome: body.nome,
      slug: body.slug,
    });
  }

  @Get('me/tenants')
  @ApiOperation({ summary: 'Listar as empresas do ator' })
  // Lista vazia é 200 com corpo vazio — a conta em onboarding (ou o admin de
  // sistema) não pertence a empresa nenhuma, e isso é uma RESPOSTA, não uma
  // ausência de recurso.
  @ApiBearerAuth()
  @ApiResponse({ status: 200, description: 'As empresas do ator' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async listar(@Req() req: RequestComAtor): Promise<EmpresaDoUsuario[]> {
    return this.useCases.listarEmpresas(req.user.sub);
  }
}
