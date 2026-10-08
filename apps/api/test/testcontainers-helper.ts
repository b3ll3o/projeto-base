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
  /**
   * Id do container no Docker.
   *
   * pt-BR (2026-10-08): existe para a suíte e2e de FRONTEND, que roda em
   * outro processo e precisa PARAR o banco para medir o que a aplicação
   * mostra quando a infraestrutura cai. Antes, esse estado morava só em
   * `globalThis` do `globalSetup` — e um spec, que roda em processo
   * separado, não alcança `globalThis` de ninguém. Sem o id, o caminho
   * "API no ar, banco fora" era impossível de produzir sem fabricar
   * resposta HTTP, e fabricar resposta é o que o `api.ts` chama de
   * "medir o que a resposta fabricada diz, não o que a aplicação faz".
   *
   * `stop`/`start` do Docker preservam a camada gravável, então o banco
   * volta com os dados intactos — **desde que** a porta do host esteja
   * fixada (ver `portaFixa`).
   */
  containerId: string;
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
export type SetupTestDatabaseOptions = {
  /**
   * Fixa a porta do HOST em que o Postgres é publicado.
   *
   * pt-BR — MEDIDO 2026-10-08, e o motivo existe: sem isso, `docker start`
   * do container **trocava a porta**, e nada voltava a funcionar.
   *
   * O `@testcontainers/postgresql` publica a porta com `HostPort: "0"`
   * (medido em `node_modules/.pnpm/testcontainers@10.28.0/.../generic-container.js:273`),
   * ou seja, porta aleatória escolhida no `docker start`. Um `docker stop`
   * seguido de `docker start` **sorteia outra**, e a `DATABASE_URL` da API —
   * assada no boot — passa a apontar para uma porta em que ninguém escuta.
   *
   * Medido, com o mesmo `PostgreSqlContainer`:
   *  - porta SOLTA: `docker port` saiu `33185` antes do stop e **`33186`** depois
   *    do start; o TCP do host voltou em **60.808 ms** — nunca voltou.
   *  - porta FIXA (`withExposedPorts({ container: 5432, host: N })`): o
   *    `docker port` ficou `0.0.0.0:N` nos dois lados, e o TCP voltou em **5 ms**.
   *
   * Sem esta opção o comportamento é o de sempre (porta aleatória) — mudar o
   * padrão dos testes de integração da API não é efeito colateral aceitável.
   */
  portaFixa?: number;
};

export async function setupTestDatabase(
  opcoes: SetupTestDatabaseOptions = {},
): Promise<TestContext> {
  const construtor = new PostgreSqlContainer('postgres:16-alpine');
  if (opcoes.portaFixa !== undefined) {
    // Chamar DEPOIS do construtor é o que importa: o construtor já chamou
    // `withExposedPorts(5432)` (que instala `HostPort: "0"`), e esta chamada
    // sobrescreve a MESMA chave de `PortBindings` com a porta explícita.
    construtor.withExposedPorts({ container: 5432, host: opcoes.portaFixa });
  }
  container = await construtor.start();
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
    containerId: container.getId(),
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
