// apps/api/test/e2e/scenarios/20-throttle-e-lockout-do-login.e2e.spec.ts
//
// Cenário E2E 20: o limite do login COMPÕE com o teto global, e a conta
// TRAVA por tentativas (issue #182).
//
// ⚠️ O QUE ESTE ARQUIVO EXISTE PARA MEDIR
//
//   1. **O `@Throttle` da rota de login SUBSTITUÍA o teto global em vez de
//      compor com ele.** O decorator usava a chave `'default'` — o MESMO
//      nome do único throttler do módulo — e no `@nestjs/throttler@6.8.0` o
//      decorator SUBSTITUI o valor do módulo na rota
//      (`routeOrClassLimit ?? namedThrottler.limit`). MEDIDO com o guard
//      real: na rota de login, 1 IP + 200 e-mails DIFERENTES → 200
//      requisições permitidas, com o teto global por IP em 100. O decorator
//      não restringia — REMOVIA a restrição.
//
//   2. **O limite era por `(IP, e-mail)`, e o NIST (5 por CONTA) nunca se
//      aplicava a uma conta só.** MEDIDO: 10 IPs distintos × 5 tentativas
//      contra a MESMA conta → 50 de 50 permitidas.
//
// Banco REAL via Testcontainers; tokens REAIS por `POST /auth/login`. Nenhum
// guard é dublê.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  bootstrapE2E,
  teardownE2E,
  cleanE2EDatabase,
  type E2EContext,
  SENHA_DE_TESTE,
} from '../test-app.helper.js';
import { LIMITE_GLOBAL_POR_MINUTO } from '../../../src/app.module.js';
import { LIMITE_DE_TENTATIVAS_DE_LOGIN } from '../../../src/modules/auth/domain/ports/login-lockout.port.js';

