// FLUXO: F18 — Cabeçalhos de segurança do web
// Cobre: a CSP com nonce por requisição e os headers de segurança.
//
// pt-BR — por que este arquivo existe.
//
// MEDIDO em 2026-11-03 (auditoria de segurança): o web NÃO tinha CSP nenhuma
// (`grep -rn 'Content-Security-Policy' apps/web` → 0). A CSP é a defesa que
// impede um XSS de executar script de um domínio atacante.
//
// O que este teste prende, e por que cada item:
//   1. a CSP chega na resposta — sem ela, a defesa não existe;
//   2. o nonce do HEADER é o mesmo nonce dos SCRIPT INLINE do HTML — se
//      divergirem, o navegador bloqueia o bootstrap do React e a página
//      fica sem hidratação (e sem erro visível na tela);
//   3. nenhum script inline fica SEM nonce — um script sem nonce é
//      bloqueado pela CSP (é exatamente o XSS que a CSP quer impedir);
//   4. `'unsafe-inline'` não aparece — ele anularia a CSP para quem controla
//      a página;
//   5. `X-Powered-By` não é exposto.
//
// O item 3 é o que pega o erro do tipo "a CSP entrou e quebrou a página": o
// script sem nonce é o sintoma, e a página quebrada é a consequência.

import { expect, test } from './support/fixtures';

test.describe('F18 — Cabeçalhos de segurança do web', () => {
  test('a resposta traz CSP com nonce, e o nonce bate com o do HTML', async ({ page, appUrl }) => {
    // `page.goto` exige URL ABSOLUTA — o fixture `appUrl` monta a partir da
    // origem que o harness levantou (MEDIDO em 2026-11-03: a primeira versão
    // do spec usava `page.goto('/login')` e o Playwright respondia
    // "Cannot navigate to invalid URL" nos três testes).
    const resposta = await page.goto(appUrl('/login'));
    expect(resposta).not.toBeNull();

    const csp = resposta!.headers()['content-security-policy'];
    expect(csp, 'a resposta não traz Content-Security-Policy').toBeTruthy();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('unsafe-inline');

    const nonceDoHeader = /'nonce-([^']+)'/.exec(csp ?? '')?.[1];
    expect(nonceDoHeader, 'a CSP não tem nonce').toBeTruthy();

    // O HTML precisa ter o MESMO nonce — é o que o Next aplica nos scripts.
    const html = await resposta!.text();
    const noncesDoHtml = [...html.matchAll(/nonce="([^"]+)"/g)].map((m) => m[1]);
    expect(noncesDoHtml.length, 'o HTML não tem script com nonce').toBeGreaterThan(0);
    for (const n of noncesDoHtml) {
      expect(n).toBe(nonceDoHeader);
    }

    // Nenhum script inline sem nonce: um script assim é bloqueado pela CSP.
    const semNonce = [...html.matchAll(/<script(?![^>]*\bnonce=)[^>]*>/g)];
    expect(
      semNonce.map((m) => m[0]),
      'há script sem nonce',
    ).toEqual([]);
  });

  test('os headers de segurança de borda estão lá', async ({ page, appUrl }) => {
    const resposta = await page.goto(appUrl('/login'));
    const h = resposta!.headers();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['strict-transport-security']).toContain('max-age=');
    // O Next anuncia a framework: informação que não precisa ser dita.
    expect(h['x-powered-by']).toBeUndefined();
  });

  test('a rota do token NÃO vaza a URL no Referer', async ({ page, appUrl }) => {
    // A regra do PR #116: o token de convite viaja na URL, e a URL vaza
    // pelo Referer de um link de mesma origem.
    const resposta = await page.goto(appUrl('/login'));
    expect(resposta!.headers()['referrer-policy']).toBe('no-referrer');
  });
});
