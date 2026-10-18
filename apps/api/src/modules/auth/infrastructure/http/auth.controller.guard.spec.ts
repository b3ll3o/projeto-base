// apps/api/src/modules/auth/infrastructure/http/auth.controller.guard.spec.ts
//
// Testes HTTP do `AuthController` COM o `JwtAuthGuard` montado (Fase 6, 6.1).
//
// ── O QUE ESTE SPEC FECHA, E POR QUE NÃO É O MESMO DO `auth.controller.spec` ──
//
// `auth.controller.spec.ts` instancia o controller na MÃO e chama os
// handlers direto. Nesse caminho os decorators não existem: não há
// `@UseGuards`, não há `@Public()`, não há `@CurrentUser()`. Ele mede a
// delegação ao use case, e é o spec certo para isso.
//
// O que ele NÃO mede é se `GET /auth/me` está protegido — e essa é a
// pergunta de segurança. Aqui o Nest sobe o controller de verdade, com os
// metadados do FONTE resolvidos pelo container.
//
// ── O DEFEITO QUE ESTE SPEC FECHA ───────────────────────────────────────────
//
// MEDIDO 2026-10-13: sem `@UseGuards(JwtAuthGuard)` na classe, o único
// filtro de `/auth/me` era o `if (subject === undefined) throw
// InvalidCredentialsException()` dentro do próprio handler. Duas
// consequências, ambas medidas:
//
//   1. UM TOKEN VÁLIDO NÃO FUNCIONA. `request.user` é publicado pelo
//      guard; sem guard, nada o escreve, `@CurrentUser()` devolve
//      `undefined` sempre — e a rota responde 401 para a sessão
//      legítima. `/auth/me` estava inútil.
//
//   2. O CÓDIGO DE ERRO ERA O DO LOGIN. O cliente recebia
//      `INVALID_CREDENTIALS`, que o manda de volta ao formulário de
//      login (ver a nota em `auth.exceptions.ts`). O certo para uma rota
//      protegida é `UNAUTHORIZED`, que manda renovar a sessão. São
//      ações opostas na UI, decididas por uma string.
//
// O `openapi.json` declarava `GET /auth/me` com `security: [{"bearer":
// []}]` — o contrato dizia "exige sessão" enquanto o runtime não
// validava NADA do token que o cliente mandava. Guard e documento têm
// que concordar; este spec é o que os amarra.

import 'reflect-metadata';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';

import { AuthController } from './auth.controller.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import {
  TOKEN_ISSUER_PORT,
  type TokenIssuerPort,
  type TokenSubject,
} from '../../domain/ports/token-issuer.port.js';
import { AUTH_USE_CASES } from '../../application/auth-use-cases.js';
import { GlobalExceptionFilter } from '../../../../shared/infrastructure/http/global-exception.filter.js';
import { UserProfileCacheService } from '../../../../shared/infrastructure/security/user-profile-cache.service.js';
import {
  TENANT_MEMBERSHIP_REPOSITORY_PORT,
  type TenantMembershipRepositoryPort,
} from '../../../tenancy/domain/ports/tenant-membership-repository.port.js';

// pt-BR (PR #101, 2026-10-17): 4ª dependência do `JwtAuthGuard`. Este spec não
// manda `X-Tenant-Id` em nenhuma das rotas que sobe, então a conferência não
// chega a rodar — mas o token precisa estar declarado, ou o Nest não constrói o
// guard e a falha aparece como `Nest can't resolve dependencies`.
const MEMBERSHIPS_STUB = {
  async findRole() {
    return 'member';
  },
} as unknown as TenantMembershipRepositoryPort;

const SUB = '0190a8b6-0000-7000-8000-000000000001';
const EMAIL = 'joao@example.com';

const ACCESS: TokenSubject = { sub: SUB, email: EMAIL, typ: 'access' };
const REFRESH: TokenSubject = { sub: SUB, email: EMAIL, typ: 'refresh' };

