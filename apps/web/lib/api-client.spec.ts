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

// pt-BR (#97): os dois helpers abaixo devolvem uma `Response` DE VERDADE do
// runtime, e não um objeto com `json` mockado. O motivo é histórico: com
// `json: vi.fn().mockResolvedValue(...)` o mock RESOLVE MESMO SEM CORPO, e o
// `res.json()` incondicional do `request()` passava o teste enquanto
// `DELETE /admin/profiles/:id` — que é `Promise<void>`, corpo vazio — estourava
// `SyntaxError: Unexpected end of JSON input` em toda chamada real. Um teste
// que só passa porque o mock mente sobre a plataforma é pior que nenhum.
// Com `Response` real, corpo vazio rejeita, que é o comportamento do runtime.
function makeFetchOk(body: unknown = { ok: true }): { fetch: Mock } {
  const fetchMock = vi
    .fn()
    .mockImplementation(() => Promise.resolve(new Response(JSON.stringify(body), { status: 200 })));
  return { fetch: fetchMock };
}

/** Corpo vazio de verdade — o que um endpoint `Promise<void>` devolve. */
function makeFetchOkVazio(status = 204): { fetch: Mock } {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status }));
  return { fetch: fetchMock };
}

function makeFetchNotOk(body: Record<string, unknown>, status = 404): { fetch: Mock } {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
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

  // pt-BR (#97): o teste que não existia e que escondia M2.
  // `DELETE /admin/profiles/:id` é `Promise<void>` no controller — a API
  // responde 204 sem corpo. `res.json()` incondicional lança
  // `SyntaxError: Unexpected end of JSON input` e `deletarPerfil` falhava em
  // TODA chamada real, com a suíte inteira verde.
  it('DELETE com resposta sem corpo resolve em vez de lançar SyntaxError', async () => {
    const { fetch: fetchMock } = makeFetchOkVazio();
    const client = new ApiClient({ baseUrl: 'http://api' });
    await expect(
      client.delete<void>('/admin/profiles/p-1', { fetch: fetchMock as unknown as typeof fetch }),
    ).resolves.toBeUndefined();
  });

  it('204 sem corpo também é tolerado em GET (qualquer endpoint void)', async () => {
    // A proteção é de `request()`, não do método: um GET que resolve vazio
    // não pode virar SyntaxError só porque o controller devolveu 204.
    const { fetch: fetchMock } = makeFetchOkVazio();
    const client = new ApiClient({ baseUrl: 'http://api' });
    await expect(
      client.get('/admin/profiles/p-1', { fetch: fetchMock as unknown as typeof fetch }),
    ).resolves.toBeUndefined();
  });

  it('200 com corpo JSON segue devolvendo o corpo parseado (não regrediu)', async () => {
    const { fetch: fetchMock } = makeFetchOk({ id: 'p-1' });
    const client = new ApiClient({ baseUrl: 'http://api' });
    await expect(
      client.get('/admin/profiles/p-1', { fetch: fetchMock as unknown as typeof fetch }),
    ).resolves.toEqual({ id: 'p-1' });
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

// pt-BR (Fase 3 — tenancy, 2026-10-16): `X-Tenant-Id` diz à API em qual
// empresa a pessoa está agindo. Sem ele a API resolve o perfil GLOBAL
// (bucket `null`) e o perfil por empresa nunca chega a ser resolvido.
describe('ApiClient — X-Tenant-Id header', () => {
  const ACME = '0190a8b6-0000-4000-8000-00000000000a';
  const GLOBEX = '0190a8b6-0000-4000-8000-00000000000b';

  it('getTenant devolve o UUID → X-Tenant-Id no request', async () => {
    const { fetch: fetchMock } = makeFetchOk();
    const client = new ApiClient({
      baseUrl: 'http://api',
      getToken: () => 'tok',
      getTenant: () => ACME,
    });
    await client.get('/x', { fetch: fetchMock as unknown as typeof fetch });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).get('x-tenant-id')).toBe(ACME);
  });

  it('getTenant devolve null → header AUSENTE, não string vazia', async () => {
    // Header vazio (`''`) não é ausente: o guard do lado da API rejeita com
    // 400 `INVALID_TENANT`. "Sem empresa" é omitir o header.
    const { fetch: fetchMock } = makeFetchOk();
    const client = new ApiClient({
      baseUrl: 'http://api',
      getToken: () => 'tok',
      getTenant: () => null,
    });
    await client.get('/x', { fetch: fetchMock as unknown as typeof fetch });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).has('x-tenant-id')).toBe(false);
  });

  it('sem getTenant → sem header (clientes pré-auth não quebram)', async () => {
    const { fetch: fetchMock } = makeFetchOk();
    const client = new ApiClient({ baseUrl: 'http://api', getToken: () => 'tok' });
    await client.get('/x', { fetch: fetchMock as unknown as typeof fetch });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).has('x-tenant-id')).toBe(false);
  });

  it('manda o header em TODOS os verbos, não só em GET', async () => {
    // O tenant não é uma preocupação só de leitura: `PUT
    // /admin/users/:id/profile` e `POST /admin/profiles/:id/authorizations`
    // também são por empresa. Um header que só sai no GET deixa exatamente
    // as escritas sem escopo.
    const { fetch: fetchMock } = makeFetchOk();
    const client = new ApiClient({
      baseUrl: 'http://api',
      getToken: () => 'tok',
      getTenant: () => ACME,
    });
    const f = fetchMock as unknown as typeof fetch;
    await client.post('/x', { a: 1 }, { fetch: f });
    await client.patch('/x', { a: 1 }, { fetch: f });
    await client.put('/x', { a: 1 }, { fetch: f });
    await client.delete('/x', { fetch: f });

    for (const call of fetchMock.mock.calls as [string, RequestInit][]) {
      expect((call[1].headers as Headers).get('x-tenant-id')).toBe(ACME);
    }
  });

  it('getTenant é consultado a CADA request (trocar de empresa pega na hora)', async () => {
    let atual = ACME;
    const { fetch: fetchMock } = makeFetchOk();
    const client = new ApiClient({
      baseUrl: 'http://api',
      getToken: () => 'tok',
      getTenant: () => atual,
    });
    const f = fetchMock as unknown as typeof fetch;

    await client.get('/x', { fetch: f });
    atual = GLOBEX;
    await client.get('/x', { fetch: f });

    const headers = (fetchMock.mock.calls as [string, RequestInit][]).map((call) =>
      (call[1].headers as Headers).get('x-tenant-id'),
    );
    expect(headers).toEqual([ACME, GLOBEX]);
  });
});

