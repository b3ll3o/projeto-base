import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
    it('acusa `check-*.ts` em tooling/scripts/ — a regra (1), que não tinha teste', async () => {
      repoComGateEm('tooling/scripts/check-vazado.ts');
      const r = await checkHarnessLocation({ repoRoot: tmp });
      expect(r.ok).toBe(false);
      const e = r.errors.find((x) => x.includes('fora do lugar'));
      expect(e).toMatch(/tooling\/scripts\/check-vazado\.ts/);
      expect(e).toMatch(/\.tooling\/scripts\/ci/);
    });

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

    // (1), (2) e (4) dependem de `git ls-files`. Sem `git` — ou sem history —
    // os três caem, e o `catch {}` vazio de cada um devolvia `ok:true` sem ter
    // medido nada: a §4 de `guard-classes.md` ("quem não pode ser comparado é
    // RECLASSIFICADO, nunca apagado") num gate que nem é do diff desta branch.
    describe('`git` indisponível', () => {
      let pathOriginal: string;

      beforeEach(() => {
        // Repo git de verdade primeiro — o setup usa o `git` bom, e só a
        // MEDIÇÃO roda contra o stub. Duas violações plantadas, uma por regra
        // que depende de `git`: se o `git` responder, elas aparecem (é o
        // controle de positividade dos testes acima).
        repoComGateEm('tooling/scripts/check-vazado.ts');
        repoComGateEm('.tooling/scripts/ci/sub/check-sombreado.ts');
        const stub = join(tmp, 'bin');
        mkdirSync(stub, { recursive: true });
        // Sai com 1 e escreve em stderr, como o `git` real faz fora de repo —
        // senão o motivo do skip não tem causa nenhuma para mostrar.
        writeFileSync(
          join(stub, 'git'),
          '#!/bin/sh\necho "fatal: not a git repository" >&2\nexit 128\n',
        );
        chmodSync(join(stub, 'git'), 0o755);
        pathOriginal = process.env['PATH'] ?? '';
        process.env['PATH'] = `${stub}:${pathOriginal}`;
      });

      afterEach(() => {
        process.env['PATH'] = pathOriginal;
      });

      it('NÃO devolve `ok:true` mudo — `skipped` nomeia o que não rodou', async () => {
        const r = await checkHarnessLocation({ repoRoot: tmp });
        expect(r.skipped).toBe(true);
        expect(r.reason).toMatch(/NÃO rodaram/);
        // `errors` vazio é o CORRETO aqui: nada foi medido, então não há o que
        // acusar. O que não pode é o gate chamar isso de "verifiquei e passou".
        expect(r.errors).toEqual([]);
      });

      it('o motivo do skip traz a CAUSA do `git`, não o "Command failed" repetindo o pathspec', async () => {
        // MEDIDO 2026-10-19 por revisão independente: `String(err).split('\n')[0]`
        // devolvia "Error: Command failed: git ls-files … <pathspec>", que repete
        // o pathspec já impresso 20 caracteres antes e joga fora `err.stderr`,
        // onde está a causa. Três causas distintas — git ausente, não é repo,
        // índice corrompido — saíam idênticas, e um skip que não diz por que não
        // mediu é o `✓` de novo com outro uniforme.
        const r = await checkHarnessLocation({ repoRoot: tmp });
        expect(r.reason).toMatch(/not a git repository/);
        expect(r.reason).not.toMatch(/Command failed/);
      });

      it('`skipped` não engole o erro de (3), que NÃO depende de git', async () => {
        // `ok` e `skipped` são independentes por contrato (`check-types.ts`):
        // um defeito real continua defeito mesmo com o resto pulado.
        writeFile(
          '.tooling/scripts/ci/preflight-gates.ts',
          'export const PREFLIGHT_CHECKS = [{name:"falso",file:".tooling/scripts/ci/check-nao-existe.ts"}];',
        );
        const r = await checkHarnessLocation({ repoRoot: tmp });
        expect(r.skipped).toBe(true);
        expect(r.ok).toBe(false);
        expect(r.errors[0]).toMatch(/NÃO EXISTE/);
      });
    });
  });
});
