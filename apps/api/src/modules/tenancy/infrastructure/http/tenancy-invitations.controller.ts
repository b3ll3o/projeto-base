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
import { z } from 'zod';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe.js';
import { TENANCY_USE_CASES, TenancyUseCases } from '../../application/tenancy.use-cases.js';

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
  async convidar(
    @Param('id') tenantId: string,
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
  async aceitar(
    @Body(new ZodValidationPipe(AceitarConviteSchema)) body: z.infer<typeof AceitarConviteSchema>,
    @Req() req: RequestComAtor,
  ): Promise<{ aceito: true }> {
    await this.useCases.aceitarConvite({ userId: req.user.sub, token: body.token });
    return { aceito: true };
  }
}
