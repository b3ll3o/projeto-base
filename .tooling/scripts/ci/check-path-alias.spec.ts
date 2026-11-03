import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aliasesMortos, checkPathAlias, extrairAliases } from './check-path-alias';

/** Raiz do repo real — usada no caso "o repo real não tem alias morto". */
const REPO_REAL = join(import.meta.dirname, '..', '..', '..');

/**
 * `tsx` e o script, derivados do PRÓPRIO spec — nunca de `process.cwd()`.
 */
const TSX = join(REPO_REAL, 'node_modules/.bin/tsx');
const SCRIPT = join(REPO_REAL, '.tooling/scripts/ci/check-path-alias.ts');

describe('extrairAliases', () => {
  it('lê o `paths` do tsconfig', () => {
    const aliases = extrairAliases({
      compilerOptions: { paths: { '@projeto/shared-types': ['./packages/shared-types/src'] } },
    });
    expect(aliases).toEqual([
      { nome: '@projeto/shared-types', alvo: './packages/shared-types/src' },
    ]);
  });

  it('aceita alvo em string', () => {
    const aliases = extrairAliases({
      compilerOptions: { paths: { '@projeto/ui': './packages/ui/src' } },
    });
    expect(aliases[0]?.alvo).toBe('./packages/ui/src');
  });

  it('config sem `paths` → lista vazia', () => {
    expect(extrairAliases({ compilerOptions: {} })).toEqual([]);
    expect(extrairAliases({})).toEqual([]);
    expect(extrairAliases(null)).toEqual([]);
  });
});

describe('checkPathAlias', () => {
  let tmp: string;
  let repo: string;

  function escreverTsconfig(paths: Record<string, string | string[]>): void {
    writeFileSync(
      join(repo, 'tsconfig.base.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths } }, null, 2),
    );
  }

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'path-alias-'));
    repo = join(tmp, 'repo');
    mkdirSync(join(repo, 'packages/shared-types/src'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it('alias apontando para diretório que existe → verde', async () => {
    escreverTsconfig({ '@projeto/shared-types': ['./packages/shared-types/src'] });
    const r = await checkPathAlias({ repoRoot: repo });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('alias apontando para diretório INEXISTENTE → VERMELHO, nomeando o alias e o alvo', async () => {
    escreverTsconfig({
      '@projeto/shared-types': ['./packages/shared-types/src'],
      '@projeto/ui': ['./packages/ui/src'],
    });
    const r = await checkPathAlias({ repoRoot: repo });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('@projeto/ui');
    expect(r.errors.join('\n')).toContain('./packages/ui/src');
  });

  it('alias que aponta para um ARQUIVO (não diretório) → VERMELHO', async () => {
    writeFileSync(join(repo, 'arquivo.ts'), '');
    escreverTsconfig({ '@projeto/x': ['./arquivo.ts'] });
    const r = await checkPathAlias({ repoRoot: repo });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('@projeto/x');
  });

  it('tsconfig ausente → skipped COM MOTIVO (nunca verde por ausência — classe 5)', async () => {
    const r = await checkPathAlias({ repoRoot: repo });
    expect(r.skipped).toBe(true);
    expect(r.reason).toContain('tsconfig.base.json');
  });

  it('o repo real não tem alias morto', async () => {
    const r = await checkPathAlias({ repoRoot: REPO_REAL });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('a medição do repo real não é verde por acidente: um alias morto é achado', async () => {
    // A árvore sadia exercita só metade do conserto: um gate que mede o repo
    // real e nunca acha nada pode estar medindo o vazio.
    const mortos = await aliasesMortos({ repoRoot: REPO_REAL });
    expect(mortos).toEqual([]);
    // E o mesmo código, contra uma árvore com alias morto, acha.
    const tmp2 = mkdtempSync(join(tmpdir(), 'path-alias-mut-'));
    try {
      const repo2 = join(tmp2, 'repo');
      mkdirSync(repo2, { recursive: true });
      writeFileSync(
        join(repo2, 'tsconfig.base.json'),
        JSON.stringify({ compilerOptions: { paths: { '@projeto/ui': ['./packages/ui/src'] } } }),
      );
      const achados = await aliasesMortos({ repoRoot: repo2 });
      expect(achados.map((a) => a.nome)).toEqual(['@projeto/ui']);
    } finally {
      rmSync(tmp2, { recursive: true, force: true });
    }
  });
});

describe('rodado como CLI', () => {
  it('mede e sai com exit 1 — MEDIDO 2026-10-29', () => {
    // Sem o bloco IIFE, `pnpm exec tsx .tooling/scripts/ci/check-path-alias.ts`
    // devolvia `exit 0` e **nenhuma saída**. O gate só media alguma coisa pelo
    // mapa `RUNNERS` do preflight; invocado direto, ele não media NADA.
    const repo = mkdtempSync(join(tmpdir(), 'path-alias-cli-'));
    try {
      writeFileSync(
        join(repo, 'tsconfig.base.json'),
        JSON.stringify({ compilerOptions: { paths: { '@projeto/ui': ['./packages/ui/src'] } } }),
      );

      let stderr = '';
      let status: number | null = null;
      try {
        execFileSync(TSX, [SCRIPT], {
          cwd: repo,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err) {
        stderr = (err as { stderr?: string }).stderr ?? '';
        status = (err as { status?: number | null }).status ?? null;
      }

      expect(stderr).toContain('@projeto/ui');
      expect(status).toBe(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