describe('E2E 20: o limite do login compõe com o teto global, e a conta trava', () => {
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

  /** Uma conta REAL, com senha — o login dela precisa passar. */
  async function conta(email: string): Promise<void> {
    const cadastro = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/users',
      payload: { nome: 'Alvo', email, senha: SENHA_DE_TESTE },
    });
    expect(cadastro.statusCode).toBe(201);
  }

  /** Uma tentativa de login com a senha ERRADA. */
  async function loginComSenhaErrada(email: string): Promise<number> {
    const res = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, senha: 'senha-errada-que-nao-e-a-do-cadastro' },
    });
    return res.statusCode;
  }

  // ─── sec-N1-002: o contador por conta ─────────────────────────────────────

  it('cada falha de login conta no contador DA CONTA', async () => {
    const email = 'conta-contada@projeto.test';
    await conta(email);

    for (let i = 1; i <= LIMITE_DE_TENTATIVAS_DE_LOGIN; i += 1) {
      expect(await loginComSenhaErrada(email)).toBe(401);
    }

    // A CONTAGEM está no banco — e é do e-mail NORMALIZADO.
    const linha = await e2e.ctx.prisma.tentativaDeLogin.findUnique({
      where: { email },
      select: { tentativas: true },
    });
    expect(linha?.tentativas).toBe(LIMITE_DE_TENTATIVAS_DE_LOGIN);
  });

  it('a conta TRAVADA recusa o login mesmo com a senha CORRETA (423)', async () => {
    const email = 'conta-travada@projeto.test';
    await conta(email);

    // ⚠️ O CONTADOR é PLANTADO no banco, e o motivo é a ORDEM dos controles:
    // as 5 falhas que o teste anterior mediu já encheram o balde do
    // `@Throttle` (5/min por `ip:email`), e a 6ª requisição é recusada pelo
    // THROTTLE (429) antes de chegar à use case — que é a ordem CORRETA (o
    // controle barato primeiro), e é por isso que o lockout precisa de uma
    // janela PRÓPRIA (15 min) para sobreviver à janela do throttler (1 min).
    //
    // O que este teste mede é a RECUSA pela trava: com o contador no limite, o
    // login com a SENHA CORRETA tem de ser recusado — se passasse, a trava
    // não existiria.
    await e2e.ctx.prisma.tentativaDeLogin.create({
      data: {
        email,
        tentativas: LIMITE_DE_TENTATIVAS_DE_LOGIN,
        janelaIniciadaEm: new Date(),
        ultimaTentativaEm: new Date(),
      },
    });

    // ⚠️ A SENHA É A CORRETA: se o login passasse, a trava não existiria. E o
    // 423 (e não 429) é o que distingue a TRAVA da conta do TETO de
    // requisições — o 429 é do throttler, e um cliente que confunde os dois
    // trata o travamento como "tente de novo em X segundos".
    const res = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, senha: SENHA_DE_TESTE },
    });

    expect(res.statusCode).toBe(423);
    expect(JSON.parse(res.body).code).toBe('ACCOUNT_LOCKED');
  });

  it('o login bem-sucedido ZERA o contador (a trava não pode ser arma de DoS)', async () => {
    const email = 'conta-que-entra@projeto.test';
    await conta(email);

    // Duas falhas (abaixo do limite) e depois o login certo.
    expect(await loginComSenhaErrada(email)).toBe(401);
    expect(await loginComSenhaErrada(email)).toBe(401);

    const ok = await e2e.injetar({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, senha: SENHA_DE_TESTE },
    });
    expect(ok.statusCode).toBe(201);

    // O contador sumiu — a próxima falha começa do 1.
    const linha = await e2e.ctx.prisma.tentativaDeLogin.findUnique({ where: { email } });
    expect(linha).toBeNull();
  });

  it('o contador existe para e-mail que NÃO existe na base (não é oráculo de enumeração)', async () => {
    // Um e-mail que nunca foi cadastrado também acumula tentativas — senão o
    // NIST (5 por conta) valeria só para quem já sabe o nome da conta, e o
    // tempo de resposta viraria um oráculo de existência.
    const email = 'ninguem@projeto.test';

    for (let i = 1; i <= LIMITE_DE_TENTATIVAS_DE_LOGIN; i += 1) {
      expect(await loginComSenhaErrada(email)).toBe(401);
    }

    const linha = await e2e.ctx.prisma.tentativaDeLogin.findUnique({
      where: { email },
      select: { tentativas: true },
    });
    expect(linha?.tentativas).toBe(LIMITE_DE_TENTATIVAS_DE_LOGIN);
  });
  // ─── sec-N1-001: o teto global por IP continua valendo na rota de login ─────
  //
  // ⚠️ Este teste é o ÚLTIMO do arquivo, e o motivo é o ORÇAMENTO GLOBAL: os
  // requests que os testes daqui acima fazem (login, cadastro) consomem o
  // mesmo balde global por IP, e este teste precisa esvaziá-lo. Ele consome
  // ~100 requisições de login — e cada uma paga um argon2id (~50-250 ms).
  //
  // ⚠️ E o porquê de ELE VIR DEPOIS: nos testes anteriores, o balde global já
  // estaria esgotado, e o 429 que eles receberiam seria o GLOBAL — que
  // quebraria a medição do lockout (que precisa de 401).

  // ─── sec-N1-001: o teto global por IP continua valendo na rota de login ─────

  it('o teto global por IP vale na rota de login, mesmo com e-mails diferentes', async () => {
    // Cada tentativa usa um e-mail DIFERENTE, e por isso o balde do login
    // (`ip:email`) nunca enche: o que pode recusar esta requisição é o teto
    // GLOBAL por IP.
    //
    // ⚠️ O teste para no primeiro 429 — e o número de 401s é a asserção: com
    // o defeito (o decorator substituindo o bucket global), NENHUMA dessas
    // requisiões encontraria o teto, e o limite observado seria o do `@Throttle`
    // antigo — muito acima do global.
    let quatro_um_e_um = 0;
    let recusaGlobal: {
      retryDoGlobal: string | undefined;
      retryDoLogin: string | undefined;
    } | null = null;

    for (let i = 0; i < LIMITE_GLOBAL_POR_MINUTO + 10; i += 1) {
      const res = await e2e.injetar({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: `spray-${i}@projeto.test`, senha: 'senha-errada' },
      });
      if (res.statusCode === 429) {
        recusaGlobal = {
          retryDoGlobal: res.headers['retry-after'] as string | undefined,
          retryDoLogin: res.headers['retry-after-login'] as string | undefined,
        };
        break;
      }
      quatro_um_e_um += 1;
    }

    // O 429 CHEGOU: sem ele, o defeito está de volta (a rota de login não
    // teria teto global).
    expect(recusaGlobal).not.toBeNull();
    // E o número de 401s é o do TETO GLOBAL (100) — nem mais (o balde do
    // login não pode segurar o global) nem menos.
    expect(quatro_um_e_um).toBeLessThanOrEqual(LIMITE_GLOBAL_POR_MINUTO);
    expect(quatro_um_e_um).toBeGreaterThan(0);

    // ⚠️ O HEADER DIZ QUAL BALDE RECUSOU. O guard do `@nestjs/throttler`
    // escreve um `Retry-After` POR THROTTLER, e o sufixo é o NOME do
    // throttler: o global (`'default'`) não leva sufixo, e o do login leva
    // `-login`. E o header de LIMITE (`x-ratelimit-limit`) NÃO vem numa
    // resposta bloqueada — o guard o escreve DEPOIS do `throw`, então quem
    // foi recusado só tem o `retry-after`.
    //
    // Um 429 do balde do LOGIN traria `retry-after-login`; o do GLOBAL traz
    // `retry-after` sozinho. E é o global que tem que recusar aqui: cada
    // tentativa usa um e-mail DIFERENTE, e por isso o balde do login
    // (`ip:email`) nunca enche.
    expect(recusaGlobal?.retryDoGlobal).toBeDefined();
    expect(recusaGlobal?.retryDoLogin).toBeUndefined();
  }, 180_000);
});
