// apps/api/test/e2e/test-app.helper.ts
//
// Helper para testes E2E ponta-a-ponta (Testcontainers + Fastify).
//
// Centraliza o bootstrap:
//  - Sobe container PostgreSQL real via Testcontainers.
//  - Compila AppModule inteiro (controllers + Prisma + Audit + Users + Auth).
//  - Aplica o mesmo wiring de main.ts (global prefix 'api/v1' +
//    GlobalExceptionFilter + ZodValidationPipe).
//  - Emite um par de tokens REAL por login real e o devolve via `injetar`.
//
// pt-BR:
//  - Replica EXATAMENTE o inline setup de users.e2e.spec.ts para garantir
//    paridade entre suites — qualquer mudança no wiring de produção deve
//    ser refletida aqui também.
//  - `cleanE2EDatabase(e2e)` deve ser chamado em `beforeEach` se o spec
//    usar múltiplos `it()` com dados conflitantes; cenário 01 não precisa
//    porque roda tudo num único `it()` sequencial.

import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import { setupTestDatabase, cleanDatabase, type TestContext } from '../testcontainers-helper.js';
import { AppModule } from '../../src/app.module.js';
import { GlobalExceptionFilter } from '../../src/shared/infrastructure/http/global-exception.filter.js';
import { ZodValidationPipe } from '../../src/shared/infrastructure/http/zod-validation.pipe.js';
import { listAllPermissions } from '../../src/shared/auth/permissions-catalog.js';

export interface E2EContext {
  app: NestFastifyApplication;
  ctx: TestContext;
  /**
   * `app.inject` COM o header de autorização da sessão de teste.
   *
   * ⚠️ Por que um wrapper e não um token global: desde que `JwtAuthGuard`
   * passou a valer na CLASSE do `UsersController`, todo endpoint de leitura
   * e escrita exige `Authorization: Bearer`. MEDIDO 2026-10-13: sem isto,
   * 31 dos testes e2e caíam — os `GET`/`PATCH`/`DELETE` com 401 e os
   * `POST` com 400 (o cadastro é público, mas passou a exigir `senha`).
   *
   * ⚠️ **Um `authorization` explícito no request NÃO é sobrescrito** (medido
   * no mesmo dia, com a política de propriedade): desde que
   * `UserOwnershipGuard` compara `request.user.sub` com o `:id` da rota, um
   * spec que opera sobre o usuário que acabou de criar precisa do token
   * DELE. `tokenDe(app, { email, senha })` entrega esse token e o spec o passa
   * em `headers`; sem esta ressalva, o header do spec seria apagado pelo
   * default e o spec mediria 403 sem saber por quê.
   *
   * O token padrão é REAL: a conta é criada pelo `POST /users` público e o
   * par vem do `POST /auth/login`. Substituir o guard por um dublê aqui
   * zeraria o custo e apagaria justamente o que estes testes existem para
   * atravessar.
   *
   * `POST /users` é `@Public()`, e levar o header nela é inofensivo — o
   * guard o ignora. Um spec que precise medir 401 tem `app` à mão, que é o
   * `inject` cru.
   */
  injetar: (
    requisicao: Parameters<NestFastifyApplication['inject']>[0],
  ) => Promise<Awaited<ReturnType<NestFastifyApplication['inject']>>>;
  /**
   * Garante que exista um token de sessão válido para o `injetar`.
   *
   * pt-BR: idempotente por desenho. Emitir token é um `POST /users` + um
   * `POST /auth/login` para a MESMA conta em toda chamada, e `emitirTokenDeSessao`
   * APAGA essa conta logo depois de emitir — o estado do banco depois do
   * bootstrap e depois de cada limpeza é idêntico: conta ausente, token válido.
   * Relogar não restaura nada; só gasta um login.
   */
  restabelecerSessao: () => Promise<void>;
}

/** E-mail da conta que os specs usam para obter o par de tokens. */
export const EMAIL_DA_SESSAO = 'conta-de-sessao-e2e@projeto.test';
/** Senha da conta de sessão. Não é segredo — é um dado de teste público. */
export const SENHA_DA_SESSAO = 'senha-de-teste-do-harness-e2e';

