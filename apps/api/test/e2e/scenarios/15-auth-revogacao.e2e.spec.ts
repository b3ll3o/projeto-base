// apps/api/test/e2e/scenarios/15-auth-revogacao.e2e.spec.ts
//
// Cenário E2E 15: o logout REVOGA o refresh token — e o token revogado é
// recusado numa requisição posterior (#132).
//
// ── O QUE ESTE SPEC PROVA, E POR QUE O UNITÁRIO NÃO BASTA ──────────────────
//
// O unitário (`auth-use-cases.spec.ts`) mede a DECISÃO — quem revoga, e
// quando. Este mede o CAMINHO INTEIRO: o login registra o `jti`, o logout
// revoga, e o token revogado é recusado pelo MESMO endpoint que o emitiu.
//
// ⚠️ A asserção central é a ÚLTIMA: um refresh token revogado que ainda
// renova é o furo da #132 inteiro — e ele só aparece depois que o request
// passa pelo guard, pelo service, pelo repositório e pelo registro.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  bootstrapE2E,
  teardownE2E,
  cleanE2EDatabase,
  type E2EContext,
} from '../test-app.helper.js';

/** E-mail da conta criada só por este spec. */
const EMAIL_DO_CENARIO = 'revogacao-e2e@projeto.test';
const SENHA_DO_CENARIO = 'senha-de-teste-e2e';

describe('E2E 15: POST /auth/logout — o refresh token revogado é recusado (#132)', () => {
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

  async function cadastrarELogar(): Promise<string> {
    const cadastro = await e2e.app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Cenario Revogacao', email: EMAIL_DO_CENARIO, senha: SENHA_DO_CENARIO },
    });
    expect(cadastro.statusCode).toBe(201);

    const login = await e2e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: EMAIL_DO_CENARIO, senha: SENHA_DO_CENARIO },
    });
    expect(login.statusCode).toBe(201);
    const refreshToken = (JSON.parse(login.body) as { refreshToken?: string }).refreshToken;
    expect(typeof refreshToken).toBe('string');
    return refreshToken!;
  }

  it('CONTROLE: o refresh token emitido renova (o logout ainda não aconteceu)', async () => {
    const refreshToken = await cadastrarELogar();

    const res = await e2e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });

    expect(res.statusCode).toBe(201);
  });

  it('depois do logout, o refresh token é RECUSADO (#132)', async () => {
    const refreshToken = await cadastrarELogar();

    const logout = await e2e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken },
    });
    expect(logout.statusCode).toBe(201);

    // ⚠️ A ASSERÇÃO CENTRAL: o token revogado não renova mais.
    const res = await e2e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(res.statusCode).toBe(401);
    const problem = JSON.parse(res.body) as { code?: string };
    expect(problem.code).toBe('INVALID_TOKEN');
  });

  it('o logout de um token INVÁLIDO é 401 — e não revoga nada (#132)', async () => {
    const res = await e2e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: { refreshToken: 'nao-e-um-jwt' },
    });

    expect(res.statusCode).toBe(401);
    const problem = JSON.parse(res.body) as { code?: string };
    expect(problem.code).toBe('INVALID_TOKEN');
  });

  it('logout sem refreshToken -> 400 VALIDATION_ERROR (o Zod do boundary)', async () => {
    const res = await e2e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const problem = JSON.parse(res.body) as { code?: string };
    expect(problem.code).toBe('VALIDATION_ERROR');
  });

  it('a ROTACAO consome o token: o refresh antigo não renova duas vezes (#132)', async () => {
    const refreshToken = await cadastrarELogar();

    const primeiro = await e2e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(primeiro.statusCode).toBe(201);
    const par = JSON.parse(primeiro.body) as { refreshToken?: string };

    // O token ANTERIOR é de uso ÚNICO: apresentá-lo de novo é o caminho do
    // replay. E aqui ele está dentro da JANELA DE TOLERÂNCIA (a rotação
    // acabou de acontecer) — então a resposta é 401 e a sessão da conta
    // continua viva.
    const segundo = await e2e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(segundo.statusCode).toBe(401);

    // E o token NOVO, que a rotação emitiu, continua valendo — a janela de
    // tolerância não matou a sessão.
    const terceiro = await e2e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: par.refreshToken },
    });
    expect(terceiro.statusCode).toBe(201);
  });
});
