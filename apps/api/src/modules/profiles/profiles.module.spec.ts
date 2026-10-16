// apps/api/src/modules/profiles/profiles.module.spec.ts
//
// pt-BR (#93.1 — RBAC, 2026-10-16): teste que sobe o CONTAINER do Nest.
//
// Por que este arquivo existe: `profiles.use-cases.spec.ts` instancia os
// use cases com `new` + stubs, o que passa com qualquer grafo de DI
// quebrado. Sem subir o container, um `@Inject` faltando não é invisível —
// é um erro de BOOT. Medido em 2026-10-16 (Lote 3): removendo o
// `@Inject(PROFILE_REPOSITORY_PORT)` do construtor, os 9 testes deste
// arquivo caem com
// `Nest can't resolve dependencies of the ProfileUseCases (?, Symbol(...))`.
// O sintoma real é o start quebrado, não o `undefined` silencioso que os
// comentários antigos deste arquivo afirmavam.
//
// Por que as asserções comparam a dep injetada com o provider do módulo:
// `mod.get(X)` prova que o PROVIDER existe, não que a USE CASE o recebeu.

import { describe, it, expect } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ProfilesModule } from './profiles.module.js';
import {
  ProfileUseCases,
  AuthorizationUseCases,
  UserProfileUseCases,
} from './application/profiles.use-cases.js';
import { PROFILE_REPOSITORY_PORT } from './domain/ports/profile-repository.port.js';
import { AUTHORIZATION_REPOSITORY_PORT } from './domain/ports/authorization-repository.port.js';
import { PrismaProfileRepository } from './infrastructure/persistence/prisma-profile.repository.js';
import { PrismaAuthorizationRepository } from './infrastructure/persistence/prisma-authorization.repository.js';
import { USER_REPOSITORY_PORT } from '../users/domain/ports/user-repository.port.js';
import { PrismaUserRepository } from '../users/infrastructure/persistence/prisma-user.repository.js';
import { UserProfileCacheService } from '../../shared/infrastructure/security/user-profile-cache.service.js';
import { JwtAuthGuard } from '../auth/infrastructure/http/jwt-auth.guard.js';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service.js';

/**
 * Janela tipada sobre as deps privadas. `as unknown as` em vez de `any`
 * para o eslint não precisar de disable e para o compilador continuar
 * checando o resto do spec.
 */
type Deps = Record<string, unknown>;

async function compilarModulo(): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), ProfilesModule],
  }).compile();
}

