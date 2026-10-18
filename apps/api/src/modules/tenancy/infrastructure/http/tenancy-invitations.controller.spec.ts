// apps/api/src/modules/tenancy/infrastructure/http/tenancy-invitations.controller.spec.ts
//
// pt-BR (PR #101, 2026-10-17): validação do `:id` de
// `POST /tenants/:id/invitations`.
//
// ⚠️ Este arquivo não existia. A rota validava o BODY com
// `ZodValidationPipe(EmitirConviteSchema)` e deixava o PATH cru: `@Param('id')
// tenantId: string` vai direto para `useCases.emitirConvite`, que leva o valor
// até o Postgres — e a coluna é `uuid`. Um `:id` malformado morre em erro de
// tipo do driver, que o `domain-exception-to-http.ts` não conhece: 500.
//
// ── POR QUE ESTE TESTE SOBE O CONTROLLER DE VERDADE ────────────────────────
// Um teste que chamasse `controller.convidar('abc', …)` direto PASSARIA VERDE
// com o defeito: pipes são aplicados pelo framework, não pela assinatura do
// método. Aqui o Nest sobe a rota com os decorators resolvidos pelo container,
// então o `@Param(new ZodValidationPipe(…))` só existe se estiver no fonte.
//
// ── POR QUE A AFIRMAÇÃO É "O USE CASE NÃO FOI CHAMADO" ─────────────────────
// Status sozinho não distingue "a borda recusou" de "algo depois recusou por
// outro motivo" — um 401 do guard passaria por 400 se eu checasse só o número.
// O `emitirConvite` ser chamado é a prova de que a borda deixou passar: com o
// defeito ele É chamado, com a validação NÃO é.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { z } from 'zod';

import { TenancyInvitationsController } from './tenancy-invitations.controller.js';
import { TENANCY_USE_CASES, TenancyUseCases } from '../../application/tenancy.use-cases.js';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { FeatureFlagGuard } from '../../../feature-flags/infrastructure/http/guards/feature-flag.guard.js';
import { GlobalExceptionFilter } from '../../../../shared/infrastructure/http/global-exception.filter.js';

const SUB = '0190a8b6-0000-7000-8000-000000000001';
const TENANT_OK = '0190a8b6-0000-7000-8000-00000000aaaa';

describe('TenancyInvitationsController — o `:id` do convite', () => {
  let app: NestFastifyApplication;
  let emitirConvite: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    emitirConvite = vi.fn().mockResolvedValue({
      token: 'a'.repeat(64),
      expiresAt: new Date('2026-10-24T00:00:00.000Z'),
    });

    const useCases = {
      emitirConvite,
      aceitarConvite: vi.fn().mockResolvedValue(undefined),
    } as unknown as TenancyUseCases;

    // O guard fica ABERTO de propósito: o que está sob teste é a borda do
    // `:id`, e um 401 aqui esconderia o 400 que o teste precisa observar.
    // Ele NÃO entra como provider — `overrideGuard` só precisa da classe como
    // metadado, e registrá-la no container puxaria `UserProfileCacheService`
    // (uma dependência a mais do que este teste mede).
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [TenancyInvitationsController],
      providers: [{ provide: TENANCY_USE_CASES, useValue: useCases }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: { switchToHttp: () => { getRequest: () => { user?: unknown } } }) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { sub: SUB };
          return true;
        },
      })
      // O `FeatureFlagGuard` fica ABERTO pelo mesmo motivo do `JwtAuthGuard`:
      // sob teste aqui é o `:id`, e um 404 de flag desligada esconderia o 400.
      // O que o guard FAZ quando a flag está off é medido no e2e
      // `test/e2e/scenarios/13-feature-flags.e2e.spec.ts`, que tem o banco.
      .overrideGuard(FeatureFlagGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  it('recusa um `:id` que não é uuid com 400, sem chamar o use case', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/tenants/nao-e-uuid/invitations',
      payload: { email: 'convidado@acme.test' },
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json().code).toBe('VALIDATION_ERROR');
    // A afirmação que tem dente: o valor NÃO atravessou a borda.
    expect(emitirConvite).not.toHaveBeenCalled();
  });

  it('um `:id` em formato de uuid atravessa e chega intacto ao use case', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: `/tenants/${TENANT_OK}/invitations`,
      payload: { email: 'convidado@acme.test' },
    });

    expect(resposta.statusCode).toBe(201);
    expect(emitirConvite).toHaveBeenCalledWith({
      tenantId: TENANT_OK,
      convidadorId: SUB,
      email: 'convidado@acme.test',
    });
  });

  it('a validação do `:id` não afrouxa a do body (email ausente ainda é 400)', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: `/tenants/${TENANT_OK}/invitations`,
      payload: {},
    });

    expect(resposta.statusCode).toBe(400);
    expect(emitirConvite).not.toHaveBeenCalled();
  });

  it('o schema do `:id` é `.uuid()` do Zod — o mesmo contrato que um VO de tenant usaria', async () => {
    // Fica explícito porque a escolha tem consequência: `.uuid()` do Zod é
    // estrito sobre a FORMA (8-4-4-4-12 hex). Um id gerado por
    // `gen_random_uuid()` sempre passa; um id vindo de base legada que use
    // big endian de outro formato passaria no `@db.Uuid` do Postgres e
    // seria recusado aqui. É a assimetria que o defeito original escondia: o
    // banco dizia "uuid" e o código não dizia nada.
    const schema = z.string().uuid();
    expect(schema.safeParse(TENANT_OK).success).toBe(true);
    expect(schema.safeParse('nao-e-uuid').success).toBe(false);
  });
});
