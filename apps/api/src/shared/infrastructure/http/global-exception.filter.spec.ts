// apps/api/src/shared/infrastructure/http/global-exception.filter.spec.ts
//
// Teste de INTEGRAÇÃO do GlobalExceptionFilter: joga cada application
// exception e verifica status HTTP. Esses testes são o que pune a classe
// de bug "filter mapeia domain mas use case joga application" (Fase 7
// review F1).
//
// pt-BR: para mockar FastifyReply, criamos um stub que captura status
// e corpo. Sem NestJS TestBed aqui — o filter é um ExceptionFilter
// simples (não NestJS managed), então pode ser instanciado direto.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyAdapter } from '@nestjs/platform-fastify';
import { HttpException, Logger } from '@nestjs/common';
import type { ArgumentsHost } from '@nestjs/common';
import type { Span } from '@opentelemetry/api';
import { trace, context } from '@opentelemetry/api';
import { GlobalExceptionFilter } from './global-exception.filter.js';
import {
  ApplicationResourceNotFoundException,
  ApplicationEmailAlreadyInUseException,
  ApplicationConcurrencyException,
  ApplicationResourceDeletedException,
  ApplicationInvalidRestoreException,
  ApplicationValidationException,
} from '../../../modules/users/application/exceptions/application.exceptions.js';

// pt-BR: tipo FastifyReply extraído via Parameters<FastifyAdapter['setHeader']>[0]
// porque o pacote 'fastify' não é dep direta de @projeto/api nesta fase.
type FastifyReply = Parameters<FastifyAdapter['setHeader']>[0];

interface CapturedReply {
  status?: number;
  body?: unknown;
}

interface ReplyStub {
  reply: FastifyReply;
  sent: CapturedReply;
}

function makeReply(): ReplyStub {
  const sent: CapturedReply = {};
  const reply = {
    status(s: number) {
      sent.status = s;
      return {
        send(b: unknown) {
          sent.body = b;
        },
      };
    },
  } as unknown as FastifyReply;
  return { reply, sent };
}

interface RequestStub {
  method: string;
  url: string;
  id?: string;
}

function makeRequest(): RequestStub {
  return { method: 'GET', url: '/api/v1/users/u-1', id: 'trace-1' };
}

function makeHost(reply: FastifyReply, request: RequestStub): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => reply,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
}

interface BodyShape {
  code: string;
  status: number;
  title: string;
  detail: string;
  traceId: string;
}

