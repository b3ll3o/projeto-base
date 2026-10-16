// apps/api/src/modules/profiles/infrastructure/http/me-profile.controller.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): endpoint "me" para o frontend
// popular o header/sidebar com a info do profile do user logado.
// Sem `@RequirePermission` — qualquer user autenticado pode ler o
// próprio profile (mesmo que seja null, indicando "sem permissões").

import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { UserProfileUseCases } from '../../application/profiles.use-cases.js';

interface AuthedRequest {
  user: { sub: string };
}

@UseGuards(JwtAuthGuard)
@Controller('api/v1/me')
export class MeProfileController {
  constructor(private readonly useCases: UserProfileUseCases) {}

  @Get('profile')
  async me(@Req() req: AuthedRequest): Promise<{
    profileId: string | null;
    profileSlug: string | null;
    profileName: string | null;
    isAdmin: boolean;
    permissions: string[];
  }> {
    return this.useCases.obterMeuPerfil(req.user.sub);
  }
}
