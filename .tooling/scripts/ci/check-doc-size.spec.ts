import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CATEGORIAS_FORA_DO_ESCOPO,
  LIMITE_DE_LINHAS,
  arquivosAcimaDoTeto,
  categoriaDe,
  contarLinhas,
  globParaRegex,
} from './check-doc-size';

/** Raiz do repo real — usada no caso "o repo real está dentro do teto". */
const REPO_REAL = join(import.meta.dirname, '..', '..', '..');

/**
 * `tsx` e o script, derivados do PRÓPRIO spec — nunca de `process.cwd()`.
 *
 * O teste de CLI abaixo executa o gate com `cwd` no repo de mentira; se
 * qualquer um dos dois viesse do `process.cwd()`, o teste mediria o repo de
 * verdade e passaria pelo motivo errado.
 */
const TSX = join(REPO_REAL, 'node_modules/.bin/tsx');
const SCRIPT = join(REPO_REAL, '.tooling/scripts/ci/check-doc-size.ts');

describe('contarLinhas', () => {
  it('conta como o wc -l: um arquivo com N newlines tem N linhas', () => {
    expect(contarLinhas('a\nb\nc\n')).toBe(3);
  });

  it('arquivo SEM newline final conta a última linha', () => {
    expect(contarLinhas('a\nb\nc')).toBe(3);
  });

  it('arquivo vazio tem 0 linhas', () => {
    expect(contarLinhas('')).toBe(0);
  });
});

describe('globParaRegex', () => {
  it('`**` atravessa `/` e `*` não', () => {
    const re = globParaRegex('docs/superpowers/**');
    expect(re.test('docs/superpowers/plans/x.md')).toBe(true);
    expect(re.test('docs/superpowers.md')).toBe(false);
  });
});

describe('categoriaDe', () => {
  it('um plano é registro datado', () => {
    expect(categoriaDe('docs/superpowers/plans/x.md')?.nome).toBe('registro-datado');
  });

  it('um ledger de execução é artefato de execução', () => {
    expect(categoriaDe('.agents/runs/memory-triage.md')?.nome).toBe('artefato-de-execucao');
  });

  it('a skill adaptada de terceiro NAO está fora do escopo (o teto a mede)', () => {
    // MEDIDO em 2026-10-29: enquanto a skill era "versionada como está", ela
    // tinha uma categoria própria (`vendor`). Adaptada, ela cabe no teto — e
    // uma exceção que não tem motivo é uma exceção que encolhe sozinha.
    expect(categoriaDe('.agents/skills/graphify/SKILL.md')).toBeNull();
  });

  it('a documentação VIVA não cai em categoria nenhuma', () => {
    expect(categoriaDe('docs/como-rodar.md')).toBeNull();
    expect(categoriaDe('AGENTS.md')).toBeNull();
    expect(categoriaDe('.agents/specs/conventions/ci-defense-in-depth-pendencias.md')).toBeNull();
  });

  it('as três categorias têm razão escrita — a razão vai para a convenção', () => {
    for (const c of CATEGORIAS_FORA_DO_ESCOPO) {
      expect(c.razao.length).toBeGreaterThan(20);
      expect(c.globs.length).toBeGreaterThan(0);
    }
  });
});

describe('arquivosAcimaDoTeto', () => {
  let tmp: string;
  let repo: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'doc-size-'));
    repo = join(tmp, 'repo');
    mkdirSync(repo, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function escrever(rel: string, linhas: number): void {
    const full = join(repo, rel);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, `${'x\n'.repeat(linhas - 1)}x\n`);
  }

  it('acusa o arquivo acima do teto', async () => {
    escrever('docs/grande.md', LIMITE_DE_LINHAS + 1);
    const acima = await arquivosAcimaDoTeto(repo, ['docs/grande.md']);
    expect(acima).toHaveLength(1);
    expect(acima[0]?.linhas).toBe(LIMITE_DE_LINHAS + 1);
  });

  it('NÃO acusa arquivo exatamente no teto', async () => {
    escrever('docs/ok.md', LIMITE_DE_LINHAS);
    expect(await arquivosAcimaDoTeto(repo, ['docs/ok.md'])).toHaveLength(0);
  });

  it('NÃO acusa arquivo de registro datado, por mais longo que seja', async () => {
    escrever('docs/superpowers/plans/gigante.md', 5_000);
    expect(await arquivosAcimaDoTeto(repo, ['docs/superpowers/plans/gigante.md'])).toHaveLength(0);
  });
});

describe('rodado como CLI', () => {
  it('mede e sai com exit 1 — MEDIDO 2026-10-29', () => {
    // Sem o bloco IIFE, `pnpm exec tsx .tooling/scripts/ci/check-doc-size.ts`
    // devolvia `exit 0` e **nenhuma saída** — inclusive contra um repo com um
    // `.md` de 400 linhas. O gate só media alguma coisa pelo mapa `RUNNERS` do
    // preflight; invocado direto, ele não media NADA.
    const repo = mkdtempSync(join(tmpdir(), 'doc-size-cli-'));
    try {
      // O gate mede arquivos VERSIONADOS (`git ls-files`), então o `.md`
      // grande precisa estar no índice — `git add -N` basta.
      mkdirSync(join(repo, 'docs'), { recursive: true });
      writeFileSync(join(repo, 'docs', 'gigante.md'), 'x\n'.repeat(LIMITE_DE_LINHAS + 100));
      execFileSync('git', ['init', '-q'], { cwd: repo });
      execFileSync('git', ['add', '-N', 'docs/gigante.md'], { cwd: repo });

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

      expect(stderr).toContain('docs/gigante.md');
      expect(status).toBe(1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe('o repo real', () => {
  it('toda documentação VIVA cabe no teto — e o gate é o que garante', async () => {
    // O gate roda sobre o repo real; aqui a medição é direta, para o teste
    // não depender do git.
    const { listarMarkdown } = await import('./check-doc-size');
    const arquivos = listarMarkdown(REPO_REAL);
    expect(arquivos).not.toBeNull();
    const acima = await arquivosAcimaDoTeto(REPO_REAL, arquivos ?? []);
    expect(acima.map((a) => `${a.path} (${a.linhas})`)).toEqual([]);
  });
});
