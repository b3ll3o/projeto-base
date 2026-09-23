// apps/api/src/main.ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger as PinoLogger } from 'nestjs-pino';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { z } from 'zod';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './shared/infrastructure/http/global-exception.filter.js';
import { ZodValidationPipe } from './shared/infrastructure/http/zod-validation.pipe.js';

async function bootstrap(): Promise<void> {
  const adapter = new FastifyAdapter({ logger: false });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));

  app.setGlobalPrefix('api/v1');
  // pt-BR: CORS habilitado para dev/staging (consumido pelo front-end
  // em http://localhost:3001). Em produção o front-end é servido atrás
  // do mesmo domínio via reverse proxy, então CORS fica desligado.
  // `origin: true` reflete o Origin do request (whitelist dinâmica);
  // `credentials: true` permite cookies de auth em chamadas cross-origin.
  if (process.env.NODE_ENV !== 'production') {
    app.enableCors({ origin: true, credentials: true });
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
  // eslint-disable-next-line no-console
  console.error('Bootstrap falhou:', err);
  process.exit(1);
});