describe('ProfilesModule (DI wiring)', () => {
  it('compila o grafo de DI sem módulo externo', async () => {
    const moduleRef = await compilarModulo();

    expect(moduleRef.get(ProfileUseCases)).toBeInstanceOf(ProfileUseCases);
    expect(moduleRef.get(AuthorizationUseCases)).toBeInstanceOf(AuthorizationUseCases);
    expect(moduleRef.get(UserProfileUseCases)).toBeInstanceOf(UserProfileUseCases);

    await moduleRef.close();
  });

  it('PROFILE_REPOSITORY_PORT resolve para PrismaProfileRepository', async () => {
    const moduleRef = await compilarModulo();

    expect(moduleRef.get(PROFILE_REPOSITORY_PORT)).toBeInstanceOf(PrismaProfileRepository);

    await moduleRef.close();
  });

  it('AUTHORIZATION_REPOSITORY_PORT resolve para PrismaAuthorizationRepository', async () => {
    const moduleRef = await compilarModulo();

    expect(moduleRef.get(AUTHORIZATION_REPOSITORY_PORT)).toBeInstanceOf(
      PrismaAuthorizationRepository,
    );

    await moduleRef.close();
  });

  it('USER_REPOSITORY_PORT chega ao ProfilesModule (vem do PrismaPersistenceModule)', async () => {
    const moduleRef = await compilarModulo();

    expect(moduleRef.get(USER_REPOSITORY_PORT)).toBeInstanceOf(PrismaUserRepository);

    await moduleRef.close();
  });

  // ─── AS ASSERÇÕES QUE PEGAM O B1 ───────────────────────────────────────────
  //
  // `mod.get(X)` prova que o PROVIDER existe. Não prova que a USE CASE o
  // recebeu: com `@Inject(TOKEN)` faltando o módulo nem sobe (ver header).
  // Estas comparam a instância injetada com a instância do container — é
  // a diferença entre "chegou a instância" e "veio outra".

  it('ProfileUseCases recebe profileRepo, userRepo e cache injetados', async () => {
    const moduleRef = await compilarModulo();
    const deps = moduleRef.get(ProfileUseCases) as unknown as Deps;

    expect(deps['profileRepo']).toBe(moduleRef.get(PROFILE_REPOSITORY_PORT));
    expect(deps['userRepo']).toBe(moduleRef.get(USER_REPOSITORY_PORT));
    // pt-BR (#97): identidade, não Defined. `toBeDefined()` passaria com
    // DUAS instâncias do cache — que é o defeito do R1 (use cases invalidam
    // uma, o JwtAuthGuard lê outra). O que prende é `toBe` no provider.
    expect(deps['cache']).toBe(moduleRef.get(UserProfileCacheService));

    await moduleRef.close();
  });

  it('AuthorizationUseCases recebe profileRepo e userRepo injetados', async () => {
    const moduleRef = await compilarModulo();
    const deps = moduleRef.get(AuthorizationUseCases) as unknown as Deps;

    expect(deps['profileRepo']).toBe(moduleRef.get(PROFILE_REPOSITORY_PORT));
    expect(deps['userRepo']).toBe(moduleRef.get(USER_REPOSITORY_PORT));
    expect(deps['cache']).toBe(moduleRef.get(UserProfileCacheService));

    await moduleRef.close();
  });

  it('UserProfileUseCases recebe userRepo e profileRepo injetados', async () => {
    const moduleRef = await compilarModulo();
    const deps = moduleRef.get(UserProfileUseCases) as unknown as Deps;

    expect(deps['userRepo']).toBe(moduleRef.get(USER_REPOSITORY_PORT));
    expect(deps['profileRepo']).toBe(moduleRef.get(PROFILE_REPOSITORY_PORT));
    expect(deps['cache']).toBe(moduleRef.get(UserProfileCacheService));

    await moduleRef.close();
  });

  /**
   * pt-BR (#97) — o R1 propriamente dito. Provider Nest NÃO é singleton:
   * cada `providers: [X]` constrói uma instância. O cache estava declarado
   * em AuthModule (lido pelo JwtAuthGuard) e em ProfilesModule (invalidado
   * pelas use cases), logo revogar uma permissão limpava um Map que ninguém
   * lia e a revogação só valia quando o TTL de 5s expirava.
   *
   * O teste afirma que o guard e as use cases compartilham a MESMA instância.
   */
  it('JwtAuthGuard e as use cases compartilham a MESMA instância do cache', async () => {
    const moduleRef = await compilarModulo();
    const guard = moduleRef.get(JwtAuthGuard, { strict: false }) as unknown as Deps;
    const deps = moduleRef.get(ProfileUseCases) as unknown as Deps;

    expect(guard['profileCache']).toBe(deps['cache']);

    await moduleRef.close();
  });

  it('PrismaProfileRepository recebe a MESMA instância de PrismaService do container', async () => {
    const moduleRef = await compilarModulo();
    // Buscado pelo token do port: o módulo registra a classe com `useClass`,
    // então o token do port É o único que resolve a instância.
    const repo = moduleRef.get(PROFILE_REPOSITORY_PORT) as PrismaProfileRepository;
    const deps = repo as unknown as Deps;

    // Identidade, não `toBeDefined()`: sem o `@Inject(PrismaService)` o Nest
    // nem sobe o módulo (ver header), e com duas instâncias de
    // PrismaService o repositório conversaria com um client diferente do
    // resto da aplicação.
    expect(deps['prisma']).toBe(moduleRef.get(PrismaService, { strict: false }));

    await moduleRef.close();
  });
});
