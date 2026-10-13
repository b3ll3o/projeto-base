// apps/api/src/modules/auth/infrastructure/http/auth.controller.spec.ts
//
// Testa a camada HTTP do auth: o controller é fino (delega aos use
// cases), então o que tem valor aqui é
//
//   1. o `me` NÃO funciona sem sessão — e devolve 401, não 500;
//   2. o decorator `@CurrentUser()` lê `request.user`, que é o que o
//      `JwtAuthGuard` da Fase 6 vai preencher. Testar o decorator
//      AGORA é o que prova que a Fase 6 não precisa reescrever o
//      controller: ela só precisa montar o guard.

import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthController } from './auth.controller.js';
import { CurrentUser } from './current-user.decorator.js';
import { InvalidCredentialsException } from '../../domain/exceptions/auth.exceptions.js';
import type { AuthUseCases } from '../../application/auth-use-cases.js';
import type { TokenSubject } from '../../domain/ports/token-issuer.port.js';

const SESSAO = {
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  user: { id: 'u-1', nome: 'João', email: 'joao@example.com', version: 1 },
};

describe('AuthController', () => {
  let useCases: AuthUseCases;
  let controller: AuthController;

  beforeEach(() => {
    useCases = {
      login: vi.fn(async () => SESSAO),
      renovar: vi.fn(async () => ({ accessToken: 'a2', refreshToken: 'r2' })),
      eu: vi.fn(async () => ({ id: 'u-1', email: 'joao@example.com' })),
    } as unknown as AuthUseCases;
    controller = new AuthController(useCases);
  });

  it('POST /auth/login delega ao use case e devolve a sessão', async () => {
    const out = await controller.login({ email: 'joao@example.com', senha: 'senha' });

    expect(useCases.login).toHaveBeenCalledWith({ email: 'joao@example.com', senha: 'senha' });
    expect(out).toEqual(SESSAO);
  });

  it('POST /auth/refresh delega ao use case', async () => {
    const out = await controller.refresh({ refreshToken: 'refresh-antigo' });

    expect(useCases.renovar).toHaveBeenCalledWith({ refreshToken: 'refresh-antigo' });
    expect(out).toEqual({ accessToken: 'a2', refreshToken: 'r2' });
  });

  it('GET /auth/me delega com o `sub` do token', async () => {
    await controller.me({ sub: 'u-1', email: 'joao@example.com', typ: 'access' });

    expect(useCases.eu).toHaveBeenCalledWith('u-1');
  });

  it('GET /auth/me SEM sessão → 401 (InvalidCredentialsException), não TypeError', async () => {
    // pt-BR: enquanto a Fase 6 não instala o guard, `request.user` é
    // `undefined`. Sem este ramo, `subject.sub` estouraria TypeError e
    // o cliente receberia 500 num erro de autenticação.
    await expect(controller.me(undefined)).rejects.toBeInstanceOf(InvalidCredentialsException);
    expect(useCases.eu).not.toHaveBeenCalled();
  });
});

describe('@CurrentUser()', () => {
  /**
   * `createParamDecorator` NÃO expõe a factory que ele embute — o que
   * ele devolve é um `ParameterDecorator`. Este helper chega na factory
   * pelo caminho que o Nest usa em produção: o decorator foi aplicado
   * numa classe real, o Nest guardou `{index, factory, data, pipes}`
   * em `__routeArguments__`, e a resolução do parametro é `factory(data,
   * ctx)`.
   *
   * Chamar `CurrentUser(undefined, ctx)` direto — que é a leitura
   * ingênua deste spec na primeira versão — devolve a função anônima do
   * ParameterDecorator, não o usuário. O teste passava a medir o Nest.
   */
  function invocarCurrentUser(request: unknown): unknown {
    class Alvo {
      me(@CurrentUser() _usuario?: unknown): unknown {
        return _usuario;
      }
    }
    const args = Reflect.getMetadata('__routeArguments__', Alvo, 'me') as Record<
      string,
      { factory: (data: unknown, ctx: unknown) => unknown }
    >;
    const entrada = args[Object.keys(args)[0]!]!;
    return entrada.factory(undefined, {
      switchToHttp: () => ({ getRequest: () => request }),
    });
  }

  it('lê `request.user` (o que o JwtAuthGuard preenche)', () => {
    const subject: TokenSubject = { sub: 'u-1', email: 'joao@example.com', typ: 'access' };

    expect(invocarCurrentUser({ user: subject })).toBe(subject);
  });

  it('devolve undefined quando não há guard — o `me` decide o que fazer com isso', () => {
    expect(invocarCurrentUser({})).toBeUndefined();
    expect(invocarCurrentUser({ user: undefined })).toBeUndefined();
  });
});
