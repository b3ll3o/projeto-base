// apps/api/test/e2e/scenarios/19-contrato-http-do-perfil.e2e.spec.ts
//
// Cenário E2E 19: o CONTRATO HTTP do perfil de admin (issue #185).
//
// ⚠️ Este arquivo existe porque os dois defeitos que ele mede só aparecem
// ATRAVESSANDO o Fastify:
//
//   1. **`POST /admin/profiles` sem validação de corpo** (code-N1-003). O pipe
//      global de Zod é `ZodValidationPipe(z.any())` — um NOOP declarado, e o
//      comentário ao lado do registro em `main.ts` diz a regra: "cada rota
//      sobrescreve via `@Body(new ZodValidationPipe(SchemaDoDto))`". Esta rota
//      NÃO sobrescrevia, e o corpo cru chegava ao agregado, que itera
//      `initialAuthorizations` sem checar o TIPO (`for (const key of props
//      .initialAuthorizations ?? [])`). O `?? []` só protege de
//      `null`/`undefined`: um objeto ou um número passavam intactos e a rota
//      respondia **500** (TypeError: object is not iterable) onde o certo é
//      **400 VALIDATION_ERROR**. E uma STRING passava como iterable de
//      CARACTERES — cada caractere virava uma permissão candidata, e a
//      mensagem de erro nomeava uma permissão que o cliente nunca pediu.
//
//   2. **`PATCH /admin/profiles/:id` apagava a descrição** (code-N1-002). O
//      controller só põe a chave `description` no input quando o cliente
//      mandou o campo, e o use case fazia `input.description ?? null` — o
//      `??` transformava a AUSÊNCIA em limpeza. Todo PATCH parcial (um PATCH
//      que só renomeia) APAGAVA a descrição, que é dado de configuração que o
//      cliente não tocou — e a limpeza entrava na auditoria como se fosse uma
//      edição deliberada.
//
// REGRA DE OURO deste arquivo (a do cenário 10): toda trava tem DOIS testes —
// um de RECUSA e um de LIBERDADE. Um `400` que passasse porque *tudo* recusa é
// indistinguível de uma trava que funciona, e é o tipo de verde que mente.
//
// Banco REAL via Testcontainers; tokens REAIS por `POST /auth/login`. Nenhum
// guard é dublê.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  bootstrapE2E,
  teardownE2E,
  cleanE2EDatabase,
  tokenDe,
  type E2EContext,
  SENHA_DE_TESTE,
} from '../test-app.helper.js';

/**
 * O que o ator tem: `admin.manage-profiles` (para criar e editar perfil) e
 * `users.read` (para poder conceder `users.read` na criação — a use case
 * recusa conceder o que o ator não tem).
 */
const DO_ATOR = ['admin.manage-profiles', 'admin.manage-authorizations', 'users.read'] as const;

