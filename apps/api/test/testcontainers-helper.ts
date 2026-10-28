// apps/api/test/testcontainers-helper.ts
//
// Helper para testes de integração que precisam de um PostgreSQL real.
// Sobe um container postgres:16-alpine, aplica as migrations Prisma e devolve
// um PrismaClient conectado. A URI fica em DATABASE_URL para qualquer código
// que resolva via env. Singleton: cleanup global feito via afterAll nos specs.

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import {
  PAPEL_DE_RUNTIME,
  PAPEL_DE_SISTEMA,
  uriComoPapelDeSistema,
} from '../src/shared/infrastructure/prisma/papel-de-runtime.js';

/**
 * Senha dos papeis no container de teste.
 *
 * #118: e' do CONTAINER EFEMERO — ela morre com o container. Nao e' default
 * de nenhum ambiente real, e nao e' usada pela migration (que cria os papeis
 * sem senha). Ela existe aqui porque o container precisa de uma senha para
 * os papeis fazerem LOGIN, e porque os specs de RLS precisam conectar
 * como `app_runtime` e como `app_system`.
 *
 * Tem 43 bytes de proposito: o guard de segredo (`segredoDeServico`) recusa
 * segredo com menos de 32, e um valor de teste que o proprio guard recusaria
 * seria um teste que roda num regime diferente do de producao.
 */
export const SENHA_DE_TESTE_DO_PAPEL = 'senha-de-teste-do-papel-de-runtime-0001';

/**
 * Escapa um valor para literal SQL.
 *
 * `ALTER ROLE ... PASSWORD` nao aceita parametro (e DDL, em Postgres, nao
 * aceita bind), entao o valor vai como literal — e um literal precisa ser
 * escapado. O `'` do SQL e' o unico caracter que muda o sentido.
 */
function literalSql(valor: string): string {
  return `'${valor.replace(/'/g, "''")}'`;
}

// pt-BR: reexportado para a suíte e2e do WEB, que não tem `@prisma/client` como
// dependência e por isso importa deste arquivo (é a razão de o `global-setup.ts`
// fazer o mesmo). Sem esta linha, `limparBase` só teria `cleanDatabase` e
// nenhuma forma de construir o `PrismaClient` que ele exige.
export { PrismaClient };

let container: StartedPostgreSqlContainer | undefined;

