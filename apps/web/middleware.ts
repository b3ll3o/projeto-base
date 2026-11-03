import { NextResponse, type NextRequest } from 'next/server';

/**
 * O nonce da CSP, por requisição.
 *
 * MEDIDO em 2026-11-03 (auditoria de segurança): o web não tinha NENHUMA CSP
 * — só `Referrer-Policy` e `Cache-Control` em três rotas. A CSP é a defesa
 * que impede um XSS de executar script de um domínio atacante; sem ela, a
 * única defesa é o React escapar tudo (e o `dangerouslySetInnerHTML` quebra
 * essa garantia).
 *
 * Por que NONCE e não `'unsafe-inline'`:
 *   - `'unsafe-inline'` anula a CSP para quem controla a página — e o
 *     objetivo da CSP é justamente não confiar no conteúdo da página;
 *   - o nonce é por requisição e unpredictível: o script que um atacante
 *     injeta não o tem, e o navegador não o executa;
 *   - o `strict-dynamic` faz o nonce valer para os scripts que ele carrega,
 *     o que dispensa listar host por host.
 *
 * O Next.js aplica o nonce nos scripts inline que ELE gera (o bootstrap do
 * React) quando a CSP da resposta tem `nonce-<valor>` — por isso o nonce
 * viaja no header `x-nonce` da requisição.
 *
 * ⚠️ O middleware roda no runtime **edge** (o `Buffer` não existe lá) — o
 * nonce é gerado com `btoa(crypto.randomUUID())`, que existe nos dois.
 *
 * O matcher cobre as páginas (o que gera HTML) e deixa de fora:
 *   - `api/health`: é o health check, responde JSON, e roda no container;
 *   - `_next/static`, `_next/image` e os arquivos com extensão: são assets
 *     com hash no nome — a CSP não os afeta, e o matcher os exclui para não
 *     pagar o custo de gerar nonce para cada arquivo.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = btoa(crypto.randomUUID());
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(
    'Content-Security-Policy',
    cspDoNonce(nonce, {
      endpointTelemetria: process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT,
      desenvolvimento: process.env.NODE_ENV !== 'production',
    }),
  );
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  return response;
}

/** O que a CSP precisa saber do ambiente. */
export interface AmbienteDaCsp {
  /**
   * O endpoint OTLP do browser (`NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT`).
   *
   * MEDIDO em 2026-11-03: a telemetria do CLIENTE sai do browser para este
   * endpoint — que é de OUTRA origem (`http://localhost:4318` no dev). Um
   * `connect-src 'self'` bloqueia isso em silêncio: a telemetria some e
   * ninguém vê erro nenhum (o `try/catch` do `instrumentation-client.ts`
   * engole a recusa do navegador). A origem do endpoint entra no
   * `connect-src` — e só a ORIGEM, não o host solto.
   */
  endpointTelemetria?: string | undefined;
  /**
   * Desenvolvimento local.
   *
   * O runtime de dev do Next usa `eval` (o HMR do webpack) — e a CSP sem
   * `'unsafe-eval'` quebra o servidor de dev, com um erro de console que
   * não é óbvio. O padrão do Next (`isDev ? "'unsafe-eval'" : ""`) resolve:
   * a produção **não** tem `'unsafe-eval'`, e o `'unsafe-inline'` continua
   * fora dos dois.
   */
  desenvolvimento?: boolean;
}

/** A origem de uma URL, ou `null` quando a URL não é absoluta. */
export function origemDe(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * A CSP do web.
 *
 * `connect-src` leva a origem da API? **Não**: MEDIDO em 2026-11-03, o web
 * **não** chama a API pelo browser — as chamadas são server-side (RSC e
 * Server Actions, com `process.env.API_BASE_URL`). O browser fala só com a
 * própria origem, **mais** o collector de telemetria (acima).
 *
 * `upgrade-insecure-requests` NÃO entra: em desenvolvimento local (http) ele
 * quebraria o HMR do Next, e quem precisa forçar HTTPS é a borda (o
 * `Strict-Transport-Security` acima e o helmet da API).
 */
export function cspDoNonce(nonce: string, ambiente: AmbienteDaCsp = {}): string {
  const connect = ["'self'"];
  const origemTelemetria = origemDe(ambiente.endpointTelemetria);
  if (origemTelemetria) connect.push(origemTelemetria);

  const script = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (ambiente.desenvolvimento) script.push("'unsafe-eval'");

  return [
    "default-src 'self'",
    // `strict-dynamic` faz o nonce valer para o que ele carrega; os
    // navegadores que o suportam ignoram o 'self' daqui.
    `script-src ${script.join(' ')}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

export const config = {
  matcher: [
    {
      source:
        '/((?!api/health|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
