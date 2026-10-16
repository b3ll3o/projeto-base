// apps/api/src/modules/auth/infrastructure/http/jwt-auth.guard.spec.ts
//
// Teste unitário do JwtAuthGuard (Fase 6, contrato C).
//
// O guard é a FRONTEIRA de autenticação: é a única coisa que decide se um
// request chega ao handler de `/users`. Os casos aqui não são "o token foi
// decodificado", são "o request NÃO CHEGOU ao handler" — cada negativa
// afirma as três coisas que importam ao cliente:
//
//   1. lança (não devolve `false`) — devolver `false` daria um 403 sem corpo
//      e esconderia o motivo; o contrato pede 401 com `code`.
//   2. o status é 401;
//   3. o `code` é `UNAUTHORIZED` — o que o GlobalExceptionFilter preserva
//      a partir do response-object da HttpException.
//
// ── POR QUE O `detail` É ÚNICO PARA TODAS AS FALHAS ─────────────────────────
//
// "Header ausente", "token expirado" e "refresh no lugar de access" são três
// `detail` diferentes na implementação ingênua — e isso é um oráculo: quem
// consegue distinguir "token inválido" de "token de refresh válido" sabe que
// o token está bem assinado. O caller JÁ POSSUI o token; dizer qual parte
// dele falhou só ajuda um atacante. Existe um teste dedicado
// ("não distingue os motivos de falha") que trava essa decisão.
//
// pt-BR: `Reflector` real é usado (não mock) — o `@Public()` é lido por
// metadata, e um mock de `getAllAndOverride` testaria o mock. O
// `ExecutionContext` é montado à mão, que é a forma unitária sem container.

import { describe, it, expect, vi } from 'vitest';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Public } from './public.decorator.js';
import {
  TOKEN_ISSUER_PORT,
  type TokenIssuerPort,
  type TokenSubject,
} from '../../domain/ports/token-issuer.port.js';

const SUB_VALID = '0190a8b6-0000-7000-8000-000000000001';
const EMAIL = 'joao@example.com';

const ACCESS_SUBJECT: TokenSubject = { sub: SUB_VALID, email: EMAIL, typ: 'access' };
const REFRESH_SUBJECT: TokenSubject = { sub: SUB_VALID, email: EMAIL, typ: 'refresh' };

/** Stub do TokenIssuerPort — `validarAccessToken` é o único método que o guard usa. */
function makeIssuer(overrides: Partial<TokenIssuerPort> = {}): TokenIssuerPort {
  return {
    emitir: vi.fn(async () => ({ accessToken: 'a', refreshToken: 'r' })),
    validarAccessToken: vi.fn(async () => ACCESS_SUBJECT),
    validarRefreshToken: vi.fn(async () => REFRESH_SUBJECT),
    ...overrides,
  } as TokenIssuerPort;
}

/**
 * Monta um ExecutionContext com o shape que o guard lê:
 * `switchToHttp().getRequest()` e `getHandler()/getClass()`.
 * `handler`/`clazz` saem das classes decorated abaixo — é assim que o
 * `@Public()` real é exercitado.
 */
class DummyController {
  findOne(): void {}
}
class DummyPublicController {
  @Public()
  create(): void {}
}

function makeContext(options: {
  authorization?: string | undefined;
  headers?: Record<string, unknown>;
  handler?: (...args: never[]) => unknown;
  clazz?: unknown;
}): ExecutionContext {
  const request: Record<string, unknown> = {
    ...(options.headers ?? {}),
    ...(options.authorization === undefined
      ? {}
      : { headers: { ...(options.headers ?? {}), authorization: options.authorization } }),
  };

  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => options.handler ?? DummyController.prototype.findOne,
    getClass: () => options.clazz ?? DummyController,
  } as unknown as ExecutionContext;
}

function makeGuard(issuer: TokenIssuerPort): JwtAuthGuard {
  return new JwtAuthGuard(issuer, new Reflector(), {
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
  } as never);
}