/**
 * Senha para os payloads de `POST /users` dos specs.
 *
 * ⚠️ Válida de propósito (cumpre 8..72): nos testes que exercitam um payload
 * INVÁLIDO — e-mail malformado, e-mail vazio — o campo `senha` é o que fica
 * CORRETO, para que a asserção isole o erro que o teste quer medir. Sem ele,
 * o boundary devolvia `[email, senha]` e o teste que esperava só `[email]`
 * falhava por um campo que ele nem estava exercitando.
 */
export const SENHA_DE_TESTE = 'senha-de-teste-e2e';

/**
 * Cria a conta de sessão pelo endpoint PÚBLICO de cadastro, loga nela, e
 * **apaga a conta** — devolvendo só o token.
 *
 * pt-BR: o cadastro é `@Public()` por decisão de projeto (é a porta de
 * entrada), e é por ele que a conta nasce — sem um seed que teria de duplicar
 * a regra de senha. O par devolvido é o que o `JwtAuthGuard` valida a cada
 * request seguinte: um token REAL, emitido por um login REAL.
 *
 * ⚠️ Por que a conta é apagada em vez de ficar: o `JwtAuthGuard` valida
 * ASSINATURA e expiração, e não consulta o banco — a conta não é necessária
 * depois que o par existe. Deixá-la popula a base com uma linha que os specs
 * de listagem não esperam. MEDIDO 2026-10-13: com a conta persistida, três
 * specs caíam por `expected 1 to be 5` e `to have a length of 1 but got 2` —
 * a falha ia para o arquivo errado, dado que nada do CRUD estava quebrado.
 *
 * O apagamento é DURO (`delete`, não soft-delete): o soft-delete deixaria a
 * linha fora da listagem padrão mas presente em `includeDeleted`, que é um
 * dos cenários que a suíte mede. As três tabelas são limpas — deixar o
 * `users_history` órfão quebraria o spec de histórico, que conta versões.
 *
 * Sem o `prisma` a conta fica; foi assim que a primeira versão passou, e é o
 * comportamento do harness de browser, onde a sessão é reemitida a cada
 * limpeza.
 */
/**
 * Estado da conta de sessão, capturado no bootstrap e **reaplicado** a cada
 * `cleanDatabase` — que apaga `users`, `profiles` e `authorizations` por
 * completo.
 */
type ContaDaSessao = {
  id: string;
  name: string;
  passwordHash: string;
  createdAt: Date;
};

let contaDaSessao: ContaDaSessao | undefined;

/**
 * Perfil GLOBAL de admin (`tenantId: null`) para a conta de sessão.
 *
 * ⚠️ `tenantId: null` não é detalhe. Sem o header `x-tenant-id` o
 * `JwtAuthGuard` deixa `tenantId` nulo, e
 * `PrismaTenantMembershipRepository.findProfileId` nesse ramo resolve o perfil
 * pelo bucket GLOBAL — `users.profile_id`, filtrado por
 * `profile.tenant_id IS NULL` (aquele arquivo, linha 47). Um perfil de EMPRESA
 * aqui resolveria `null`, `PermissionsGuard` cairia no `user.isAdmin` do
 * `JwtAuthGuard` (false) e o ator tomaria 403 em toda rota com
 * `@RequirePermission` — inclusive `GET /users`.
 *
 * O slug é próprio (`e2e-admin-global`) e não `admin`: o seed de #93 usa
 * `admin`, e o índice parcial de unicidade global é sobre `slug`.
 */
async function garantirPerfilGlobalAdminE2E(prisma: PrismaClient): Promise<string> {
  const slug = 'e2e-admin-global';
  const existente = await prisma.profile.findFirst({ where: { slug, tenantId: null } });
  if (existente !== null) return existente.id;
  const perfil = await prisma.profile.create({
    data: {
      slug,
      name: 'Administrador Global E2E',
      isAdmin: true,
      isSystem: true,
      tenantId: null,
    },
  });
  await prisma.authorization.createMany({
    data: listAllPermissions().map((permissionKey) => ({ profileId: perfil.id, permissionKey })),
  });
  return perfil.id;
}

