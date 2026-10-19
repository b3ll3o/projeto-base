import { describe, it, expect, vi } from 'vitest';
import { traceIdDe, type RequestComTrace } from './trace-id.js';

// pt-BR (#111): a razão de `traceIdDe` existir. Sem ela, o log de bloqueio e o
// corpo do 404 saíam com identificadores DIFERENTES no terceiro ramo — e o
// terceiro ramo é exatamente o caso em que a correlação é o que se pediu.
//
// MEDIDO no código anterior: `registrarBloqueio` usava `... ?? '-'` e o
// `GlobalExceptionFilter` usava `... ?? randomUUID()`. Divergiam sem span OTel e
// sem `request.id`.
describe('traceIdDe — a mesma derivação para o log e para o erro', () => {
  it('sem span e sem request.id, a SEGUNDA chamada devolve o mesmo id da primeira', () => {
    const req: RequestComTrace = {};
    const primeiro = traceIdDe(req);
    const segundo = traceIdDe(req);

    // A asserção que prova a correção: sem gravar no request, estas duas seriam
    // dois `randomUUID()` diferentes — e a divergência é o defeito.
    expect(primeiro).not.toBe('-');
    expect(segundo).toBe(primeiro);
  });

  it('o id fixado fica no request — é o que faz o terceiro ramo convergir', () => {
    const req: RequestComTrace = {};
    const id = traceIdDe(req);
    expect(req.featureFlagTraceId).toBe(id);
  });

  it('request.id tem prioridade sobre o id fixado — Fastify sempre tem', () => {
    const req: RequestComTrace = { id: 'req-fastify' };
    traceIdDe(req); // fixa um UUID que NÃO deve ser usado
    expect(traceIdDe(req)).toBe('req-fastify');
  });

  it('sem request nenhum, deriva um UUID em vez de "-"', () => {
    const id = traceIdDe(undefined);
    // O `'-'` é o que a versão anterior devolvia: um id que não casa com nada,
    // e por isso inútil para correlacionar.
    expect(id).not.toBe('-');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('DOIS requests sem id são dois ids — o cache é por request, não global', () => {
    const a: RequestComTrace = {};
    const b: RequestComTrace = {};
    expect(traceIdDe(a)).not.toBe(traceIdDe(b));
  });

  // Anti-vacuuidade: um gate/função que devolvesse sempre a mesma constante
  // passaria nos dois primeiros testes deste arquivo.
  it('ids fixados são distintos entre chamadas independentes', () => {
    const ids = new Set(Array.from({ length: 5 }, () => traceIdDe({} as RequestComTrace)));
    expect(ids.size).toBe(5);
  });
});
