// apps/api/test/e2e/scenarios/07-auth-refresh.e2e.spec.ts
//
// Cenário E2E 07: `POST /auth/refresh` rejeita token ruim com 401
// INVALID_TOKEN, e sem vazar a mensagem interna da biblioteca.
//
// ── O QUE ESTE SPEC PROVA, E POR QUE ELE NÃO É OPCIONAL ────────────────────
//
// MEDIDO 2026-10-13: com token malformado, expirado ou de tipo trocado, o
// endpoint respondia **HTTP 500**, e o corpo trazia a mensagem do
// `jsonwebtoken` no `detail` ("jwt malformed", "jwt expired", "invalid
// signature"). Duas coisas estavam erradas ao mesmo tempo:
//
//   1. O STATUS. `@ApiResponse({ status: 401 })` e `docs/api/auth.md`
//      prometem 401 para refresh inválido; o runtime devolvia 500. Um 500
//      diz ao cliente "a culpa é do servidor, tente mais tarde", quando a
//      sessão é que está morta — e o `retry` que o cliente faria é o oposto
//      do conserto.
//
//   2. O `detail`. O `GlobalExceptionFilter` serializa
//      `exception.message` (ver `global-exception.filter.ts:122`), e a
//      exceção do `jsonwebtoken` carrega a razão técnica. Ela descreve o
//      estado interno do verificador de assinatura — que token o atacante
//      mandou, com que formato, assinado por qual chave — e um verificador
//      que distingue "expirado" de "assinatura inválida" é meio caminho
//      para distinguir token autêntico de forjado.
//
// A unit `jwt-token.service.spec.ts` trava a exceção que o serviço lança.
// Isso NÃO prova o contrato HTTP: ela roda `validarRefreshToken` fora do
// request, e o defeito era o que o `GlobalExceptionFilter` fazia com ela
// depois. Este spec é o que atravessa o request inteiro.
//
// ⚠️ `refresh` é `@Public()`. O `JwtAuthGuard.canActivate` retorna no passo
// 1 sem olhar o token, então o único `catch` em torno de `validar*Token`
// está DENTRO do guard e nunca chega aqui. Por isso a exceção sobe crua
// até o filtro global — e por isso este spec precisava existir.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  bootstrapE2E,
  teardownE2E,
  cleanE2EDatabase,
  type E2EContext,
} from '../test-app.helper.js';
import type { Ttl } from '../../../src/modules/auth/infrastructure/security/jwt-token.service.js';

/** E-mail da conta criada só por este spec (o caminho feliz precisa de DB). */
const EMAIL_DO_CENARIO = 'refresh-e2e@projeto.test';
const SENHA_DO_CENARIO = 'senha-de-teste-e2e';

/**
 * Razões internas que o `jsonwebtoken` usa e que NUNCA podem aparecer no
 * `detail` da resposta.
 *
 * ⚠️ Não é uma lista decorativa: as três são alcançáveis por um `POST` anônimo
 * — `nao-e-um-jwt` cai em "jwt malformed", um token de testes anteriores
 * cai em "jwt expired" e um token assinado com outra chave cai em "invalid
 * signature". Sem esta asserção, um 401 com `detail` vazando a razão
 * passaria.
 */
const RAZOES_INTERNAS = /jwt malformed|jwt expired|invalid signature|invalid algorithm/i;

/** Corpo de erro que o `GlobalExceptionFilter` produz (RFC 7807). */
interface ProblemDetails {
  code?: string;
  title?: string;
  status?: number;
  detail?: string;
  type?: string;
  instance?: string;
  traceId?: string;
}

