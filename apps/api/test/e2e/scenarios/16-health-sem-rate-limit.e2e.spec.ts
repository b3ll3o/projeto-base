// apps/api/test/e2e/scenarios/16-health-sem-rate-limit.e2e.spec.ts
//
// pt-BR (conformidade do system design, 2026-11-10): a rota de health NÃO
// pode ser contada pelo rate limit global.
//
// MEDIDO 2026-11-10 no container `projeto-base-api` (rodando):
//
//   $ curl -i http://localhost:3000/api/v1/health
//   HTTP/1.1 429 Too Many Requests
//   retry-after: 52
//   {"type":"…/TOO_MANY_REQUESTS","detail":"ThrottlerException: Too Many Requests",…}
//
// O desenho (`docs/system-design/operacao.md` §5) afirma que a rota **não**
// é contada, e DOIS comentários do código (`main.ts` e `app.module.ts`)
// afirmavam que existia um `@SkipThrottle()` — que não existia. O doc
// descrevia um controle que o código não tinha.
//
// ⚠️ POR QUE ESTE SPEC EXISTE, E O QUE ELE PROVA:
// o `ThrottlerGuard` é global (`APP_GUARD` em `app.module.ts`), e o
// healthcheck do container (`apps/api/Dockerfile`, a cada 10 s) é o que
// decide se o container está `healthy`. Um probe que recebe 429 derruba o
// container — e, no compose, `depends_on: service_healthy` derruba o que
// depende dele.
//
// ⚠️ O NÚMERO NÃO É DUPLICADO AQUI: o limite vem do código de produção
// (`LIMITE_GLOBAL_POR_MINUTO`), pelo mesmo motivo do
// `09-rate-limit.e2e.spec.ts` — com o número escrito no spec, baixar o
// limite no código deixa o teste verde mentindo.

import { beforeAll, afterAll, describe, expect, it } from 'vitest';

import { LIMITE_GLOBAL_POR_MINUTO } from '../../../src/app.module.js';
import { bootstrapE2E, teardownE2E, type E2EContext } from '../test-app.helper.js';

const HEALTH = '/api/v1/health';

describe('A rota de health não é contada pelo rate limit global', () => {
  let e2e: E2EContext;

  beforeAll(async () => {
    e2e = await bootstrapE2E();
  });
  afterAll(async () => {
    await teardownE2E(e2e);
  });

  it(`responde 200 nas ${LIMITE_GLOBAL_POR_MINUTO + 1} requisições seguidas`, async () => {
    // Uma a mais que o limite global: é exatamente a requisição que o
    // rate limit cortaria, se a rota fosse contada.
    for (let i = 1; i <= LIMITE_GLOBAL_POR_MINUTO + 1; i += 1) {
      const res = await e2e.app.inject({ method: 'GET', url: HEALTH });
      expect(res.statusCode, `requisição ${i} de ${LIMITE_GLOBAL_POR_MINUTO + 1}`).toBe(200);
    }
  });
});
