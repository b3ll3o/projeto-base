// apps/api/src/modules/tenancy/infrastructure/http/tenancy-invitations.controller.ts
//
// pt-BR (Fase 5 — tenancy, 2026-10-16): as duas rotas de convite.
//
//   POST /tenants/:id/invitations  → o owner convida alguém
//   POST /invitations/accept        → quem tem o token entra
//
// A entrada por CONTA NOVA não mora aqui: ela é o ramo `destino: 'convite'`
// de `POST /users`, porque conta e membership precisam cair na mesma
// transação — o que um `@Post` separado não consegue prometer.

import { Body, Controller, Inject, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe.js';
import { TENANCY_USE_CASES, TenancyUseCases } from '../../application/tenancy.use-cases.js';
import { FeatureFlagGuard } from '../../../feature-flags/infrastructure/http/guards/feature-flag.guard.js';
import { RequireFeatureFlag } from '../../../feature-flags/infrastructure/http/decorators/require-feature-flag.decorator.js';

/** `req.user` publicado pelo `JwtAuthGuard`. */
interface RequestComAtor {
  user: { sub: string };
}

/**
 * `email` e não `emailDoConvite`: o dono pode convidar quem ele quiser, e o
 * e-mail é a chave que o aceite vai conferir contra a conta de quem entra.
 */
const EmitirConviteSchema = z.object({
  email: z.string().email(),
});

const AceitarConviteSchema = z.object({
  token: z
    .string()
    .length(64)
    .regex(/^[0-9a-f]{64}$/),
});

/**
 * O `:id` é um `uuid` de coluna (`tenants.id @db.Uuid`), então o path tem a mesma
 * obrigação de contrato que o body. Fica no NÍVEL DO MÓDULO, e não dentro da
 * classe: um `const` no corpo da classe vira campo de instância, que não existe
 * no escopo em que o decorator é avaliado (MEDIDO — `ReferenceError: TenantIdSchema
 * is not defined`).
 */
const TenantIdSchema = z.string().uuid();

/**
 * As DUAS portas respondem `404` quando `tenancy.invites` está desligada, e o
 * corpo é genérico de propósito: nomear a flag diria a qualquer scanner externo
 * que existe um interruptor. Sem esta declaração o `openapi:export` publicava
 * só `201`, e um cliente gerado do documento não tratava o 404 como possível.
 *
 * ⚠️ O `201` é declarado JUNTO e não ficou implícito: MEDIDO 2026-10-19, um
 * `@ApiResponse` único declarando só o 404 fez o documento sair com `['404']` —
 * o `@ApiResponse` declarado por handler SUBSTITUI o default do `@Post`, não se
 * soma a ele. Precedente: `users.controller.ts:161` declara o 201.
 */
const FLAG_DESLIGADA_404 = 'Recurso indisponível (funcionalidade desligada)';

// ⚠️ SEM `PermissionsGuard` e SEM `@RequirePermission`, e isso é deliberado.
// O `PermissionsGuard` resolve as permissões pelo tenant do HEADER
// (`X-Tenant-Id`), que pode ser diferente do `:id` desta rota — um header
// apontando para a Acme e um path para a Globex checariam "tenho
// `admin.manage-users` na Acme?" para uma ação sobre a Globex. Eixos
// trocados. A autorização certa aqui é "o `sub` é owner DESTE tenant", que é
// uma pergunta de um eixo só — e ela mora no use case (`findRole`), que é
// onde o dado está.
@UseGuards(JwtAuthGuard)
@Controller()
export class TenancyInvitationsController {
  constructor(
    // `@Inject` EXPLÍCITO: `tsx` (esbuild) não emite `design:paramtypes`, então
    // sem o token o Nest resolveria `undefined` e a rota morreria com 500 no
    // primeiro request — o mesmo defeito medido em cenário e2e 10.
    @Inject(TENANCY_USE_CASES) private readonly useCases: TenancyUseCases,
  ) {}

  @Post('tenants/:id/invitations')
  // pt-BR (feature-flags, 2026-10-18 — Fase 4): a PRIMEIRA functionality a
  // respeitar uma flag. Precedente: `users.controller.ts:246,262,300,331,361`.
  //
  // ⚠️ `JwtAuthGuard` NÃO é repetido aqui, e a ordem é o que garante o
  // `req.user`. O Nest CONCATENA metadata (`context-creator.js` devolve
  // `[...global, ...classe, ...handler]`), então a classe (linha 57) roda
  // primeiro e publica `req.user`; repetir o guard aqui o executaria DUAS
  // vezes, com o mesmo custo e nenhum efeito. MEDIDO: remover o `JwtAuthGuard`
  // daqui não muda um status só nos cenários 10 e 12.
  @UseGuards(FeatureFlagGuard)
  @RequireFeatureFlag('tenancy.invites')
  // pt-BR: `@ApiBearerAuth()` é OBRIGATÓRIO — no documento OpenAPI a rota
  // PÚBLICA é a única que não declara `security`, e esta exige JWT (o
  // `JwtAuthGuard` da classe). Sem o decorator, um cliente gerado do
  // documento não manda `Authorization` e leva 401 na primeira chamada.
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Convite emitido' })
  @ApiResponse({ status: 400, description: 'Payload inválido' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 403, description: 'Quem convida não administra a empresa' })
  // pt-BR: o 409 é o `CONVITE_JA_EMITIDO` — o `@@unique([tenantId, email])` de
  // `invitations` traduzido em `ConviteJaEmitidoException`. A rota DEVOLVE esse
  // status (convidar o mesmo e-mail duas vezes na mesma empresa) e o documento
  // não o anunciava: um cliente gerado do documento não tem ramo para ele, e o
  // dono lê "algo deu errado" num conflito que ele precisa resolver ("cancele o
  // convite pendente ou convide outro e-mail"). O irmão `tenancy-empresas`
  // declara os seus — a omissão aqui era uma contradição do contrato.
  @ApiResponse({ status: 409, description: 'Já existe um convite pendente para este e-mail' })
  @ApiResponse({ status: 404, description: FLAG_DESLIGADA_404 })
  async convidar(
    // ⚠️ (PR #101) O `:id` É validado, e não só o body. Sem este pipe o valor
    // chegava cru ao `emitirConvite`, que o leva até o Postgres — e a coluna é
    // `uuid`. Um path malformado morria em erro de tipo do driver, que o
    // `domain-exception-to-http.ts` não mapeia: 500 em vez de 400. MEDIDO no
    // spec deste controller: antes da correção a rota devolvia 201 e o use case
    // era chamado com `tenantId: 'nao-e-uuid'`.
    //
    // `@Param('id', pipe)` e não `@Param(pipe)`: a forma sem nome entrega o
    // OBJETO de params inteiro, e o Zod recusa com `Expected string, received
    // object` — um 400 que não distingue "uuid inválido" de "uuid válido".
    @Param('id', new ZodValidationPipe(TenantIdSchema)) tenantId: string,
    @Body(new ZodValidationPipe(EmitirConviteSchema)) body: z.infer<typeof EmitirConviteSchema>,
    @Req() req: RequestComAtor,
  ): Promise<{ token: string; expiresAt: string }> {
    const { token, expiresAt } = await this.useCases.emitirConvite({
      tenantId,
      convidadorId: req.user.sub,
      email: body.email,
    });
    // O segredo volta na resposta porque não há maileiro no repo: é a única
    // forma de a tela de admin mostrar o link. Quando houver envio de e-mail,
    // isto vira `void` e o token sai do outro lado.
    return { token, expiresAt: expiresAt.toISOString() };
  }

  @Post('invitations/accept')
  // A SEGUNDA porta, fechada em 2026-10-19. Até aqui ela era de propósito:
  // "desligar convites não pode trancar quem já tem o token". Isso é escolha de
  // produto, e escolha de produto escrita só em comentário não é uma escolha de
  // produto — é um bypass. O `FeatureFlagGuard` serve aqui (ao contrário de
  // `POST /users`, que é `@Public()` e não tem `req.user` para o guard exigir).
  @UseGuards(FeatureFlagGuard)
  @RequireFeatureFlag('tenancy.invites')
  // pt-BR: `@ApiBearerAuth()` — mesma razão da rota de cima. E os status que
  // a API DEVOLVE estão declarados: o web ramifica em 410 (expirado), 409
  // (já usado) e 403 (e-mail diferente), e um cliente gerado do documento que
  // não os conhecesse não teria ramo para eles.
  @ApiBearerAuth()
  @ApiResponse({ status: 201, description: 'Convite aceito' })
  @ApiResponse({ status: 400, description: 'Token inválido' })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  @ApiResponse({ status: 403, description: 'O convite é de outro e-mail' })
  @ApiResponse({ status: 409, description: 'O convite já foi usado' })
  @ApiResponse({ status: 410, description: 'O convite expirou' })
  @ApiResponse({ status: 404, description: FLAG_DESLIGADA_404 })
  async aceitar(
    @Body(new ZodValidationPipe(AceitarConviteSchema)) body: z.infer<typeof AceitarConviteSchema>,
    @Req() req: RequestComAtor,
  ): Promise<{ aceito: true; tenantId: string }> {
    // O `tenantId` volta porque a empresa do convite é o que o web precisa para
    // apontar a sessão para ela (o cookie `tenant_id`). Sem ele, a conta
    // entra na empresa e fica com ZERO permissões na tela — membership sem
    // escopo.
    const { tenantId } = await this.useCases.aceitarConvite({
      userId: req.user.sub,
      token: body.token,
    });
    return { aceito: true, tenantId };
  }
}
