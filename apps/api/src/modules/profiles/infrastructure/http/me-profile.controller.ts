// apps/api/src/modules/profiles/infrastructure/http/me-profile.controller.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): endpoint "me" para o frontend
// popular o header/sidebar com a info do profile do user logado.
// Sem `@RequirePermission` — qualquer user autenticado pode ler o
// próprio profile (mesmo que seja null, indicando "sem permissões").

import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { type MeuPerfil, UserProfileUseCases } from '../../application/profiles.use-cases.js';

// pt-BR (Fase 3): `tenantId` é opcional porque nem toda requisição manda
// `X-Tenant-Id` — o guard publica `null` nesse caso, e `null` é um bucket
// próprio, não falta de dado.
interface AuthedRequest {
  user: { sub: string; tenantId?: string | null };
}

@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeProfileController {
  constructor(
    // pt-BR (#97): `@Inject` EXPLÍCITO — `tsx` (esbuild) não emite
    // `design:paramtypes`, então sem o token o Nest passa `undefined`. Esta
    // rota não aparece no cenário e2e 10, mas é a mesma classe de defeito
    // das outras três: nenhuma delas tem spec que suba o container.
    @Inject(UserProfileUseCases) private readonly useCases: UserProfileUseCases,
  ) {}

  @Get('profile')
  async me(@Req() req: AuthedRequest): Promise<MeuPerfil> {
    return this.useCases.obterMeuPerfil(req.user.sub, req.user.tenantId ?? null);
  }
}
