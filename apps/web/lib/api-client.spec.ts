// apps/web/lib/api-client.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { ApiClient } from './api-client.js';

describe('ApiClient', () => {
  it('GET retorna JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true }),
    });
    const client = new ApiClient({ baseUrl: 'http://api', getToken: () => 'tok' });
    await client.get('/x', { fetch: fetchMock as any });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api/x',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('lança ApiError em resposta não-OK', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () =>
        Promise.resolve({
          type: 't',
          title: 't',
          status: 404,
          detail: 'd',
          instance: 'i',
          code: 'NOT_FOUND',
          traceId: 'tr',
        }),
    });
    const client = new ApiClient({ baseUrl: 'http://api' });
    await expect(client.get('/x', { fetch: fetchMock as any })).rejects.toThrow('t');
  });
});