describe('E2E 07: POST /auth/refresh — 401 INVALID_TOKEN sem vazar a causa interna', () => {
  let e2e: E2EContext;
  let segredo: string;

  beforeAll(async () => {
    e2e = await bootstrapE2E();
    // O segredo vem do ConfigService do próprio app em vez de ser repetido
    // aqui: `vitest.config.ts` define `JWT_SECRET` no `env` do projeto e2e,
    // e hardcodar o mesmo literal nos dois arquivos criaria um segundo lugar
    // onde o segredo do teste mora — que é exatamente o tipo de duplicação
    // que quebra em silêncio quando um dos dois muda.
    segredo = e2e.app.get(ConfigService).get<string>('JWT_SECRET') ?? '';
    expect(segredo).not.toBe('');
  });

  afterAll(async () => {
    await teardownE2E(e2e);
  });

  // ⚠️ Este spec NÃO chamava `beforeEach`, e o container Postgres é
  // COMPARTILHADO entre arquivos (`singleFork`): o `it` de controle cria a
  // conta `refresh-e2e@projeto.test` e a deixava na base. Hoje isso não
  // morde porque todo spec seguinte limpa em `beforeEach` — mas a
  // proteção era a ORDEM dos arquivos, não o spec. Um spec novo que conte
  // linhas herdaria a conta alheia. A limpeza é o que isola o arquivo,
  // e não o vizinho que por acaso passa a limpar.
  beforeEach(async () => {
    await cleanE2EDatabase(e2e);
  });

  /**
   * Assina um token com o segredo REAL do app, escolhendo o TTL.
   *
   * O TTL é `Ttl` — o mesmo tipo do serviço, importado em vez de redigitado.
   * A primeira versão deste helper declarava `number | string`, que é
   * precisamente o tipo que o `ms` recusa: `StringValue` é uma união de
   * template literals, e `string` é largo demais para ela. A suíte rodava verde
   * e só o `tsc --noEmit` acusava — o mesmo par (spec verde, typecheck
   * vermelho) que a convenção `spec-que-so-verifica-render-nao-tem-dente`
   * descreve para a camada seguinte.
   */
  async function assinarRefresh(overrides: { expiresIn?: Ttl; typ?: string }) {
    const jwt = e2e.app.get(JwtService);
    return jwt.signAsync(
      { sub: '0190a8b6-0000-7000-8000-000000000000', email: EMAIL_DO_CENARIO, ...overrides },
      { secret: segredo, expiresIn: overrides.expiresIn ?? '1h' },
    );
  }

  function lerProblem(res: { body: string }): ProblemDetails {
    return JSON.parse(res.body) as ProblemDetails;
  }

  it('token malformado -> 401 INVALID_TOKEN, e o detail não diz "jwt malformed"', async () => {
    const res = await e2e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: 'nao-e-um-jwt' },
    });

    expect(res.statusCode).toBe(401);
    const body = lerProblem(res);
    expect(body.code).toBe('INVALID_TOKEN');
    expect(body.status).toBe(401);
    expect(body.title).toBe('Sessão inválida');
    // ⚠️ A teeth desta spec: o status sozinho não distingue um 401 limpo de
    // um 401 que delivery o diagnóstico interno. Um 500 com a mensagem da
    // biblioteca também "tem detalhe" — o que não pode é a razão técnica.
    expect(body.detail ?? '').not.toMatch(RAZOES_INTERNAS);
  });

  it('token expirado -> 401 INVALID_TOKEN, e o detail não diz "jwt expired"', async () => {
    const refreshToken = await assinarRefresh({ typ: 'refresh', expiresIn: '-1s' });

    const res = await e2e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });

    expect(res.statusCode).toBe(401);
    const body = lerProblem(res);
    expect(body.code).toBe('INVALID_TOKEN');
    expect(body.detail ?? '').not.toMatch(RAZOES_INTERNAS);
  });

  it('access token no lugar de refresh -> 401 INVALID_TOKEN', async () => {
    // Mesmo segredo, mesmo usuário, tipo trocado: só o `typ` discorda. É o
    // caso que a checagem de `typ` existe para pegar, e ela precisa happen
    // DEPOIS da assinatura — o `verifyAsync` passa, o `typ` barra.
    const accessToken = await assinarRefresh({ typ: 'access', expiresIn: '1h' });

    const res = await e2e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: accessToken },
    });

    expect(res.statusCode).toBe(401);
    expect(lerProblem(res).code).toBe('INVALID_TOKEN');
  });

  it('assinatura de outra chave -> 401 INVALID_TOKEN, sem "invalid signature"', async () => {
    const jwt = e2e.app.get(JwtService);
    const refreshToken = await jwt.signAsync(
      { sub: '0190a8b6-0000-7000-8000-000000000000', email: EMAIL_DO_CENARIO, typ: 'refresh' },
      { secret: `${segredo}-outra-chave`, expiresIn: '1h' },
    );

    const res = await e2e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });

    expect(res.statusCode).toBe(401);
    const body = lerProblem(res);
    expect(body.code).toBe('INVALID_TOKEN');
    expect(body.detail ?? '').not.toMatch(RAZOES_INTERNAS);
  });

  it('CONTROLE: refresh válido devolve 201 com par novo — os 401 acima são específicos', async () => {
    // ⚠️ Sem este `it`, uma suíte em que TUDO dá 401 (ou TUDO dá 500 por
    // qualquer outro motivo) passa nas quatro asserções acima. O controle
    // é o que separa "o endpoint recusa o que deve recusar" de "o endpoint
    // recusa tudo".
    const cadastro = await e2e.app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Cenario Refresh', email: EMAIL_DO_CENARIO, senha: SENHA_DO_CENARIO },
    });
    expect(cadastro.statusCode).toBe(201);

    const login = await e2e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: EMAIL_DO_CENARIO, senha: SENHA_DO_CENARIO },
    });
    expect(login.statusCode).toBe(201);
    // ⚠️ O valor do token não é logado nem interpolado na mensagem: ele é
    // credencial. Só o comprimento, que não revela nada.
    const refreshToken = (JSON.parse(login.body) as { refreshToken?: string }).refreshToken;
    expect(typeof refreshToken).toBe('string');
    expect(refreshToken).not.toBe('');

    const res = await e2e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });

    expect(res.statusCode).toBe(201);
    const par = JSON.parse(res.body) as { accessToken?: string; refreshToken?: string };
    // Renovação precisa devolver um par NOVO, não ecoar o token de entrada.
    expect(typeof par.accessToken).toBe('string');
    expect(par.accessToken).not.toBe(refreshToken);
    expect(typeof par.refreshToken).toBe('string');
  });

  it('refreshToken ausente -> 400 VALIDATION_ERROR (o Zod do boundary, não o JWT)', async () => {
    // ⚠️ 400 e não 401: corpo sem `refreshToken` nem chega ao emissor — o
    // `RefreshSchema` recusa antes. Registrar o caminho contrário (401 para
    // payload vazio) abriria uma porta de oráculo: 401 diria "o campo
    // existe, o valor é que não".
    const res = await e2e.app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(lerProblem(res).code).toBe('VALIDATION_ERROR');
  });
});
