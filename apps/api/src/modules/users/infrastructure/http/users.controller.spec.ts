// apps/api/src/modules/users/infrastructure/http/users.controller.spec.ts
//
// Teste unitário do UsersController — cobre o escopo completo:
//
//   1. Helper `parseIfMatch` (ponto onde RFC 7232 encontra o nosso
//      domain: If-Match → expectedVersion). Cobre regex canônico W/"v<n>"
//      (case-insensitive, whitespace-tolerant, uint-safe) e a surface
//      de erro RFC 7807 (`code`/`detail` via `getResponse()`).
//
//   2. Bodies dos handlers HTTP (create / update / remove / restore /
//      list / findOne / history) delegando para `userUseCases` /
//      `auditService` via stubs.
//
//   3. Verificação de wrapping em `AuditContextStore.run`:
//      • Endpoints mutantes (create/update/remove/restore) são envoltos;
//      • Endpoints read (list/findOne/history) NÃO são envoltos.
//
//   4. Assertions de ETag/status nos endpoints mutantes:
//      • create/restore setam `ETag: W/"v<n>"` + status 201;
//      • update seta ETag (status default 200, não setado);
//      • remove NÃO seta ETag nem status (204 sem corpo).
//
// pt-BR: parseIfMatch é `private`, então acessamos via bracket-notation
// (`ctrl['parseIfMatch'](...)`). É convenção comum para testar métodos
// privados em TS quando eles concentram lógica importante e estável.
//
// O throw é `BadRequestException({ code, detail })` — o `.message` da
// exceção é apenas "Bad Request", por isso verificamos o `code`/`detail`
// via `getResponse()` (que é o payload propagado pelo
// GlobalExceptionFilter para o cliente em RFC 7807).

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { CreateUserDto, CreateUserSchema, UpdateUserSchema } from './users.schemas.js';
import { ZodValidationPipe } from '../../../../shared/infrastructure/http/zod-validation.pipe.js';
import { AuditContextStore } from '../../../../shared/audit/shared/audit-context-store.js';
import type { UserUseCases } from '../../application/user-use-cases.js';
import type { AuditServicePort } from '../../../../shared/audit/application/audit-service.port.js';

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

// ───────────────────────────────────────────────────────────────────────────
// Stubs/helpers para testar os handlers HTTP delegando ao use case.
// ───────────────────────────────────────────────────────────────────────────

interface ReplyStub {
  header: Mock;
  status: Mock;
}

function makeReply(): ReplyStub {
  return {
    header: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  };
}

interface UserUseCasesStub {
  criarUser: Mock;
  listar: Mock;
  obterPorId: Mock;
  atualizarNome: Mock;
  softDelete: Mock;
  restaurar: Mock;
}

function makeUserUseCasesStub(): UserUseCasesStub {
  return {
    criarUser: vi.fn(),
    listar: vi.fn(),
    obterPorId: vi.fn(),
    atualizarNome: vi.fn(),
    softDelete: vi.fn(),
    restaurar: vi.fn(),
  };
}

function makeAuditStub(): { listHistory: Mock } {
  return {
    listHistory: vi.fn(),
  };
}

const fakeUserOutput = {
  id: '0190a8b6-0000-7000-8000-000000000001',
  nome: 'João',
  email: 'joao@example.com',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  version: 7,
  deletedAt: null,
  isDeleted: false,
};

