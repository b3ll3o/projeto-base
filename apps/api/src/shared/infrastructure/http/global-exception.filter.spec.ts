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

import { describe, it, expect } from 'vitest';
import type { FastifyAdapter } from '@nestjs/platform-fastify';
import type { ArgumentsHost } from '@nestjs/common';
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
  id: string;
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