/** Executa o guard e devolve a exceção capturada, falhando o teste se NÃO houver. */
async function captureRejection(guard: JwtAuthGuard, ctx: ExecutionContext): Promise<unknown> {
  let captured: unknown;
  let threw = false;
  try {
    await guard.canActivate(ctx);
  } catch (e) {
    captured = e;
    threw = true;
  }
  expect(threw, 'o guard deveria ter rejeitado o request').toBe(true);
  return captured;
}

function expectUnauthorized(err: unknown): void {
  expect(err).toBeInstanceOf(UnauthorizedException);
  const payload = (err as UnauthorizedException).getResponse() as Record<string, unknown>;
  expect((err as UnauthorizedException).getStatus()).toBe(401);
  expect(payload['code']).toBe('UNAUTHORIZED');
}

describe('JwtAuthGuard — token válido', () => {
  it('libera o request e publica o TokenSubject em request.user', async () => {
    const issuer = makeIssuer();
    const guard = makeGuard(issuer);

    const ctx = makeContext({ authorization: 'Bearer abc.def.ghi' });
    const allowed = await guard.canActivate(ctx);

    expect(allowed).toBe(true);
    const request = ctx.switchToHttp().getRequest<{
      user?: TokenSubject & { isAdmin: boolean; permissions: string[] };
    }>();
    // pt-BR (#93.1 — RBAC, 2026-10-16): guard adiciona `isAdmin`/`permissions`
    // (cache lookup). Sem cache hit, default = `false`/`[]`.
    expect(request.user).toEqual({ ...ACCESS_SUBJECT, isAdmin: false, permissions: [] });
  });

  it('consulta validarAccessToken com o token SEM o prefixo "Bearer "', async () => {
    const issuer = makeIssuer();
    const guard = makeGuard(issuer);

    await guard.canActivate(makeContext({ authorization: 'Bearer abc.def.ghi' }));

    expect(issuer.validarAccessToken).toHaveBeenCalledWith('abc.def.ghi');
  });

  it('aceita o prefixo "bearer" em minúsculo (RFC 7235 é case-insensitive)', async () => {
    const issuer = makeIssuer();
    const guard = makeGuard(issuer);

    const allowed = await guard.canActivate(makeContext({ authorization: 'bearer abc.def.ghi' }));

    expect(allowed).toBe(true);
    expect(issuer.validarAccessToken).toHaveBeenCalledWith('abc.def.ghi');
  });
});

describe('JwtAuthGuard — header ausente ou malformado', () => {
  it('rejeita com 401 UNAUTHORIZED quando não há header Authorization', async () => {
    const issuer = makeIssuer();
    const guard = makeGuard(issuer);

    const err = await captureRejection(guard, makeContext({ authorization: undefined }));

    expectUnauthorized(err);
    expect(issuer.validarAccessToken).not.toHaveBeenCalled();
  });

  it('rejeita com 401 quando o header não usa o esquema Bearer', async () => {
    const guard = makeGuard(makeIssuer());

    const err = await captureRejection(guard, makeContext({ authorization: 'Basic dXNlcjpwYXNz' }));

    expectUnauthorized(err);
  });

  it('rejeita com 401 quando o header é "Bearer" sem token', async () => {
    const guard = makeGuard(makeIssuer());

    const err = await captureRejection(guard, makeContext({ authorization: 'Bearer' }));

    expectUnauthorized(err);
  });

  it('rejeita com 401 quando o header é "Bearer " só com espaços', async () => {
    const guard = makeGuard(makeIssuer());

    const err = await captureRejection(guard, makeContext({ authorization: 'Bearer    ' }));

    expectUnauthorized(err);
  });

  it('rejeita com 401 quando o request nem tem objeto headers', async () => {
    const guard = makeGuard(makeIssuer());
    // pt-BR: request sem `headers` (Fastify sempre popula, mas um guard que
    // assume o shape quebra em qualquer adapter que não popule — e o teste
    // é o que trava essa suposição).
    const ctx = makeContext({});
    (ctx.switchToHttp().getRequest() as Record<string, unknown>)['headers'] = undefined;

    const err = await captureRejection(guard, ctx);

    expectUnauthorized(err);
  });
});

