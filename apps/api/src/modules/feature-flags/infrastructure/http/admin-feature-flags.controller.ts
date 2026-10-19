// apps/api/src/modules/feature-flags/infrastructure/http/admin-feature-flags.controller.ts
//
// pt-BR (feature-flags, 2026-10-18 — Fase 3): a tela de admin do sistema.
//
//   GET  /admin/feature-flags             → toda chave do catálogo + estado
//   PUT  /admin/feature-flags/:chave      → liga/desliga UMA chave
//
// ⚠️ `@RequirePermission` em CADA handler, e não na CLASSE. O `@UseGuards` da
// classe cobre as duas rotas, mas o `PermissionsGuard` faz
// `getAllAndOverride([handler, classe])` — decorator de classe ainda funciona.
// O motivo de repetir por handler é o modo como o resto do repositório escreve
// (`admin-profiles.controller.ts`) e o modo como o DEFECTO aparece: handler
// novo sem o decorator continua ABERTO, porque o guard devolve `true` quando
// não há requisito (`permissions.guard.ts:60`).
//
// ⚠️ O `@RequirePermission` NÃO é o portão desta feature — o signup de empresa
// concede `listAllPermissions()` ao dono de cada empresa nova
// (`prisma-tenant-onboarding.repository.ts:209`), então todo dono de empresa
// **CRIADA A PARTIR DESTA VERSÃO** já tem `admin.manage-feature-flags` no banco.
//
// MEDIDO 2026-10-18: a chave é NOVA neste branch (o diff do catálogo em relação
// a `main` é só a linha `+ 'admin.manage-feature-flags',`) e NENHUMA migration
// faz backfill de `authorizations` — `grep -rl manage-feature-flags
// prisma/migrations/` não devolve nada. Então o dono de uma empresa ANTERIOR a
// esta versão não tem a chave, e o `PermissionsGuard` barra ele aqui, ANTES de
// D2. O desfecho é o mesmo 403; muda só QUEM recusou — e por isso o decorator
// continua sendo defense in depth, não o portão. Quem barra de fato é D2, dentro
// da use case (`tenantId === null && isAdmin`).
//
// O backfill foi considerado e **não** feito de propósito: ele não mudaria a
// autorização de ninguém (D2 barra o mesmo ator logo em seguida), então seria
// escrita em produção sem efeito de segurança, por um ganho de nada.

import { Body, Controller, Get, Inject, Param, Put, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import type { FeatureFlagDto, UpdateFeatureFlagInputDto } from '@projeto/shared-types';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { PermissionsGuard } from '../../../profiles/infrastructure/http/guards/permissions.guard.js';
import { RequirePermission } from '../../../profiles/infrastructure/http/decorators/require-permission.decorator.js';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe.js';
import { FeatureFlagUseCases } from '../../application/feature-flag.use-cases.js';

/**
 * O mínimo do `req.user` publicado pelo `JwtAuthGuard` — mesma forma local do
 * `admin-profiles.controller.ts` (declarada por controller, não extraída,
 * porque os dois nunca são usados juntos).
 */
interface RequestComAtor {
  user: { sub: string; tenantId?: string | null; isAdmin?: boolean };
}

/**
 * Corpo do PUT. Fica no NÍVEL DO MÓDULO e não dentro da classe: um `const` no
 * corpo da classe vira campo de instância, e o decorator é avaliado no escopo
 * do módulo (o mesmo motivo anotado em
 * `tenancy-invitations.controller.ts:41-46`).
 *
 * `z.boolean()` e não coerção: `"false"`, `1` e `0` são recusados com 400 em
 * vez de virarem estado. Um toggle que aceita `"false"` como verdadeiro é
 * desligar a funcionalidade sem ninguém ter clicado em nada.
 *
 * Campos a mais são descartados pelo Zod (strip), então um `chave` no corpo
 * não muda o recurso endereçado — a chave é do PATH.
 */
const DefinirFeatureFlagSchema = z.object({ ativada: z.boolean() });

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('admin/feature-flags')
export class AdminFeatureFlagsController {
  constructor(
    // pt-BR: `@Inject` EXPLÍCITO — `tsx` (esbuild) não emite
    // `design:paramtypes`, então sem o token o Nest passa `undefined` e a rota
    // morre com 500 no PRIMEIRO request. Nenhuma spec unitária pega: o spec
    // deste controller monta com `new`.
    @Inject(FeatureFlagUseCases) private readonly useCases: FeatureFlagUseCases,
  ) {}

  /**
   * `req.user` → `AtorAutenticado`. `isAdmin === true` e não `isAdmin`: o
   * ausente precisa virar `false` (fail-closed), não `undefined` — que é
   * falsy num `if` e verdadeiro num `!== false`.
   */
  private atorDe(req: RequestComAtor) {
    return {
      userId: req.user.sub,
      tenantId: req.user.tenantId ?? null,
      isAdmin: req.user.isAdmin === true,
    };
  }

  @Get()
  @RequirePermission('admin.manage-feature-flags')
  async listar(@Req() req: RequestComAtor): Promise<FeatureFlagDto[]> {
    return this.useCases.listar(this.atorDe(req));
  }

  @Put(':chave')
  @RequirePermission('admin.manage-feature-flags')
  async definir(
    @Param('chave') chave: string,
    @Body(new ZodValidationPipe(DefinirFeatureFlagSchema)) body: UpdateFeatureFlagInputDto,
    @Req() req: RequestComAtor,
  ): Promise<FeatureFlagDto> {
    return this.useCases.definir(this.atorDe(req), chave, body.ativada);
  }
}
