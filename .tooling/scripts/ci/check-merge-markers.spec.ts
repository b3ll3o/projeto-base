import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CAMINHOS_IGNORADOS,
  checkMergeMarkers,
  detectaConflitos,
  ehIgnorado,
} from './check-merge-markers';

describe('detectaConflitos', () => {
  it('acha o marcador de início e o de fim de um bloco de conflito', () => {
    const achados = detectaConflitos(
      [
        'texto',
        '<<<<<<< HEAD',
        'a linha do HEAD',
        '=======',
        'a linha do outro lado',
        '>>>>>>> bbd0a9a',
        'fim',
      ].join('\n'),
    );
    expect(achados.map((a) => a.linha)).toEqual([2, 4, 6]);
    expect(achados[0]?.marcador).toBe('<<<<<<< HEAD');
  });

  it('NÃO acusa o underline de um heading setext — `=======` sozinho é sintaxe de Markdown', () => {
    const conteudo = ['# Título', '=======', '', 'texto'].join('\n');
    expect(detectaConflitos(conteudo)).toEqual([]);
  });

  it('NÃO acusa `=======` fora de um bloco, mas acusa dentro dele', () => {
    expect(detectaConflitos('=======\n')).toEqual([]);
    const dentro = detectaConflitos('<<<<<<< HEAD\n=======\n');
    expect(dentro).toHaveLength(2);
  });

  it('devolve a linha 1-based do marcador', () => {
    const achados = detectaConflitos('a\nb\n<<<<<<< HEAD\n');
    expect(achados[0]?.linha).toBe(3);
  });

  it('não acusa texto que só menciona a palavra', () => {
    expect(detectaConflitos('use <<<<<<< para marcar conflito')).toEqual([]);
  });
});

describe('ehIgnorado', () => {
  it('ignora o registro datado e o artefato de execução', () => {
    expect(ehIgnorado('docs/superpowers/plans/x.md')).toBe(true);
    expect(ehIgnorado('.agents/runs/2026-11-03-x.md')).toBe(true);
  });

  it('NÃO ignora as convenções — foi lá que o conflito do #143 ficou', () => {
    expect(ehIgnorado('.agents/specs/conventions/estrutura-e-versionamento.md')).toBe(false);
    expect(ehIgnorado('docs/api/users.md')).toBe(false);
  });

  it('os caminhos ignorados são os mesmos dois do check-doc-size', () => {
    expect(CAMINHOS_IGNORADOS).toEqual(['docs/superpowers/', '.agents/runs/']);
  });
});

describe('checkMergeMarkers', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'check-merge-markers-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeFile(relPath: string, content: string) {
    const full = join(tmp, relPath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }

  /** O gate usa `git ls-files`; sem repo git o gate não tem o que varrer. */
  function gitInit() {
    execFileSync('git', ['init', '-q'], { cwd: tmp });
    execFileSync('git', ['config', 'user.email', 'teste@local'], { cwd: tmp });
    execFileSync('git', ['config', 'user.name', 'Teste'], { cwd: tmp });
  }

  it('verde num repo sem conflito', async () => {
    gitInit();
    writeFile('README.md', '# ok\n\ntexto\n');
    writeFile('docs/api/users.md', 'ok\n');
    execFileSync('git', ['add', '-A'], { cwd: tmp });
    const r = await checkMergeMarkers({ repoRoot: tmp });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('vermelho, nomeando arquivo e linha, quando há marcador versionado', async () => {
    gitInit();
    writeFile('docs/x.md', 'antes\n<<<<<<< HEAD\nmeio\n=======\noutro\n>>>>>>> abc123\ndepois\n');
    execFileSync('git', ['add', '-A'], { cwd: tmp });
    const r = await checkMergeMarkers({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('docs/x.md:2');
    expect(r.errors[0]).toContain('<<<<<<< HEAD');
  });

  it('verde quando o marcador está no registro datado', async () => {
    gitInit();
    writeFile('docs/superpowers/plans/p.md', '<<<<<<< HEAD\nmeio\n=======\noutro\n>>>>>>> abc\n');
    execFileSync('git', ['add', '-A'], { cwd: tmp });
    const r = await checkMergeMarkers({ repoRoot: tmp });
    expect(r.ok).toBe(true);
  });

  it('verde quando o arquivo tem heading setext (o falso positivo que não pode existir)', async () => {
    gitInit();
    writeFile('docs/y.md', '# Título\n=======\n\ntexto\n');
    execFileSync('git', ['add', '-A'], { cwd: tmp });
    const r = await checkMergeMarkers({ repoRoot: tmp });
    expect(r.ok).toBe(true);
  });

  it('o repo real está limpo — o conflito do #143 foi corrigido', async () => {
    const r = await checkMergeMarkers({ repoRoot: process.cwd() });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});
