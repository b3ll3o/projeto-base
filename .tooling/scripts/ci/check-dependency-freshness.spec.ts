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

  it('REPROVA quando a faixa ja e (ou passou da) major que a pendencia diz que nao sobe', async () => {
    const dir = await repo();
    try {
      // A árvore que o Dependabot propoe: a faixa JÁ é a major que a
      // pendência diz que não sobe agora.
      await writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify({ dependencies: { eslint: '^10.14.0' } }, null, 2),
        'utf-8',
      );
      await majors(dir, { medidoEm: '2026-11-10', majors: { eslint: 10 } });
      await pendencias(dir, [
        {
          pacote: 'eslint',
          faixaAtual: '^9.39.5',
          majorAtual: 9,
          majorNova: 10,
          motivo: 'flat-config breaking: acompanha o eslint 10',
          declaradaEm: '2026-11-09',
        },
      ]);

      const r = await checkDependencyFreshness({ repoRoot: dir });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('envelheceu');
      expect(r.errors.join('\n')).toContain('eslint');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('REPROVA quando a faixa PASSOU da major que a pendencia nomeia', async () => {
    const dir = await repo();
    try {
      // A faixa está numa major ACIMA da que a pendência nomeia (`^12` com
      // pendência 9 → 10): a regra julga `>=`, e essa forma não tinha spec.
      await writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify({ dependencies: { eslint: '^12.0.0' } }, null, 2),
        'utf-8',
      );
      await majors(dir, { medidoEm: '2026-11-10', majors: { eslint: 10 } });
      await pendencias(dir, [
        {
          pacote: 'eslint',
          faixaAtual: '^9.39.5',
          majorAtual: 9,
          majorNova: 10,
          motivo: 'flat-config breaking: acompanha o eslint 10',
          declaradaEm: '2026-11-09',
        },
      ]);

      const r = await checkDependencyFreshness({ repoRoot: dir });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('envelheceu');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('nao acusa pendencia de pacote declarado em faixa que o gate nao entende', async () => {
    const dir = await repo();
    try {
      // `latest` não tem major: o gate não inventa número para spec que ele
      // não entende, e não acusa a pendência com ele.
      await writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify({ dependencies: { eslint: 'latest' } }, null, 2),
        'utf-8',
      );
      await majors(dir, { medidoEm: '2026-11-10', majors: { eslint: 10 } });
      await pendencias(dir, [
        {
          pacote: 'eslint',
          faixaAtual: 'latest',
          majorAtual: 9,
          majorNova: 10,
          motivo: 'flat-config breaking: acompanha o eslint 10',
          declaradaEm: '2026-11-09',
        },
      ]);

      const r = await checkDependencyFreshness({ repoRoot: dir });
      expect(r.ok).toBe(true);
      expect(r.errors).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('nao julga uma pendencia que o modelo de major nao expressa (pacote 0.x)', async () => {
    const dir = await repo();
    try {
      // A major de um pacote 0.x é 0 em QUALQUER versão — o modelo não sabe
      // dizer "a major foi adotada". Uma pendência 0.x escrita à mão não pode
      // ser julgada por essa regra (e não pode ser acusa com "a major 0 não
      // sobe agora"). MEDIDO 2026-11-10: sem o corte, o gate acusava erro.
      await writeFile(
        path.join(dir, 'package.json'),
        JSON.stringify(
          { dependencies: { '@opentelemetry/exporter-trace-otlp-http': '^0.54.2' } },
          null,
          2,
        ),
        'utf-8',
      );
      await majors(dir, {
        medidoEm: '2026-11-10',
        majors: { '@opentelemetry/exporter-trace-otlp-http': 0 },
      });
      await pendencias(dir, [
        {
          pacote: '@opentelemetry/exporter-trace-otlp-http',
          faixaAtual: '^0.54.2',
          majorAtual: 0,
          majorNova: 0,
          motivo: 'trem 0.x nao sobe',
          declaradaEm: '2026-11-10',
        },
      ]);

      const r = await checkDependencyFreshness({ repoRoot: dir });
      expect(r.ok).toBe(true);
      expect(r.errors).toEqual([]);
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
