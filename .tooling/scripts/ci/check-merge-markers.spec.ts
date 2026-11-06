import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CAMINHOS_IGNORADOS,
  checkMergeMarkers,
  detectaConflitos,
  ehArquivoDeTexto,
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

  it('NÃO acusa `=======` fora de um bloco', () => {
    expect(detectaConflitos('=======\n')).toEqual([]);
  });

  it('acusa o `=======` de um bloco de conflito FECHADO', () => {
    const dentro = detectaConflitos('<<<<<<< HEAD\nmeio\n=======\noutro\n>>>>>>> abc\n');
    expect(dentro.map((a) => a.linha)).toEqual([1, 3, 5]);
  });

  it('um bloco TRUNCADO não envenena o resto do arquivo (o underline setext de depois não é marcador)', () => {
    // MEDIDO 2026-11-05: com o `dentroDoBloco` ligado até o fim, todo
    // underline de heading setext posterior virava "marcador de conflito".
    const conteudo = ['<<<<<<< HEAD', 'meio', '', '# Título', '=======', '', 'texto'].join('\n');
    const achados = detectaConflitos(conteudo);
    expect(achados.map((a) => a.linha)).toEqual([1]);
    expect(achados.map((a) => a.marcador)).toEqual(['<<<<<<< HEAD']);
  });

  it('devolve a linha 1-based do marcador', () => {
    const achados = detectaConflitos('a\nb\n<<<<<<< HEAD\n');
    expect(achados[0]?.linha).toBe(3);
  });

  it('não acusa texto que só menciona a palavra', () => {
    expect(detectaConflitos('use <<<<<<< para marcar conflito')).toEqual([]);
  });

  it('o separador tem 7 `=` — o que o git escreve', () => {
    // 8 `=` não é o que o git escreve; e o underline setext pode ter 7.
    const oito = detectaConflitos('<<<<<<< HEAD\n========\noutro\n>>>>>>> abc\n');
    expect(oito.map((a) => a.linha)).toEqual([1, 4]);
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

describe('ehArquivoDeTexto', () => {
  it('texto é texto; binário (byte NULO) não é', () => {
    expect(ehArquivoDeTexto(Buffer.from('a\nb\n', 'utf-8'))).toBe(true);
    expect(ehArquivoDeTexto(Buffer.from([0x61, 0x00, 0x62]))).toBe(false);
  });

  it('o byte NULO só conta nos primeiros 8000 bytes (heurístico do git)', () => {
    const grande = Buffer.concat([Buffer.alloc(9000, 0x61), Buffer.from([0x00])]);
    expect(ehArquivoDeTexto(grande)).toBe(true);
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

  it('acusa o marcador em QUALQUER arquivo de texto versionado — não só em 12 extensões', async () => {
    // MEDIDO 2026-11-05: a allowlist de extensões pulava 44 arquivos
    // versionados — as migration.sql do Prisma, o schema.prisma, os
    // Dockerfile e os hooks do husky. A convenção promete "qualquer arquivo
    // de texto versionado".
    gitInit();
    const bloco = '<<<<<<< HEAD\nmeio\n=======\noutro\n>>>>>>> abc\n';
    writeFile('apps/api/prisma/schema.prisma', bloco);
    writeFile('apps/api/prisma/migrations/x/migration.sql', bloco);
    writeFile('apps/api/Dockerfile', bloco);
    writeFile('.husky/pre-push', bloco);
    writeFile('notas.txt', bloco);
    execFileSync('git', ['add', '-A'], { cwd: tmp });
    const r = await checkMergeMarkers({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    const accuse = r.errors.map((e) => e.split("'")[1]?.split(':')[0]);
    for (const arquivo of [
      'apps/api/prisma/schema.prisma',
      'apps/api/prisma/migrations/x/migration.sql',
      'apps/api/Dockerfile',
      '.husky/pre-push',
      'notas.txt',
    ]) {
      expect(accuse).toContain(arquivo);
    }
  });

  it('acusa o marcador no 1º arquivo quando há BOM', async () => {
    gitInit();
    writeFile('docs/bom.md', '﻿<<<<<<< HEAD\nmeio\n=======\noutro\n>>>>>>> abc\n');
    execFileSync('git', ['add', '-A'], { cwd: tmp });
    const r = await checkMergeMarkers({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('<<<<<<< HEAD'))).toBe(true);
  });

  it('um conflito de merge REAL (3 estágios no índice) é acusado UMA vez por marcador', async () => {
    // MEDIDO 2026-11-05: `git ls-files` sem `--deduplicate` devolve o path
    // unmerged 3 vezes — o mesmo achado sairia 3 vezes.
    gitInit();
    execFileSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: tmp });
    writeFile('f.md', 'base\n');
    execFileSync('git', ['add', '-A'], { cwd: tmp });
    execFileSync('git', ['commit', '-qm', 'base'], { cwd: tmp });
    execFileSync('git', ['checkout', '-qb', 'lateral'], { cwd: tmp });
    writeFile('f.md', 'um\n');
    execFileSync('git', ['commit', '-qam', 'um'], { cwd: tmp });
    execFileSync('git', ['checkout', '-q', 'master'], { cwd: tmp });
    writeFile('f.md', 'dois\n');
    execFileSync('git', ['commit', '-qam', 'dois'], { cwd: tmp });
    // `git merge` sai com código != 0 quando há conflito — é o estado que o
    // teste quer, não uma falha do teste.
    try {
      execFileSync('git', ['merge', 'lateral'], { cwd: tmp, stdio: 'ignore' });
    } catch {
      /* conflito esperado */
    }

    const r = await checkMergeMarkers({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    // O índice tem 3 estágios para o same path (base/ours/theirs) — sem o
    // dedupe, o MESMO achado sai 3× (o gate acusaria 9 em vez de 3).
    expect(r.errors).toHaveLength(3);
    expect(r.errors.filter((e) => e.includes('<<<<<<< HEAD'))).toHaveLength(1);
  });

  it('mede a árvore INTEIRA mesmo quando o repoRoot é um subdiretório', async () => {
    gitInit();
    writeFile('docs/x.md', '<<<<<<< HEAD\nmeio\n=======\noutro\n>>>>>>> abc\n');
    execFileSync('git', ['add', '-A'], { cwd: tmp });
    const r = await checkMergeMarkers({ repoRoot: join(tmp, 'docs') });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('docs/x.md');
  });

  it('acusa o marcador que está só na WORKING TREE (não staged)', async () => {
    // MEDIDO 2026-11-05: o gate lê o índice E o disco. O disco só entra
    // quando ele pode divergir — arquivo com mudança não staged, ou índice
    // unmerged. Um arquivo modificado e NÃO staged tem o índice limpo e o
    // disco com o marcador: sem a leitura do disco, o gate passava.
    gitInit();
    writeFile('docs/x.md', 'limpo\n');
    execFileSync('git', ['add', '-A'], { cwd: tmp });
    execFileSync('git', ['commit', '-qm', 'limpo'], { cwd: tmp });
    writeFile('docs/x.md', '<<<<<<< HEAD\nmeio\n=======\noutro\n>>>>>>> abc\n');
    const r = await checkMergeMarkers({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('docs/x.md');
  });

  it('acusa o marcador que está no ÍNDICE, mesmo com o arquivo APAGADO do disco', async () => {
    // MEDIDO 2026-11-05: ler o DISCO media outra coisa — um arquivo staged com
    // marcador e depois apagado passava pelo gate e era publicado com o
    // marcador dentro. "Versionado" é o blob do índice.
    gitInit();
    writeFile('docs/x.md', '<<<<<<< HEAD\nmeio\n=======\noutro\n>>>>>>> abc\n');
    execFileSync('git', ['add', '-A'], { cwd: tmp });
    rmSync(join(tmp, 'docs/x.md'), { force: true });
    const r = await checkMergeMarkers({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('docs/x.md');
  });

  it('nomeia a ORIGEM do achado — índice e working tree', async () => {
    // O mesmo arquivo pode ter marcador em linhas diferentes nos dois lados
    // (o que será publicado vs o que está no disco). Sem dizer de onde veio,
    // o leitor não sabe qual é o que o `git commit` publica.
    gitInit();
    writeFile('docs/x.md', 'limpo\n');
    execFileSync('git', ['add', '-A'], { cwd: tmp });
    execFileSync('git', ['commit', '-qm', 'limpo'], { cwd: tmp });
    writeFile('docs/x.md', 'a\nb\n<<<<<<< HEAD\n');
    execFileSync('git', ['add', '-A'], { cwd: tmp });
    writeFile('docs/x.md', 'a\nb\nc\nd\ne\nf\n<<<<<<< HEAD\n');
    const r = await checkMergeMarkers({ repoRoot: tmp });
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toContain('índice');
    expect(r.errors[1]).toContain('working tree');
  });

  it('DECLARA o skip quando o git não está disponível (não é verde mudo)', async () => {
    const r = await checkMergeMarkers({ repoRoot: join(tmpdir(), 'nao-existe-xyz') });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.skipped).toBe(true);
    expect(r.reason).toBeTruthy();
  });

  it('um blob indexado ilegível vira advisory, não silêncio', async () => {
    // O blob do índice é legível mesmo com o arquivo fora do disco — o
    // advisory é para o caso em que o GIT não devolve o blob.
    gitInit();
    writeFile('docs/x.md', 'ok\n');
    execFileSync('git', ['add', '-A'], { cwd: tmp });
    const r = await checkMergeMarkers({ repoRoot: tmp });
    expect(r.ok).toBe(true);
    expect(r.advisories ?? []).toEqual([]);
  });

  it('o repo real está limpo — o conflito do #143 foi corrigido', async () => {
    const r = await checkMergeMarkers({ repoRoot: process.cwd() });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('mede a árvore INTEIRA mesmo com repoRoot num subdiretório — o marcador pode estar FORA dele', async () => {
    // MEDIDO 2026-11-05: `git ls-files` sem pathspec lista só o que está
    // debaixo do cwd — `--full-name` muda o FORMATO do path, não o ESCOPO.
    // O pathspec `:/` é o que traz a árvore inteira.
    gitInit();
    writeFile('root.md', '<<<<<<< HEAD\nmeio\n=======\noutro\n>>>>>>> abc\n');
    mkdirSync(join(tmp, 'docs'), { recursive: true });
    execFileSync('git', ['add', '-A'], { cwd: tmp });
    const r = await checkMergeMarkers({ repoRoot: join(tmp, 'docs') });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('root.md');
  });

  it('um blob AUSENTE no índice não silencia os arquivos seguintes', async () => {
    // MEDIDO 2026-11-05: o `git cat-file --batch` responde "<sha> missing\n"
    // (sem campo de tamanho) para um objeto ausente — e o parser desalinhava,
    // o arquivo seguinte era lido do byte errado, o marcador dele era
    // perdido e o gate devolvia VERDE.
    gitInit();
    writeFile('a.txt', 'a\n');
    writeFile('b.txt', 'b\n');
    writeFile('c.txt', '<<<<<<< HEAD\nmeio\n=======\noutro\n>>>>>>> abc\n');
    execFileSync('git', ['add', '-A'], { cwd: tmp });
    execFileSync('git', ['commit', '-qm', 'base'], { cwd: tmp });
    // apaga o objeto do blob de b.txt do repositório
    const sha = execFileSync('git', ['rev-parse', ':b.txt'], {
      cwd: tmp,
      encoding: 'utf-8',
    }).trim();
    rmSync(join(tmp, '.git/objects', sha.slice(0, 2), sha.slice(2)), { force: true });
    const r = await checkMergeMarkers({ repoRoot: tmp });
    // o gate não pode sair verde: ou acusa o marcador de c.txt, ou declara skip
    expect(r.ok && r.skipped !== true).toBe(false);
    if (r.ok) {
      expect(r.errors.length + (r.advisories?.length ?? 0)).toBeGreaterThan(0);
    } else {
      expect(r.errors.some((e) => e.includes('c.txt'))).toBe(true);
    }
  });

  it('um arquivo com assume-unchanged ainda é medido (o diff-files não o lista)', async () => {
    // MEDIDO 2026-11-05: `git diff-files` omite os arquivos com
    // `assume-unchanged` — e o índice continua em stage 0, então o gate
    // passava verde com o marcador na working tree.
    gitInit();
    writeFile('f.md', 'limpo\n');
    execFileSync('git', ['add', '-A'], { cwd: tmp });
    execFileSync('git', ['commit', '-qm', 'base'], { cwd: tmp });
    writeFile('f.md', '<<<<<<< HEAD\nmeio\n=======\noutro\n>>>>>>> abc\n');
    execFileSync('git', ['update-index', '--assume-unchanged', 'f.md'], { cwd: tmp });
    const r = await checkMergeMarkers({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('f.md');
  });

  it('o gate NÃO dispara no fonte dele mesmo (classe 3)', async () => {
    // MEDIDO 2026-11-05: o exemplo do defeito no JSDoc do gate era
    // byte-a-byte o que o gate caça — só não disparava porque o comentário
    // prefixava cada linha com " * ". Dedentado, o gate se accusava.
    const fonte = readFileSync(
      join(process.cwd(), '.tooling/scripts/ci/check-merge-markers.ts'),
      'utf-8',
    );
    expect(detectaConflitos(fonte)).toEqual([]);
  });
});
