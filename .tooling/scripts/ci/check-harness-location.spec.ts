import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkHarnessLocation } from './check-harness-location';

describe('checkHarnessLocation', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'check-harness-location-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeFile(relPath: string, content: string = '// stub') {
    const full = join(tmp, relPath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }

  // Sub-checks 1 e 2 (vazamento entre tooling/ e .tooling/) dependem de
  // `git ls-files` — em tmpdir fora de um repo git, devolvem vazio, e o
  // gate passa por não ter o que vazar. Os testes abaixo cobrem (3), a
  // paridade preflight-gates ↔ disco, que é o que prova o gate de verdade.
  // Os (1) e (2) seriam cegos num ambiente sem git; o repo real é o
  // diferencial.

  it('verde quando preflight-gates.ts aponta para arquivos que existem', async () => {
    writeFile(
      '.tooling/scripts/ci/preflight-gates.ts',
      'export const PREFLIGHT_CHECKS = [{name:"x",file:".tooling/scripts/ci/check-types.ts"}];',
    );
    writeFile('.tooling/scripts/ci/check-types.ts');
    const r = await checkHarnessLocation({ repoRoot: tmp });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('vermelho, e nomeando o gate, quando o arquivo declarado não existe', async () => {
    writeFile(
      '.tooling/scripts/ci/preflight-gates.ts',
      'export const PREFLIGHT_CHECKS = [{name:"falso",file:".tooling/scripts/ci/check-que-nao-existe.ts"}];',
    );
    const r = await checkHarnessLocation({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/falso/);
    expect(r.errors[0]).toMatch(/check-que-nao-existe\.ts/);
    expect(r.errors[0]).toMatch(/NÃO EXISTE/);
  });

  it('vermelho, listando TODOS os arquivos faltantes (não para no primeiro)', async () => {
    writeFile(
      '.tooling/scripts/ci/preflight-gates.ts',
      'export const PREFLIGHT_CHECKS = [{name:"a",file:".tooling/scripts/ci/a.ts"},{name:"b",file:".tooling/scripts/ci/b.ts"}];',
    );
    const r = await checkHarnessLocation({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors).toHaveLength(2);
    expect(r.errors.some((e) => e.includes('a.ts'))).toBe(true);
    expect(r.errors.some((e) => e.includes('b.ts'))).toBe(true);
  });

  it('vermelho quando preflight-gates.ts não existe — gate não pode afirmar nada', async () => {
    // tmpdir não tem preflight-gates.ts
    const r = await checkHarnessLocation({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/preflight-gates\.ts não encontrado/);
  });

  // Sub-check (4): `git ls-files` só devolve path TRACKED, então o teste
  // precisa de um repo git de verdade. Sem `git init`, o gate devolveria
  // vazio e ficaria verde por não ter o que ver — a mesma cegueira que os
  // sub-checks (1) e (2) têm, e que o comentário do topo já declarava.
  describe('check-*.ts em subdiretório (o preflight varre por glob plano)', () => {
    function git(...args: string[]) {
      execFileSync('git', args, { cwd: tmp, stdio: 'ignore' });
    }

    /** Repo git real, com preflight-gates.ts válido, e `check-*.ts` no path dado. */
    function repoComGateEm(gateRelPath: string) {
      git('init', '-q');
      git('config', 'user.email', 't@t');
      git('config', 'user.name', 't');
      writeFile('.tooling/scripts/ci/preflight-gates.ts', 'export const PREFLIGHT_CHECKS = [];');
      writeFile('.tooling/scripts/ci/check-types.ts');
      writeFile(gateRelPath);
      git('add', '-A');
    }

    it('verde quando o check-*.ts vive NA RAIZ de .tooling/scripts/ci/', async () => {
      repoComGateEm('.tooling/scripts/ci/check-na-raiz.ts');
      const r = await checkHarnessLocation({ repoRoot: tmp });
      expect(r.errors.filter((e) => e.includes('subdir'))).toEqual([]);
    });

    it('vermelho, nomeando o path, quando o check-*.ts vive em SUBDIR', async () => {
      repoComGateEm('.tooling/scripts/ci/sub/check-sombreado.ts');
      const r = await checkHarnessLocation({ repoRoot: tmp });
      expect(r.ok).toBe(false);
      const e = r.errors.find((x) => x.includes('subdir'));
      expect(e).toMatch(/ci\/sub\/check-sombreado\.ts/);
      expect(e).toMatch(/sombreado/);
    });

    it('NÃO acusa o spec do próprio gate — spec em subdir é convenção do repo', async () => {
      repoComGateEm('.tooling/scripts/ci/sub/check-algo.spec.ts');
      const r = await checkHarnessLocation({ repoRoot: tmp });
      expect(r.errors.filter((e) => e.includes('subdir'))).toEqual([]);
    });

    it('NÃO acusa arquivo que não é check-* — o subdir só sombreia GATES', async () => {
      repoComGateEm('.tooling/scripts/ci/sub/ajudante.ts');
      const r = await checkHarnessLocation({ repoRoot: tmp });
      expect(r.errors.filter((e) => e.includes('subdir'))).toEqual([]);
    });

    // MEDIDO 2026-10-16: `git ls-files` sem `--others` só devolve o que está
    // TRACKED, e um gate novo nasce untracked até o primeiro commit dele. O
    // gate roda no pre-push, e a janela entre "criei o gate" e "commitei o
    // gate" é exatamente quando ele ainda não está stageado — verde por não
    // ter o que ver. O repo já tem o padrão em `check-teeth-registry.ts:268`.
    it('acusa o gate em subdir mesmo SEM git add (untracked)', async () => {
      git('init', '-q');
      git('config', 'user.email', 't@t');
      git('config', 'user.name', 't');
      writeFile('.tooling/scripts/ci/preflight-gates.ts', 'export const PREFLIGHT_CHECKS = [];');
      git('add', '-A');
      // agora o gate existe e NÃO é tracked
      writeFile('.tooling/scripts/ci/sub/check-nao-stageado.ts');
      const r = await checkHarnessLocation({ repoRoot: tmp });
      expect(r.errors.some((x) => x.includes('subdir') && x.includes('check-nao-stageado'))).toBe(
        true,
      );
    });
  });
});
