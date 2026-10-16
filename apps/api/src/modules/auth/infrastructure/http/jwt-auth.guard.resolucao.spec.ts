// apps/api/src/modules/auth/infrastructure/http/jwt-auth.guard.resolucao.spec.ts
//
// O `JwtAuthGuard` RESOLVE no grafo real do `AuthModule`? (Fase 6.1)
//
// `auth.controller.guard.spec.ts` monta um TestingModule com providers
// STUB. Isso prova que o controller está protegido, mas não prova que o
// guard resolve no módulo de verdade — que é outra pergunta.
//
// O modo HTTP (`app.init` + `inject`) exigiria o Postgres de pé e não
// roda em suíte unitária. A pergunta, porém, é de DI e se responde sem
// banco: compilar o `AuthModule` e olhar o guard que o container
// construiu.
//
// ── POR QUE ESTE SPEC EXISTE ───────────────────────────────────────────────
//
// `auth.module.spec.ts` já afirma
//
//   expect(moduleRef.get(JwtAuthGuard)).toBeInstanceOf(JwtAuthGuard)
//
// e essa asserção PASSA com o guard completamente quebrado. Foi
// exatamente assim que o defeito do `@Inject(Reflector)` passou na
// revisão da Fase 6: a instância era da classe certa, com
// `this.reflector === undefined` dentro. O sintoma só aparecia no
// PRIMEIRO REQUEST HTTP ("Cannot read properties of undefined (reading
// 'getAllAndOverride')") — um 500 que nenhuma suíte unitária via.
//
// `toBeInstanceOf` mede a CLASSE, e a classe estava certa. O que estava
// errado eram as DEPENDÊNCIAS. Então este spec olha as dependências.
//
// ── POR QUE ISSO PASSA A IMPORTAR AGORA ────────────────────────────────────
//
// Antes desta fase o guard só era usado pelo `UsersController`, que tem o
// seu próprio grafo de DI. A Fase 6 também o pôs no `AuthController`
// (contrato D: `GET /auth/me` exige sessão). Um guard que não resolve
// quebra TODAS as rotas do controller em que está — e agora isso vale
// para login, refresh e `me` de uma vez.

import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { AuthModule, AUTH_GUARD_SLOT } from '../../auth.module.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JwtTokenService } from '../security/jwt-token.service.js';

describe('JwtAuthGuard — resolução no grafo real do AuthModule (Fase 6.1)', () => {
  const segredo = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'segredo-do-spec-de-resolucao-com-tamanho-razoavel';
  });

  afterAll(() => {
    if (segredo === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredo;
  });

  it('o container constrói o JwtAuthGuard com AS DUAS dependências definidas', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), AuthModule],
    }).compile();

    const guard = moduleRef.get<JwtAuthGuard>(JwtAuthGuard) as unknown as Record<string, unknown>;

    // `toBeInstanceOf` passaria mesmo com tudo undefined — daí olhar os campos.
    expect(guard).toBeInstanceOf(JwtAuthGuard);
    expect(guard['tokenIssuer'], 'o emissor de token não resolveu').toBeDefined();
    expect(
      guard['reflector'],
      'o Reflector não resolveu → todo request HTTP morreria com 500',
    ).toBeDefined();
    expect(guard['reflector']).toBeInstanceOf(Reflector);
    expect(guard['tokenIssuer']).toBeInstanceOf(JwtTokenService);
    // pt-BR (#93.1 — RBAC, 2026-10-16): cache também precisa resolver
    // (a 3ª dependência do JwtAuthGuard).
    expect(guard['profileCache'], 'o cache de profile não resolveu').toBeDefined();

    // E o método precisa existir de fato (a classe certa, não um stub).
    expect(typeof guard['canActivate']).toBe('function');

    await moduleRef.close();
  });

  it('AUTH_GUARD_SLOT e a classe JwtAuthGuard são o MESMO token', () => {
    // pt-BR: `@UseGuards(JwtAuthGuard)` pede a CLASSE ao container. O
    // provider está declarado sob `AUTH_GUARD_SLOT`; se os dois divergissem,
    // o guard seria instanciado FORA do módulo e o `Reflector` poderia não
    // resolver — o mesmo bug, mais difícil de ver.
    expect(AUTH_GUARD_SLOT).toBe(JwtAuthGuard);
  });
});
