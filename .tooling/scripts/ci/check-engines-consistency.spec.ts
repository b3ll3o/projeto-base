import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkEnginesConsistency, parseMinEngine, rootSatisfiesApp } from './check-engines-consistency';

describe('parseMinEngine', () => {
  it('parseia ">=22.6.0" em {op: ">=", major: 22, minor: 6, patch: 0}', () => {
    expect(parseMinEngine('>=22.6.0')).toEqual({ op: '>=', major: 22, minor: 6, patch: 0 });
  });
  it('parseia "^20.0.0" em {op: "^", ...}', () => {
    expect(parseMinEngine('^20.0.0')?.op).toBe('^');
  });
  it('devolve null para spec inválida', () => {
    expect(parseMinEngine('latest')).toBeNull();
  });
});

describe('rootSatisfiesApp', () => {
  it('app sem engines → OK', () => {
    expect(rootSatisfiesApp('>=22.6.0', undefined)).toBe(true);
  });
  it('raiz sem engines → OK (gate não julga)', () => {
    expect(rootSatisfiesApp(undefined, '>=22.6.0')).toBe(true);
  });
  it('engines iguais → OK', () => {
    expect(rootSatisfiesApp('>=22.6.0', '>=22.6.0')).toBe(true);
  });
  it('app com minor mais antigo → ERRO', () => {
    expect(rootSatisfiesApp('>=22.6.0', '>=20.0.0')).toBe(false);
  });
  it('app com minor mais novo → ERRO', () => {
    expect(rootSatisfiesApp('>=22.6.0', '>=24.0.0')).toBe(false);
  });
  it('app com ^20 (alvo em Node 20) → ERRO', () => {
    expect(rootSatisfiesApp('>=22.6.0', '^20.0.0')).toBe(false);
  });
});

describe('checkEnginesConsistency', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'engines-consistency-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeFile(relPath: string, content: string) {
    const full = join(tmp, relPath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }

  it('verde quando nenhum app declara engines', async () => {
    writeFile('package.json', JSON.stringify({ engines: { node: '>=22.6.0' } }));
    writeFile('apps/api/package.json', JSON.stringify({ name: 'api' }));
    writeFile('apps/web/package.json', JSON.stringify({ name: 'web' }));
    const r = await checkEnginesConsistency({ repoRoot: tmp });
    expect(r.ok).toBe(true);
  });

  it('verde quando engines da app bate com a da raiz', async () => {
    writeFile('package.json', JSON.stringify({ engines: { node: '>=22.6.0' } }));
    writeFile('apps/api/package.json', JSON.stringify({ name: 'api', engines: { node: '>=22.6.0' } }));
    const r = await checkEnginesConsistency({ repoRoot: tmp });
    expect(r.ok).toBe(true);
  });

  it('vermelho quando app declara engines mais antigas que a raiz', async () => {
    writeFile('package.json', JSON.stringify({ engines: { node: '>=22.6.0' } }));
    writeFile('apps/api/package.json', JSON.stringify({ name: 'api', engines: { node: '>=20.0.0' } }));
    const r = await checkEnginesConsistency({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/apps\/api/);
    expect(r.errors[0]).toMatch(/>=20\.0\.0/);
  });

  it('vermelho quando app declara engines mais novas que a raiz', async () => {
    writeFile('package.json', JSON.stringify({ engines: { node: '>=22.6.0' } }));
    writeFile('apps/web/package.json', JSON.stringify({ name: 'web', engines: { node: '>=24.0.0' } }));
    const r = await checkEnginesConsistency({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/>=24\.0\.0/);
  });

  it('skipped com motivo quando raiz não declara engines', async () => {
    writeFile('package.json', JSON.stringify({ name: 'root' }));
    writeFile('apps/api/package.json', JSON.stringify({ name: 'api' }));
    const r = await checkEnginesConsistency({ repoRoot: tmp });
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(true);
    expect(r.reason).toMatch(/engines\.node ausente/);
  });

  it('skipped quando não há apps', async () => {
    writeFile('package.json', JSON.stringify({ engines: { node: '>=22.6.0' } }));
    const r = await checkEnginesConsistency({ repoRoot: tmp });
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(true);
  });
});
