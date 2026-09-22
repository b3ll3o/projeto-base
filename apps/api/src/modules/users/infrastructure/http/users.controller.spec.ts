// apps/api/src/modules/users/infrastructure/http/users.controller.spec.ts
//
// Teste unitário do UsersController — foco no helper `parseIfMatch`,
// que é o ponto onde RFC 7232 encontra o nosso domain (If-Match →
// expectedVersion). O resto do controller é fina delegação para
// use cases (que têm spec dedicado) + AuditContextStore.run, portanto
// não é re-testado aqui — testes de integração e2e (Task 7.7) cobrem
// o fluxo HTTP ponta-a-ponta.
//
// pt-BR: parseIfMatch é `private`, então acessamos via bracket-notation
// (`ctrl['parseIfMatch'](...)`). É convenção comum para testar métodos
// privados em TS quando eles concentram lógica importante e estável.
//
// O throw é `BadRequestException({ code, detail })` — o `.message` da
// exceção é apenas "Bad Request", por isso verificamos o `code`/`detail`
// via `getResponse()` (que é o payload propagado pelo
// GlobalExceptionFilter para o cliente em RFC 7807).

import { describe, it, expect, beforeEach } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { UsersController } from './users.controller.js';

interface ErrorPayload {
  code?: unknown;
  detail?: unknown;
}

function readErrorPayload(e: unknown): ErrorPayload {
  expect(e).toBeInstanceOf(BadRequestException);
  const resp = (e as BadRequestException).getResponse();
  if (typeof resp !== 'object' || resp === null) {
    throw new Error('expected BadRequestException response to be an object');
  }
  return resp as ErrorPayload;
}

describe('UsersController.parseIfMatch', () => {
  let ctrl: UsersController;

  beforeEach(() => {
    // Stubs `{} as never` para os dois colaboradores — parseIfMatch
    // não chama nem userUseCases nem auditService. Outros testes
    // (integração / e2e Task 7.7) validam o caminho feliz + mutação.
    ctrl = new UsersController({} as never, {} as never);
  });

  it('aceita W/"v3" canônico', () => {
    expect(ctrl['parseIfMatch']('W/"v3"')).toBe(3);
  });

  it('aceita lowercase w/"v3"', () => {
    expect(ctrl['parseIfMatch']('w/"v3"')).toBe(3);
  });

  it('aceita whitespace externo', () => {
    expect(ctrl['parseIfMatch']('  W/"v3"  ')).toBe(3);
  });

  it('aceita versão grande (uint-safe, sem overflow)', () => {
    expect(ctrl['parseIfMatch']('W/"v9007199254740991"')).toBe(9007199254740991);
  });

  it('rejeita undefined com IF_MATCH_REQUIRED', () => {
    let captured: unknown;
    try {
      ctrl['parseIfMatch'](undefined);
    } catch (e) {
      captured = e;
    }
    const payload = readErrorPayload(captured);
    expect(payload.code).toBe('IF_MATCH_REQUIRED');
    expect(String(payload.detail)).toMatch(/ausente/i);
  });

  it('rejeita string vazia com IF_MATCH_REQUIRED', () => {
    let captured: unknown;
    try {
      ctrl['parseIfMatch']('');
    } catch (e) {
      captured = e;
    }
    const payload = readErrorPayload(captured);
    expect(payload.code).toBe('IF_MATCH_REQUIRED');
    expect(String(payload.detail)).toMatch(/ausente/i);
  });

  it('rejeita whitespace puro como ausente', () => {
    let captured: unknown;
    try {
      ctrl['parseIfMatch']('   ');
    } catch (e) {
      captured = e;
    }
    const payload = readErrorPayload(captured);
    expect(payload.code).toBe('IF_MATCH_REQUIRED');
    expect(String(payload.detail)).toMatch(/ausente/i);
  });

  it('rejeita formato sem prefixo W/ (ex: "v3")', () => {
    let captured: unknown;
    try {
      ctrl['parseIfMatch']('"v3"');
    } catch (e) {
      captured = e;
    }
    const payload = readErrorPayload(captured);
    expect(payload.code).toBe('IF_MATCH_INVALID');
    expect(String(payload.detail)).toMatch(/inválido/i);
  });

  it('rejeita formato sem aspas (W/v3)', () => {
    let captured: unknown;
    try {
      ctrl['parseIfMatch']('W/v3');
    } catch (e) {
      captured = e;
    }
    const payload = readErrorPayload(captured);
    expect(payload.code).toBe('IF_MATCH_INVALID');
    expect(String(payload.detail)).toMatch(/inválido/i);
  });

  it('rejeita formato com versão não-numérica', () => {
    for (const raw of ['W/"v3abc"', 'W/"vabc"', 'W/"v"']) {
      let captured: unknown;
      try {
        ctrl['parseIfMatch'](raw);
      } catch (e) {
        captured = e;
      }
      const payload = readErrorPayload(captured);
      expect(payload.code).toBe('IF_MATCH_INVALID');
      expect(String(payload.detail)).toMatch(/inválido/i);
    }
  });

  it('rejeita prefixo forte (etag strong sem W/)', () => {
    let captured: unknown;
    try {
      ctrl['parseIfMatch']('"v3"');
    } catch (e) {
      captured = e;
    }
    const payload = readErrorPayload(captured);
    expect(payload.code).toBe('IF_MATCH_INVALID');
    expect(String(payload.detail)).toMatch(/inválido/i);
  });

  it('payload de erro sempre traz code (string) + detail (string não-vazio)', () => {
    let captured: unknown;
    try {
      ctrl['parseIfMatch']('"v3"');
    } catch (e) {
      captured = e;
    }
    const payload = readErrorPayload(captured);
    expect(typeof payload.code).toBe('string');
    expect(typeof payload.detail).toBe('string');
    expect((payload.detail as string).length).toBeGreaterThan(0);
  });
});
