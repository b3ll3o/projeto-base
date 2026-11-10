// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuditInfraModule } from './shared/audit/audit-infra.module.js';
import { IdempotencyInfraModule } from './shared/idempotency/idempotency-infra.module.js';
import { IdempotencyInterceptor } from './shared/idempotency/infrastructure/http/idempotency.interceptor.js';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ProfilesModule } from './modules/profiles/profiles.module.js';
import { TenancyModule } from './modules/tenancy/tenancy.module.js';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module.js';

// pt-BR (2026-11-10): o `idempotency-key` entra na redação. A chave é do
// cliente e é PARTE da capacidade de replay (junto com o corpo e o ator) —
// um log que a traz em claro é um log que entrega a capacidade.
//
// ⚠️ A lista é EXPORTADA porque a afirmação "a chave não vai para o log"
// precisa de instrumento: o spec (`app.module.spec.ts`) aplica ESTES
// caminhos — e não uma cópia deles, que passaria verde com a redação
// quebrada aqui.
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["idempotency-key"]',
] as const;

/**
 * O teto global de requisições, por IP, na janela de `JANELA_GLOBAL_MS`.
 *
 * pt-BR (2026-11-10 — conformidade do system design): o número é EXPORTADO
 * porque ele tem UM dono, e o dono é o código. O spec do e2e
 * (`16-health-sem-rate-limit.e2e.spec.ts`) importa este valor em vez de
 * escrevê-lo — o mesmo motivo de `LIMITE_LOGIN_POR_MINUTO`: com o número
 * duplicado no spec, baixar o limite no código deixa o teste verde mentindo.
 */
export const LIMITE_GLOBAL_POR_MINUTO = Number(process.env.THROTTLE_LIMIT ?? 100);

/** A janela do limite global, em milissegundos. */
export const JANELA_GLOBAL_MS = Number(process.env.THROTTLE_TTL_MS ?? 60_000);

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    // #72: rate-limit global. Default 100 req/min por IP (configurável via
    // THROTTLE_TTL_MS e THROTTLE_LIMIT).
    //
    // pt-BR (2026-11-10): este comentário afirmava que "health e outros
    // endpoints baratos usam @SkipThrottle() para não serem contados" — e
    // NÃO EXISTIA NENHUM `@SkipThrottle` no código. MEDIDO: a rota de health
    // recebia 429 do limite global (ver o spec
    // `16-health-sem-rate-limit.e2e.spec.ts`). A isenção agora é do
    // controller do health, e é a única: as outras rotas são contadas.
    ThrottlerModule.forRoot([
      {
        ttl: JANELA_GLOBAL_MS,
        limit: LIMITE_GLOBAL_POR_MINUTO,
      },
    ]),
    LoggerModule.forRoot(
      process.env.NODE_ENV === 'production'
        ? { pinoHttp: { redact: [...REDACT_PATHS] } }
        : {
            pinoHttp: {
              transport: { target: 'pino-pretty', options: { singleLine: true, colorize: true } },
              redact: [...REDACT_PATHS],
            },
          },
    ),
    PrismaModule,
    AuditInfraModule,
    // pt-BR (2026-11-10 — conformidade do system design): a idempotência de
    // escrita. O interceptor é GLOBAL (o `APP_INTERCEPTOR` abaixo), e ele só
    // age em POST que traz `Idempotency-Key` — sem o header, o pedido é
    // exatamente o que era.
    IdempotencyInfraModule,
    HealthModule,
    AuthModule,
    UsersModule,
    // pt-BR (#93.1 — RBAC, 2026-10-16): ProfilesModule (controllers admin
    // + use cases). UserProfileCacheService é singleton (registrado em
    // AuthModule e UsersModule também — Nest deduplica).
    ProfilesModule,
    // pt-BR (Fase 5 — tenancy): TenancyModule (rotas de convite +
    // TENANCY_USE_CASES). Já vem por transitividade de `UsersModule`, que o
    // importa para injetar o token.
    // ⚠️ MEDIDO 2026-10-18: a listagem aqui é REDUNDANTE, e o comentário que a
    // justificava antes ("listar aqui é o que registra o CONTROLLER, que o Nest
    // não herda pelo módulo intermediário") era FALSO. Tirando `TenancyModule`
    // desta lista, os cenários 10, 12 e 13 continuam 43/43 verdes — o Nest
    // registra os controllers de um módulo assim que ele é instanciado em
    // qualquer ponto do grafo, e `UsersModule` (importado na linha acima) já o
    // instancia. Ela fica pela mesma razão do `FeatureFlagsModule` abaixo: a
    // rota não deve depender de transitividade — se um dia `UsersModule`
    // deixar de importar o módulo de tenancy, as rotas de convite somem e
    // nenhuma spec do par acusaria.
    TenancyModule,
    // pt-BR (feature-flags): registra as rotas de `admin/feature-flags`.
    // ⚠️ MEDIDO 2026-10-18: esta linha é REDUNDANTE, e o comentário que a
    // justificava antes ("o Nest não herda o controller pelo módulo
    // intermediário") era FALSO. Tirando `FeatureFlagsModule` daqui, o e2e
    // `13-feature-flags` continua VERDE — o `TenancyModule` importa o
    // módulo pela aresta da porta (D13) e o `AppModule` importa o
    // `TenancyModule`, e o Nest registra os controllers de um módulo assim que
    // ele é instanciado em qualquer ponto do grafo.
    // ⚠️ O texto dizia "10/10" aqui. O número envelheceu sozinho: esta mesma
    // branch adicionou 3 testes ao cenário 13 depois da medição, e ele virou
    // 13/13 sem que ninguém voltasse nesta linha. Por isso não há contagem
    // nenhuma — quem precisar mede com o comando, e a contagem que importa
    // (todos verdes) é a que não envelhece.
    // Ela fica porque a rota NÃO deve depender da aresta D13: se um dia o
    // `TenancyModule` deixar de importar o módulo, `convidar` perde o guard e
    // a tela de admin perde a rota — e nenhuma spec desse par acusaria.
    FeatureFlagsModule,
  ],
  // #72: registra ThrottlerGuard globalmente via APP_GUARD (injetado pelo
  // container do Nest, sem precisar instanciar manualmente no main.ts).
  //
  // pt-BR (2026-11-10 — conformidade do system design): o interceptor da
  // idempotência é global pelo mesmo motivo — a chave de idempotência é uma
  // propriedade do PEDIDO, não de uma rota. Ele só age quando o pedido traz
  // `Idempotency-Key`; sem o header, ele passa tudo direto.
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class AppModule {}
