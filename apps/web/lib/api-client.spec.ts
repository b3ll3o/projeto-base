// apps/web/lib/api-client.spec.ts
//
// TDD: cobre ApiClient.get/post/patch/delete e a classe ApiError.
//
//   • GET/DELETE não passam body (DELETE nunca serializa).
//   • POST/PATCH serializam body via JSON.stringify.
//   • getToken é consultado a cada request:
//       - retorna null → nenhum header Authorization
//       - retorna 'tok' → Authorization: 'Bearer tok'
//   • headers passados via init são mergeados com content-type default.
//   • Resposta não-OK → throw ApiError(message, code, status, problem).
//   • ApiError expõe name='ApiError' + campos públicos code/status/problem.

import { describe, it, expect, vi, type Mock } from 'vitest';
import { ApiClient, ApiError } from './api-client.js';

interface FetchResult {
  ok: boolean;
  status: number;
  json: Mock;
}

function makeFetchOk(body: unknown = { ok: true }): { fetch: Mock; responses: FetchResult[] } {
  const responses: FetchResult[] = [];
  const fetchMock = vi.fn().mockImplementation(() => {
    const r: FetchResult = {
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(body),
    };
    responses.push(r);
    return Promise.resolve(r);
  });
  return { fetch: fetchMock, responses };
}

function makeFetchNotOk(body: Record<string, unknown>, status = 404): { fetch: Mock } {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: vi.fn().mockResolvedValue(body),
  });
  return { fetch: fetchMock };
}

const problemBody = {
  type: 'https://errors.projeto.com/NOT_FOUND',
  title: 'Recurso não encontrado',
  status: 404,
  detail: 'User u-1 não existe',
  instance: 'GET /api/v1/users/u-1',
  code: 'NOT_FOUND',
  traceId: 'tr-42',
};

describe('ApiClient — GET', () => {
  it('GET retorna JSON quando ok', async () => {
    const { fetch: fetchMock } = makeFetchOk({ id: 1 });
    const client = new ApiClient({ baseUrl: 'http://api', getToken: () => 'tok' });
    const result = await client.get('/x', { fetch: fetchMock as unknown as typeof fetch });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api/x',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual({ id: 1 });
  });
});

describe('ApiClient — body handling', () => {
  it('POST envia body JSON-stringified', async () => {
    const { fetch: fetchMock } = makeFetchOk({ created: true });
    const client = new ApiClient({ baseUrl: 'http://api' });
    await client.post('/users', { nome: 'João' }, { fetch: fetchMock as unknown as typeof fetch });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api/users',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ nome: 'João' }),
      }),
    );
  });

  it('PATCH envia body JSON-stringified', async () => {
    const { fetch: fetchMock } = makeFetchOk({ updated: true });
    const client = new ApiClient({ baseUrl: 'http://api' });
    await client.patch(
      '/users/u-1',
      { novoNome: 'Maria' },
      { fetch: fetchMock as unknown as typeof fetch },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api/users/u-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ novoNome: 'Maria' }),
      }),
    );
  });

  it('DELETE NÃO envia body (não chama JSON.stringify)', async () => {
    const { fetch: fetchMock } = makeFetchOk();
    const client = new ApiClient({ baseUrl: 'http://api' });
    await client.delete('/users/u-1', { fetch: fetchMock as unknown as typeof fetch });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('DELETE');
    expect(init.body).toBeUndefined();
  });
});

describe('ApiClient — Authorization header', () => {
  it('getToken retorna null → sem header Authorization', async () => {
    const { fetch: fetchMock } = makeFetchOk();
    const client = new ApiClient({ baseUrl: 'http://api', getToken: () => null });
    await client.get('/x', { fetch: fetchMock as unknown as typeof fetch });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.has('authorization')).toBe(false);
  });

  it('getToken retorna "tok" → Authorization: Bearer tok', async () => {
    const { fetch: fetchMock } = makeFetchOk();
    const client = new ApiClient({ baseUrl: 'http://api', getToken: () => 'tok' });
    await client.get('/x', { fetch: fetchMock as unknown as typeof fetch });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('authorization')).toBe('Bearer tok');
  });

  it('sem getToken → sem header Authorization', async () => {
    const { fetch: fetchMock } = makeFetchOk();
    const client = new ApiClient({ baseUrl: 'http://api' });
    await client.get('/x', { fetch: fetchMock as unknown as typeof fetch });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.has('authorization')).toBe(false);
  });
});

describe('ApiClient — content-type e merge de headers', () => {
  it('content-type default = application/json', async () => {
    const { fetch: fetchMock } = makeFetchOk();
    const client = new ApiClient({ baseUrl: 'http://api' });
    await client.get('/x', { fetch: fetchMock as unknown as typeof fetch });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('headers customizados são mergeados com content-type', async () => {
    const { fetch: fetchMock } = makeFetchOk();
    const client = new ApiClient({ baseUrl: 'http://api' });
    await client.get('/x', {
      headers: { 'x-correlation-id': 'abc' },
      fetch: fetchMock as unknown as typeof fetch,
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-correlation-id')).toBe('abc');
  });
});

describe('ApiClient — respostas não-OK', () => {
  it('lança ApiError com title, code, status e problem populados', async () => {
    const { fetch: fetchMock } = makeFetchNotOk(problemBody, 404);
    const client = new ApiClient({ baseUrl: 'http://api' });
    let captured: unknown;
    try {
      await client.get('/users/u-1', { fetch: fetchMock as unknown as typeof fetch });
    } catch (e) {
      captured = e;
    }
    expect(captured).toBeInstanceOf(ApiError);
    const err = captured as ApiError;
    expect(err.name).toBe('ApiError');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.status).toBe(404);
    expect(err.problem).toEqual(problemBody);
    expect(err.message).toBe('Recurso não encontrado');
  });

  it('lança ApiError em 4xx sem title custom', async () => {
    const { fetch: fetchMock } = makeFetchNotOk(
      {
        type: 't',
        title: 't',
        status: 400,
        detail: 'd',
        instance: 'i',
        code: 'BAD_INPUT',
        traceId: 'tr',
      },
      400,
    );
    const client = new ApiClient({ baseUrl: 'http://api' });
    await expect(client.get('/x', { fetch: fetchMock as unknown as typeof fetch })).rejects.toThrow(
      't',
    );
  });
});

describe('ApiError class', () => {
  it('expõe name="ApiError" e campos públicos code/status/problem', () => {
    const problem = {
      type: 't',
      title: 'title-x',
      status: 422,
      detail: 'detail-x',
      instance: 'POST /api/v1/users',
      code: 'INVALID',
      traceId: 'tr',
    };
    const err = new ApiError('title-x', 'INVALID', 422, problem);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ApiError');
    expect(err.code).toBe('INVALID');
    expect(err.status).toBe(422);
    expect(err.problem).toBe(problem);
    expect(err.message).toBe('title-x');
  });
});