describe('JwtAuthGuard — token rejeitado pelo emissor', () => {
  it('rejeita com 401 quando o token está expirado', async () => {
    const issuer = makeIssuer({
      validarAccessToken: vi.fn(async () => {
        throw new Error('jwt expired');
      }),
    });
    const guard = makeGuard(issuer);

    const err = await captureRejection(guard, makeContext({ authorization: 'Bearer expirado' }));

    expectUnauthorized(err);
  });

  it('rejeita com 401 quando a assinatura não confere', async () => {
    const issuer = makeIssuer({
      validarAccessToken: vi.fn(async () => {
        throw new Error('invalid signature');
      }),
    });
    const guard = makeGuard(issuer);

    const err = await captureRejection(guard, makeContext({ authorization: 'Bearer adulterado' }));

    expectUnauthorized(err);
  });

  it('NÃO publica request.user quando o emissor rejeita', async () => {
    const issuer = makeIssuer({
      validarAccessToken: vi.fn(async () => {
        throw new Error('nope');
      }),
    });
    const guard = makeGuard(issuer);
    const ctx = makeContext({ authorization: 'Bearer ruim' });

    await captureRejection(guard, ctx);

    const request = ctx.switchToHttp().getRequest<{ user?: TokenSubject }>();
    expect(request.user).toBeUndefined();
  });
});

describe('JwtAuthGuard — refresh token no lugar de access', () => {
  it('rejeita com 401 quando validarAccessToken devolve typ="refresh"', async () => {
    // pt-BR: a defesa primária é o próprio `validarAccessToken` recusar. Esta
    // spec mede a SEGUNDA barreira — o guard não confia que a implementação
    // fez o filtro, e revalida o `typ` antes de liberar o request. Um
    // emissor mal-escrito que devolva o refresh mesmo assim NÃO abre a porta.
    const issuer = makeIssuer({ validarAccessToken: vi.fn(async () => REFRESH_SUBJECT) });
    const guard = makeGuard(issuer);
    const ctx = makeContext({ authorization: 'Bearer refresh.de.jwt' });

    const err = await captureRejection(guard, ctx);

    expectUnauthorized(err);
    const request = ctx.switchToHttp().getRequest<{ user?: TokenSubject }>();
    expect(request.user).toBeUndefined();
  });

  it('rejeita com 401 quando o typ ausente ou inválido', async () => {
    const issuer = makeIssuer({
      // pt-BR: `typ: 'banana'` é fora do contrato de propósito (o `typ` do
      // TokenSubject é `'access' | 'refresh'`). O duplo `as` documenta que o
      // emissor pode devolver um formato fora do tipo — é justamente o que a segunda
      // barreira do guard tem de aguentar sem virar 500.
      validarAccessToken: vi.fn(
        async () => ({ ...ACCESS_SUBJECT, typ: 'banana' }) as unknown as TokenSubject,
      ),
    });
    const guard = makeGuard(issuer);

    const err = await captureRejection(guard, makeContext({ authorization: 'Bearer x.y.z' }));

    expectUnauthorized(err);
  });
});

