// apps/api/src/modules/feature-flags/feature-flags.module.spec.ts
//
// pt-BR (feature-flags, 2026-10-18 — Fase 3): instancia o CONTAINER do Nest.
//
// POR QUE ESTE ARQUIVO EXISTE
// `feature-flag.use-cases.spec.ts` instancia a use case com `new` + fake, e
// `admin-feature-flags.controller.spec.ts` instancia o controller com `new` +
// stub. Os dois passam com QUALQUER grafo de DI quebrado — o símbolo errado no
// `@Inject`, o token não resolvido, a aresta faltando. Nenhum dos dois toca o
// container. Aqui o container é INSTANCIADO de verdade, e instanciar já accuse
// a maior parte dos grafos quebrados.
//
// ⚠️ O que este arquivo NÃO é: um teste de BOOT. `compile()` resolve e cria as
// instâncias mas NÃO chama `app.init()`, então nenhum `onModuleInit` roda — nem
// o do `PrismaService` (`prisma.service.ts:31`) nem a assinatura de membership.
// O que este arquivo pega é FALHA DE INSTANCIAÇÃO. O boot de verdade, com o
// `AppModule` inteiro e o Postgres real, é o e2e
// `test/e2e/scenarios/13-feature-flags.e2e.spec.ts`.
//
// O que este arquivo é obrigado a pegar (medido, não suposto):
//   - As ARESTAS dos guards. `@UseGuards` faz o Nest instanciar o guard no
//     contexto do módulo do controller, e `JwtAuthGuard` injeta
//     `TenantMembershipRepositoryPort` — que o `AuthModule` importa mas NÃO
//     re-exporta. Sem `PrismaPersistenceModule` nos imports a instanciação
//     morre (medido: 6 vermelhos).
//   - D13: a PORTA exportada chega ao `TenancyModule` — é ela que o guard do
//     `convidar` (F4) vai injetar.
//
// ⚠️ O que este arquivo NÃO pega, e o plano dizia que pegava: a D17 do plano
// v1.3.0 afirmava que `PermissionsGuard`/`JwtAuthGuard` precisam estar nos
// `providers` do módulo. MEDIDO 2026-10-18: declará-los localmente não é
// necessário — tirando o `PermissionsGuard` dos `providers`, estas 6
// asserções continuam verdes. A correção está no `feature-flags.module.ts`.
// A lesson: `moduleRef.get(X, { strict: false })` procura no container INTEIRO,
// então não distingue "provider deste módulo" de "provider de outro módulo" —
// uma asserção que só verifica resolução não prova LOCALIZAÇÃO. O mesmo vale
// para EXPORT: um `get` em modo não-strict acha o token que outro módulo
// trouxe, e por isso o bloco D13 usa um provider que INJETA a porta — o `get`
// não teria dente.

import { describe, it, expect } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { FeatureFlagsModule } from './feature-flags.module.js';
import { FeatureFlagUseCases } from './application/feature-flag.use-cases.js';
import { FEATURE_FLAG_REPOSITORY_PORT } from './domain/ports/feature-flag-repository.port.js';
import { PrismaFeatureFlagRepository } from './infrastructure/persistence/prisma-feature-flag.repository.js';
import { PermissionsGuard } from '../profiles/infrastructure/http/guards/permissions.guard.js';
import { JwtAuthGuard } from '../auth/infrastructure/http/jwt-auth.guard.js';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service.js';
import { TenancyModule } from '../tenancy/tenancy.module.js';

/**
 * Janela tipada sobre as deps privadas. `as unknown as` em vez de `any` para
 * o compilador continuar checando o resto do spec.
 */
type Deps = Record<string, unknown>;

/** Token do provider que injeta a porta — a forma que o guard da F4 vai ter. */
const PROBE_INJETA_PORTA = Symbol('PROBE_INJETA_PORTA');

async function compilar(imports: unknown[]): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      ...(imports as never[]),
    ],
  }).compile();
}

