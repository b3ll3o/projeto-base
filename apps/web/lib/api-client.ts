// apps/web/lib/api-client.ts
import type { ProblemDetailsDto } from '@projeto/shared-types';

export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => string | null;
  /**
   * #70: timeout default em ms para qualquer request. Default 10s.
   * Pode ser sobrescrito por request via `init.timeoutMs`.
   */
  defaultTimeoutMs?: number;
}

// Estende RequestInit para permitir injetar `fetch` (testabilidade) sem
// conflitar com o tipo nativo de lib.dom.d.ts.
export interface ApiRequestInit extends Omit<RequestInit, 'body'> {
  fetch?: typeof fetch;
  body?: BodyInit | null;
  /**
   * #70: timeout custom para este request específico. Se não setado,
   * usa `config.defaultTimeoutMs` (10s default).
   */
  timeoutMs?: number;
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
  // pt-BR (#93.1 — RBAC, 2026-10-16): PUT usado em
  // `/admin/profiles/:id/authorizations` (sync) e
  // `/admin/users/:id/profile` (assign).
  async put<T>(path: string, body?: unknown, init?: ApiRequestInit): Promise<T> {
    return this.request<T>('PUT', path, { ...init, body: JSON.stringify(body) });
  }
  async delete<T>(path: string, init?: ApiRequestInit): Promise<T> {
    return this.request<T>('DELETE', path, init);
  }

  private async request<T>(method: string, path: string, init?: ApiRequestInit): Promise<T> {
    const { fetch: injectedFetch, timeoutMs, ...restInit } = init ?? {};
    const fetchFn: typeof fetch = injectedFetch ?? fetch;
    const token = this.config.getToken?.();
    const headers = new Headers(restInit.headers);
    headers.set('content-type', 'application/json');
    if (token) headers.set('authorization', `Bearer ${token}`);

    // #70: timeout via AbortController. Sem isso, um fetch que nunca resolve
    // (API hang, network partition) segura a UI por minutos até o browser
    // desistir. 10s é folgado para uma chamada CRUD local; spec e2e
    // pode usar `init.timeoutMs: 30_000` para suites mais pesadas.
    const effectiveTimeout = timeoutMs ?? this.config.defaultTimeoutMs ?? 10_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeout);

    try {
      const res = await fetchFn(`${this.config.baseUrl}${path}`, {
        method,
        ...restInit,
        headers,
        signal: controller.signal,
      });
      if (!res.ok) {
        const problem = (await res.json()) as ProblemDetailsDto;
        throw new ApiError(problem.title, problem.code, problem.status, problem);
      }
      return res.json() as Promise<T>;
    } catch (err) {
      // #70: distinguir timeout (AbortError) de outros erros de rede.
      // Permite que a UI mostre "tempo esgotado" em vez de "erro genérico".
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiTimeoutError(path, effectiveTimeout, method);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
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

/**
 * #70: erro específico para timeout. Distinto de ApiError (que vem do servidor)
 * para permitir tratamento dedicado na UI (ex: "tempo esgotado, tente novamente").
 */
export class ApiTimeoutError extends Error {
  constructor(
    public readonly path: string,
    public readonly timeoutMs: number,
    public readonly method: string,
  ) {
    super(`Request ${method} ${path} timed out after ${timeoutMs}ms`);
    this.name = 'ApiTimeoutError';
  }
}
