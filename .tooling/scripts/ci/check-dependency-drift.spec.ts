/**
 * SEM shebang, de propósito.
 *
 * As regressões do `check-dependency-drift`.
 *
 * A mutação que **provou** que o gate tem dente (MEDIDO 2026-11-09):
 * divergir o `vitest` do web para `^2.1.0` fazia o gate reprovar com a
 * mensagem que diz quais arquivos declararam cada faixa.
 */
import { describe, expect, it } from 'vitest';
import {
  acharDivergencias,
  checkDependencyDrift,
  divergenciaCoberta,
  listarPackageJsons,
  versoesDeclaradas,
} from './check-dependency-drift';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

describe('check-dependency-drift — declaracoes', () => {
  it('extrai as versoes de dependencies e devDependencies', () => {
    const v = versoesDeclaradas({
      dependencies: { a: '^1.0.0' },
      devDependencies: { b: '^2.0.0' },
    });
    expect(v.get('a')).toBe('^1.0.0');
    expect(v.get('b')).toBe('^2.0.0');
  });

  it('ignora workspace: — nao e versao, e um link interno', () => {
    const v = versoesDeclaradas({ dependencies: { '@projeto/shared': 'workspace:*' } });
    expect(v.size).toBe(0);
  });

  it('ignora secao desconhecida', () => {
    const v = versoesDeclaradas({ peerDependencies: { a: '^1.0.0' } } as never);
    expect(v.size).toBe(0);
  });
});

describe('check-dependency-drift — deteccao de divergencia', () => {
  const arquivo = (arquivo: string, versoes: Record<string, string>) => ({
    arquivo,
    versoes: new Map(Object.entries(versoes)),
  });

  it('nao acusa quando todos declaram a mesma faixa', () => {
    const d = acharDivergencias([
      arquivo('a/package.json', { vitest: '^2.1.9' }),
      arquivo('b/package.json', { vitest: '^2.1.9' }),
    ]);
    expect(d).toEqual([]);
  });

  it('acusa quando duas faixas divergem', () => {
    const d = acharDivergencias([
      arquivo('a/package.json', { vitest: '^2.1.9' }),
      arquivo('b/package.json', { vitest: '^2.1.0' }),
    ]);
    expect(d).toHaveLength(1);
    expect(d[0]!.pacote).toBe('vitest');
    expect(Object.keys(d[0]!.porFaixa).sort()).toEqual(['^2.1.0', '^2.1.9']);
  });

  it('acusa quando TRES faixas divergem', () => {
    const d = acharDivergencias([
      arquivo('a/package.json', { x: '^1.0.0' }),
      arquivo('b/package.json', { x: '^1.1.0' }),
      arquivo('c/package.json', { x: '^1.2.0' }),
    ]);
    expect(d).toHaveLength(1);
    expect(Object.keys(d[0]!.porFaixa)).toHaveLength(3);
  });

  it('a ordem das faixas e dos arquivos e estavel (o gate nao deve oscilar)', () => {
    const d = acharDivergencias([
      arquivo('z/package.json', { x: '^1.0.0' }),
      arquivo('a/package.json', { x: '^2.0.0' }),
    ]);
    expect(d[0]!.porFaixa['^1.0.0']).toEqual(['z/package.json']);
    expect(d[0]!.porFaixa['^2.0.0']).toEqual(['a/package.json']);
  });

  it('pacotes diferentes nao sao comparados entre si', () => {
    const d = acharDivergencias([
      arquivo('a/package.json', { x: '^1.0.0' }),
      arquivo('b/package.json', { y: '^2.0.0' }),
    ]);
    expect(d).toEqual([]);
  });
});