/**
 * Reaparece a conta de sessão DEPOIS da limpeza, com o MESMO `id` — que é o
 * `sub` do token.
 *
 * ⚠️ O token NÃO é reemitido, e é deliberado: `JwtAuthGuard` valida
 * assinatura e expiração sem tocar o banco, e re-logar a cada `beforeEach`
 * esbarra no limite de 5/min por conta (MEDIDO 2026-10-14: 17 specs caíam com
 * 429). Por isso a reaparição é uma escrita direta pelo DONO, e não um
 * `POST /users` + login.
 */
async function reaparecerContaDeSessao(prisma: PrismaClient, c: ContaDaSessao): Promise<void> {
  const perfilId = await garantirPerfilGlobalAdminE2E(prisma);
  await prisma.user.create({
    data: {
      id: c.id,
      name: c.name,
      email: EMAIL_DA_SESSAO,
      passwordHash: c.passwordHash,
      profileId: perfilId,
      createdAt: c.createdAt,
      updatedAt: new Date(),
      version: 1,
    },
  });
}

export async function emitirTokenDeSessao(
  app: NestFastifyApplication,
  prisma?: PrismaClient,
): Promise<string> {
  // ⚠️ A conta de sessão agora SOBREVIVE ao bootstrap (ela deixou de ser
  // apagada, porque precisa de perfil para passar do `PermissionsGuard`), e os
  // 13 arquivos de spec dividem o mesmo container sob `singleFork`. O
  // `POST /users` abaixo bateria em `P2002` com a conta do arquivo ANTERIOR
  // sempre que esse arquivo não limpou no teardown — só 10 dos 13 limpam.
  // Apagar a sobra aqui é o que torna o helper idempotente, em vez de
  // depender da ordem dos arquivos.
  if (prisma) {
    const sobra = await prisma.user.findFirst({
      where: { email: EMAIL_DA_SESSAO },
      select: { id: true },
    });
    if (sobra) {
      await prisma.userHistory.deleteMany({ where: { entityId: sobra.id } });
      await prisma.userArchive.deleteMany({ where: { entityId: sobra.id } });
      await prisma.user.delete({ where: { id: sobra.id } });
    }
  }

  const cadastro = await app.inject({
    method: 'POST',
    url: '/api/v1/users',
    payload: {
      nome: 'Conta de Sessao E2E',
      email: EMAIL_DA_SESSAO,
      senha: SENHA_DA_SESSAO,
    },
  });
  if (cadastro.statusCode !== 201) {
    throw new Error(
      `a conta de sessão do e2e não foi criada: HTTP ${cadastro.statusCode} — ${cadastro.body}`,
    );
  }

  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: EMAIL_DA_SESSAO, senha: SENHA_DA_SESSAO },
  });
  if (login.statusCode !== 201) {
    throw new Error(
      `o login da conta de sessão do e2e falhou: HTTP ${login.statusCode} — ${login.body}`,
    );
  }

  const { accessToken } = JSON.parse(login.body) as { accessToken?: unknown };
  // ⚠️ O valor NÃO é logado nem incluído na mensagem: ele é uma credencial.
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new Error('o login do e2e devolveu um accessToken ausente ou vazio');
  }
  if (prisma) {
    // ⚠️ A conta NÃO é mais apagada. Até 2026-10-17 ela era deletada logo em
    // seguida e só o token sobrevivia — o que funcionava porque nenhuma rota
    // exigia PERMISSÃO. `GET /users` passou a exigir `users.read`
    // (`@RequirePermission`), e um ator sem perfil é 403
    // (`permissions.guard.ts:104`). A conta continua viva, promovida a admin
    // global: é o que preserva a decisão de produto registrada em
    // `user-ownership.guard.ts:22-31` (o diretório continua legível), agora
    // com um ator que de fato tem o direito.
    const conta = await prisma.user.findFirst({
      where: { email: EMAIL_DA_SESSAO },
    });
    if (conta) {
      contaDaSessao = {
        id: conta.id,
        name: conta.name,
        passwordHash: conta.passwordHash,
        createdAt: conta.createdAt,
      };
      await prisma.user.update({
        where: { id: conta.id },
        data: { profileId: await garantirPerfilGlobalAdminE2E(prisma) },
      });
    }
  }

  return accessToken;
}

