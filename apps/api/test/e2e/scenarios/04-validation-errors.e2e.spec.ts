// apps/api/test/e2e/scenarios/04-validation-errors.e2e.spec.ts
//
// Cenário E2E 04: Validation Zod + RFC 7807 Problem Details (Fase 9 Task 9.5).
//
// Cobre caminhos de validação que devem retornar 400 com body.errors[]:
//  - POST sem email (campo obrigatório)
//  - POST com email em formato inválido
//  - GET com id não-UUID (rejeitado pelo Zod do path param)
//  - PATCH com payload vazio (nenhum campo mutável)
//  - nome/email fora da faixa do VO de domínio (a faixa que o Zod do
//    boundary aceitou e que o VO recusou — via de 500, medida 2026-10-08)

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  bootstrapE2E,
  teardownE2E,
  cleanE2EDatabase,
  type E2EContext,
} from '../test-app.helper.js';

describe('E2E 04: Validation errors (Zod) + RFC 7807 Problem Details', () => {
  let e2e: E2EContext;

  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });

  afterAll(async () => {
    await teardownE2E(e2e);
  });

  beforeEach(async () => {
    await cleanE2EDatabase(e2e.ctx);
  });

  it('POST sem email -> 400 VALIDATION_ERROR com errors[] + RFC 7807 props', async () => {
    const { app } = e2e;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Ana' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as {
      code: string;
      errors?: unknown[];
      traceId?: string;
      instance?: string;
    };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors!.length).toBeGreaterThanOrEqual(1);
    // pt-BR: RFC 7807 Problem Details — problem type + instance + traceId.
    expect(body).toHaveProperty('traceId');
    expect(body).toHaveProperty('instance');
  });

  it('GET id inválido (não-UUID) -> 400 VALIDATION_ERROR', async () => {
    const { app } = e2e;
    const res = await app.inject({ method: 'GET', url: '/api/v1/users/not-a-uuid' });
    // MEDIDO 2026-10-08: a afirmação era `expect([400, 500]).toContain(...)`.
    // Aceitar os dois é a forma de um teste dizer que o defeito faz
    // parte do contrato — e o defeito era real: `UserId.create` lançava
    // `Error` puro, que o mapper não conhece, e o status era **500**.
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('POST com email em formato inválido -> 400 VALIDATION_ERROR', async () => {
    const { app } = e2e;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Ana', email: 'not-an-email' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { code: string; errors?: { field: string }[] };
    expect(body.code).toBe('VALIDATION_ERROR');
    // O nome é válido de propósito: com `nome: 'X'` (1 char) o Zod
    // apontava DOIS campos e este teste não isolava o motivo que o
    // nome declara medir.
    expect(body.errors?.map((e) => e.field)).toEqual(['email']);
  });

  it('POST com email duplicado (case-insensitive) -> 409 EMAIL_IN_USE', async () => {
    const { app } = e2e;
    await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alice', email: 'dup@b.com' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Bob', email: 'DUP@B.COM' },
    });
    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('EMAIL_IN_USE');
  });

  it('PATCH com payload vazio -> 400 VALIDATION_ERROR', async () => {
    const { app } = e2e;
    const c = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Ana', email: 'a@b.com' },
    });
    // MEDIDO 2026-10-08: sem esta asserção o teste passava pelo motivo
    // errado. Com `nome: 'A'` o POST devolvia **500** (o VO recusa 1 char
    // e o Zod aceita), `id` vinha `undefined`, e o PATCH batia em
    // `/api/v1/users/undefined` — cujo path param Zod recusava com 400.
    // O teste afirmava sobre o path param, não sobre o payload vazio.
    // A asserção abaixo é o que impede a regressão de voltar a ser verde
    // sem estar medindo nada.
    expect(c.statusCode).toBe(201);
    const userId = (JSON.parse(c.body) as { id: string }).id;
    expect(typeof userId).toBe('string');

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${userId}`,
      headers: { 'if-match': 'W/"v1"' },
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { code: string };
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  // Faixa que o Zod do boundary aceita (1..120) e o `UserName` VO recusa
  // (2..100). MEDIDO 2026-10-08 antes do conserto, com email VÁLIDO para
  // que nada mais rejeite o payload:
  //
  //   1 char  -> 500 INTERNAL  detail="UserName: muito curto (mín 2 chars)"
  //   101     -> 500 INTERNAL  detail="UserName: muito longo (max 100 chars)"
  //   120     -> 500 INTERNAL
  //   121     -> 400 VALIDATION_ERROR   (os dois recusam)
  //
  // É 500 porque o VO lança `Error` puro, e `mapExceptionToHttp` não o
  // conhece: cai no `return` final (500 INTERNAL). O `detail` ainda vaza
  // a mensagem interna do VO na resposta ao cliente.
  it.each([
    { rotulo: '1 char (abaixo do VO)', nome: 'A' },
    { rotulo: '101 chars (acima do VO)', nome: 'A'.repeat(101) },
    { rotulo: '120 chars (acima do VO)', nome: 'A'.repeat(120) },
  ])('POST com nome $rotulo -> 400 VALIDATION_ERROR, não 500', async ({ nome }) => {
    const { app } = e2e;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome, email: 'valido@exemplo.com' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { code: string; detail: string };
    expect(body.code).toBe('VALIDATION_ERROR');
    // A mensagem interna do VO (`UserName: muito curto (mín 2 chars)`) não
    // pode vazar na resposta: o cliente precisa de uma instrução, não da
    // string de uma assertção de teste de outra camada.
    expect(body.detail).not.toMatch(/UserName:|Email:/);
  });

  // Este é o caso que dá DENTES ao conserto. Sem ele, alinhar os números
  // do Zod com os do VO já deixa a suíte inteira verde: o boundary passa
  // a rejeitar antes de o VO ser chamado, e o `UserValidationException`
  // nunca é lançado — MEDIDO, a mutação que faz o VO voltar a `Error`
  // puro produz **9 passed** aqui.
  //
  // A assimetria que sobra: o Zod conta caracteres CRUS e o VO conta os
  // já aparados. `' A '` tem 3 chars (passa `min(2)`), mas aparado fica
  // `'A'`, com 1 — e aí quem recusa é o VO. MEDIDO com o VO mutado:
  // `" A "` -> 500, `"   A   "` -> 500, `"\tA\t"` -> 500.
  it.each([
    { rotulo: 'espaço nas pontas', nome: ' A ' },
    { rotulo: 'muitos espaços', nome: '   A   ' },
    { rotulo: 'tab nas pontas', nome: '\tA\t' },
  ])('POST com nome "$rotulo" -> 400, não 500 (assimetria de trim)', async ({ nome }) => {
    const { app } = e2e;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome, email: 'valido@exemplo.com' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as {
      code: string;
      errors?: { field: string; message: string; code: string }[];
    };
    expect(body.code).toBe('VALIDATION_ERROR');
    // O `errors[]` não é decoração. MEDIDO no consumidor: o Server Action
    // do web (`app/users/novo/actions.ts`, `estadoDeErro`) mapeia cada
    // `errors[].field` para o erro do campo; e quando a lista vem VAZIA
    // cai em `formError: ERRO_GENERICO`. Um 400 sem `errors[]` deixa a
    // pessoa com "erro genérico" num erro que é inteiramente dela — o
    // mesmo sintoma de "passa pelo motivo errado", agora na ponta.
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors?.some((e) => e.field === 'nome')).toBe(true);
  });

  // MEDIDO: este teste NÃO pega o alargamento do limite. Com o schema
  // voltando a `.max(255)`, ele continua **12 passed** — o boundary
  // aceita, o VO recusa, e o `UserValidationException` devolve 400, o
  // mesmo status que o teste afirma. Quem pega é
  // `users.schemas.spec.ts` (1 de 3 vermelho, nomeando `len=255`).
  //
  // Ele fica porque afirma o que o cliente recebe, que é uma coisa
  // diferente do que o spec de paridade mede — mas afirmar que protege
  // o limite seria uma afirmação que a medição desmente.
  it('POST com email de 255 chars -> 400 VALIDATION_ERROR, não 500', async () => {
    const { app } = e2e;
    // Mesma classe do nome: o Zod aceita `.max(255)` e o `Email` VO recusa
    // `> 254`. MEDIDO 2026-10-08: 255 -> 500 INTERNAL com
    // `detail="Email: tamanho inválido (max 254)"`.
    const local = 'a'.repeat(255 - '@exemplo.com'.length);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Ana', email: `${local}@exemplo.com` },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body) as { code: string; detail: string };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.detail).not.toMatch(/UserName:|Email:/);
  });
});
