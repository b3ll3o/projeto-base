import { describe, it, expect, beforeAll } from 'vitest';
import { checkDocRefs } from './check-doc-refs';
import { formatMark } from './preflight';
import type { CheckResult } from './check-types';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

// Diretorio isolado por suite: '/tmp/ci-fixtures' compartilhado era
// vulneravel a leftover de outra execucao.
const FIXTURES = path.join(os.tmpdir(), 'ci-fixtures-check-doc-refs');

describe('checkDocRefs', () => {
  beforeAll(async () => {
    // Garantir que os fixtures existam (idempotente).
    await fs.mkdir(path.join(FIXTURES, 'docs-ok'), { recursive: true });
    await fs.mkdir(path.join(FIXTURES, 'docs-broken-ref'), { recursive: true });
    await fs.mkdir(path.join(FIXTURES, 'docs-external-links'), { recursive: true });

    await fs.writeFile(
      path.join(FIXTURES, 'docs-ok/guia.md'),
      '# Guia\n\nVeja [intro](intro.md) para começar.\n',
    );
    await fs.writeFile(
      path.join(FIXTURES, 'docs-ok/intro.md'),
      '# Intro\n\nConteúdo introdutório.\n',
    );

    await fs.writeFile(
      path.join(FIXTURES, 'docs-broken-ref/guia.md'),
      '# Guia\n\nVeja [intro](arquivo-inexistente.md).\n',
    );

    await fs.writeFile(
      path.join(FIXTURES, 'docs-external-links/guia.md'),
      '# Guia\n\nVeja [site](https://example.com).\n',
    );

    // Os 3 fixtures abaixo eram referenciados por testes que NUNCA rodaram
    // (§F2-T8): a suite nao entrava em tooling:test nem no CI, entao os 3
    // vermelhos ficavam invisiveis. Criados aqui, e nao reaproveitados
    // pelos testes de §F2-T1, para nao criar dependencia de ordem entre
    // tasks.
    await fs.mkdir(path.join(FIXTURES, 'docs-fenced-block'), { recursive: true });
    await fs.writeFile(
      path.join(FIXTURES, 'docs-fenced-block/guia.md'),
      '# Guia\n\n```ts\nconst x = [a](b);\n```\n\nVeja [intro](intro.md).\n',
    );
    await fs.writeFile(path.join(FIXTURES, 'docs-fenced-block/intro.md'), '# Intro\n');

    await fs.mkdir(path.join(FIXTURES, 'docs-inline-code'), { recursive: true });
    await fs.writeFile(
      path.join(FIXTURES, 'docs-inline-code/guia.md'),
      '# Guia\n\nVeja [`intro.md`](intro.md) para começar.\n',
    );
    await fs.writeFile(path.join(FIXTURES, 'docs-inline-code/intro.md'), '# Intro\n');

    await fs.mkdir(path.join(FIXTURES, 'docs-mixed'), { recursive: true });
    await fs.writeFile(
      path.join(FIXTURES, 'docs-mixed/guia.md'),
      '# Guia\n\n```\n[a](b)\n```\n\nVeja [real-broken](nao-existe.md).\n',
    );

    // F2-T1: os 2 links apontam para o MESMO alvo quebrado; um tem label
    // 100% inline-code, o outro nao. Com remocao do trecho inline-code o
    // primeiro colapsa para `[]()` e nunca casa com /\[([^\]]+)\]/ — o gate
    // reportava 1 erro em vez de 2, em silencio.
    await fs.mkdir(path.join(FIXTURES, 'docs-inline-code-label'), { recursive: true });
    await fs.writeFile(
      path.join(FIXTURES, 'docs-inline-code-label/guia.md'),
      '# Guia\n\nVeja [`nao-existe.md`](./nao-existe.md) e tambem [aqui](./nao-existe.md).\n',
    );

    // F2-T2 (a): .md fora das raizes declaradas em `docsRoot` ainda entra no
    // escopo quando `docsRoots` lista outro diretorio. Sem `docsRoots`, o
    // arquivo nao e lido e o gate reporta verde sobre um escopo menor.
    await fs.mkdir(path.join(FIXTURES, 'docs-fora-de-docsRoot'), { recursive: true });
    await fs.writeFile(
      path.join(FIXTURES, 'docs-fora-de-docsRoot/guia.md'),
      '# Guia\n\nVeja [intro](alvo-inexistente.md).\n',
    );

    // F2-T2 (b): o `walk` nao pode descer em node_modules — com `docsRoot: '.'`
    // isso media 500+ erros so de dependencias.
    await fs.mkdir(path.join(FIXTURES, 'docs-skip-dirs/node_modules/pacote-falso'), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(FIXTURES, 'docs-skip-dirs/node_modules/pacote-falso/guia.md'),
      '# Guia\n\nVeja [intro](alvo-inexistente.md).\n',
    );
  });

  it('deve passar quando todas as refs apontam para arquivos existentes', async () => {
    const result = await checkDocRefs({ docsRoot: path.join(FIXTURES, 'docs-ok') });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('deve falhar com mensagem clara quando ref aponta para arquivo inexistente', async () => {
    const result = await checkDocRefs({ docsRoot: path.join(FIXTURES, 'docs-broken-ref') });
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(
      /docs-broken-ref\/guia\.md: link para 'arquivo-inexistente\.md' quebrado/,
    );
  });

  it('deve ignorar refs externas (http://, https://)', async () => {
    const result = await checkDocRefs({
      docsRoot: path.join(FIXTURES, 'docs-external-links'),
    });
    expect(result.ok).toBe(true);
  });

  describe('checkDocRefs - inline code com label', () => {
    it('deve detectar link com label 100% inline-code (nao pode colapsar)', async () => {
      const result = await checkDocRefs({
        docsRoot: path.join(FIXTURES, 'docs-inline-code-label'),
      });
      expect(result.ok).toBe(false);
      // Os 2 links do arquivo apontam para o mesmo alvo quebrado: um com
      // label inline-code, um sem. Remover o inline-code faria o 1o virar
      // `[]()`, que o regex (label 1+ char) nunca casa — 1 erro em vez de 2.
      expect(result.errors).toHaveLength(2);
      expect(result.errors.every((e) => e.includes('./nao-existe.md'))).toBe(true);
    });
  });

  describe('checkDocRefs - escopo', () => {
    it('deve cobrir .md declarado em docsRoots, mesmo fora de docsRoot', async () => {
      const result = await checkDocRefs({
        docsRoot: path.join(FIXTURES, 'docs-ok'),
        docsRoots: [path.join(FIXTURES, 'docs-fora-de-docsRoot')],
      });
      expect(result.ok).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/alvo-inexistente\.md/);
    });

    it('deve IGNORAR node_modules/ (e demais diretorios de build)', async () => {
      const result = await checkDocRefs({ docsRoot: path.join(FIXTURES, 'docs-skip-dirs') });
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('checkDocRefs - code block handling', () => {
    it('deve IGNORAR refs dentro de fenced code blocks ```', async () => {
      const result = await checkDocRefs({ docsRoot: path.join(FIXTURES, 'docs-fenced-block') });
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('deve IGNORAR refs dentro de inline code `backticks`', async () => {
      const result = await checkDocRefs({ docsRoot: path.join(FIXTURES, 'docs-inline-code') });
      expect(result.ok).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('deve AINDA detectar refs quebradas fora de code blocks', async () => {
      const result = await checkDocRefs({ docsRoot: path.join(FIXTURES, 'docs-mixed') });
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toMatch(/real-broken/);
    });
  });

  // F4-T1: `CheckResult` era binario — `ok: true, errors: []` nao distingue
  // "verifiquei e passou" de "nao havia o que verificar". Um check que
  // early-return por pre-requisito ausente imprimia o MESMO token de sucesso
  // de um check que realmente rodou. Regra: o token de sucesso nao pode ser
  // o mesmo para os dois casos.
  describe('formatMark - o token de sucesso nao mente', () => {
    it('NAO pode renderizar ✓ quando o check nao chegou a rodar', () => {
      const skipped: CheckResult = { ok: true, errors: [], skipped: true, reason: 'sem diretório' };
      const mark = formatMark(skipped);
      expect(mark).not.toBe('✓');
      expect(mark).toContain('skipped:');
      expect(mark).toContain('sem diretório');
    });

    it('deve manter ✓ para o check que realmente rodou e passou', () => {
      expect(formatMark({ ok: true, errors: [] })).toBe('✓');
    });

    it('deve manter ✗ para o check que rodou e falhou', () => {
      expect(formatMark({ ok: false, errors: ['algo quebrado'] })).toBe('✗');
    });
  });
});
