// apps/api/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { AuditInfraModule } from './shared/audit/audit-infra.module.js';
import { PrismaModule } from './shared/infrastructure/prisma/prisma.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { UsersModule } from './modules/users/users.module.js';

const REDACT_PATHS = ['req.headers.authorization', 'req.headers.cookie'] as const;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
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
    UsersModule,
  ],
})
export class AppModule {}
