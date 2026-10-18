// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuditInfraModule } from './shared/audit/audit-infra.module.js';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ProfilesModule } from './modules/profiles/profiles.module.js';
import { TenancyModule } from './modules/tenancy/tenancy.module.js';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module.js';

const REDACT_PATHS = ['req.headers.authorization', 'req.headers.cookie'] as const;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    // #72: rate-limit global. Default 100 req/min por IP (configurável via
    // THROTTLE_TTL_MS e THROTTLE_LIMIT). Health e outros endpoints baratos
    // usam @SkipThrottle() para não serem contados.
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
        limit: Number(process.env.THROTTLE_LIMIT ?? 100),
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
    HealthModule,
    AuthModule,
    UsersModule,
    // pt-BR (#93.1 — RBAC, 2026-10-16): ProfilesModule (controllers admin
    // + use cases). UserProfileCacheService é singleton (registrado em
    // AuthModule e UsersModule também — Nest deduplica).
    ProfilesModule,
    // pt-BR (Fase 5 — tenancy): TenancyModule (rotas de convite +
    // TENANCY_USE_CASES). Já vem por transitividade de `UsersModule`, que o
    // importa para injetar o token — listar aqui é o que registra o
    // CONTROLLER, que o Nest não herda pelo módulo intermediário.
    TenancyModule,
    // pt-BR (feature-flags): registra as rotas de `admin/feature-flags`.
    // ⚠️ MEDIDO 2026-10-18: esta linha é REDUNDANTE, e o comentário que a
    // justificava antes ("o Nest não herda o controller pelo módulo
    // intermediário") era FALSO. Tirando `FeatureFlagsModule` daqui, o e2e
    // `13-feature-flags` continua 10/10 verde — o `TenancyModule` importa o
    // módulo pela aresta da porta (D13) e o `AppModule` importa o
    // `TenancyModule`, e o Nest registra os controllers de um módulo assim que
    // ele é instanciado em qualquer ponto do grafo.
    // Ela fica porque a rota NÃO deve depender da aresta D13: se um dia o
    // `TenancyModule` deixar de importar o módulo, `convidar` perde o guard e
    // a tela de admin perde a rota — e nenhuma spec desse par acusaria.
    FeatureFlagsModule,
  ],
  // #72: registra ThrottlerGuard globalmente via APP_GUARD (injetado pelo
  // container do Nest, sem precisar instanciar manualmente no main.ts).
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
