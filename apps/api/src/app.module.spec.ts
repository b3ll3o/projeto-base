// apps/api/src/app.module.spec.ts
//
// pt-BR (2026-11-10 — conformidade do system design): a REDAÇÃO do log.
//
// O QUE ESTE ARQUIVO PROVA
//
// A chave de idempotência é do cliente e é PARTE da capacidade de replay
// (junto com o corpo e o ator): um log que a traz em claro entrega a
// capacidade. O ADR-0011 §11 afirma que o header entra na redação do
// `pino` — e este spec é o instrumento que torna a afirmação MEDIDA.
//
// ⚠️ O spec aplica os MESMOS caminhos que o `app.module.ts` aplica (o
// `REDACT_PATHS` exportado), e não uma cópia: uma cópia passaria verde
// com a redação quebrada no código.
//
// ⚠️ O `pino` é carregado com `createRequire` (o mesmo caminho do
// `tracing-pino.spec.ts`) — o `import` estático de um CJS num projeto ESM
// traz o namespace, e não a função.

import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import type pinoType from 'pino';

import { REDACT_PATHS } from './app.module.js';

const req = createRequire(import.meta.url);
const pino = req('pino') as typeof pinoType;

describe('A redação do log (REDACT_PATHS)', () => {
  it('a chave de idempotência NÃO sai em claro — nem o `authorization` nem o `cookie`', () => {
    const capturadas: string[] = [];
    const stream = {
      write: (s: string) => {
        capturadas.push(s);
      },
    };
    const log = pino({ redact: [...REDACT_PATHS] }, stream);

    log.info(
      {
        req: {
          headers: {
            authorization: 'Bearer segredo-do-token',
            cookie: 'sessao=segreda',
            'idempotency-key': 'chave-do-cliente',
          },
        },
      },
      'pedido',
    );

    const saida = capturadas.join('');
    expect(saida).not.toContain('chave-do-cliente');
    expect(saida).not.toContain('Bearer segredo-do-token');
    expect(saida).not.toContain('sessao=segreda');
    // E a redação ACONTECEU — o pino marca o valor redigido, e é esse
    // marcador que diz que o caminho casou (e não que o header não veio).
    expect(saida).toContain('[Redacted]');
  });

  it('a redação é DIRIGIDA: um header que não está na lista sai em claro', () => {
    // ⚠️ Sem esta afirmação, uma redação que redigisse TUDO também
    // passaria no teste de cima — e a lista viraria decorativa. O pino
    // aceita as duas formas do caminho com traço (`req.headers["x"]` e
    // `req.headers.x`); o que o spec trava é que o CAMINHO casa com o
    // header, e não com o prefixo dele.
    const capturadas: string[] = [];
    const log = pino(
      { redact: [...REDACT_PATHS] },
      {
        write: (s: string) => {
          capturadas.push(s);
        },
      },
    );

    log.info(
      { req: { headers: { 'x-request-id': 'req-42', 'idempotency-key': 'chave-do-cliente' } } },
      'pedido',
    );

    const saida = capturadas.join('');
    expect(saida).toContain('req-42');
    expect(saida).not.toContain('chave-do-cliente');
  });
});
