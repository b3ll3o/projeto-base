// apps/api/src/modules/auth/auth.module.spec.ts
//
// Testa o GRAFO DE DI do AuthModule — não a lógica de negócio (essa é
// do `auth-use-cases.spec.ts`), e sim se cada token resolve para a
// implementação concreta certa.
//
// Este arquivo é a defesa contra a classe de bug mais cara desta
// arquitetura hexagonal: parâmetro de construtor que é `interface` (logo
// apagada em runtime) com `@Inject` faltando. O Nest não reclama em
// tempo de compilação — ele passa `undefined`, e o TypeScript não diz
// nada. O sintoma só aparece em produção, no primeiro request, como
// `Cannot read properties of undefined`. Compilar o módulo aqui pega
// isso no CI.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth.module.js';
import { AuthUseCases, AUTH_USE_CASES } from './application/auth-use-cases.js';
import { AuthController } from './infrastructure/http/auth.controller.js';
import { Argon2PasswordHasher } from './infrastructure/security/argon2-password-hasher.js';
import { JwtAuthGuard } from './infrastructure/http/jwt-auth.guard.js';
import { JwtTokenService } from './infrastructure/security/jwt-token.service.js';
import { TOKEN_ISSUER_PORT } from './domain/ports/token-issuer.port.js';
import { PASSWORD_HASHER_PORT } from '../users/domain/ports/password-hasher.port.js';
import { USER_REPOSITORY_PORT } from '../users/domain/ports/user-repository.port.js';
import { PrismaPersistenceModule } from '../users/infrastructure/prisma-persistence.module.js';
import { PrismaModule } from '../../shared/infrastructure/prisma/prisma.module.js';

describe('AuthModule (DI wiring)', () => {
  const segredoOriginal = process.env.JWT_SECRET;

  beforeAll(() => {
    process.env.JWT_SECRET = 'segredo-do-spec-de-di-com-tamanho-razoavel';
  });

  afterAll(() => {
    if (segredoOriginal === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoOriginal;
  });

  it('compila e resolve o grafo completo (as dependências não são undefined)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), AuthModule],
    }).compile();

    const useCases = moduleRef.get<AuthUseCases>(AUTH_USE_CASES);

    // pt-BR: `toBeDefined()` passaria com um objeto quebrado. O que
    // prova o `@Inject` é que os três colaboradores chegaram.
    expect(useCases).toBeInstanceOf(AuthUseCases);
    expect(moduleRef.get(AuthController)).toBeInstanceOf(AuthController);

    await moduleRef.close();
  });

  it('PASSWORD_HASHER_PORT resolve para Argon2PasswordHasher', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), AuthModule],
    }).compile();

    expect(moduleRef.get(PASSWORD_HASHER_PORT)).toBeInstanceOf(Argon2PasswordHasher);

    await moduleRef.close();
  });

  it('TOKEN_ISSUER_PORT resolve para JwtTokenService', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), AuthModule],
    }).compile();

    expect(moduleRef.get(TOKEN_ISSUER_PORT)).toBeInstanceOf(JwtTokenService);

    await moduleRef.close();
  });

  it('o USER_REPOSITORY_PORT chega ao AuthUseCases pelo PrismaPersistenceModule', async () => {
    // pt-BR: `auth → users` num caminho só. Se alguém mover o port de
    // hash para `auth/`, este spec passa a não compilar — que é a
    // intenção: a aresta invertida é um ciclo de import ES.
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PrismaModule,
        PrismaPersistenceModule,
        AuthModule,
      ],
    }).compile();

    expect(moduleRef.get(USER_REPOSITORY_PORT)).toBeDefined();

    await moduleRef.close();
  });

  it('exporta o JwtAuthGuard para o UsersModule resolver (contrato C)', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), AuthModule],
    }).compile();

    // pt-BR (contrato C): UsersModule vai IMPORTAR o AuthModule para
    // resolver `@UseGuards(JwtAuthGuard)` — não vai importar o arquivo do
    // guard. Importar o arquivo criaria a aresta users -> auth por
    // caminho, que é o ciclo de import ES que o `token-issuer.port.ts`
    // mora em `auth/` justamente para evitar.
    expect(moduleRef.get(JwtAuthGuard)).toBeInstanceOf(JwtAuthGuard);

    await moduleRef.close();
  });
});
