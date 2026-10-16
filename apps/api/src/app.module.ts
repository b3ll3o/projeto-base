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
  ],
  // #72: registra ThrottlerGuard globalmente via APP_GUARD (injetado pelo
  // container do Nest, sem precisar instanciar manualmente no main.ts).
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
