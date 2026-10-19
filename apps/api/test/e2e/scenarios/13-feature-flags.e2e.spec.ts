// apps/api/test/e2e/scenarios/13-feature-flags.e2e.spec.ts
//
// Cenário E2E 13: as duas rotas de feature flags do ADMIN DO SISTEMA.
//
// POR QUE ESTE ARQUIVO EXISTE, e por que é e2e e não unitário
//
// `admin-feature-flags.controller.spec.ts` chama os handlers com `new` e um
// stub: nenhum GUARD roda, o PIPE não existe e a ROTA não é consultada.
// `feature-flags.module.spec.ts` sobe o container, mas compila o módulo ISOLADO
// — nunca o `AppModule`.
//
// MEDIDO 2026-10-18 (revisão adversarial da F3): 7 mutações que quebram
// invariantes REAIS deixavam a suíte unitária **871/871 verde** —
//
//   - `FeatureFlagsModule` fora do `AppModule` ....... 404 nas duas rotas
//   - `PermissionsGuard` fora do `@UseGuards` ........ 403 em TUDO (o A4)
//   - `ZodValidationPipe` fora do `@Body` ............ 500, e `{}` → 200
//   - `z.boolean()` → `z.coerce.boolean()` ........... `"false"` grava `true`
//   - rota `admin/feature-flags` → `admin/flags` .... 404
//   - `controllers: []` .............................. 404 nas duas rotas
//
// Quatro delas eram defeito observável, e a cobertura do arquivo de produção
// era **100%** durante todas elas. Este arquivo é o que fecha esse orçamento.
//
// O `PermissionsGuard` (2º item) é a mais importante: com cache de perfil
// FRIO — que é o estado de um servidor recém-subido — o `JwtAuthGuard` só LÊ
// `req.user.isAdmin` e não escreve de volta. O ÚNICO produtor do perfil
// aquecido é o `PermissionsGuard` (`permissions.guard.ts:93-102`). Sem ele, o
// admin legítimo leva 403 numa tela recém-nascida: o defeito A4 que a D8 do
// plano existe para impedir.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  bootstrapE2E,
  teardownE2E,
  cleanE2EDatabase,
  criarUsuarioAutenticado,
  type E2EContext,
} from '../test-app.helper.js';
import { listAllPermissions } from '../../../src/shared/auth/permissions-catalog.js';

const ROTA = '/api/v1/admin/feature-flags';

/** Chave do catálogo — a única da v1. */
const CHAVE = 'tenancy.invites';