/**
 * Faz login com um par (e-mail, senha) JÁ EXISTENTE e devolve o `accessToken`.
 *
 * pt-BR: existe desde que `UserOwnershipGuard` passou a comparar o `sub` do
 * token com o `:id` da rota. Um spec que age sobre o usuário que acabou de
 * criar precisa do token DELE — o token da sessão e2e é de outra conta (que
 * ainda por cima é apagada depois de emitido), então ele não serve para nada
 * por-id.
 *
 * ⚠️ NÃO recria a conta: quem cria é o `POST /users` do próprio spec, e é
 * justamente esse `POST` que o spec precisa medir. Um helper que criasse a
 * conta esconderia o cadastro da asserção.
 */
export async function tokenDe(
  app: NestFastifyApplication,
  conta: { email: string; senha: string },
): Promise<string> {
  const login = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: conta.email, senha: conta.senha },
  });
  if (login.statusCode !== 201) {
    // ⚠️ A mensagem NÃO embute `conta.senha` nem o token devolvido: um erro de
    // setup que joga a credencial no stdout do CI é um segredo no log do CI.
    throw new Error(`o login de '${conta.email}' falhou: HTTP ${login.statusCode} — ${login.body}`);
  }
  const { accessToken } = JSON.parse(login.body) as { accessToken?: unknown };
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new Error(`o login de '${conta.email}' devolveu um accessToken ausente ou vazio`);
  }
  return accessToken;
}

/**
 * Cria uma conta pelo `POST /users` público e devolve o SEU token, mais os
 * headers prontos para as rotas por-id.
 *
 * pt-BR: é o par que quase todo spec de CRUD precisa desde que
 * `UserOwnershipGuard` compara o `sub` do token com o `:id` da rota — a conta
 * de sessão e2e é de outra pessoa (e é apagada depois de emitida), então
 * qualquer spec que atue sobre o registro que acabou de criar precisa do
 * token DELE.
 *
 * Devolver `headers` pronto (e não o token cru) é deliberado: o erro mais
 * fácil de cometer aqui é passar `{ 'if-match': … }` e esquecer o
 * `authorization`, que produz um 403 que parece falha de autorização e é
 * falha de montagem do spec.
 */
export async function criarUsuarioAutenticado(
  e2e: E2EContext,
  conta: { nome: string; email: string; senha?: string },
): Promise<{
  id: string;
  email: string;
  token: string;
  headers: Record<string, string>;
  /** A resposta crua do `POST /users` — specs que medem o `ETag` do 201. */
  cadastro: { statusCode: number; headers: Record<string, unknown>; body: string };
}> {
  const senha = conta.senha ?? SENHA_DE_TESTE;
  const cadastro = await e2e.injetar({
    method: 'POST',
    url: '/api/v1/users',
    payload: { nome: conta.nome, email: conta.email, senha },
  });
  if (cadastro.statusCode !== 201) {
    throw new Error(
      `o cadastro de '${conta.email}' falhou: HTTP ${cadastro.statusCode} — ${cadastro.body}`,
    );
  }
  const { id } = JSON.parse(cadastro.body) as { id?: unknown };
  if (typeof id !== 'string' || id === '') {
    throw new Error(`o cadastro de '${conta.email}' devolveu um id ausente`);
  }
  const token = await tokenDe(e2e.app, { email: conta.email, senha });
  return {
    id,
    email: conta.email,
    token,
    headers: { authorization: `Bearer ${token}` },
    cadastro: { statusCode: cadastro.statusCode, headers: cadastro.headers, body: cadastro.body },
  };
}

/**
 * Sobe container Postgres via Testcontainers, compila AppModule, aplica
 * wiring idêntico ao main.ts de produção e devolve `{ app, ctx, injetar }`.
 */
