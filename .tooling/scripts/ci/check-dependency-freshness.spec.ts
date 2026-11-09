/**
 * SEM shebang, de propósito.
 *
 * As regressões do `check-dependency-freshness`.
 *
 * O gate é **hermético**: ele não consulta a rede. O dado vem do arquivo
 * versionado `dependencias-major-disponiveis.json`, gerado por
 * `pnpm run deps:major-scan`. Sem ele, o gate é `skipped` com motivo — nunca
 * verde-por-ignorância.
 */
import { describe, expect, it } from 'vitest';
import {
  checkDependencyFreshness,
  faixaPermiteMajor,
  majorDeclarada,
} from './check-dependency-freshness';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

describe('check-dependency-freshness — major declarada', () => {
  it('extrai a major de ^15.5.29', () => {
    expect(majorDeclarada('^15.5.29')).toBe(15);
  });

  it('extrai a major de ~4.1.0', () => {
    expect(majorDeclarada('~4.1.0')).toBe(4);
  });

  it('extrai a major de >=22.6.0', () => {
    expect(majorDeclarada('>=22.6.0')).toBe(22);
  });

  it('devolve null para faixa que nao tem numero', () => {
    expect(majorDeclarada('latest')).toBeNull();
    expect(majorDeclarada('workspace:*')).toBeNull();
  });
});

describe('check-dependency-freshness — a faixa permite a major nova?', () => {
  it('^ nao permite major maior', () => {
    expect(faixaPermiteMajor('^2.1.9', 3)).toBe(false);
  });

  it('^ permite a propria major', () => {
    expect(faixaPermiteMajor('^2.1.9', 2)).toBe(true);
  });

  it('~ nao permite major maior', () => {
    expect(faixaPermiteMajor('~4.1.0', 5)).toBe(false);
  });

  it('>= permite major maior — e por isso a pendencia envelhece', () => {
    expect(faixaPermiteMajor('>=1.0.0', 2)).toBe(true);
  });

  it('exato so permite a propria major', () => {
    expect(faixaPermiteMajor('3.2.1', 3)).toBe(true);
    expect(faixaPermiteMajor('3.2.1', 4)).toBe(false);
  });

  it('spec que o gate nao entende nao e julgada', () => {
    expect(faixaPermiteMajor('latest', 9)).toBe(false);
  });
});

describe('check-dependency-freshness — fim a fim, num repo temporario', () => {
  async function repo(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'fresh-'));
    await mkdir(path.join(dir, '.tooling', 'scripts', 'ci'), { recursive: true });
    return dir;
  }

  async function majors(dir: string, dados: unknown): Promise<void> {
    await writeFile(
      path.join(dir, '.tooling', 'scripts', 'ci', 'dependencias-major-disponiveis.json'),
      JSON.stringify(dados, null, 2),
      'utf-8',
    );
  }

  async function pendencias(dir: string, lista: unknown[]): Promise<void> {
    await writeFile(
      path.join(dir, '.tooling', 'scripts', 'ci', 'dependencias-major-pendentes.json'),
      JSON.stringify({ pendencias: lista }, null, 2),
      'utf-8',
    );
  }

  it('skipped, com motivo, quando o registro de majors nao existe', async () => {
    const dir = await repo();
    try {
      const r = await checkDependencyFreshness({ repoRoot: dir });
      expect(r.ok).toBe(true);
      expect(r.skipped).toBe(true);
      expect(r.reason).toContain('deps:major-scan');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('REPROVA quando uma major nova nao tem pendencia declarada', async () => {
    const dir = await repo();
    try {
      await writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify({ dependencies: { next: '^15.5.29' } }, null, 2),
        'utf-8',
      );
      await majors(dir, { medidoEm: '2026-11-09', majors: { next: 16 } });
      await pendencias(dir, []);

      const r = await checkDependencyFreshness({ repoRoot: dir });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('major não declarada');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('PASSA quando a major pendente esta declarada com motivo', async () => {
    const dir = await repo();
    try {
      await writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify({ dependencies: { next: '^15.5.29' } }, null, 2),
        'utf-8',
      );
      await majors(dir, { medidoEm: '2026-11-09', majors: { next: 16 } });
      await pendencias(dir, [
        {
          pacote: 'next',
          faixaAtual: '^15.5.29',
          majorAtual: 15,
          majorNova: 16,
          motivo: 'breaking change de framework',
          declaradaEm: '2026-11-09',
        },
      ]);

      const r = await checkDependencyFreshness({ repoRoot: dir });
      expect(r.ok).toBe(true);
      expect(r.errors).toEqual([]);
      // a divida medida tem que aparecer como advisory, nao como erro
      expect((r.advisories ?? []).join('\n')).toContain('1 major');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('REPROVA quando a pendencia envelhece (a faixa ja permite a major)', async () => {
    const dir = await repo();
    try {
      await writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify({ dependencies: { next: '>=15.0.0' } }, null, 2),
        'utf-8',
      );
      await majors(dir, { medidoEm: '2026-11-09', majors: { next: 16 } });
      await pendencias(dir, [
        {
          pacote: 'next',
          faixaAtual: '>=15.0.0',
          majorAtual: 15,
          majorNova: 16,
          motivo: 'breaking change de framework',
          declaradaEm: '2026-11-09',
        },
      ]);

      const r = await checkDependencyFreshness({ repoRoot: dir });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('envelhecida');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('REPROVA quando a pendencia descreve um pacote que saiu do workspace', async () => {
    const dir = await repo();
    try {
      await writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify({ dependencies: { next: '^15.5.29' } }, null, 2),
        'utf-8',
      );
      await majors(dir, { medidoEm: '2026-11-09', majors: { next: 16 } });
      await pendencias(dir, [
        {
          pacote: 'next',
          faixaAtual: '^15.5.29',
          majorAtual: 15,
          majorNova: 16,
          motivo: 'breaking change de framework',
          declaradaEm: '2026-11-09',
        },
        {
          pacote: 'pacote-que-saiu',
          faixaAtual: '^1.0.0',
          majorAtual: 1,
          majorNova: 2,
          motivo: 'nao existe mais',
          declaradaEm: '2026-11-09',
        },
      ]);

      const r = await checkDependencyFreshness({ repoRoot: dir });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('pacote-que-saiu');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('nao acusa pacote que ja esta na major mais nova', async () => {
    const dir = await repo();
    try {
      await writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify({ dependencies: { zod: '^4.0.0' } }, null, 2),
        'utf-8',
      );
      await majors(dir, { medidoEm: '2026-11-09', majors: { zod: 4 } });
      await pendencias(dir, []);

      const r = await checkDependencyFreshness({ repoRoot: dir });
      expect(r.ok).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
