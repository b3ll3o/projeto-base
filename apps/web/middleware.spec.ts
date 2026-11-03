import { describe, expect, it } from 'vitest';
import { cspDoNonce, origemDe } from './middleware';

/**
 * As regressões da CSP.
 *
 * MEDIDO em 2026-11-03 (revisão do PR #143): a primeira versão da CSP tinha
 * `connect-src 'self'` — e a telemetria do CLIENTE sai do browser para o
 * collector, que é de OUTRA origem (`http://localhost:4318` no dev). O
 * navegador recusa a conexão em SILÊNCIO (o `try/catch` do
 * `instrumentation-client.ts` engole a recusa) e a telemetria do browser
 * simplesmente desaparece — sem erro, sem aviso, sem teste quebrado.
 *
 * A segunda lição: o runtime de dev do Next usa `eval` (o HMR do webpack), e
 * a CSP sem `'unsafe-eval'` quebra o servidor de dev.
 */
describe('a CSP do web', () => {
  const nonce = 'abc123';

  it('o nonce entra no script-src e no style-src', () => {
    const csp = cspDoNonce(nonce);
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(csp).toContain(`style-src 'self' 'nonce-${nonce}'`);
  });

  it("NUNCA usa 'unsafe-inline' — ele anularia a CSP para quem controla a página", () => {
    expect(cspDoNonce(nonce)).not.toContain('unsafe-inline');
    expect(cspDoNonce(nonce, { desenvolvimento: true })).not.toContain('unsafe-inline');
  });

  it('a origem do collector de telemetria entra no connect-src', () => {
    // A regressão do PR #143: sem isto, a telemetria do browser morre em
    // silêncio.
    const csp = cspDoNonce(nonce, {
      endpointTelemetria: 'http://localhost:4318/v1/traces',
    });
    expect(csp).toContain("connect-src 'self' http://localhost:4318");
  });

  it('sem endpoint de telemetria, o connect-src fica só com self', () => {
    const csp = cspDoNonce(nonce);
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toContain('localhost');
  });

  it('"unsafe-eval" só em desenvolvimento — em produção, não', () => {
    expect(cspDoNonce(nonce, { desenvolvimento: true })).toContain("'unsafe-eval'");
    expect(cspDoNonce(nonce, { desenvolvimento: false })).not.toContain('unsafe-eval');
    expect(cspDoNonce(nonce)).not.toContain('unsafe-eval');
  });

  it('as diretivas de base estão lá', () => {
    const csp = cspDoNonce(nonce);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
  });

  it('"upgrade-insecure-requests" NÃO entra (quebraria o HMR local em http)', () => {
    expect(cspDoNonce(nonce, { desenvolvimento: true })).not.toContain('upgrade-insecure-requests');
  });
});

describe('a origem do endpoint', () => {
  it('extrai a origem de uma URL absoluta', () => {
    expect(origemDe('http://localhost:4318/v1/traces')).toBe('http://localhost:4318');
    expect(origemDe('https://otel.exemplo.com/v1/traces')).toBe('https://otel.exemplo.com');
  });

  it('não inventa origem de URL inválida ou ausente', () => {
    expect(origemDe(undefined)).toBeNull();
    expect(origemDe('')).toBeNull();
    expect(origemDe('/api/otel/collect')).toBeNull();
  });
});