export async function bootstrapE2E(): Promise<E2EContext> {
  // pt-BR: container Postgres compartilhado via singleFork; setupTestDatabase
  // aplica migrations Prisma e injeta DATABASE_URL no process.env.
  const ctx = await setupTestDatabase();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());

  // pt-BR: replica o wiring de main.ts (prefix + filter + pipe).
  app.setGlobalPrefix('api/v1');
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(new ZodValidationPipe(z.any()));

  await app.init();

  // ⚠️ A conta de sessão é criada ANTES de devolver o contexto, e o token é
  // capturado por referência em `token`. `cleanE2EDatabase` apaga todas as
  // linhas — inclusive esta — e o token sobrevive à limpeza: ele é stateless, e
  // o `JwtAuthGuard` valida assinatura/expiração sem consultar o banco. Nenhum
  // spec precisa da CONTA de sessão de volta (MEDIDO: nenhum spec de e2e
  // exercita `GET /auth/me`, que é a única rota que resolve `sub` → usuário).
  // `undefined` é o estado "ainda sem token": o bootstrap nunca chega nele, e
  // existe só para `restabelecerSessao` poder distinguir "não tenho token" de
  // "tenho um token válido" sem relogar.
  let token: string | undefined = await emitirTokenDeSessao(app, ctx.prisma);

  const injetar: E2EContext['injetar'] = (requisicao) => {
    // `inject` aceita `string | InjectOptions`. Nenhum spec deste arquivo
    // passa a forma string (ela não carrega payload), mas o tipo permite —
    // e espalhar uma string aqui seria silenciosamente errado.
    if (typeof requisicao === 'string') {
      return app.inject(requisicao);
    }
    const headers = (requisicao.headers ?? {}) as Record<string, unknown>;
    // ⚠️ `authorization` que veio do request vence o default — é assim que um
    // spec opera como o dono do registro (`tokenDe`) em vez da conta de
    // sessão. Sobrepor aqui era o que faria a política de propriedade virar
    // "403 em todos os specs" sem que nenhum deles dissesse por quê.
    if (typeof headers['authorization'] === 'string') {
      return app.inject(requisicao);
    }
    return app.inject({
      ...requisicao,
      headers: { ...headers, authorization: `Bearer ${token}` },
    });
  };

  return {
    app,
    ctx,
    injetar,
    // ⚠️ Idempotente: só reloga se não há token. Relogar em toda limpeza
    // gastava um login da MESMA conta a cada `beforeEach`, e o limite por conta
    // que o T-B acabou de instalar (5/min) corta isso — MEDIDO 2026-10-14: 17
    // testes caíam com `o login da conta de sessão do e2e falhou: HTTP 429`,
    // 34 ocorrências, todas do mesmo bucket `127.0.0.1:<email-da-sessão>`.
    // A correção é aqui, e não no limite: o limite é o controle de segurança
    // que o usuário pediu, e um login por teste para a MESMA conta é o
    // comportamento que ele existe para travar.
    async restabelecerSessao() {
      // ⚠️ A ordem importa e não pode inverter: reaparecer a conta com o token
      // que JÁ existe é o caso comum (o token é stateless e sobrevive à
      // limpeza). Re-logar aqui gastaria o limite de 5/min por conta e
      // derrubaria a suíte — foi o que MEDIDO em 2026-10-14 derrubou 17 specs.
      // O login só acontece quando não há token nenhum.
      if (token !== undefined) {
        if (contaDaSessao !== undefined) {
          await reaparecerContaDeSessao(ctx.prisma, contaDaSessao);
        }
        return;
      }
      token = await emitirTokenDeSessao(app, ctx.prisma);
    },
  };
}

/**
 * Encerra o app Nest e o container Postgres. Idempotente quanto a ordem
 * (app.close primeiro para drenar conexões Prisma ativas).
 */
export async function teardownE2E({ app, ctx }: E2EContext): Promise<void> {
  await app.close();
  await ctx.stop();
}

/**
 * Trunca as tabelas do schema de users e garante a sessão de teste.
 *
 * ⚠️ Recebe o `E2EContext` inteiro, e não só o `ctx`, porque a sessão vive no
 * `e2e`, não no `prisma`.
 *
 * A documentação anterior deste helper afirmava que limpar sem restaurar
 * "deixava a suíte num estado em que nenhum spec consegue logar". MEDIDO
 * 2026-10-14: falso. O token da sessão é stateless e `emitirTokenDeSessao`
 * apaga a conta depois de emitir, então restaurar não devolvia nada — e o
 * `POST /auth/login` que ela fazia a cada `beforeEach` passou a ser cortado
 * pelo limite por conta (17 testes vermelhos, 34 ocorrências de HTTP 429).
 *
 * Chame em `beforeEach` quando o spec tiver múltiplos `it()` com dados
 * conflitantes.
 */
export async function cleanE2EDatabase(e2e: E2EContext): Promise<void> {
  await cleanDatabase(e2e.ctx.prisma);
  await e2e.restabelecerSessao();
}
