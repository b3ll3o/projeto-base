// apps/api/scripts/export-openapi.ts
//
// Exporta o documento OpenAPI 3 gerado pelo `@nestjs/swagger` para
// `apps/api/openapi.json`. Uso:
//
//   pnpm --filter @projeto/api openapi:export
//
// pt-BR:
// - Usamos `@nestjs/testing` (não `NestFactory.create`) porque o
//   AppModule importa `PrismaService` globalmente, e `onModuleInit`
//   chama `$connect()` — em CI (sem Postgres) isso falharia. Sobrescrever
//   o provider com um stub `{}` evita a tentativa de conexão e mantém o
//   SwaggerModule feliz (ele só lê metadados dos decorators, não toca DB).
// - `createNestApplication(new FastifyAdapter())` usa o adapter do
//   projeto (Fastify), não o default Express — assim não exige
//   `@nestjs/platform-express` como dep.
// - O documento JSON é gerado a partir dos `@Api*` decorators já
//   presentes em `UsersController` (Fase 7). Conforme novos controllers
//   forem adicionados, eles aparecem automaticamente.
// - `setGlobalPrefix('api/v1')` é aplicado aqui para que o JSON gerado
//   espelhe o runtime (`main.ts:19`). Sem isso, o documento sai com
//   paths relativos (`/users`, `/users/:id`) e qualquer consumer
//   (docs, SDK generator, contract test) atinge paths errados.
// - O `mkdir -p` cobre o caso de primeira execução (pasta `apps/api/`
//   existe, mas o script não depende de path relativo estável — usa
//   `process.cwd()` assumindo que `pnpm --filter` aponta para o package).

import 'reflect-metadata';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/shared/infrastructure/prisma/prisma.service.js';

async function exportOpenApi(): Promise<void> {
  // pt-BR: stub PrismaService para evitar `$connect()`. Métodos
  // utilizados pelos controllers/adapters NÃO são chamados durante a
  // extração do documento (SwaggerModule só lê metadados).
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue({})
    .compile();

  const app = moduleRef.createNestApplication(new FastifyAdapter());

  // pt-BR: espelha o runtime (`main.ts:19`). Sem isso o documento sai
  // com paths relativos e diverge do servidor real.
  app.setGlobalPrefix('api/v1');

  const config = new DocumentBuilder()
    .setTitle('Projeto Base API')
    .setDescription('API do projeto base — DDD + Hexagonal')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const outputPath = resolve(process.cwd(), 'openapi.json');
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(document, null, 2));

  // pt-BR: close garante que o processo não fica esperando handles
  // abertos do NestJS/Fastify.
  await app.close();

  // eslint-disable-next-line no-console
  console.log(`OpenAPI exportado para ${outputPath}`);
}

exportOpenApi().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('OpenAPI export falhou:', err);
  process.exit(1);
});