describe('FeatureFlagsModule (DI wiring)', () => {
  it('sobe o grafo de DI — guards incluídos', async () => {
    const moduleRef = await compilar([FeatureFlagsModule]);

    expect(moduleRef.get(FeatureFlagUseCases)).toBeInstanceOf(FeatureFlagUseCases);

    await moduleRef.close();
  });

  it('FEATURE_FLAG_REPOSITORY_PORT resolve para PrismaFeatureFlagRepository', async () => {
    const moduleRef = await compilar([FeatureFlagsModule]);

    expect(moduleRef.get(FEATURE_FLAG_REPOSITORY_PORT)).toBeInstanceOf(PrismaFeatureFlagRepository);

    await moduleRef.close();
  });

  // ─── AS ASSERÇÕES QUE PEGAM O `@Inject` ERRADO ─────────────────────────────
  //
  // `mod.get(X)` prova que o PROVIDER existe, não que a USE CASE o recebeu.
  // Estas comparam identidade com a instância do container.
  it('FeatureFlagUseCases recebe a MESMA instância do port', async () => {
    const moduleRef = await compilar([FeatureFlagsModule]);
    const deps = moduleRef.get(FeatureFlagUseCases) as unknown as Deps;

    expect(deps['repositorio']).toBe(moduleRef.get(FEATURE_FLAG_REPOSITORY_PORT));

    await moduleRef.close();
  });

  it('o repositório recebe a MESMA instância de PrismaService do container', async () => {
    const moduleRef = await compilar([FeatureFlagsModule]);
    const deps = moduleRef.get(FEATURE_FLAG_REPOSITORY_PORT) as unknown as Deps;

    // Identidade, não Defined: um segundo PrismaClient aqui seria um segundo
    // pool de conexões, e a flag gravada pela tela apareceria ausente para o
    // guard — porque os dois conversariam com bancos diferentes.
    expect(deps['prisma']).toBe(moduleRef.get(PrismaService, { strict: false }));

    await moduleRef.close();
  });

  /**
   * Os dois guards que o controller usa são INSTANCIÁVEIS no container que
   * este módulo monta — o que é a condição de boot das rotas (é o mesmo
   * caminho que acusou o `PrismaPersistenceModule` faltando, medido).
   *
   * O que este teste NÃO afirma é que os guards sejam provider DESTE módulo:
   * `strict: false` varre o container inteiro, então uma segunda instância de
   * guard em outro módulo passaria igual. Ver a nota do cabeçalho.
   */
  it('PermissionsGuard e JwtAuthGuard resolvem no container do módulo', async () => {
    const moduleRef = await compilar([FeatureFlagsModule]);

    expect(moduleRef.get(PermissionsGuard, { strict: false })).toBeInstanceOf(PermissionsGuard);
    expect(moduleRef.get(JwtAuthGuard, { strict: false })).toBeInstanceOf(JwtAuthGuard);

    await moduleRef.close();
  });
});

describe('a porta atravessa a aresta com o BC Tenancy (D13)', () => {
  // O guard de `convidar` (F4) injeta a PORTA, não a use case: o ator do
  // convite é o dono de uma empresa e a use case exige admin do sistema (D2).
  // Sem esta aresta o sintoma é um boot que morre por `FeatureFlagRepositoryPort`
  // não resolvido — longe do arquivo que o causou.
  it('TenancyModule resolve a porta de flag', async () => {
    const moduleRef = await compilar([TenancyModule]);

    expect(moduleRef.get(FEATURE_FLAG_REPOSITORY_PORT, { strict: false })).toBeInstanceOf(
      PrismaFeatureFlagRepository,
    );

    await moduleRef.close();
  });

  /**
   * O `exports` é load-bearing, e o teste acima NÃO prova isso.
   *
   * MEDIDO 2026-10-18: com `exports: []` no `FeatureFlagsModule`, o teste
   * acima continuava VERDE — `{ strict: false }` varre o container inteiro e
   * acha o token pelo caminho que o próprio `TenancyModule` abriu. É a mesma
   * cegueira do cabeçalho, aplicada ao `exports`.
   *
   * A forma que morde é um provider que INJETA a porta, porque a resolução de
   * dependência respeita o `exports` do módulo importado — e é literalmente a
   * forma que o guard da F4 vai ter. MEDIDO: com `exports: []`, compilar este
   * módulo morre com
   * `Nest can't resolve dependencies of the PROBE (?). Please make sure that
   *  the argument Symbol(FeatureFlagRepositoryPort) at index [0] is available`.
   */
  it('o `exports` do módulo é o que torna a porta visível a quem o importa', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), FeatureFlagsModule],
      providers: [
        {
          provide: PROBE_INJETA_PORTA,
          useFactory: (repositorio: PrismaFeatureFlagRepository) => repositorio,
          inject: [FEATURE_FLAG_REPOSITORY_PORT],
        },
      ],
    }).compile();

    expect(moduleRef.get(PROBE_INJETA_PORTA)).toBeInstanceOf(PrismaFeatureFlagRepository);

    await moduleRef.close();
  });
});