describe('GlobalExceptionFilter — application-layer integration', () => {
  it('ApplicationResourceNotFoundException → 404 USER_NOT_FOUND', () => {
    const { reply, sent } = makeReply();
    const filter = new GlobalExceptionFilter();
    filter.catch(
      new ApplicationResourceNotFoundException('User', 'u-1'),
      makeHost(reply, makeRequest()),
    );
    expect(sent.status).toBe(404);
    const body = sent.body as BodyShape;
    expect(body.code).toBe('USER_NOT_FOUND');
  });

  it('ApplicationEmailAlreadyInUseException → 409 EMAIL_IN_USE', () => {
    const { reply, sent } = makeReply();
    const filter = new GlobalExceptionFilter();
    filter.catch(
      new ApplicationEmailAlreadyInUseException('a@b.com'),
      makeHost(reply, makeRequest()),
    );
    expect(sent.status).toBe(409);
    const body = sent.body as BodyShape;
    expect(body.code).toBe('EMAIL_IN_USE');
  });

  it('ApplicationConcurrencyException → 412 CONCURRENCY_CONFLICT (HTTP-observable optimistic lock)', () => {
    const { reply, sent } = makeReply();
    const filter = new GlobalExceptionFilter();
    filter.catch(new ApplicationConcurrencyException('User', 3, 5), makeHost(reply, makeRequest()));
    expect(sent.status).toBe(412);
    expect(sent.status).not.toBe(409);
    const body = sent.body as BodyShape;
    expect(body.code).toBe('CONCURRENCY_CONFLICT');
  });

  it('ApplicationResourceDeletedException → 410 USER_DELETED', () => {
    const { reply, sent } = makeReply();
    const filter = new GlobalExceptionFilter();
    filter.catch(
      new ApplicationResourceDeletedException('User', 'u-1'),
      makeHost(reply, makeRequest()),
    );
    expect(sent.status).toBe(410);
    const body = sent.body as BodyShape;
    expect(body.code).toBe('USER_DELETED');
  });

  it('ApplicationInvalidRestoreException → 422 INVALID_RESTORE', () => {
    const { reply, sent } = makeReply();
    const filter = new GlobalExceptionFilter();
    filter.catch(new ApplicationInvalidRestoreException('msg'), makeHost(reply, makeRequest()));
    expect(sent.status).toBe(422);
    const body = sent.body as BodyShape;
    expect(body.code).toBe('INVALID_RESTORE');
  });

  it('ApplicationValidationException → 400 VALIDATION_ERROR', () => {
    const { reply, sent } = makeReply();
    const filter = new GlobalExceptionFilter();
    filter.catch(
      new ApplicationValidationException('name', 'empty'),
      makeHost(reply, makeRequest()),
    );
    expect(sent.status).toBe(400);
    const body = sent.body as BodyShape;
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});

describe('GlobalExceptionFilter — HttpException branches', () => {
  it('HttpException com response-objeto preserva code/detail/errors[]', () => {
    const { reply, sent } = makeReply();
    const filter = new GlobalExceptionFilter();
    const exc = new HttpException(
      {
        code: 'CUSTOM_CODE',
        detail: 'detalhe custom',
        title: 'Título custom',
        errors: [{ field: 'x', message: 'err', code: 'e_invalid' }],
      },
      422,
    );
    filter.catch(exc, makeHost(reply, makeRequest()));
    expect(sent.status).toBe(422);
    const body = sent.body as BodyShape & { errors: unknown };
    expect(body.code).toBe('CUSTOM_CODE');
    expect(body.detail).toBe('detalhe custom');
    expect(Array.isArray(body.errors)).toBe(true);
  });

  it('HttpException com response-objeto cai em detail=message quando nem detail nem code estão presentes', () => {
    const { reply, sent } = makeReply();
    const filter = new GlobalExceptionFilter();
    const exc = new HttpException({ message: 'only-message' }, 400);
    filter.catch(exc, makeHost(reply, makeRequest()));
    const body = sent.body as BodyShape;
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.detail).toBe('only-message');
  });

  it('HttpException com response-string usa code do status e detail=string', () => {
    const { reply, sent } = makeReply();
    const filter = new GlobalExceptionFilter();
    const exc = new HttpException('falha generica', 503);
    filter.catch(exc, makeHost(reply, makeRequest()));
    expect(sent.status).toBe(503);
    const body = sent.body as BodyShape;
    expect(body.code).toBe('SERVICE_UNAVAILABLE');
    expect(body.detail).toBe('falha generica');
  });

  it('non-HttpException delega para mapExceptionToHttp (Erro puro → 500 INTERNAL)', () => {
    const { reply, sent } = makeReply();
    const filter = new GlobalExceptionFilter();
    filter.catch(new Error('boom'), makeHost(reply, makeRequest()));
    expect(sent.status).toBe(500);
    const body = sent.body as BodyShape;
    expect(body.code).toBe('INTERNAL');
    expect(body.detail).toBe('boom');
  });

  it('non-HttpException não-Error (string) cai em detail=String(exception)', () => {
    const { reply, sent } = makeReply();
    const filter = new GlobalExceptionFilter();
    filter.catch('literal-error', makeHost(reply, makeRequest()));
    expect(sent.status).toBe(500);
    const body = sent.body as BodyShape;
    expect(body.detail).toBe('literal-error');
  });

  it('instance é "METHOD URL" e traceId vem do request.id', () => {
    const { reply, sent } = makeReply();
    const filter = new GlobalExceptionFilter();
    filter.catch(
      new Error('x'),
      makeHost(reply, { method: 'POST', url: '/api/v1/users', id: 't-42' }),
    );
    const body = sent.body as BodyShape & { instance: string; traceId: string };
    expect(body.instance).toBe('POST /api/v1/users');
    expect(body.traceId).toBe('t-42');
  });

  describe('W3C traceId via OTel active span', () => {
    // pt-BR: tipado como `MockInstance` (forma genérica) para que Type-
    // Script não tente inferir o overload específico de `vi.spyOn`
    // (que exige `PropertyKey extends never` quando o objeto é a
    // singleton `TraceAPI`). Variável guarda o spy entre `it`s.
    let getSpanSpy: import('vitest').MockInstance<(...args: never[]) => unknown> | undefined;

    beforeEach(() => {
      // pt-BR: default sem span ativo — restaura spy se algum teste ante-
      // rior deixou pendurado. Cada teste que quiser um span ativo deve
      // instalar seu próprio spy dentro do `it` para clareza.
      if (getSpanSpy) {
        getSpanSpy.mockRestore();
        getSpanSpy = undefined;
      }
    });

    afterEach(() => {
      if (getSpanSpy) {
        getSpanSpy.mockRestore();
        getSpanSpy = undefined;
      }
    });

    it('extrai traceId W3C (32 hex chars) do span ativo quando há span', () => {
      // pt-BR: W3C traceId são exatamente 32 chars hex minúsculos.
      // Spy em `trace.getSpan` (do módulo singleton) faz o filter usar
      // o traceId do span ativo em vez de request.id.
      const fakeSpan = {
        spanContext: () => ({
          traceId: 'a'.repeat(32),
          spanId: 'b'.repeat(16),
          traceFlags: 0x01,
        }),
      } as unknown as Span;
      getSpanSpy = vi.spyOn(trace, 'getSpan').mockReturnValue(fakeSpan);

      const { reply, sent } = makeReply();
      const filter = new GlobalExceptionFilter();
      filter.catch(new Error('boom-otel'), makeHost(reply, makeRequest()));
      const body = sent.body as BodyShape & { traceId: string };
      expect(body.traceId).toBe('a'.repeat(32));
      expect(body.traceId).toHaveLength(32);
      expect(body.traceId).toMatch(/^[0-9a-f]{32}$/);
    });

    it('cai no request.id quando NÃO há span ativo (preserva t-42)', () => {
      // pt-BR: sem spy, trace.getSpan() retorna undefined (noop default).
      // Filter deve cair no fallback `request.id ?? randomUUID()`.
      const { reply, sent } = makeReply();
      const filter = new GlobalExceptionFilter();
      filter.catch(
        new Error('x'),
        makeHost(reply, { method: 'POST', url: '/api/v1/users', id: 't-42' }),
      );
      const body = sent.body as BodyShape & { traceId: string };
      expect(body.traceId).toBe('t-42');
    });

    it('cai no randomUUID quando NÃO há span e request.id ausente', () => {
      // pt-BR: request sem `id` → randomUUID (último fallback).
      const { reply, sent } = makeReply();
      const filter = new GlobalExceptionFilter();
      filter.catch(new Error('x'), makeHost(reply, { method: 'GET', url: '/api/v1/x' }));
      const body = sent.body as BodyShape & { traceId: string };
      // UUID v4: 36 chars com hífens
      expect(body.traceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    });
  });

  it('5xx loga via Logger.error com stack trace', () => {
    const { reply } = makeReply();
    const filter = new GlobalExceptionFilter();
    const err = new Error('server-boom');
    const spy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter.catch(err, makeHost(reply, makeRequest()));
    expect(spy).toHaveBeenCalled();
    const firstCall = spy.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (firstCall) {
      const [message, stack] = firstCall;
      expect(String(message)).toContain('trace-1');
      expect(String(message)).toContain('GET');
      expect(String(message)).toContain('/api/v1/users/u-1');
      expect(typeof stack === 'string' || stack === undefined).toBe(true);
    }
    spy.mockRestore();
  });

  it('4xx NÃO loga via Logger.error', () => {
    const { reply } = makeReply();
    const filter = new GlobalExceptionFilter();
    const spy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter.catch(new HttpException('nope', 404), makeHost(reply, makeRequest()));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reply.status(status).send(problem) é chamado com status correto', () => {
    const { reply, sent } = makeReply();
    const filter = new GlobalExceptionFilter();
    filter.catch(new Error('send-me'), makeHost(reply, makeRequest()));
    expect(sent.status).toBe(500);
    expect(sent.body).toBeDefined();
    const body = sent.body as BodyShape;
    expect(body.status).toBe(500);
    expect(body.code).toBe('INTERNAL');
    expect(body.title).toBe('Erro interno');
  });

  it('type inclui code no formato https://errors.projeto.com/<CODE>', () => {
    const { reply, sent } = makeReply();
    const filter = new GlobalExceptionFilter();
    filter.catch(new Error('typed'), makeHost(reply, makeRequest()));
    const body = sent.body as BodyShape & { type: string };
    expect(body.type).toBe('https://errors.projeto.com/INTERNAL');
  });
});
