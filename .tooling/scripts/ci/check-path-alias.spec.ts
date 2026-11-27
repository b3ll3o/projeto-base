import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { aliasesDe, checkPathAlias, medirAliases } from './check-path-alias';

/** Raiz do repo real — usada no caso "o repo real não tem alias morto". */
const REPO_REAL = join(import.meta.dirname, '..', '..', '..');

/**
 * `tsx` e o script, derivados do PRÓPRIO spec — nunca de `process.cwd()`.
 */
const TSX = join(REPO_REAL, 'node_modules/.bin/tsx');
const SCRIPT = join(REPO_REAL, '.tooling/scripts/ci/check-path-alias.ts');

describe('aliasesDe', () => {
  it('lê o `paths` do tsconfig', () => {
    const aliases = aliasesDe({ '@projeto/shared-types': ['./packages/shared-types/src'] });
    expect(aliases).toEqual([
      { nome: '@projeto/shared-types', alvos: ['./packages/shared-types/src'] },
    ]);
  });

  it('aceita alvo em string e normaliza para lista', () => {
    const aliases = aliasesDe({ '@projeto/ui': './packages/ui/src' });
    expect(aliases[0]?.alvos).toEqual(['./packages/ui/src']);
  });

  it('GUARDA TODOS os alvos, na ordem — o TS tenta cada um em ordem', () => {
    const aliases = aliasesDe({ '@x': ['./nao-existe', './src/real.ts'] });
    expect(aliases[0]?.alvos).toEqual(['./nao-existe', './src/real.ts']);
  });

  it('sem `paths` → lista vazia', () => {
    expect(aliasesDe({})).toEqual([]);
  });
});

