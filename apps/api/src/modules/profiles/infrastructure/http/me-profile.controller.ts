// apps/api/src/modules/profiles/infrastructure/http/me-profile.controller.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): endpoint "me" para o frontend
// popular o header/sidebar com a info do profile do user logado.
// Sem `@RequirePermission` — qualquer user autenticado pode ler o
// próprio profile (mesmo que seja null, indicando "sem permissões").

import { Controller, Get, Inject, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { type MeuPerfil, UserProfileUseCases } from '../../application/profiles.use-cases.js';

// pt-BR (Fase 3): `tenantId` é opcional porque nem toda requisição manda
// `X-Tenant-Id` — o guard publica `null` nesse caso, e `null` é um bucket
// próprio, não falta de dado.
interface AuthedRequest {
  user: { sub: string; tenantId?: string | null };
}

// ⚠️ `@ApiBearerAuth()` NA CLASSE, e não em cada handler: no documento
// OpenAPI a rota protegida é a que declara `security`, e a rota PÚBLICA é a
// ÚNICA que não declara (o inverso disso é defeito medido: uma rota com
// guard e sem `security` sai pública no contrato).
//
// ⚠️ Aqui todas as rotas são protegidas — não há uma pública neste
// controller — então o decorator na CLASSE é o que fecha a classe: uma rota
// NOVA herda a proteção do contrato, em vez de depender de alguém lembrar
// de declarar o decorator no handler.
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@ApiTags('me')
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
  @ApiOperation({ summary: 'Ler o perfil efetivo do ator' })
  async me(@Req() req: AuthedRequest): Promise<MeuPerfil> {
    return this.useCases.obterMeuPerfil(req.user.sub, req.user.tenantId ?? null);
  }
}