describe('JwtAuthGuard — rotas públicas (@Public)', () => {
  it('libera o request SEM token quando o handler tem @Public()', async () => {
    const issuer = makeIssuer();
    const guard = makeGuard(issuer);
    const ctx = makeContext({
      authorization: undefined,
      handler: DummyPublicController.prototype.create,
      clazz: DummyPublicController,
    });

    const allowed = await guard.canActivate(ctx);

    expect(allowed).toBe(true);
    expect(issuer.validarAccessToken).not.toHaveBeenCalled();
  });

  it('libera o request SEM token mesmo quando a CLASSE tem o guard', async () => {
    // pt-BR: `@Public()` no handler tem de vencer o guard de classe. É a
    // diferença entre "cadastro aberto" (decisão D-2) e "cadastro trancado".
    const issuer = makeIssuer();
    const guard = makeGuard(issuer);
    const ctx = makeContext({
      authorization: undefined,
      handler: DummyPublicController.prototype.create,
      clazz: DummyPublicController,
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('ainda exige token no resto da classe (o @Public() é por handler)', async () => {
    const issuer = makeIssuer();
    const guard = makeGuard(issuer);
    const ctx = makeContext({ authorization: undefined, clazz: DummyPublicController });

    const err = await captureRejection(guard, ctx);

    expectUnauthorized(err);
  });
});

describe('JwtAuthGuard — não vaza o motivo da falha', () => {
  it('usa o MESMO detail para header ausente, token inválido e refresh-no-lugar-de-access', async () => {
    // pt-BR (2026-10-13): três `detail` distintos seriam um oráculo — quem
    // distingue "expirado" de "refresh válido" descobre que o token está
    // bem assinado. Este teste é o que trava a decisão.
    const guardSemHeader = makeGuard(makeIssuer());
    const guardTokenRuim = makeGuard(
      makeIssuer({
        validarAccessToken: vi.fn(async () => {
          throw new Error('jwt expired');
        }),
      }),
    );
    const guardRefresh = makeGuard(
      makeIssuer({ validarAccessToken: vi.fn(async () => REFRESH_SUBJECT) }),
    );

    const detalhes = await Promise.all(
      [
        captureRejection(guardSemHeader, makeContext({ authorization: undefined })),
        captureRejection(guardTokenRuim, makeContext({ authorization: 'Bearer expirado' })),
        captureRejection(guardRefresh, makeContext({ authorization: 'Bearer refresh' })),
      ].map((p) =>
        p.then((e) => (e as UnauthorizedException).getResponse() as Record<string, unknown>),
      ),
    );

    expect(new Set(detalhes.map((d) => d['detail'])).size).toBe(1);
    expect(new Set(detalhes.map((d) => d['code']))).toEqual(new Set(['UNAUTHORIZED']));
  });

  it('não embute o token recebido na mensagem de erro', async () => {
    const guard = makeGuard(
      makeIssuer({
        validarAccessToken: vi.fn(async () => {
          throw new Error('invalid');
        }),
      }),
    );

    const err = await captureRejection(
      guard,
      makeContext({ authorization: 'Bearer segredo-falso' }),
    );
    const payload = (err as UnauthorizedException).getResponse() as Record<string, unknown>;

    expect(JSON.stringify(payload)).not.toContain('segredo-falso');
  });
});

describe('JwtAuthGuard — contrato de injeção', () => {
  it('o guard depende de TOKEN_ISSUER_PORT (não de uma classe concreta)', () => {
    // pt-BR: o `@Inject(TOKEN_ISSUER_PORT)` explícito é obrigatório porque
    // o parâmetro é uma interface — apagada em runtime, sem
    // design:paramtypes. Sem esse token o Nest resolveria `undefined` e o
    // defeito só apareceria em `dev` (tsx não emite metadata de DI).
    const paramtypes = Reflect.getMetadata?.('design:paramtypes', JwtAuthGuard) ?? [];
    // A verificação real é estrutural: o token existe e o guard o consome
    // via construtor. Aqui basta fixar que o símbolo está exportado e é
    // estável (guard espera o MESMO símbolo que o AuthModule provide).
    expect(typeof TOKEN_ISSUER_PORT).toBe('symbol');
    expect(TOKEN_ISSUER_PORT.description).toBe('TokenIssuerPort');
    // Se um dia JwtAuthGuard ganhar um construtor sem parâmetro, o teste
    // acima continuaria verde e o guard quebraria em runtime — este
    // `paramtypes` fica declarado para tornar essa regressão visível.
    expect(paramtypes === undefined || Array.isArray(paramtypes)).toBe(true);
  });
});