describe('ApiClient — content-type e merge de headers', () => {
  it('content-type default = application/json quando há corpo', async () => {
    const { fetch: fetchMock } = makeFetchOk();
    const client = new ApiClient({ baseUrl: 'http://api' });
    await client.post('/x', { a: 1 }, { fetch: fetchMock as unknown as typeof fetch });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('content-type')).toBe('application/json');
  });

  // pt-BR (2026-10-20): este caso usava `GET` e exigia o header presente — era
  // o teste que fixava o defeito como se fosse o desejado. O Fastify responde
  // `Body cannot be empty when content-type is set to 'application/json'` (400),
  // e `revogarPermissao`/`apagarPerfil` quebravam em produção por causa disso.
  // MEDIDO contra a API acesa, mesmo request e mesmo token, mudando só o
  // header: DELETE sem → 200, com → 400. GET → 200 nos dois sentidos.
  it('sem corpo, nenhum content-type é declarado', async () => {
    const { fetch: fetchMock } = makeFetchOk();
    const client = new ApiClient({ baseUrl: 'http://api' });
    await client.delete('/x', { fetch: fetchMock as unknown as typeof fetch });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get('content-type')).toBeNull();
  });

  it('headers customizados são mergeados com content-type', async () => {
    const { fetch: fetchMock } = makeFetchOk();
    const client = new ApiClient({ baseUrl: 'http://api' });
    await client.post(
      '/x',
      { a: 1 },
      {
        headers: { 'x-correlation-id': 'abc' },
        fetch: fetchMock as unknown as typeof fetch,
      },
    );
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

  it('corpo de erro NÃO-JSON (502 de proxy) vira ApiError, não SyntaxError cru', async () => {
    // pt-BR: o corpo de erro de um gateway é HTML. `res.json()` estourava
    // `SyntaxError` DENTRO do try do `request()`, o catch repassava a exceção
    // crua e `err instanceof ApiError` ficava falso — o 401→login de `/users`
    // nunca acontecia. `Response` real, então o corpo não-JSON é de verdade.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('<html><body>502 Bad Gateway</body></html>', { status: 502 }),
      );
    const client = new ApiClient({ baseUrl: 'http://api' });

    const err = await client
      .get('/users', { fetch: fetchMock as unknown as typeof fetch })
      .then(() => null)
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    const apiError = err as ApiError;
    expect(apiError.status).toBe(502);
    expect(apiError.code).toBe('UNKNOWN');
    expect(apiError.message).toBe('Erro 502');
    // `comTraceId` decide por truthiness: string vazia não gera o sufixo
    // "Código de rastreamento: ." na tela.
    expect(apiError.problem.traceId).toBe('');
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