describe('checkPathAlias', () => {
  let tmp: string;
  let repo: string;

  function escreverTsconfig(
    paths: Record<string, string | string[]>,
    extra: Record<string, unknown> = {},
    nome = 'tsconfig.base.json',
  ): void {
    const caminho = join(repo, nome);
    mkdirSync(join(caminho, '..'), { recursive: true });
    writeFileSync(
      caminho,
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths, ...extra }, ...extra }, null, 2),
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

  it('🔴 alias apontando para diretório INEXISTENTE → VERMELHO, nomeando o alias e o alvo', async () => {
    escreverTsconfig({
      '@projeto/shared-types': ['./packages/shared-types/src'],
      '@projeto/ui': ['./packages/ui/src'],
    });
    const r = await checkPathAlias({ repoRoot: repo });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('@projeto/ui');
    expect(r.errors.join('\n')).toContain('./packages/ui/src');
  });

  it('🔴 alias que aponta para um ARQUIVO (não diretório) → VERDE (o TS resolve arquivo)', async () => {
    // MEDIDO 2026-10-30: a forma (a) do defeito — o alvo de um `paths` do TS
    // é um LOCAL DE MÓDULO, e o TS resolve tanto arquivo quanto diretório.
    // O gate antigo exigia `st.isDirectory()` e acusava esta forma legítima.
    writeFileSync(join(repo, 'arquivo.ts'), '');
    escreverTsconfig({ '@projeto/x': ['./arquivo.ts'] });
    const r = await checkPathAlias({ repoRoot: repo });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('🔴 alias com WILDCARD cuja raiz existe → VERDE (o TS resolve wildcard)', async () => {
    // MEDIDO 2026-10-30: a forma (b) do defeito — `apps/web/tsconfig.json`
    // declara `"@/*": ["./*"]`, com 150 imports `@/…` no web.
    mkdirSync(join(repo, 'lib'), { recursive: true });
    writeFileSync(join(repo, 'lib', 'api-client.ts'), '');
    escreverTsconfig({ '@/*': ['./lib/*'] });
    const r = await checkPathAlias({ repoRoot: repo });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('🔴 alias com WILDCARD cuja raiz NÃO existe → VERMELHO', async () => {
    escreverTsconfig({ '@/*': ['./lib/*'] });
    const r = await checkPathAlias({ repoRoot: repo });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('@/*');
  });

  it('🔴 alias com 2 alvos, o 1º inexistente e o 2º existente → VERDE (fallback na ordem)', async () => {
    // MEDIDO 2026-10-30: `['./src/nao-existe','./src/real.ts']` resolve para
    // `real.ts` no TS. O gate antigo olhava SÓ o primeiro destino.
    mkdirSync(join(repo, 'src'), { recursive: true });
    writeFileSync(join(repo, 'src', 'real.ts'), '');
    escreverTsconfig({ '@x': ['./src/nao-existe', './src/real.ts'] });
    const r = await checkPathAlias({ repoRoot: repo });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('🔴 alias com 2 alvos, NENHUM existente → VERMELHO, nomeando os 2', async () => {
    escreverTsconfig({ '@x': ['./src/nao-existe', './outro/nao-existe'] });
    const r = await checkPathAlias({ repoRoot: repo });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('./src/nao-existe');
    expect(r.errors.join('\n')).toContain('./outro/nao-existe');
  });

  it('🔴 tsconfig com COMENTÁRIO (JSONC) → medido, não pulado', async () => {
    // MEDIDO em 2026-11-26: com `JSON.parse`, o `catch` devolvia `[]` e o gate
    // ficava VERDE com DOIS aliases mortos — um `//` no tsconfig desligava o
    // gate inteiro (a classe 5 de `guard-classes.md`).
    writeFileSync(
      join(repo, 'tsconfig.base.json'),
      `{
  // comentário: o \`tsc\` aceita JSONC, o \`JSON.parse\` não
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@projeto/ui": ["./packages/ui/src"]
    }
  }
}
`,
    );
    const r = await checkPathAlias({ repoRoot: repo });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('@projeto/ui');
  });

  it('🔴 tsconfig com vírgula final (JSONC) → o gate mede, não pula', async () => {
    writeFileSync(
      join(repo, 'tsconfig.base.json'),
      '{\n  "compilerOptions": {\n    "baseUrl": ".",\n    "paths": {\n      "@projeto/ui": ["./packages/ui/src"],\n    },\n  },\n}\n',
    );
    const r = await checkPathAlias({ repoRoot: repo });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('@projeto/ui');
  });

  it('🔴 tsconfig que é JSON INVÁLIDO de verdade → NÃO MEDIDO, com motivo (nunca verde por ausência)', async () => {
    writeFileSync(join(repo, 'tsconfig.base.json'), '{ "compilerOptions": { ');
    const r = await checkPathAlias({ repoRoot: repo });
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(true);
    expect(r.reason).toContain('JSONC');
    expect(r.errors).toEqual([]);
  });

  it('🔴 tsconfig ausente → skipped COM MOTIVO (nunca verde por ausência)', async () => {
    const r = await checkPathAlias({ repoRoot: repo });
    expect(r.skipped).toBe(true);
    expect(r.reason).toContain('tsconfig');
    expect(r.errors).toEqual([]);
  });

  it('🔴 o alias herdado por `extends` é resolvido contra a base do config que o DECLARA', async () => {
    // O `paths` vive no base; o filho o herda. O TS resolve o alvo do PAI
    // contra o `baseUrl` do PAI — o gate antigo resolvia contra o diretório
    // do tsconfig que lia.
    mkdirSync(join(repo, 'base'), { recursive: true });
    mkdirSync(join(repo, 'base', 'lib'), { recursive: true });
    writeFileSync(
      join(repo, 'base', 'tsconfig.base.json'),
      JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@x': ['./lib'] } } }),
    );
    mkdirSync(join(repo, 'app'), { recursive: true });
    writeFileSync(
      join(repo, 'app', 'tsconfig.json'),
      JSON.stringify({ extends: '../base/tsconfig.base.json' }),
    );
    const r = await checkPathAlias({ repoRoot: repo });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('o repo real não tem alias morto', async () => {
    const r = await checkPathAlias({ repoRoot: REPO_REAL });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('a medição do repo real não é verde por acidente: um alias morto é achado', async () => {
    // A árvore sadia exercita só metade do conserto: um gate que mede o repo
    // real e nunca acha nada pode estar medindo o vazio.
    const mortos = await medirAliases(join(tmp, 'vazio'));
    expect(mortos.aliases).toEqual([]);
    // E o mesmo código, contra uma árvore com alias morto, acha.
    const repo2 = join(tmp, 'repo2');
    mkdirSync(repo2, { recursive: true });
    writeFileSync(
      join(repo2, 'tsconfig.base.json'),
      JSON.stringify({
        compilerOptions: { baseUrl: '.', paths: { '@projeto/ui': ['./packages/ui/src'] } },
      }),
    );
    const achados = await medirAliases(repo2);
    expect(achados.aliases.filter((a) => !a.vivo).map((a) => a.nome)).toEqual(['@projeto/ui']);
  });

  it('🔴 no repo REAL, o alias com WILDCARD do web é medido e NÃO é acusado', async () => {
    // MEDIDO 2026-11-27: `apps/web/tsconfig.json` declara
    // `"@/*": ["./*"]`, e o web tem 150 imports `@/…` (MEDIDO:
    // `grep -rhoE "from '@/[^']*'" apps/web --include=*.ts --include=*.tsx
    // | wc -l` → 150). Um gate que exigisse diretório acusaria essa forma
    // legítima — foi o que segurou o escopo do gate em UM tsconfig.
    const medido = await medirAliases(REPO_REAL);
    const web = medido.aliases.filter((a) => a.nome === '@/*');
    expect(web.length).toBeGreaterThan(0);
    expect(web.every((a) => a.vivo)).toBe(true);
    // E o gate não é verde por ausência: ele mediu os 3 aliases da raiz
    // mais o wildcard do web.
    expect(medido.aliases.length).toBeGreaterThanOrEqual(4);
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
        JSON.stringify({
          compilerOptions: { baseUrl: '.', paths: { '@projeto/ui': ['./packages/ui/src'] } },
        }),
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
