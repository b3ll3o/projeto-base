// apps/web/lib/next-config.spec.ts
//
// TDD (Task 3.5): garante que `apps/web/next.config.mjs` empacota
// `@opentelemetry/*` + `web-vitals` no output standalone via
// `outputFileTracingIncludes` no TOP-LEVEL (NÃO nested em `experimental`).
//
// Por que arquivo-fonte (não runtime import)? O `next.config.mjs` é validado
// pelo Next.js no build; aqui queremos um guard portável e rápido contra
// regressões acidentais de remoção dos globs ou migração errada para
// `experimental.outputFileTracingIncludes` (que seria silenciosamente
// ignorada em Next.js 15.5.x — ver collect-build-traces.js).
//
// Cobertura:
//   1. `output: 'standalone'` preservado (alinhado ao Dockerfile de prod).
//   2. `outputFileTracingIncludes` no top-level (NÃO nested em experimental)
//      com chave raiz '/**'.
//   3. globs cobrem `./node_modules/@opentelemetry/**/*` e
//      `./node_modules/web-vitals/**/*` dentro do `/**`.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const configPath = fileURLToPath(new URL('../next.config.mjs', import.meta.url));
const source = readFileSync(configPath, 'utf8');

describe('next.config.mjs — outputFileTracingIncludes (Task 3.5)', () => {
  it('preserva output: "standalone" (alinhado ao Dockerfile prod)', () => {
    expect(source).toMatch(/output:\s*['"]standalone['"]/);
  });

  it('declara outputFileTracingIncludes no TOP-LEVEL (NÃO dentro de experimental)', () => {
    // Positivo: outputFileTracingIncludes aparece no top-level do objeto
    // (sem indentação significativa que indique aninhamento).
    expect(source).toMatch(/^\s*outputFileTracingIncludes\s*:/m);

    // Negativo (guard de regressão): NÃO pode estar nested dentro de
    // `experimental: { ... }`. Em Next.js 15.5.x isso seria silenciosamente
    // ignorado em runtime (collect-build-traces.js destrutura apenas de
    // config.outputFileTracingIncludes, nunca de config.experimental).
    expect(source).not.toMatch(/experimental:\s*\{[\s\S]*?outputFileTracingIncludes/);

    // Chave raiz '/**' presente
    expect(source).toMatch(/['"]\/\*\*['"]:\s*\[/);
  });

  it('outputFileTracingIncludes cobre @opentelemetry/**/* e web-vitals/**/*', () => {
    expect(source).toMatch(/['"]\.\/node_modules\/@opentelemetry\/\*\*\/\*['"]/);
    expect(source).toMatch(/['"]\.\/node_modules\/web-vitals\/\*\*\/\*['"]/);
  });
});

describe('next.config.mjs — o token de convite não vaza por Referer', () => {
  // pt-BR (onboarding de empresa, 2026-10-21): o token de convite viaja na
  // URL, e o default do browser (`strict-origin-when-cross-origin`) manda a
  // URL INTEIRA no `Referer` de um link MESMO ORIGEM — o token vai parar no
  // log de acesso de outra rota do mesmo servidor. `no-referrer` fecha isso.
  //
  // ⚠️ O guard é sobre o FONTE, e não sobre a resposta HTTP: o `headers()`
  // do config é lido pelo Next no boot, e um spec que o exercitasse exigiria
  // subir a aplicação — caro para um guard de duas linhas.
  it('as três telas que carregam o token têm Referrer-Policy e Cache-Control', () => {
    expect(source).toMatch(/['"]Referrer-Policy['"]\s*,\s*value:\s*['"]no-referrer['"]/);
    expect(source).toMatch(/['"]Cache-Control['"]\s*,\s*value:\s*['"]no-store['"]/);
  });

  it('cobre a tela do CONVITE, a de CADASTRO e o LOGIN', () => {
    // As TRÊS: o token entra pela URL do convite, sai pela query do
    // cadastro e atravessa o login. Uma rota que não carrega token não
    // precisa da proteção; uma rota faltando carrega.
    expect(source).toMatch(/source:\s*['"]\/convite\/:path\*['"]/);
    expect(source).toMatch(/source:\s*['"]\/users\/novo['"]/);
    expect(source).toMatch(/source:\s*['"]\/login['"]/);
  });
});