describe('E2E 13: Feature flags (admin do sistema)', () => {
  let e2e: E2EContext;

  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });

  afterAll(async () => {
    await teardownE2E(e2e);
  });

  beforeEach(async () => {
    // `cleanDatabase` apaga `feature_flags` junto (`testcontainers-helper.ts:152`),
    // então D4 (linha ausente = ATIVADA) é o estado de partida de cada teste.
    await cleanE2EDatabase(e2e);
  });

  /**
   * O teste de registro da rota. Um 404 aqui é indistinguível de "o módulo não
   * está no AppModule", "o controller não está em `controllers`" e "o `@Controller`
   * aponta para outro caminho" — e são exatamente as 3 mutações cegas.
   *
   * E afirma D4 no boundary: base vazia ⇒ todas as chaves ATIVADAS.
   */
  it('GET devolve o catálogo inteiro, com tudo ativada (D4), para o admin do sistema', async () => {
    const res = await e2e.injetar({ method: 'GET', url: ROTA });

    // 403 aqui = o `PermissionsGuard` não rodou ou não hidratou o cache frio.
    // MEDIDO: sem o guard, este EXATO request responde 403.
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { chave: string; ativada: boolean; descricao: string }[];

    const chave = body.find((f) => f.chave === CHAVE);
    expect(chave).toBeDefined();
    // D4: NENHUMA linha foi gravada, e o estado devolvido é ATIVADA.
    expect(chave?.ativada).toBe(true);
    // Sem `updatedAt` no contrato (D16) — e o web não pode começar a consumi-lo.
    expect(Object.keys(chave ?? {}).sort()).toEqual(['ativada', 'chave', 'descricao']);
  });

  it('PUT alterna a flag e o GET seguinte devolve o estado novo', async () => {
    const desligada = await e2e.injetar({
      method: 'PUT',
      url: `${ROTA}/${CHAVE}`,
      payload: { ativada: false },
    });
    expect(desligada.statusCode).toBe(200);
    expect(JSON.parse(desligada.body)).toMatchObject({ chave: CHAVE, ativada: false });

    const listagem = await e2e.injetar({ method: 'GET', url: ROTA });
    const chave = (JSON.parse(listagem.body) as { chave: string; ativada: boolean }[]).find(
      (f) => f.chave === CHAVE,
    );
    expect(chave?.ativada).toBe(false);

    // Religar: o caminho de `upsert` passa a ser update, e não insert.
    const religada = await e2e.injetar({
      method: 'PUT',
      url: `${ROTA}/${CHAVE}`,
      payload: { ativada: true },
    });
    expect(religada.statusCode).toBe(200);
    expect(JSON.parse(religada.body)).toMatchObject({ chave: CHAVE, ativada: true });
  });

  /**
   * Fecha M3 e M5 com UM teste, porque é o mesmo request que separa os dois:
   *
   * - SEM o `ZodValidationPipe`: `"false"` chega cru ao use case, o Prisma
   *   recusa a escrita no booleano e a rota responde **500**. MEDIDO.
   * - Com coerção (`z.coerce.boolean()`, que é o default do Zod e o que
   *   alguém "corrigindo" o 500 escreveria): `"false"` é convertido e
   *   **grava `true`** — o estado diverge do que o admin digitou e o 200
   *   confirma a mentira. MEDIDO.
   *
   * Por isso a asserção tem as duas faces: 400 E nada gravado. Só o 400
   * deixaria passar um `catch` que engole e persiste mesmo assim.
   */
  it.each([
    { rotulo: 'string "false"', payload: { ativada: 'false' } },
    { rotulo: 'string "true"', payload: { ativada: 'true' } },
    { rotulo: 'número 1', payload: { ativada: 1 } },
    { rotulo: 'número 0', payload: { ativada: 0 } },
    { rotulo: 'ausente', payload: {} },
  ])('PUT com ativada $rotulo -> 400 VALIDATION_ERROR, e nada é gravado', async ({ payload }) => {
    const res = await e2e.injetar({
      method: 'PUT',
      url: `${ROTA}/${CHAVE}`,
      payload,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');

    // A segunda face: a base continua sem linha nenhuma, o que prova que o
    // request NÃO gravou antes de recusar.
    const gravadas = await e2e.ctx.prisma.featureFlag.count();
    expect(gravadas).toBe(0);
  });

  /** Chave fora do catálogo é 400 da use case — e o `code` é o dela, não o do Zod. */
  it('PUT com chave fora do catálogo -> 400 FEATURE_FLAG_CHAVE_INVALIDA', async () => {
    const res = await e2e.injetar({
      method: 'PUT',
      url: `${ROTA}/tenancy.invit`,
      payload: { ativada: false },
    });

    expect(res.statusCode).toBe(400);
    expect((JSON.parse(res.body) as { code: string }).code).toBe('FEATURE_FLAG_CHAVE_INVALIDA');
    expect(await e2e.ctx.prisma.featureFlag.count()).toBe(0);
  });

  /**
   * As três guarantias abaixo são afirmações do CONTRATO
   * (`docs/superpowers/specs/2026-10-18-feature-flags-contrato-http.md`) que
   * nenhuma spec fixava: o documento dizia e o código podia mudar sem que nada
   * accusasse. Documento que não tem teste apodrece em silêncio — este bloco é
   * o que o mantém verdadeiro.
   *
   * ⚠️ O primeiro é o mais importante e o mais caro de descobrir sozinho: o
   * cliente web se recusa a mandar `X-Tenant-Id` (D14) e o comentário dela diz
   * que enviar "tira o ator do bucket global". O que NINGUÉM tinha medido é o
   * que acontece quando alguém manda mesmo assim: **403**, e um `code` que
   * fala em EMPRESA (`TENANT_MEMBERSHIP_REQUIRED`), que não é o `FORBIDDEN`
   * de D2. Um cliente novo, escrito a partir do contrato e sem o comentário,
   * manda o header por hábito e recebe uma recusa que não menciona a flag.
   */
  it('X-Tenant-Id na listagem -> 403 TENANT_MEMBERSHIP_REQUIRED (D14, do lado do servidor)', async () => {
    const res = await e2e.injetar({
      method: 'GET',
      url: ROTA,
      headers: { 'x-tenant-id': '0190a8b6-0000-7000-8000-00000000ffff' },
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body) as { code: string; detail: string };
    // O `code` NÃO é o `FORBIDDEN` de D2 — e essa distinção é o que permite ao
    // cliente dizer "você mandou header de empresa" em vez de "você não é
    // admin". As duas recusas compartilham o status e divergem aqui.
    expect(body.code).toBe('TENANT_MEMBERSHIP_REQUIRED');
    expect(body.detail).toContain('X-Tenant-Id');
  });

  /** §3 do contrato: campo a mais é descartado (strip do Zod), e o recurso é o do path. */
  it('PUT com campo extra -> 200 e o campo é descartado, sem redirecionar o recurso', async () => {
    const res = await e2e.injetar({
      method: 'PUT',
      url: `${ROTA}/${CHAVE}`,
      payload: { ativada: false, chave: 'tenancy.exportacoes', descricao: 'injetado' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { chave: string; ativada: boolean };
    // O `chave` do CORPO não redireciona: a linha gravada é a do PATH.
    expect(body.chave).toBe(CHAVE);
    expect(body.ativada).toBe(false);

    const linha = await e2e.ctx.prisma.featureFlag.findUniqueOrThrow({ where: { chave: CHAVE } });
    expect(linha.ativada).toBe(false);
    // E nada foi criado para a chave que veio no corpo — que nem existe no
    // catálogo, mas que o strip impede de chegar ao `definir`.
    expect(await e2e.ctx.prisma.featureFlag.count()).toBe(1);
  });

  /** §7.1 do contrato: `field` é `"(root)"` sem corpo e `"ativada"` com `{}`. */
  it('o field do VALIDATION_ERROR distingue "corpo ausente" de "campo ausente"', async () => {
    const semCorpo = await e2e.injetar({ method: 'PUT', url: `${ROTA}/${CHAVE}` });
    const corpoVazio = await e2e.injetar({
      method: 'PUT',
      url: `${ROTA}/${CHAVE}`,
      payload: {},
    });

    // `?.` e nao `!`: o `noUncheckedIndexedAccess` do projeto torna `errors[0]`
    // possivelmente ausente. Com `!` o tsc passa mas um `errors: []` viraria
    // `undefined` silencioso; com `?.` o `undefined` chega na assercao e falha
    // alto — `undefined` nao e `'(root)'`. O dente fica, o typecheck fecha.
    const campoDe = (res: { body: string }) =>
      (JSON.parse(res.body) as { errors: { field: string }[] }).errors[0]?.field;

    expect(semCorpo.statusCode).toBe(400);
    expect(campoDe(semCorpo)).toBe('(root)');
    expect(corpoVazio.statusCode).toBe(400);
    expect(campoDe(corpoVazio)).toBe('ativada');
  });

  /**
   * O `@UseGuards` da CLASSSE fecha a porta. Sem ele as duas rotas abrem para
   * quem não tem token — e nada na suíte unitária vê isso, porque nenhuma
   * spec de unidade executa um guard.
   *
   * `e2e.app.inject` e não `e2e.injetar`: o wrapper injeta o token da sessão
   * por padrão, e o ponto do teste é justamente não tê-lo.
   */
  it('sem token -> 401 nas duas rotas', async () => {
    for (const requisicao of [
      { method: 'GET' as const, url: ROTA },
      { method: 'PUT' as const, url: `${ROTA}/${CHAVE}`, payload: { ativada: false } },
    ]) {
      const res = await e2e.app.inject(requisicao);
      expect(res.statusCode).toBe(401);
    }
  });

  /**
   * D2 no boundary, e não só na spec da use case.
   *
   * O ator aqui TEM `admin.manage-feature-flags` — o `PermissionsGuard` passa —
   * e mesmo assim é barrado. Se esta asserção virasse 200, o portão real da
   * feature seria o decorator, e o comentário que o descreve no controller
   * seria mentira: bastaria o signup de empresa, que concede `listAllPermissions()`
   * ao dono de cada empresa nova (`prisma-tenant-onboarding.repository.ts:209`).
   *
   * O perfil é global (`tenantId: null`) para o `PermissionsGuard` achá-lo, e
   * `isAdmin: false` é o que separa este ator do administrador do sistema.
   */
  it('ator COM a permissão mas SEM admin do sistema -> 403 (D2, não o decorator)', async () => {
    const perfil = await e2e.ctx.prisma.profile.create({
      data: {
        slug: 'e2e-quase-admin-sem-perfil-global',
        name: 'Quase Admin E2E',
        isAdmin: false,
        tenantId: null,
      },
    });
    await e2e.ctx.prisma.authorization.createMany({
      data: listAllPermissions().map((permissionKey) => ({
        profileId: perfil.id,
        permissionKey,
      })),
    });

    const ator = await criarUsuarioAutenticado(e2e, {
      nome: 'Quase Admin',
      email: 'quase-admin-sem-admin@projeto.test',
    });
    await e2e.ctx.prisma.user.update({
      where: { id: ator.id },
      data: { profileId: perfil.id },
    });

    const listagem = await e2e.injetar({ method: 'GET', url: ROTA, headers: ator.headers });
    expect(listagem.statusCode).toBe(403);
    expect((JSON.parse(listagem.body) as { code: string }).code).toBe('FORBIDDEN');

    const alternada = await e2e.injetar({
      method: 'PUT',
      url: `${ROTA}/${CHAVE}`,
      headers: ator.headers,
      payload: { ativada: false },
    });
    expect(alternada.statusCode).toBe(403);
    expect(await e2e.ctx.prisma.featureFlag.count()).toBe(0);
  });
});
