import { describe, it, expect, beforeAll } from 'vitest';
import { checkDocRefs } from './check-doc-refs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const FIXTURES = '/tmp/ci-fixtures';

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
});
