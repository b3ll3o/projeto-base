// apps/api/src/main.ts
import './shared/infrastructure/telemetry/tracing.js';
import { initTracing } from './shared/infrastructure/telemetry/tracing.js';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyHelmet from '@fastify/helmet';
import { z } from 'zod';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './shared/infrastructure/http/global-exception.filter.js';
import { ZodValidationPipe } from './shared/infrastructure/http/zod-validation.pipe.js';

// pt-BR: Inicializa OTel ANTES de qualquer outro código rodar (deve ser o
// primeiro passo do bootstrap — ver tracing.ts:30-36 para o rationale ESM).
initTracing();

/**
 * #73: parse seguro de ALLOWED_ORIGINS.
 * Lista vazia = CORS desligado. Default dev = http://localhost:3001
 * (porta do front em dev). Em prod, ALLOWED_ORIGINS é obrigatório e
 * é a lista de domínios confiáveis (comma-separated).
 */
function parseAllowedOrigins(): string[] {
  const raw = process.env.ALLOWED_ORIGINS ?? 'http://localhost:3001';
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({ logger: false });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));

  app.setGlobalPrefix('api/v1');

  // #85: helmet plugin — security headers (HSTS, X-Frame-Options, X-Content-Type-Options,
  // CSP, Referrer-Policy, X-DNS-Prefetch-Control, X-Download-Options, X-Permitted-Cross-Domain-Policies).
  // API é JSON pura, então CSP é bem restritivo: sem scripts/styles/img/connect cross-origin.
  // Registrado como plugin Fastify antes do CORS — ambos rodam no mesmo hook (onRequest) mas a
  // ordem é helmet→cors (helmet setta headers em `reply.header` independente do CORS).
  await app
    .getHttpAdapter()
    .getInstance()
    .register(fastifyHelmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'none'"],
          styleSrc: ["'none'"],
          imgSrc: ["'none'"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
          baseUri: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false, // API não embebe recursos
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'same-origin' },
    });

  // #72: rate-limit global via APP_GUARD provider (registrado em app.module.ts).
  // O guard lê a config do ThrottlerModule e aplica por IP. Rotas com
  // @SkipThrottle() (ex: /health) não são contadas.

  // #73: CORS whitelist via env. Em produção é OBRIGATÓRIO setar
  // ALLOWED_ORIGINS — sem isso, o servidor aborta o bootstrap para não
  // cair no default dev (que abriria o front de dev para prod).
  if (process.env.NODE_ENV === 'production') {
    const allowedOrigins = parseAllowedOrigins();
    if (allowedOrigins.includes('http://localhost:3001')) {
      throw new Error(
        'ALLOWED_ORIGINS contém apenas o default de dev (http://localhost:3001) ' +
          'em produção. Defina a lista de origens reais em .env.production.',
      );
    }
    app.enableCors({ origin: allowedOrigins, credentials: true });
  } else {
    app.enableCors({ origin: parseAllowedOrigins(), credentials: true });
  }

  app.useGlobalFilters(new GlobalExceptionFilter());
  // Pipe global Zod: default `z.any()` (noop) — cada rota
  // sobrescreve via @Body(new ZodValidationPipe(SchemaDoDto)).
  app.useGlobalPipes(new ZodValidationPipe(z.any()));
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Projeto Base API')
    .setDescription('API do projeto base — DDD + Hexagonal')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch((err) => {
  console.error('Bootstrap falhou:', err);
  process.exit(1);
});
