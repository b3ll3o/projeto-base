// apps/web/lib/api-client.ts
import type { ProblemDetailsDto } from '@projeto/shared-types';

export interface ApiClientConfig {
  baseUrl: string;
  getToken?: () => string | null;
  /**
   * pt-BR (Fase 3 — tenancy, 2026-10-16): a empresa em que a pessoa está
   * agindo, enviada como `X-Tenant-Id`. `null` (ou ausente) OMITE o header —
   * a API resolve então o perfil GLOBAL, sem assumir empresa nenhuma (e sem
   * trocar de bucket de cache). Consultado a cada request, como `getToken`,
   * para trocar de empresa pegar sem recriar o cliente.
   */
  getTenant?: () => string | null;
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
    const tenant = this.config.getTenant?.();
    const headers = new Headers(restInit.headers);
    // pt-BR (2026-10-20): `content-type` só quando HÁ corpo. O Fastify recusa
    // um DELETE sem corpo que declare `application/json` com
    // `Body cannot be empty when content-type is set to 'application/json'` (400),
    // e era exatamente isso que quebrava `revogarPermissao` e `apagarPerfil` —
    // os dois `client.delete(...)` do front, que não mandam body. MEDIDO contra
    // a API acesa, mesmo request e mesmo token, mudando só este header:
    // DELETE sem → 200; DELETE com → 400.
    //
    // `Content-Type` descreve o corpo, e um request sem corpo não tem o que
    // descrever. O GET não sente a ausência (MEDIDO: 200 com e sem). POST/
    // PATCH/PUT seguem mandando porque todo caller atual passa corpo real —
    // e `JSON.stringify(undefined)` devolveria `undefined` (não string), o que
    // faria um `client.post(path)` sem argumento cair aqui e mandar POST sem
    // header nenhum. Nenhum caller faz isso hoje.
    // `!= null` (solto) de propósito: cobre `undefined` E `null` numa condição
    // só, porque os dois são a mesma coisa aqui — "não há corpo". Escrever os
    // dois operadores cria um ramo que nenhum caller exercita e que nenhum teste
    // distingue: `body: null` é o mesmo caso de `body` ausente, e tratá-lo
    // diferente devolveria o 400 que esta linha conserta.
    //
    // ⚠️ E `''` é o TERCEIRO "não há corpo" — o `!= null` sozinho não o pega,
    // porque string vazia não é null. MEDIDO 2026-10-20 contra o Fastify real
    // (`app.inject`): `content-type: application/json` + corpo vazio → 400
    // `FST_ERR_CTP_EMPTY_JSON_BODY`; sem o header → 200, e o corpo
    // simplesmente não é parseado. Declarar `application/json` para um corpo
    // vazio é declarar um formato para um corpo que não existe — e é o 400 que
    // a linha de cima conserta, voltando pela porta de trás.
    if (restInit.body != null && restInit.body !== '') {
      headers.set('content-type', 'application/json');
    }
    if (token) headers.set('authorization', `Bearer ${token}`);
    // pt-BR (Fase 3): `if (tenant)`, não `?? null` — header vazio seria
    // rejeitado com 400 `INVALID_TENANT` do outro lado, e "sem empresa" é
    // omitir, não enviar string vazia.
    if (tenant) headers.set('x-tenant-id', tenant);

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
        // pt-BR: mesmo cuidado do caminho de sucesso (#97) — um corpo de erro
        // nem sempre é JSON. 502/504 de proxy e HTML de gateway derrubavam o
        // `res.json()` com `SyntaxError` DENTRO deste try, e o `catch`
        // repassava a exceção crua: todo consumidor que testa
        // `err instanceof ApiError` (ex.: o redirect de 401 em `/users`)
        // recebia algo que não é ApiError, e a distinção de status se perdia.
        const corpo = await res.text();
        let problem: ProblemDetailsDto;
        try {
          problem = JSON.parse(corpo) as ProblemDetailsDto;
        } catch {
          problem = {
            type: 'about:blank',
            title: `Erro ${res.status}`,
            status: res.status,
            detail: corpo.slice(0, 200),
            instance: path,
            // Sem corpo RFC 7807 não há traceId; a tela compõe a mensagem com
            // `comTraceId`, então a string vazia é o valor honesto.
            code: 'UNKNOWN',
            traceId: '',
          };
        }
        throw new ApiError(problem.title, problem.code, problem.status, problem);
      }
      // pt-BR (#97): endpoint `void` (ex: `DELETE /admin/profiles/:id`) responde
      // 204 sem corpo, e `res.json()` em corpo vazio lança `SyntaxError`.
      // Lê como texto e só faz parse quando TEM conteúdo — protege todos os
      // endpoints vazios, não só este.
      const texto = await res.text();
      return (texto === '' ? undefined : JSON.parse(texto)) as T;
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
