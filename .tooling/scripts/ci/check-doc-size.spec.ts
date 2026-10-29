import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

  it('a skill de terceiro é vendor', () => {
    expect(categoriaDe('.agents/skills/graphify/SKILL.md')?.nome).toBe('vendor');
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
