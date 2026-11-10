// apps/api/test/e2e/scenarios/16-health-sem-rate-limit.e2e.spec.ts
//
// pt-BR (2026-11-10 — conformidade do system design): a rota de health tem
// teto PRÓPRIO, e não o global.
//
// MEDIDO 2026-11-10 no container `projeto-base-api` (rodando):
//
//   $ curl -i http://localhost:3000/api/v1/health
//   HTTP/1.1 429 Too Many Requests
//   retry-after: 52
//   {"type":"…/TOO_MANY_REQUESTS","detail":"ThrottlerException: Too Many Requests",…}
//
// O desenho (`docs/system-design/operacao.md` §5) afirmava que a rota **não**
// era contada, e DOIS comentários do código (`main.ts` e `app.module.ts`) já
// diziam que existia um `@SkipThrottle()` — que não existia.
//
// ⚠️ O QUE ESTE SPEC PROVE, E POR QUE SÃO DUAS AFIRMAÇÕES
//
// 1. A rota **não** obeyece o teto GLOBAL (100/min): 101 requisições seguidas
//    respondem 200 — e sem a correção a 101ª levaria 429.
// 2. A rota **tem** teto PRÓPRIO (600/min): o abuse não é ilimitado. A rota
//    é pública e faz `SELECT 1` no banco a cada chamada, e uma rota sem
//    teto é um vetor de pressão sobre o pool.
//
// O número do teto é o do código (`LIMITE_DE_HEALTH_POR_MINUTO`), pelo mesmo
// motivo do `09-rate-limit.e2e.spec.ts`: com o número duplicado aqui, baixar
// o teto no código deixa o teste verde mentindo.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import {
  LIMITE_DE_HEALTH_POR_MINUTO,
  JANELA_DE_HEALTH_MS,
} from '../../../src/modules/health/health.controller.js';
import { LIMITE_GLOBAL_POR_MINUTO } from '../../../src/app.module.js';
import { bootstrapE2E, teardownE2E, type E2EContext } from '../test-app.helper.js';

const HEALTH = '/api/v1/health';

describe('A rota de health tem teto próprio, e não o global', () => {
  let e2e: E2EContext;

  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });
  afterAll(async () => {
    await teardownE2E(e2e);
  });

  it(`as ${LIMITE_GLOBAL_POR_MINUTO + 1} requisições (o teto GLOBAL) respondem 200`, async () => {
    // Uma a mais que o teto global: é exatamente a requisição que o rate
    // limit global cortaria, se a rota obeyecesse a ele.
    for (let i = 1; i <= LIMITE_GLOBAL_POR_MINUTO + 1; i += 1) {
      const res = await e2e.app.inject({ method: 'GET', url: HEALTH });
      expect(res.statusCode, `requisição ${i} de ${LIMITE_GLOBAL_POR_MINUTO + 1}`).toBe(200);
    }
  });

  it(`a rota tem teto PRÓPRIO: a ${LIMITE_DE_HEALTH_POR_MINUTO + 1}ª leva 429`, async () => {
    // ⚠️ O balde é por IP: este spec usa um IP DIFERENTE do de cima, para
    // não herdar as requisições que ele já fez (o balde do `127.0.0.1` já
    // está com 101 pedidos).
    const ipDoTeste = { remoteAddress: '203.0.113.7' }; // TEST-NET-3 (RFC 5737)
    for (let i = 1; i <= LIMITE_DE_HEALTH_POR_MINUTO; i += 1) {
      const res = await e2e.app.inject({ method: 'GET', url: HEALTH, ...ipDoTeste });
      expect(res.statusCode, `requisição ${i} de ${LIMITE_DE_HEALTH_POR_MINUTO}`).toBe(200);
    }
    const ultima = await e2e.app.inject({ method: 'GET', url: HEALTH, ...ipDoTeste });
    expect(ultima.statusCode).toBe(429);
    // E a janela é a declarada (60 s) — o `retry-after` diz quanto falta.
    expect(Number(ultima.headers['retry-after'])).toBeLessThanOrEqual(JANELA_DE_HEALTH_MS / 1000);
  });
});
