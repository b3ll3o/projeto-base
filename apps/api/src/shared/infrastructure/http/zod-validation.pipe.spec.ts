// apps/api/src/shared/infrastructure/http/zod-validation.pipe.spec.ts
//
// TDD: cobre ZodValidationPipe — schema válido passa direto; schema
// inválido lança BadRequestException no formato esperado pelo
// GlobalExceptionFilter (code='VALIDATION_ERROR', detail, errors[]
// com field/message/code). Caminho de path vazio vira '(root)' para
// manter UI consistente em formulários. Múltiplos issues do Zod
// produzem múltiplos errors[] (N errors in, N errors out).
//
// pt-BR: usamos z.object com z.string para exercitar o cenário comum
// (DTO de request com campos validados). Os errors[] de ZodError são
// o contrato propagado pelo filter para a UI listar campos inválidos.

import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

interface ValidationErrorItem {
  field: unknown;
  message: unknown;
  code: unknown;
}

interface ErrorPayload {
  code?: unknown;
  detail?: unknown;
  errors?: unknown;
}

function readPayload(e: unknown): ErrorPayload {
  expect(e).toBeInstanceOf(BadRequestException);
  const resp = (e as BadRequestException).getResponse();
  if (typeof resp !== 'object' || resp === null) {
    throw new Error('expected object response');
  }
  return resp as ErrorPayload;
}

describe('ZodValidationPipe — schema válido', () => {
  it('passa o valor parseado através do transform', () => {
    const schema = z.object({ nome: z.string() });
    const pipe = new ZodValidationPipe(schema);
    const out = pipe.transform({ nome: 'João' }, { type: 'body' });
    expect(out).toEqual({ nome: 'João' });
  });

  it('aceita z.any() como schema noop (pass-through)', () => {
    const pipe = new ZodValidationPipe(z.any());
    const payload = { x: 1, y: 'qualquer' };
    expect(pipe.transform(payload, { type: 'body' })).toBe(payload);
  });

  it('preserva tipos do schema genérico (number → number)', () => {
    const schema = z.object({ idade: z.number() });
    const pipe = new ZodValidationPipe(schema);
    const out = pipe.transform({ idade: 42 }, { type: 'body' });
    expect(out).toEqual({ idade: 42 });
  });
});

describe('ZodValidationPipe — schema inválido', () => {
  it('lança BadRequestException com code=VALIDATION_ERROR', () => {
    const pipe = new ZodValidationPipe(z.object({ nome: z.string() }));
    let captured: unknown;
    try {
      pipe.transform({} as unknown, { type: 'body' });
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(BadRequestException);
    const payload = readPayload(captured);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('inclui detail (string não-vazia) para o cliente HTTP', () => {
    const pipe = new ZodValidationPipe(z.object({ nome: z.string() }));
    let captured: unknown;
    try {
      pipe.transform({} as unknown, { type: 'body' });
    } catch (e) {
      captured = e;
    }
    const payload = readPayload(captured);
    expect(typeof payload.detail).toBe('string');
    expect((payload.detail as string).length).toBeGreaterThan(0);
  });

  it('errors[] populado com field/message/code para cada issue', () => {
    const pipe = new ZodValidationPipe(z.object({ nome: z.string() }));
    let captured: unknown;
    try {
      pipe.transform({} as unknown, { type: 'body' });
    } catch (e) {
      captured = e;
    }
    const payload = readPayload(captured);
    expect(Array.isArray(payload.errors)).toBe(true);
    const errors = payload.errors as ValidationErrorItem[];
    expect(errors.length).toBeGreaterThan(0);
    for (const item of errors) {
      expect(typeof item.field).toBe('string');
      expect(typeof item.message).toBe('string');
      expect(typeof item.code).toBe('string');
    }
  });

  it('errors[].field usa o path do ZodError joined com "."', () => {
    const schema = z.object({
      endereco: z.object({ cidade: z.string() }),
    });
    const pipe = new ZodValidationPipe(schema);
    let captured: unknown;
    try {
      pipe.transform({ endereco: { cidade: 42 } } as unknown, { type: 'body' });
    } catch (e) {
      captured = e;
    }
    const payload = readPayload(captured);
    const errors = payload.errors as ValidationErrorItem[];
    expect(errors[0]?.field).toBe('endereco.cidade');
  });

  it('errors[].field é "(root)" quando o path está vazio', () => {
    // z.string() aplicado a um objeto → erro com path vazio.
    const pipe = new ZodValidationPipe(z.string());
    let captured: unknown;
    try {
      pipe.transform({ x: 1 } as unknown, { type: 'body' });
    } catch (e) {
      captured = e;
    }
    const payload = readPayload(captured);
    const errors = payload.errors as ValidationErrorItem[];
    expect(errors[0]?.field).toBe('(root)');
  });

  it('múltiplos issues do ZodError produzem múltiplos errors[]', () => {
    const schema = z.object({
      nome: z.string(),
      idade: z.number(),
      email: z.string().email(),
    });
    const pipe = new ZodValidationPipe(schema);
    let captured: unknown;
    try {
      pipe.transform({} as unknown, { type: 'body' });
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(BadRequestException);
    const payload = readPayload(captured);
    const errors = payload.errors as ValidationErrorItem[];
    expect(errors.length).toBe(3);
    const fields = errors.map((e) => e.field).sort();
    expect(fields).toEqual(['email', 'idade', 'nome']);
  });
});