const TOKEN_ACCESS = 'header.payload.assinatura-access';
const TOKEN_REFRESH = 'header.payload.assinatura-refresh';
/** Token expirado: o emissor lança, como `jsonwebtoken` faz. */
const TOKEN_EXPIRADO = 'header.payload.assinatura-expirada';

const SESSAO = {
  accessToken: TOKEN_ACCESS,
  refreshToken: TOKEN_REFRESH,
  user: { id: SUB, nome: 'João', email: EMAIL, version: 1 },
};

function makeUseCases() {
  return {
    login: vi.fn(async () => SESSAO),
    renovar: vi.fn(async () => ({ accessToken: TOKEN_ACCESS, refreshToken: TOKEN_REFRESH })),
    eu: vi.fn(async () => ({ id: SUB, nome: 'João', email: EMAIL })),
  };
}

/**
 * Emissor stub. O mapa é por TOKEN — nunca por `includes('access')`: um
 * stub que casa por substring aceitaria qualquer token contendo a
 * palavra, e o teste "200 com token válido" passaria pelo motivo errado.
 *
 * `TOKEN_EXPIRADO` NÃO está no mapa: `validarAccessToken` lança, que é
 * o que o `JwtTokenService` real faz com um JWT expirado.
 */
function makeIssuer(aceitos: { token: string; subject: TokenSubject }[] = []): TokenIssuerPort {
  return {
    emitir: vi.fn(async () => ({ accessToken: TOKEN_ACCESS, refreshToken: TOKEN_REFRESH })),
    validarAccessToken: vi.fn(async (token: string) => {
      const achado = aceitos.find((t) => t.token === token);
      if (!achado) throw new Error('token inválido ou expirado');
      return achado.subject;
    }),
    validarRefreshToken: vi.fn(async () => REFRESH),
  } as TokenIssuerPort;
}