describe('E2E 19: o contrato HTTP do perfil de admin (issue #185)', () => {
  let e2e: E2EContext;

  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });

  afterAll(async () => {
    await teardownE2E(e2e);
  });

  beforeEach(async () => {
    await cleanE2EDatabase(e2e);
  });

  /**
   * ⚠️ O e-mail precisa ser DIFERENTE a cada chamada: o limitador de login é
   * POR CONTA (5/min), e um e-mail fixo faz o 6º login da suíte responder 429
   * — a falha aparece como "spec quebrado", não como limite de taxa. É o
   * mesmo cuidado do cenário 14.
   */
  let contadorDeContas = 0;
  function emailNovo(): string {
    contadorDeContas += 1;
    return `ator-perfil-${contadorDeContas}@projeto.test`;
  }

  /** Um profile global com as permissões do ator, e o token dele. */
  async function atorComPerfil(): Promise<{ token: string; profileId: string }> {
    const profile = await e2e.ctx.prisma.profile.create({
      data: { slug: `ator-perfil-${contadorDeContas + 1}`, name: 'Ator', isAdmin: false },
      select: { id: true },
    });
    await e2e.ctx.prisma.authorization.createMany({
      data: DO_ATOR.map((permissionKey) => ({ profileId: profile.id, permissionKey })),
    });

    const email = emailNovo();
    const cadastro = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Ator', email, senha: SENHA_DE_TESTE },
    });
    expect(cadastro.statusCode).toBe(201);
    const { id } = JSON.parse(cadastro.body) as { id: string };
    await e2e.ctx.prisma.user.update({ where: { id }, data: { profileId: profile.id } });
    return {
      token: await tokenDe(e2e.app, { email, senha: SENHA_DE_TESTE }),
      profileId: profile.id,
    };
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  // ─── code-N1-003: o corpo malformado é 400, não 500 ─────────────────────────

  it('`initialPermissions` com NÚMERO responde 400 VALIDATION_ERROR, não 500', async () => {
    const ator = await atorComPerfil();

    const res = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/admin/profiles',
      headers: auth(ator.token),
      payload: { slug: 'perfil-com-numero', name: 'Com número', initialPermissions: 123 },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('VALIDATION_ERROR');
    // A linha que quebra se alguém voltar a deixar o corpo cru chegar ao
    // agregado: o TypeError do `for...of` virava 500.
    expect(res.statusCode).not.toBe(500);
  });

  it('`initialPermissions` com OBJETO responde 400, não 500', async () => {
    const ator = await atorComPerfil();

    const res = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/admin/profiles',
      headers: auth(ator.token),
      payload: { slug: 'perfil-com-objeto', name: 'Com objeto', initialPermissions: { a: 'b' } },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('VALIDATION_ERROR');
    expect(res.statusCode).not.toBe(500);
  });

  it('`initialPermissions` com TEXTO responde 400, e não nomeia uma permissão que ninguém pediu', async () => {
    const ator = await atorComPerfil();

    const res = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/admin/profiles',
      headers: auth(ator.token),
      payload: { slug: 'perfil-com-texto', name: 'Com texto', initialPermissions: 'users.read' },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).code).toBe('VALIDATION_ERROR');
    // O agregado iterava os CARACTERES da string: cada caractere virava uma
    // permissão candidata, e a mensagem nomeava uma permissão inexistente.
    expect(res.body).not.toContain('u.s.e');
  });

  it('`initialPermissions` com LISTA válida continua sendo ACEITO (a trava não é tudo)', async () => {
    const ator = await atorComPerfil();

    const res = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/admin/profiles',
      headers: auth(ator.token),
      payload: {
        slug: 'perfil-valido',
        name: 'Perfil válido',
        initialPermissions: ['users.read'],
      },
    });

    expect(res.statusCode).toBe(201);
    const corpo = JSON.parse(res.body) as { permissions?: string[] };
    expect(corpo.permissions ?? []).toContain('users.read');
  });

  it('o corpo SEM `initialPermissions` continua sendo aceito (perfil sem concessão)', async () => {
    const ator = await atorComPerfil();

    const res = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/admin/profiles',
      headers: auth(ator.token),
      payload: { slug: 'perfil-sem-concessao', name: 'Sem concessão' },
    });

    expect(res.statusCode).toBe(201);
  });

  // ─── code-N1-002: PATCH ausente ≠ PATCH null ───────────────────────────────

  it('PATCH sem `description` PRESERVA a descrição existente', async () => {
    const ator = await atorComPerfil();

    const criado = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/admin/profiles',
      headers: auth(ator.token),
      payload: {
        slug: 'perfil-patch',
        name: 'Perfil do patch',
        description: 'Descrição que tem de ficar',
      },
    });
    expect(criado.statusCode).toBe(201);
    const id = (JSON.parse(criado.body) as { id: string }).id;

    const patch = await e2e.injetar({
      method: 'PATCH',
      url: `/api/v1/admin/profiles/${id}`,
      headers: auth(ator.token),
      // SEM `description`: o cliente não tocou no campo.
      payload: { name: 'Nome novo' },
    });
    expect(patch.statusCode).toBe(200);

    // A leitura é pela API — e a asserção é sobre o valor, não sobre o status.
    const lido = await e2e.injetar({
      method: 'GET',
      url: `/api/v1/admin/profiles/${id}`,
      headers: auth(ator.token),
    });
    expect(lido.statusCode).toBe(200);
    expect((JSON.parse(lido.body) as { description?: string | null }).description).toBe(
      'Descrição que tem de ficar',
    );
  });

  it('PATCH com `description: null` LIMPA a descrição (limpeza explícita continua possível)', async () => {
    const ator = await atorComPerfil();

    const criado = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/admin/profiles',
      headers: auth(ator.token),
      payload: {
        slug: 'perfil-limpar',
        name: 'Perfil do clear',
        description: 'Descrição que tem de sumir',
      },
    });
    expect(criado.statusCode).toBe(201);
    const id = (JSON.parse(criado.body) as { id: string }).id;

    const patch = await e2e.injetar({
      method: 'PATCH',
      url: `/api/v1/admin/profiles/${id}`,
      headers: auth(ator.token),
      payload: { name: 'Nome novo', description: null },
    });
    expect(patch.statusCode).toBe(200);

    const lido = await e2e.injetar({
      method: 'GET',
      url: `/api/v1/admin/profiles/${id}`,
      headers: auth(ator.token),
    });
    expect(lido.statusCode).toBe(200);
    expect((JSON.parse(lido.body) as { description?: string | null }).description).toBeNull();
  });
});
