// apps/api/test/e2e/scenarios/09-rate-limit.e2e.spec.ts
//
// MEDIDO 2026-10-14: sem limite por conta, `POST /auth/login` respondia 201 (ou
// 401 para senha errada) em 100 requisições/minuto — o teto GLOBAL que veio
// do `@nestjs/throttler` (main, PR #80). Esse teto é por IP, e é o teto errado
// para o ataque que importa:
//
//   O ataque de brute force é "muitas senhas contra UM e-mail". Com chave por
//   IP, um atacante distribuído (N máquinas) nunca esgota o bucket de nenhuma
//   delas, e um IP único de verdade (NAT de escritório, VPN) tranca a rede
//   inteira atrás de um usuário legítimo que esqueceu a senha uma vez.
//
// A chave certa é `ip:email`: o atacante esgota o bucket **da conta que está
// atacando**, sem travar os vizinhos da mesma rede.
//
// ⚠️ Este spec importa `LIMITE_LOGIN_POR_MINUTO` do código de produção em vez
// de escrever o número. Razão medida, não estética: `users.e2e.spec.ts` faz 7
// logins num app e o pior arquivo da suíte passaria raspando num limite
// baixo. Com o número duplicado aqui, baixar o limite no código deixa o teste
// verde mentindo — que é a forma mais barata de um gate não medir nada.

import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';

import { LIMITE_LOGIN_POR_MINUTO } from '../../../src/modules/auth/infrastructure/http/auth.controller.js';
import {
  bootstrapE2E,
  cleanE2EDatabase,
  teardownE2E,
  type E2EContext,
} from '../test-app.helper.js';

const LOGIN = '/api/v1/auth/login';

async function tentarLogin(
  e2e: E2EContext,
  email: string,
  senha = 'senha-errada-de-proposito',
): Promise<number> {
  const res = await e2e.app.inject({
    method: 'POST',
    url: LOGIN,
    payload: { email, senha },
  });
  return res.statusCode;
}

describe('Rate limiting do login (T-B)', () => {
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

  it(`corta a ${LIMITE_LOGIN_POR_MINUTO}ª tentativa contra a MESMA conta com 429`, async () => {
    const email = 'alvo-do-bruteforce@projeto.test';

    // Até o limite, o login responde 401 (senha errada) — e 401, não 429, é
    // o que diz "a credencial está errada". O corte tem de chegar DEPOIS.
    for (let i = 1; i <= LIMITE_LOGIN_POR_MINUTO; i += 1) {
      expect(await tentarLogin(e2e, email), `tentativa ${i} de ${LIMITE_LOGIN_POR_MINUTO}`).toBe(
        401,
      );
    }

    // A tentativa seguinte é a que o bucket tem de recusar.
    expect(await tentarLogin(e2e, email)).toBe(429);
  });

  it('o corte é POR CONTA: a conta B não herda o bucket da conta A', async () => {
    const alvoA = 'conta-a-exausta@projeto.test';
    for (let i = 0; i < LIMITE_LOGIN_POR_MINUTO; i += 1) {
      await tentarLogin(e2e, alvoA);
    }
    expect(await tentarLogin(e2e, alvoA)).toBe(429);

    // ⚠️ Esta é a afirmação que separa "limitou por IP" de "limitou por conta".
    // Se o `getTracker` voltar a ser o IP, as duas linhas acima continuam
    // verdes e SÓ esta cai — porque o e2e inteiro vem de 127.0.0.1. Um guard
    // que só prova o 429 prova o teto, nunca a chave.
    expect(await tentarLogin(e2e, 'conta-b-intacta@projeto.test')).toBe(401);
  });

  it('o corpo do 429 não diz se a conta existe (não vira oráculo de enumeração)', async () => {
    const email = 'conta-inexistente-probada@projeto.test';
    for (let i = 0; i < LIMITE_LOGIN_POR_MINUTO; i += 1) {
      await tentarLogin(e2e, email);
    }
    const res = await e2e.app.inject({
      method: 'POST',
      url: LOGIN,
      payload: { email, senha: 'senha-errada-de-proposito' },
    });
    expect(res.statusCode).toBe(429);

    // Um 429 que nomeia "usuário não encontrado" transforma o rate limit num
    // enumerador de contas — a proteção vira o ataque.
    const corpo = res.json<{ message?: unknown; detail?: unknown }>();
    expect(JSON.stringify(corpo).toLowerCase()).not.toMatch(
      /não (foi )?encontrad|not found|inexistente/,
    );
  });
});
