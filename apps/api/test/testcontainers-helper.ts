// apps/api/test/testcontainers-helper.ts
//
// Helper para testes de integração que precisam de um PostgreSQL real.
// Sobe um container postgres:16-alpine, aplica as migrations Prisma e devolve
// um PrismaClient conectado. A URI fica em DATABASE_URL para qualquer código
// que resolva via env. Singleton: cleanup global feito via afterAll nos specs.

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

let container: StartedPostgreSqlContainer | undefined;

export type TestContext = {
  prisma: PrismaClient;
  stop: () => Promise<void>;
};

/**
 * Sobe um container PostgreSQL 16-alpine, aplica as migrations Prisma via
 * `prisma migrate deploy` e devolve um PrismaClient conectado.
 *
 * pt-BR: o cwd do execSync é o `process.cwd()` (deve ser `apps/api` quando
 * o vitest roda a partir dali). A URI também é injetada em `process.env.DATABASE_URL`
 * para que o `PrismaClient` do helper e qualquer outro código resolvam o
 * mesmo banco.
 */
export async function setupTestDatabase(): Promise<TestContext> {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  const uri = container.getConnectionUri();
  process.env.DATABASE_URL = uri;
  const prisma = new PrismaClient({ datasourceUrl: uri });

  execSync('pnpm exec prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: uri },
    stdio: 'inherit',
  });

  return {
    prisma,
    stop: async () => {
      await prisma.$disconnect();
      await container?.stop();
    },
  };
}

/**
 * Trunca as tabelas do schema de users para isolamento entre testes.
 *
 * Ordem: UserArchive e UserHistory primeiro (não há FK cascade mas é a ordem
 * segura caso seja adicionada), depois User.
 */
export async function cleanDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.userArchive.deleteMany({});
  await prisma.userHistory.deleteMany({});
  await prisma.user.deleteMany({});
}
