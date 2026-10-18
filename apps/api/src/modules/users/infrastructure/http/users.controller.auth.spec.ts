// apps/api/src/modules/users/infrastructure/http/users.controller.auth.spec.ts
//
// Testes HTTP da Fase 6 no `UsersController` — o que a fronteira de
// autenticação FAZ, não o que o guard faz em isolamento (isso está em
// `auth/infrastructure/http/jwt-auth.guard.spec.ts`).
//
// A diferença que importa: aqui o Nest sobe o controller de verdade, com
// os decorators resolvidos pelo container. Um teste do guard com
// `ExecutionContext` montado à mão passa verde mesmo que o `@UseGuards`
// esteja no lugar errado, ou que o `@Public()` aponte para metadata que o
// `Reflector` não lê. Aqui os metadados são os do fonte.
//
// ── AS AFIRMAÇÕES QUE VALEM ─────────────────────────────────────────────────
//
//   POST /users   SEM token → 201   (decisão D-2: cadastro aberto)
//   GET  /users   SEM token → 401   (`code: UNAUTHORIZED`)
//   GET  /users   COM token → 200
//   *             COM refresh no lugar de access → 401
//
// E a auditoria (6.3): o `AuditContext` que chega ao use case tem
// `actorId` = `sub` do token — que é o que `PrismaAuditService` grava em
// `users_history.changed_by`.
//
// ── POR QUE O `TOKEN_ISSUER_PORT` É STUBADO ─────────────────────────────────
//
// O que a spec mede é o SUBJECT devolvido, não a criptografia. Um emissor real
// exigiria `JWT_SECRET` e decidiria o resultado; um stub deixa o teste dizer
// token o guard autorizou. A validação criptográfica tem spec própria.

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Span } from '@opentelemetry/api';
import { trace } from '@opentelemetry/api';

import { UsersController } from './users.controller.js';
import { UserUseCases, USER_USE_CASES } from '../../application/user-use-cases.js';
import { JwtAuthGuard } from '../../../auth/infrastructure/http/jwt-auth.guard.js';
import { UserProfileUseCases } from '../../../profiles/application/profiles.use-cases.js';
import { UserProfileCacheService } from '../../../../shared/infrastructure/security/user-profile-cache.service.js';
import {
  TOKEN_ISSUER_PORT,
  type TokenIssuerPort,
  type TokenSubject,
} from '../../../auth/domain/ports/token-issuer.port.js';
import { AUDIT_SERVICE_PORT } from '../../../../shared/audit/shared/audit.tokens.js';
import { AuditContextStore } from '../../../../shared/audit/shared/audit-context-store.js';
import type { AuditContext } from '../../../../shared/audit/domain/audit-context.vo.js';
import {
  TENANT_MEMBERSHIP_REPOSITORY_PORT,
  type TenantMembershipRepositoryPort,
} from '../../../tenancy/domain/ports/tenant-membership-repository.port.js';
import { GlobalExceptionFilter } from '../../../../shared/infrastructure/http/global-exception.filter.js';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe.js';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { z } from 'zod';

const SUB = '0190a8b6-0000-7000-8000-000000000001';
const EMAIL = 'joao@example.com';
/** Senha válida: `CreateUserSchema` exige 8..72 (limites vindos do VO). */
const SENHA = 'senha-de-teste-123';

const ACCESS: TokenSubject = { sub: SUB, email: EMAIL, typ: 'access' };
const REFRESH: TokenSubject = { sub: SUB, email: EMAIL, typ: 'refresh' };

const USER_OUTPUT = {
  id: SUB,
  nome: 'João',
  email: EMAIL,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  version: 7,
  deletedAt: null,
  isDeleted: false,
};

interface ReplyStub {
  header: Mock;
  status: Mock;
}

function makeReply(): ReplyStub {
  return { header: vi.fn().mockReturnThis(), status: vi.fn().mockReturnThis() };
}

function makeUseCases() {
  return {
    criarUser: vi.fn(async () => USER_OUTPUT),
    listar: vi.fn(async () => ({ items: [], nextCursor: null })),
    obterPorId: vi.fn(async () => USER_OUTPUT),
    atualizarNome: vi.fn(async () => ({ ...USER_OUTPUT, version: 8 })),
    softDelete: vi.fn(async () => undefined),
    restaurar: vi.fn(async () => ({ ...USER_OUTPUT, version: 9 })),
  };
}