describe('UsersController — handlers HTTP', () => {
  let useCases: UserUseCasesStub & UserUseCases;
  let audit: { listHistory: Mock } & AuditServicePort;
  let reply: ReplyStub;
  let ctrl: UsersController;

  beforeEach(() => {
    useCases = makeUserUseCasesStub() as unknown as UserUseCasesStub & UserUseCases;
    audit = makeAuditStub() as unknown as { listHistory: Mock } & AuditServicePort;
    reply = makeReply();
    ctrl = new UsersController(useCases, audit);
  });

  it('create() wrapa em AuditContextStore.run e seta ETag + status 201', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    useCases.criarUser.mockResolvedValue(fakeUserOutput);

    const input: CreateUserDto = { nome: 'João', email: 'joao@example.com' };
    const result = await ctrl.create(input, reply as never);

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(useCases.criarUser).toHaveBeenCalledWith(input);
    expect(reply.header).toHaveBeenCalledWith('ETag', 'W/"v7"');
    expect(reply.status).toHaveBeenCalledWith(201);
    expect(result).toBe(fakeUserOutput);
    runSpy.mockRestore();
  });

  it('list() NÃO wrapa em AuditContextStore.run (read path)', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    useCases.listar.mockResolvedValue({ items: [], nextCursor: null });

    const result = await ctrl.list(undefined, '20');

    expect(runSpy).not.toHaveBeenCalled();
    expect(useCases.listar).toHaveBeenCalledWith({
      cursor: null,
      limit: 20,
      includeDeleted: false,
    });
    expect(result).toEqual({ items: [], nextCursor: null });
    runSpy.mockRestore();
  });

  it('list() passa cursor quando fornecido', async () => {
    useCases.listar.mockResolvedValue({ items: [], nextCursor: null });
    await ctrl.list('cur-1', '5');
    expect(useCases.listar).toHaveBeenCalledWith({
      cursor: 'cur-1',
      limit: 5,
      includeDeleted: false,
    });
  });

  it('findOne() NÃO wrapa em AuditContextStore.run', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    useCases.obterPorId.mockResolvedValue(fakeUserOutput);

    await ctrl.findOne('u-1');

    expect(runSpy).not.toHaveBeenCalled();
    expect(useCases.obterPorId).toHaveBeenCalledWith({ id: 'u-1' });
    runSpy.mockRestore();
  });

  it('update() parseia If-Match, wrapa em run e seta ETag', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    useCases.atualizarNome.mockResolvedValue({ ...fakeUserOutput, version: 8 });

    await ctrl.update('u-1', { novoNome: 'Maria' }, 'W/"v7"', reply as never);

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(useCases.atualizarNome).toHaveBeenCalledWith({
      id: 'u-1',
      novoNome: 'Maria',
      expectedVersion: 7,
    });
    expect(reply.header).toHaveBeenCalledWith('ETag', 'W/"v8"');
    expect(reply.status).not.toHaveBeenCalled();
    runSpy.mockRestore();
  });

  it('update() propaga BadRequestException quando If-Match ausente', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    await expect(
      ctrl.update('u-1', { novoNome: 'x' }, undefined as unknown as string, reply as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(runSpy).not.toHaveBeenCalled();
    expect(useCases.atualizarNome).not.toHaveBeenCalled();
    runSpy.mockRestore();
  });

  it('update() rejeita body sem novoNome com NOVO_NOME_REQUIRED', async () => {
    // pt-BR: schema aceita `{}` (novoNome opcional, forward-compat) mas
    // o controller exige-o hoje e devolve 400 NOVO_NOME_REQUIRED antes
    // de chamar o use case.
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    let captured: unknown;
    try {
      await ctrl.update('u-1', {} as never, 'W/"v7"', reply as never);
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(BadRequestException);
    const payload = readErrorPayload(captured);
    expect(payload.code).toBe('NOVO_NOME_REQUIRED');
    expect(String(payload.detail)).toMatch(/obrigat/i);
    expect(runSpy).not.toHaveBeenCalled();
    expect(useCases.atualizarNome).not.toHaveBeenCalled();
    runSpy.mockRestore();
  });

  it('remove() parseia If-Match e wrapa em run, NÃO seta ETag', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    useCases.softDelete.mockResolvedValue(undefined);

    await ctrl.remove('u-1', 'W/"v7"');

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(useCases.softDelete).toHaveBeenCalledWith({
      id: 'u-1',
      reason: null,
      expectedVersion: 7,
    });
    expect(reply.header).not.toHaveBeenCalled();
    expect(reply.status).not.toHaveBeenCalled();
    runSpy.mockRestore();
  });

  it('remove() propaga BadRequestException quando If-Match malformado', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    await expect(ctrl.remove('u-1', '"v3"')).rejects.toBeInstanceOf(BadRequestException);
    expect(runSpy).not.toHaveBeenCalled();
    expect(useCases.softDelete).not.toHaveBeenCalled();
    runSpy.mockRestore();
  });

  it('restore() parseia If-Match, wrapa em run, seta ETag + status 201', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    useCases.restaurar.mockResolvedValue({ ...fakeUserOutput, version: 9 });

    await ctrl.restore('u-1', 'W/"v8"', reply as never);

    expect(runSpy).toHaveBeenCalledTimes(1);
    expect(useCases.restaurar).toHaveBeenCalledWith({ id: 'u-1', expectedVersion: 8 });
    expect(reply.header).toHaveBeenCalledWith('ETag', 'W/"v9"');
    expect(reply.status).toHaveBeenCalledWith(201);
    runSpy.mockRestore();
  });

  it('history() NÃO wrapa em AuditContextStore.run e delega para auditService.listHistory', async () => {
    const runSpy = vi.spyOn(AuditContextStore, 'run');
    audit.listHistory.mockResolvedValue({ entries: [], nextCursor: null });

    const result = await ctrl.history('u-1', undefined, '20');

    expect(runSpy).not.toHaveBeenCalled();
    expect(audit.listHistory).toHaveBeenCalledWith({
      entityName: 'User',
      entityId: 'u-1',
      cursor: null,
      limit: 20,
    });
    expect(result).toEqual({ entries: [], nextCursor: null });
    runSpy.mockRestore();
  });

  it('history() propaga cursor quando fornecido', async () => {
    audit.listHistory.mockResolvedValue({ entries: [], nextCursor: null });
    await ctrl.history('u-1', 'cur-1', '5');
    expect(audit.listHistory).toHaveBeenCalledWith({
      entityName: 'User',
      entityId: 'u-1',
      cursor: 'cur-1',
      limit: 5,
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Validação Zod no boundary HTTP (Task 7.4 — defense-in-depth).
//
// pt-BR: o controller declara `@Body(new ZodValidationPipe(CreateUserSchema))`.
// NestJS instancia o pipe no momento do request e propaga
// BadRequestException com code='VALIDATION_ERROR'. Aqui exercitamos
// diretamente pipe+schema (não o método do controller), porque é a
// única forma unitariamente determinística de verificar o schema sem
// montar o TestingModule inteiro — o pipe é puro (stateless) e o
// schema é a fonte de verdade da validação HTTP. Confiamos que o
// framework NestJS invoca o pipe declarado no decorator.
// ───────────────────────────────────────────────────────────────────────────

describe('UsersController — Zod validation at HTTP boundary', () => {
  function captureValidationError(payload: unknown): unknown {
    let captured: unknown;
    try {
      new ZodValidationPipe(CreateUserSchema).transform(payload, { type: 'body' });
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(BadRequestException);
    return captured;
  }

  function captureUpdateError(payload: unknown): unknown {
    let captured: unknown;
    try {
      new ZodValidationPipe(UpdateUserSchema).transform(payload, { type: 'body' });
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(BadRequestException);
    return captured;
  }

  it('create rejeita payload com email vazio (VALIDATION_ERROR)', () => {
    const err = captureValidationError({ nome: 'João', email: '' });
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('create rejeita payload com email em formato inválido', () => {
    const err = captureValidationError({ nome: 'João', email: 'invalid-email' });
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('create rejeita payload sem o campo email', () => {
    const err = captureValidationError({ nome: 'João' });
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('create rejeita payload com nome vazio', () => {
    const err = captureValidationError({ nome: '', email: 'joao@example.com' });
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('create rejeita payload com nome > 120 chars', () => {
    const err = captureValidationError({
      nome: 'x'.repeat(121),
      email: 'joao@example.com',
    });
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('create rejeita payload com email > 255 chars', () => {
    const longLocal = 'a'.repeat(250);
    const err = captureValidationError({
      nome: 'João',
      email: `${longLocal}@example.com`,
    });
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('create aceita payload válido (nome + email RFC 5322)', () => {
    const pipe = new ZodValidationPipe(CreateUserSchema);
    const out = pipe.transform({ nome: 'João', email: 'joao@example.com' }, { type: 'body' });
    expect(out).toEqual({ nome: 'João', email: 'joao@example.com' });
  });

  it('update rejeita novoNome vazio', () => {
    const err = captureUpdateError({ novoNome: '' });
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('update rejeita novoNome com tipo errado (number)', () => {
    const err = captureUpdateError({ novoNome: 42 });
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('update rejeita novoNome > 120 chars', () => {
    const err = captureUpdateError({ novoNome: 'x'.repeat(121) });
    const payload = readErrorPayload(err);
    expect(payload.code).toBe('VALIDATION_ERROR');
  });

  it('update aceita novoNome válido', () => {
    const pipe = new ZodValidationPipe(UpdateUserSchema);
    const out = pipe.transform({ novoNome: 'Maria' }, { type: 'body' });
    expect(out).toEqual({ novoNome: 'Maria' });
  });

  it('update aceita payload sem novoNome (campo opcional)', () => {
    const pipe = new ZodValidationPipe(UpdateUserSchema);
    const out = pipe.transform({}, { type: 'body' });
    expect(out).toEqual({});
  });
});