describe('AuthController — fronteira de autenticação (Fase 6.1)', () => {
  let app: NestFastifyApplication;
  let useCases: ReturnType<typeof makeUseCases>;
  let issuer: TokenIssuerPort;

  beforeEach(async () => {
    useCases = makeUseCases();
    issuer = makeIssuer([{ token: TOKEN_ACCESS, subject: ACCESS }]);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AUTH_USE_CASES, useValue: useCases },
        { provide: TOKEN_ISSUER_PORT, useValue: issuer },
        JwtAuthGuard,
        {
          provide: UserProfileCacheService,
          useValue: {
            async getUserProfileAndPermissions() {
              return null;
            },
            async setUserProfileAndPermissions() {
              /* noop */
            },
            async invalidateUser() {
              /* noop */
            },
            async invalidateAll() {
              /* noop */
            },
          },
        },
        { provide: TENANT_MEMBERSHIP_REPOSITORY_PORT, useValue: MEMBERSHIPS_STUB },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    // pt-BR: o filtro global é o que traduz a exceção em RFC 7807 — sem
    // ele o teste mediria o default do Nest, não a nossa fronteira.
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── GET /auth/me: EXIGE sessão válida (contrato D) ─────────────────

  it('GET /auth/me responde 200 COM access token válido e delega o sub', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${TOKEN_ACCESS}` },
    });

    expect(res.statusCode).toBe(200);
    // `@CurrentUser()` entrega o subject que o guard validou.
    expect(useCases.eu).toHaveBeenCalledWith(SUB);
  });

  it('GET /auth/me responde 401 SEM token, com code UNAUTHORIZED', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });

    expect(res.statusCode).toBe(401);
    // NÃO INVALID_CREDENTIALS: essa string manda o cliente de volta ao
    // formulário de login; o que houve foi sessão ausente. A distinção
    // é o que permite à UI oferecer "renovar sessão" em vez de
    // "digite a senha de novo".
    expect(res.json().code).toBe('UNAUTHORIZED');
    expect(useCases.eu).not.toHaveBeenCalled();
  });

  it('GET /auth/me responde 401 com header Authorization malformado', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
    expect(useCases.eu).not.toHaveBeenCalled();
  });

  it('GET /auth/me responde 401 com token EXPIRADO (o emissor lança)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${TOKEN_EXPIRADO}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
    expect(useCases.eu).not.toHaveBeenCalled();
  });

  it('GET /auth/me barra REFRESH no lugar de access', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${TOKEN_REFRESH}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
    expect(useCases.eu).not.toHaveBeenCalled();
  });

  it('o guard barra o refresh mesmo com emissor SABOTADO que o devolve como válido', async () => {
    // pt-BR: emissor de propósito mal comportado — `validarAccessToken`
    // devolve o refresh. A segunda barreira (`subject.typ === 'access'`)
    // é a que segura o request. Sem ela, 7 dias de acesso nasceriam de um
    // token de 15 minutos.
    const sabota = makeIssuer([{ token: TOKEN_REFRESH, subject: REFRESH }]);
    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AUTH_USE_CASES, useValue: makeUseCases() },
        { provide: TOKEN_ISSUER_PORT, useValue: sabota },
        JwtAuthGuard,
        {
          provide: UserProfileCacheService,
          useValue: {
            async getUserProfileAndPermissions() {
              return null;
            },
            async setUserProfileAndPermissions() {
              /* noop */
            },
            async invalidateUser() {
              /* noop */
            },
            async invalidateAll() {
              /* noop */
            },
          },
        },
        { provide: TENANT_MEMBERSHIP_REPOSITORY_PORT, useValue: MEMBERSHIPS_STUB },
      ],
    }).compile();
    const sabotaApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    sabotaApp.useGlobalFilters(new GlobalExceptionFilter());
    await sabotaApp.init();
    await sabotaApp.getHttpAdapter().getInstance().ready();

    try {
      const res = await sabotaApp.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${TOKEN_REFRESH}` },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await sabotaApp.close();
    }
  });

  it('o 401 de /auth/me é o MESMO nos quatro caminhos de falha (sem oráculo)', async () => {
    // pt-BR: o caller já possui o token; dizer qual parte dele falhou só
    // serve a quem está sondando um token roubado. Os quatro corpos têm de
    // ser idênticos — não só o status.
    const semToken = await app.inject({ method: 'GET', url: '/auth/me' });
    const malformado = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: 'Bearer' },
    });
    const expirado = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${TOKEN_EXPIRADO}` },
    });
    const refresh = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${TOKEN_REFRESH}` },
    });

    const detalhe = (r: { json(): { detail?: string } }) => r.json().detail;
    expect(detalhe(semToken)).toBe(detalhe(malformado));
    expect(detalhe(semToken)).toBe(detalhe(expirado));
    expect(detalhe(semToken)).toBe(detalhe(refresh));
    // A mensagem do emissor ("token inválido ou expirado") NÃO pode vazar.
    expect(detalhe(expirado)).not.toContain('expirad');
  });

  // ─── POST /auth/login e /auth/refresh: PÚBLICAS ─────────────────────

  it('POST /auth/login responde 201 SEM token (a rota é pública)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: EMAIL, senha: 'senha-de-teste-123' },
    });

    expect(res.statusCode).toBe(201);
    expect(useCases.login).toHaveBeenCalledTimes(1);
    // Rota pública não autentica ninguém: o emissor não pode ser tocado.
    expect(issuer.validarAccessToken).not.toHaveBeenCalled();
  });

  it('POST /auth/login responde 201 COM token INVÁLIDO no header (pública não inspeciona)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { authorization: 'Bearer token-que-nao-existe' },
      payload: { email: EMAIL, senha: 'senha-de-teste-123' },
    });

    expect(res.statusCode).toBe(201);
    expect(issuer.validarAccessToken).not.toHaveBeenCalled();
  });

  it('POST /auth/refresh responde 201 SEM token (a rota é pública)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: TOKEN_REFRESH },
    });

    expect(res.statusCode).toBe(201);
    expect(useCases.renovar).toHaveBeenCalledTimes(1);
    expect(issuer.validarAccessToken).not.toHaveBeenCalled();
  });
});