export type TestContext = {
  prisma: PrismaClient;
  /**
   * URI do banco como **dono** (o superuser que o container cria).
   *
   * pt-BR (Fase 9 — RLS, 2026-10-17): existe para os specs que precisam provar
   * o comportamento de um papel **sem** BYPASSRLS. `prisma` é o cliente de
   * setup/asserção e continua no dono de propósito — o verificador precisa
   * enxergar o banco inteiro, senão a asserção "a escrita não aconteceu" seria
   * verificável só através da mesma política que deveria ter barrado a escrita.
   * O papel de runtime é derivado desta URI pelo spec.
   */
  uriDoBanco: string;
  /**
   * A URI do papel de SISTEMA (#118) — a credencial que abre o bucket de
   * sistema, separada da de runtime.
   */
  uriDoPapelDeSistema: string;
  /** A senha que o helper aplicou aos papeis do container efemero. */
  senhaDoPapel: string;
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
  // pt-BR (Fase 9 — RLS): `schema.prisma` tem `directUrl = env("DIRECT_DATABASE_URL")`,
  // que é a conexão que o CLI do Prisma usa. As duas apontam para o MESMO banco
  // aqui de propósito: o container nasce com o dono das tabelas, e o
  // `migrate deploy` PRECISA do dono (`CREATE ROLE`, `ALTER TABLE ... ENABLE ROW
  // LEVEL SECURITY` e `GRANT` exigem posse da tabela). O papel `app_runtime` é
  // criado pela própria migration; quem o exercita é o spec de RLS, com o
  // `uriComoPapelDeRuntime` — não este helper, que precisa enxergar o banco
  // inteiro para montar o fixture.
  process.env.DIRECT_DATABASE_URL = uri;
  const prisma = new PrismaClient({ datasourceUrl: uri });

  execSync('pnpm exec prisma migrate deploy', {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: uri, DIRECT_DATABASE_URL: uri },
    stdio: 'inherit',
  });

  // #118: a migration cria os papeis SEM senha (`NOLOGIN`) — uma migration
  // nao le env, e foi por isso que a senha do `app_runtime` ficou versionada
  // em texto puro. O setup e' quem aplica a senha, e aqui ele e' o proprio
  // helper (o container de teste nasce do zero).
  //
  // A senha e' do CONTAINER EFEMERO, nao de nenhum ambiente real: ela morre
  // com o container. O que importa e que ela NAO esta' no repositorio como
  // um default aplicavel a producao — e que os papeis sao criados sem senha
  // pela migration.
  await prisma.$executeRawUnsafe(
    `ALTER ROLE ${PAPEL_DE_RUNTIME} LOGIN PASSWORD ${literalSql(SENHA_DE_TESTE_DO_PAPEL)}`,
  );
  await prisma.$executeRawUnsafe(
    `ALTER ROLE ${PAPEL_DE_SISTEMA} LOGIN PASSWORD ${literalSql(SENHA_DE_TESTE_DO_PAPEL)}`,
  );

  // A credencial de SISTEMA: e' ela que abre o bucket de sistema, e ela e'
  // SEPARADA da de runtime. O bucket de sistema deixou de ser concedido por
  // um valor de GUC e passou a ser concedido pela credencial.
  const uriDeSistema = uriComoPapelDeSistema(uri, SENHA_DE_TESTE_DO_PAPEL);
  process.env.SYSTEM_DATABASE_URL = uriDeSistema;

  return {
    prisma,
    uriDoBanco: uri,
    uriDoPapelDeSistema: uriDeSistema,
    senhaDoPapel: SENHA_DE_TESTE_DO_PAPEL,
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
  // pt-BR (Fase 2 — tenancy, 2026-10-16): `invitations` e `tenant_memberships`
  // entram no TOPO. São as tabelas com o `@@unique` mais apertado do schema —
  // sem truncar, o segundo spec que cria `slug: 'manager'` leva `P2002` de
  // uma linha que sobrou do primeiro: parece falha do spec e é falha de
  // isolamento (o mesmo sintoma que o comentário de `profiles` abaixo
  // descreve, agora na D3).
  //
  // `tenants` vai por ÚLTIMO, não por ser "menos urgente" mas por causa da FK:
  // `profiles.tenant_id` referencia `tenants(id)`, então apagar a empresa
  // antes deixaria o `profile.deleteMany` logo abaixo dependente de cascade.
  await prisma.invitation.deleteMany({});
  await prisma.tenantMembership.deleteMany({});
  // pt-BR (feature-flags, 2026-10-18): `feature_flags` não tem FK, então a
  // posição é irrelevante — entra no topo só por uniformidade. Sem esta linha a
  // ausência é SILENCIOSA: o primeiro spec que grava uma flag deixa a linha
  // para o seguinte, que começa esperando base vazia e falha como se o
  // repositório inventasse estado.
  await prisma.featureFlag.deleteMany({});
  await prisma.userArchive.deleteMany({});
  await prisma.userHistory.deleteMany({});
  await prisma.user.deleteMany({});
  // `profiles`/`authorizations` (RBAC, #97): as tabelas passaram a existir DEPOIS
  // deste helper, e a ausência era silenciosa — o primeiro spec e2e que criava
  // um profile levou `Unique constraint (slug)` em todos os testes, que parece
  // falha do spec e é falha de isolamento.
  //
  // Ordem: `users` ANTES. `User.profileId` é `onDelete: Restrict`, então apagar
  // um profile ainda referenciado por um usuário rebenta; apagando as users
  // primeiro não existe referência pendente. As `authorizations` caem por
  // cascade (`Profile` → `Authorization` é `onDelete: Cascade`).
  await prisma.profile.deleteMany({});
  await prisma.tenant.deleteMany({});
}