function makeAudit() {
  return { listHistory: vi.fn(async () => ({ entries: [], nextCursor: null })) };
}

// pt-BR (Fase 10+ — RLS, 2026-10-17): `GET /users` passou a trazer
// `@UseGuards(PermissionsGuard)` + `@RequirePermission('users.read')`, e o
// guard injeta `UserProfileUseCases` no índice [1]. Sem este provider o
// TestingModule NÃO SOBE — e o sintoma (15 vermelhos, todos com
// `await app.close()` no `afterEach`) não aponta para "falta uma dependência":
// aponta para o teardown.
//
// A concessão abaixo é o que mantém ESTE arquivo medindo AUTENTICAÇÃO. Sem
// `users.read`, o `GET /users` COM token viraria 403 e a afirmação "200 COM
// token" passaria a medir autorização — que é o outro arquivo. Onde a
// AUSÊNCIA da permissão é o que está sob medida é o e2e
// `08-ownership.e2e.spec.ts`, com perfil sem a chave.
const PROFILE_USE_CASES_STUB = {
  async obterMeuPerfil() {
    return { isAdmin: false, permissions: ['users.read'] };
  },
} as unknown as UserProfileUseCases;

// pt-BR (#93.1 — RBAC, 2026-10-16): stub do cache usado em todos os
// TestingModule deste arquivo. A 3ª dependência do JwtAuthGuard.
const CACHE_STUB = {
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
} as unknown as UserProfileCacheService;

// pt-BR (PR #101, 2026-10-17): a 4ª dependência do `JwtAuthGuard`. Nenhum
// teste deste arquivo manda `X-Tenant-Id`, então a conferência de membership não
// chega a rodar — mas o token precisa estar declarado, ou o Nest não constrói o
// guard e os 20 testes caem com `Nest can't resolve dependencies`.
const MEMBERSHIPS_STUB = {
  async findRole() {
    return 'member';
  },
} as unknown as TenantMembershipRepositoryPort;

/** Token de access que o emissor stub aceita. */
const TOKEN_ACCESS = 'header.payload.assinatura-access';
/** Token de refresh que o emissor stub aceita. */
const TOKEN_REFRESH = 'header.payload.assinatura-refresh';

/**
 * Emissor que ACEITA o access e REJEITA o refresh — o comportamento
 * correto. O teste "refresh no lugar de access" usa este mesmo emissor,
 * de propósito: o guard tem de recusar mesmo quando o emissor é bem
 * comportado, porque a segunda barreira (`typ`) não depende da boa-fé.
 *
 * O mapa é por TOKEN, não por `includes(typ)`: um stub que casa por
 * substring aceita qualquer token que contenha a palavra "access", e
 * então o teste "200 com token válido" passaria por um motivo errado.
 *
 * @param aceitos subject que o emissor devolve para `validarAccessToken`,
 *        indexado pelo token correspondente. Passe `[REFRESH]` para o
 *        emissor sabota de propósito.
 */
function makeIssuer(
  aceitos: { token: string; subject: TokenSubject }[] = [{ token: TOKEN_ACCESS, subject: ACCESS }],
): TokenIssuerPort {
  return {
    emitir: vi.fn(async () => ({ accessToken: TOKEN_ACCESS, refreshToken: TOKEN_REFRESH })),
    validarAccessToken: vi.fn(async (token: string) => {
      const achado = aceitos.find((t) => t.token === token);
      if (!achado) throw new Error('token inválido');
      return achado.subject;
    }),
    validarRefreshToken: vi.fn(async () => REFRESH),
  } as TokenIssuerPort;
}

