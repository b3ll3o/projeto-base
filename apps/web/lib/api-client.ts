// apps/web/lib/api-client.ts
import type { ProblemDetailsDto } from '@projeto/shared-types';

export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => string | null;
}

// Estende RequestInit para permitir injetar `fetch` (testabilidade) sem
// conflitar com o tipo nativo de lib.dom.d.ts.
export interface ApiRequestInit extends Omit<RequestInit, 'body'> {
  fetch?: typeof fetch;
  body?: BodyInit | null;
}

export class ApiClient {
  constructor(private readonly config: ApiClientConfig) {}

  async get<T>(path: string, init?: ApiRequestInit): Promise<T> {
    return this.request<T>('GET', path, init);
  }
  async post<T>(path: string, body?: unknown, init?: ApiRequestInit): Promise<T> {
    return this.request<T>('POST', path, { ...init, body: JSON.stringify(body) });
  }
  async patch<T>(path: string, body?: unknown, init?: ApiRequestInit): Promise<T> {
    return this.request<T>('PATCH', path, { ...init, body: JSON.stringify(body) });
  }
  async delete<T>(path: string, init?: ApiRequestInit): Promise<T> {
    return this.request<T>('DELETE', path, init);
  }

  private async request<T>(method: string, path: string, init?: ApiRequestInit): Promise<T> {
    const { fetch: injectedFetch, ...restInit } = init ?? {};
    const fetchFn: typeof fetch = injectedFetch ?? fetch;
    const token = this.config.getToken?.();
    const headers = new Headers(restInit.headers);
    headers.set('content-type', 'application/json');
    if (token) headers.set('authorization', `Bearer ${token}`);

    const res = await fetchFn(`${this.config.baseUrl}${path}`, {
      method,
      ...restInit,
      headers,
    });
    if (!res.ok) {
      const problem = (await res.json()) as ProblemDetailsDto;
      throw new ApiError(problem.title, problem.code, problem.status, problem);
    }
    return res.json() as Promise<T>;
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly problem: ProblemDetailsDto,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