describe('check-dependency-drift — excecao declarada', () => {
  const divergencia = {
    pacote: 'vitest',
    porFaixa: { '^2.1.0': ['apps/web/package.json'], '^2.1.9': ['package.json'] },
  };

  it('uma excecao que nomeia o pacote e a faixa cobre a divergencia', () => {
    expect(
      divergenciaCoberta(divergencia, [
        { pacote: 'vitest', faixa: '^2.1.0', motivo: 'o web fixa a serie 2' },
      ]),
    ).toBe(true);
  });

  it('uma excecao de outro pacote nao cobre', () => {
    expect(
      divergenciaCoberta(divergencia, [{ pacote: 'typescript', faixa: '^2.1.0', motivo: 'outro' }]),
    ).toBe(false);
  });

  it('uma excecao com faixa que nao existe na divergencia nao cobre', () => {
    expect(
      divergenciaCoberta(divergencia, [
        { pacote: 'vitest', faixa: '^9.9.9', motivo: 'faixa obsoleta' },
      ]),
    ).toBe(false);
  });
});

describe('check-dependency-drift — fim a fim, num repo temporario', () => {
  async function repo(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'drift-'));
    await mkdir(path.join(dir, 'apps', 'api'), { recursive: true });
    await mkdir(path.join(dir, 'apps', 'web'), { recursive: true });
    return dir;
  }

  async function escrever(dir: string, rel: string, pkg: unknown): Promise<void> {
    await writeFile(path.join(dir, rel), `${JSON.stringify(pkg, null, 2)}\n`, 'utf-8');
  }

  it('reprova quando um pacote diverge entre workspaces', async () => {
    const dir = await repo();
    try {
      await escrever(dir, 'package.json', { devDependencies: { vitest: '^2.1.9' } });
      await escrever(dir, 'apps/api/package.json', { devDependencies: { vitest: '^2.1.9' } });
      await escrever(dir, 'apps/web/package.json', { devDependencies: { vitest: '^2.1.0' } });

      const r = await checkDependencyDrift({ repoRoot: dir });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('vitest');
      // a mensagem tem que dizer ONDE — quem lê precisa saber o que corrigir
      expect(r.errors.join('\n')).toContain('apps/web/package.json');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('passa quando todos declaram a mesma faixa', async () => {
    const dir = await repo();
    try {
      await escrever(dir, 'package.json', { devDependencies: { vitest: '^2.1.9' } });
      await escrever(dir, 'apps/api/package.json', { devDependencies: { vitest: '^2.1.9' } });
      await escrever(dir, 'apps/web/package.json', { devDependencies: { vitest: '^2.1.9' } });

      const r = await checkDependencyDrift({ repoRoot: dir });
      expect(r.ok).toBe(true);
      expect(r.errors).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('reprova quando a excecao declarada envelhece (o pacote saiu do workspace)', async () => {
    const dir = await repo();
    try {
      await escrever(dir, 'package.json', { devDependencies: { vitest: '^2.1.9' } });
      await escrever(dir, 'apps/api/package.json', { devDependencies: { vitest: '^2.1.9' } });
      await mkdir(path.join(dir, '.tooling', 'scripts', 'ci'), { recursive: true });
      await writeFile(
        path.join(dir, '.tooling', 'scripts', 'ci', 'excecoes-de-dependencias-drift.json'),
        JSON.stringify({
          excecoes: [{ pacote: 'vitest', faixa: '^2.1.0', motivo: 'autorizado' }],
        }),
        'utf-8',
      );

      const r = await checkDependencyDrift({ repoRoot: dir });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('envelhecida');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('skipped, com motivo, quando nao ha o que comparar', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'drift-vazio-'));
    try {
      await escrever(dir, 'package.json', { name: 'x' });
      const r = await checkDependencyDrift({ repoRoot: dir });
      expect(r.ok).toBe(true);
      expect(r.skipped).toBe(true);
      expect(r.reason).toBeTruthy();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('lista os package.json da raiz e dos workspaces', async () => {
    const dir = await repo();
    try {
      await escrever(dir, 'package.json', {});
      await escrever(dir, 'apps/api/package.json', {});
      await escrever(dir, 'apps/web/package.json', {});
      const lista = await listarPackageJsons(dir);
      expect(lista).toContain('package.json');
      expect(lista).toContain(path.join('apps', 'api', 'package.json'));
      expect(lista).toContain(path.join('apps', 'web', 'package.json'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