describe('UsersController — fronteira HTTP de autenticação', () => {
  let app: NestFastifyApplication;
  let useCases: ReturnType<typeof makeUseCases>;
  let issuer: TokenIssuerPort;

  beforeEach(async () => {
    useCases = makeUseCases();
    issuer = makeIssuer();

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: USER_USE_CASES, useValue: useCases },
        { provide: AUDIT_SERVICE_PORT, useValue: makeAudit() },
        { provide: UserProfileUseCases, useValue: PROFILE_USE_CASES_STUB },
        { provide: TOKEN_ISSUER_PORT, useValue: issuer },
        { provide: TENANT_MEMBERSHIP_REPOSITORY_PORT, useValue: MEMBERSHIPS_STUB },
        JwtAuthGuard,
        {
          provide: UserProfileCacheService,
          useValue: CACHE_STUB,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    // pt-BR: o filtro global é o que traduz a exceção em RFC 7807. Sem ele
    // o teste mediria o default do Nest (500/403), não a nossa fronteira.
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(new ZodValidationPipe(z.any()));
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await app.close();
  });

  // ─── POST /users: PÚBLICO (decisão D-2) ──────────────────────────────
  it('POST /users responde 201 SEM token (cadastro aberto)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      payload: { nome: 'João', email: EMAIL, senha: SENHA },
    });

    expect(res.statusCode).toBe(201);
    expect(useCases.criarUser).toHaveBeenCalledTimes(1);
    // O guard não pode ter consultado o emissor: rota pública não
    // autentica ninguém.
    expect(issuer.validarAccessToken).not.toHaveBeenCalled();
  });

  it('POST /users responde 201 COM token inválido (pública não inspeciona token)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/users',
      headers: { authorization: 'Bearer token-que-nao-existe' },
      payload: { nome: 'João', email: EMAIL, senha: SENHA },
    });

    expect(res.statusCode).toBe(201);
    expect(issuer.validarAccessToken).not.toHaveBeenCalled();
  });

  // ─── GET /users: EXIGE sessão ────────────────────────────────────────
  it('GET /users responde 401 SEM token', async () => {
    const res = await app.inject({ method: 'GET', url: '/users' });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
    // O caso read NÃO pode tocar o repositório.
    expect(useCases.listar).not.toHaveBeenCalled();
  });

  it('GET /users responde 401 com header malformado', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users',
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
    expect(useCases.listar).not.toHaveBeenCalled();
  });

  it('GET /users responde 200 COM token válido', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users',
      headers: { authorization: `Bearer ${TOKEN_ACCESS}` },
    });

    expect(res.statusCode).toBe(200);
    expect(useCases.listar).toHaveBeenCalledTimes(1);
  });

  it('GET /users/:id exige sessão (o guard cobre a classe inteira)', async () => {
    const res = await app.inject({ method: 'GET', url: `/users/${SUB}` });

    expect(res.statusCode).toBe(401);
    expect(useCases.obterPorId).not.toHaveBeenCalled();
  });

  it('GET /users/:id/history exige sessão', async () => {
    const res = await app.inject({ method: 'GET', url: `/users/${SUB}/history` });

    expect(res.statusCode).toBe(401);
  });

  it('PATCH /users/:id exige sessão', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/users/${SUB}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: { novoNome: 'Maria' },
    });

    expect(res.statusCode).toBe(401);
    expect(useCases.atualizarNome).not.toHaveBeenCalled();
  });

  it('DELETE /users/:id exige sessão', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/users/${SUB}`,
      headers: { 'if-match': 'W/"v1"' },
    });

    expect(res.statusCode).toBe(401);
    expect(useCases.softDelete).not.toHaveBeenCalled();
  });

  // ─── refresh no lugar de access ───────────────────────────────────────
  it('GET /users responde 401 com REFRESH token no header', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/users',
      headers: { authorization: `Bearer ${TOKEN_REFRESH}` },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('UNAUTHORIZED');
    expect(useCases.listar).not.toHaveBeenCalled();
  });

  it('o guard barra o refresh mesmo com emissor que o devolve como válido', async () => {
    // pt-BR: emissor SABOTADO de propósito — `validarAccessToken` devolve o
    // refresh. A segunda barreira (`subject.typ === 'access'`) é a que
    // segura o request aqui.
    const sabota: TokenIssuerPort = makeIssuer([{ token: TOKEN_REFRESH, subject: REFRESH }]);
    const moduleRef = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: USER_USE_CASES, useValue: makeUseCases() },
        { provide: AUDIT_SERVICE_PORT, useValue: makeAudit() },
        { provide: UserProfileUseCases, useValue: PROFILE_USE_CASES_STUB },
        { provide: TOKEN_ISSUER_PORT, useValue: sabota },
        { provide: TENANT_MEMBERSHIP_REPOSITORY_PORT, useValue: MEMBERSHIPS_STUB },
        JwtAuthGuard,
        { provide: UserProfileCacheService, useValue: CACHE_STUB },
      ],
    }).compile();
    const sabotaApp = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    sabotaApp.useGlobalFilters(new GlobalExceptionFilter());
    await sabotaApp.init();
    await sabotaApp.getHttpAdapter().getInstance().ready();

    try {
      const res = await sabotaApp.inject({
        method: 'GET',
        url: '/users',
        headers: { authorization: `Bearer ${TOKEN_REFRESH}` },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await sabotaApp.close();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6.4 — o carve-out de segurança SOBREVIVE ao documento OpenAPI.
//
// MEDIDO 2026-10-13: com `@ApiSecurity('bearer', [])` em `POST /users`, o
// `openapi.json` gerado trazia
//
//   POST   /api/v1/users   security=[{"bearer": []}]
//   GET    /api/v1/users   security=[{"bearer": []}]
//
// — IDÊNTICO. Porque `@ApiSecurity('bearer', [])` produz exatamente o mesmo
// metadata que `@ApiBearerAuth()`: ambos viram `[{ bearer: [] }]`. O contrato
// público declarava que o cadastro ABIERTO exige token, e nenhum teste de
// runtime acusa isso (a rota responde 201 sem token — o guard está certo).
// Só quem lê o DOCUMENTO vê o erro.
//
// A correção NÃO é `security: []`: essa forma é INALCANÇÁVEL neste swagger.
// `swagger-explorer.js:123` roda `omitBy(methodMetadata, isEmpty)`, e o
// `isEmpty` do lodash responde `true` para `[]` — a metadata é descartada
// antes de virar operação. Não há `operationBuilderFactory` em 11.4.7.
//
// A rota pública é declarada por AUSÊNCIA da chave `security`. Isso só
// significa "pública" enquanto o documento não tiver requisito global — e é
// exatamente por isso que o segundo teste existe.
// ───────────────────────────────────────────────────────────────────────────

describe('UsersController — o carve-out público sobrevive ao OpenAPI', () => {
  let app: NestFastifyApplication;
  let doc: OpenAPIObject;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: USER_USE_CASES, useValue: makeUseCases() },
        { provide: AUDIT_SERVICE_PORT, useValue: makeAudit() },
        { provide: UserProfileUseCases, useValue: PROFILE_USE_CASES_STUB },
        { provide: TOKEN_ISSUER_PORT, useValue: makeIssuer() },
        { provide: TENANT_MEMBERSHIP_REPOSITORY_PORT, useValue: MEMBERSHIPS_STUB },
        JwtAuthGuard,
        { provide: UserProfileCacheService, useValue: CACHE_STUB },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('t').addBearerAuth().build(),
    );
  });

  afterEach(async () => {
    await app.close();
  });

  function operacao(method: string, path: string): { security?: unknown } {
    const op = (doc.paths[path] as Record<string, { security?: unknown }> | undefined)?.[method];
    expect(op, `operação ${method.toUpperCase()} ${path} ausente do documento`).toBeDefined();
    return op as { security?: unknown };
  }

  it('POST /users NÃO declara requisito de segurança (o carve-out não é herdado)', () => {
    // `undefined` e não `[]`: `security: []` é o idioma canônico do OpenAPI
    // para "sem requisito", mas o `@nestjs/swagger@11.4.7` descarta esse
    // valor (ver o bloco acima). O que resta, e funciona, é a AUSÊNCIA —
    // e ela só quer dizer "pública" por causa do teste seguinte.
    expect(operacao('post', '/users').security).toBeUndefined();
  });

  it('o documento NÃO tem `security` global — é o que torna "ausente" = pública', () => {
    // pt-BR: `addBearerAuth()` registra o ESQUEMA (`components.securitySchemes`),
    // não um requisito global. Se alguém adicionar um requisito global ao
    // `DocumentBuilder`, `POST /users` passaria a exigir token NO CONTRATO sem
    // nenhuma mudança no guard — o document mente e o runtime continua certo.
    // É este teste que torna a mentira barulhenta.
    expect(doc.security).toBeUndefined();
  });

  it('as rotas protegidas do mesmo controller exigem bearer', () => {
    expect(operacao('get', '/users').security).toEqual([{ bearer: [] }]);
    expect(operacao('get', '/users/{id}').security).toEqual([{ bearer: [] }]);
    expect(operacao('patch', '/users/{id}').security).toEqual([{ bearer: [] }]);
    expect(operacao('delete', '/users/{id}').security).toEqual([{ bearer: [] }]);
    expect(operacao('post', '/users/{id}/restore').security).toEqual([{ bearer: [] }]);
    expect(operacao('get', '/users/{id}/history').security).toEqual([{ bearer: [] }]);
  });

  it('o documento declara o esquema bearer com bearerFormat JWT', () => {
    expect(doc.components?.securitySchemes?.['bearer']).toMatchObject({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6.3 — `buildContext` popula `actorId` a partir do `sub`.
// ───────────────────────────────────────────────────────────────────────────

describe('UsersController.buildContext — actorId vem do sub do token', () => {
  let useCases: ReturnType<typeof makeUseCases>;
  let ctrl: UsersController;

  beforeEach(() => {
    useCases = makeUseCases();
    ctrl = new UsersController(
      useCases as unknown as UserUseCases,
      makeAudit() as never,
      {} as never,
    );
  });

  function actorIdDeCreate(request?: unknown): string | null {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    void ctrl.create(
      { nome: 'João', email: EMAIL } as never,
      makeReply() as never,
      request as never,
    );
    const ctx = runSpy.mock.calls[0]?.[0] as AuditContext;
    runSpy.mockRestore();
    return ctx.actorId;
  }

  it('popula actorId com o sub quando há sessão', async () => {
    await Promise.resolve();
    const actorId = actorIdDeCreate({ user: ACCESS });

    expect(actorId).toBe(SUB);
  });

  it('actorId é null quando a rota é pública e não há token (POST /users)', async () => {
    await Promise.resolve();
    expect(actorIdDeCreate(undefined)).toBeNull();
    expect(actorIdDeCreate({})).toBeNull();
  });

  it('actorId é null quando o sub NÃO é um UUID (changed_by é @db.Uuid)', async () => {
    // pt-BR: gravar um `sub` não-UUID em `users_history.changed_by`
    // (@db.Uuid) estouraria na camada de dados → 500 num request válido.
    // A queda para `null` degrada a auditoria, não a request.
    await Promise.resolve();
    expect(actorIdDeCreate({ user: { ...ACCESS, sub: 'nao-e-uuid' } })).toBeNull();
    expect(actorIdDeCreate({ user: { ...ACCESS, sub: '' } })).toBeNull();
  });

  it('actorId aceita um UUID v7 de outro usuário (não é fixo no usuário logado)', async () => {
    const outro = '0190a8b6-0000-7000-8000-00000000dead';
    await Promise.resolve();
    expect(actorIdDeCreate({ user: { ...ACCESS, sub: outro } })).toBe(outro);
  });

  it('o correlationId continua W3C quando há span ativo (não regrediu)', async () => {
    const fakeSpan = {
      spanContext: () => ({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 0x01 }),
    } as unknown as Span;
    const getSpanSpy = vi.spyOn(trace, 'getSpan').mockReturnValue(fakeSpan);
    const runSpy = vi.spyOn(AuditContextStore, 'run');

    try {
      await ctrl.create(
        { nome: 'João', email: EMAIL } as never,
        makeReply() as never,
        { user: ACCESS } as never,
      );

      const ctx = runSpy.mock.calls[0]?.[0] as AuditContext;
      expect(ctx.correlationId).toBe('a'.repeat(32));
      // O ponto da Fase 6: as DUAS coisas no mesmo AuditContext.
      expect(ctx.actorId).toBe(SUB);
    } finally {
      getSpanSpy.mockRestore();
      runSpy.mockRestore();
    }
  });
});
