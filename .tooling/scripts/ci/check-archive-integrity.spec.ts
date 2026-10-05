// .tooling/scripts/ci/check-archive-integrity.spec.ts
//
// pt-BR: Testes do check de integridade do archive (task 1.4 do plano
// docs/superpowers/plans/2026-10-03-guard-classes.md, métrica B19).
//
// O defeito que estes testes existem para prender: o check calculava
// `join(repoRoot, '.agents/runs/archive')`, confirmava com `existsSync` que
// esse diretório existe, e então chamava `execSync('pnpm archive:lint')` SEM
// `--archive-dir`. O script `archive:lint` do package.json é
// `cd tooling/scripts && pnpm archive:lint`, e o default do linter é relativo
// ao cwd — então o early-return rodava em
// `tooling/scripts/.agents/runs/archive`, que não existe. **O archive real
// nunca era lido**, enquanto o check renderizava `✓`.
//
// A assinatura do bug: o `existsSync` — a prova de vida do gate — passava. A
// âncora e a execução estavam em sistemas de arquivos diferentes.
//
// Cobre:
// - a invocação recebe o archive ABSOLUTO, imune ao `cd` do script npm
// - arquivo inválido no archive REAL deixa o check vermelho (o que não acontecia)
// - arquivo inválido no diretório ERRADO não altera o resultado
// - precondição ausente continua `skipped`, nunca `✓` calado

import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkArchiveIntegrity, buildLintArgs } from './check-archive-integrity.js';

const REPO = resolve(process.cwd());
const ARCHIVE = join(REPO, '.agents/runs/archive');
const WRONG_DIR = join(REPO, 'tooling/scripts/.agents/runs/archive');
const PLANTED = join(ARCHIVE, '2026-10-05-prova-plantada.md');

const INVALID = ['---', 'name: nao-e-um-archive', '---', '', 'body', ''].join('\n');

afterEach(() => {
  if (existsSync(PLANTED)) rmSync(PLANTED, { force: true });
  if (existsSync(join(REPO, 'tooling/scripts/.agents'))) {
    rmSync(join(REPO, 'tooling/scripts/.agents'), { recursive: true, force: true });
  }
});

describe('buildLintArgs', () => {
  it('passa o archive por --archive-dir, em caminho ABSOLUTO', () => {
    const { archiveDir, args } = buildLintArgs(REPO);
    expect(args).toContain(`--archive-dir=${archiveDir}`);
    // Absoluto é o que torna o check imune ao `cd tooling/scripts` do script
    // npm. Um caminho relativo aqui é exatamente o bug B19 de volta.
    expect(archiveDir.startsWith('/')).toBe(true);
    expect(args.some((a) => a.includes('..'))).toBe(false);
  });

  it('o archiveDir aponta para o diretório que o check existencia', () => {
    const { archiveDir } = buildLintArgs(REPO);
    expect(archiveDir).toBe(join(REPO, '.agents/runs/archive'));
  });

  it('funciona com repoRoot relativo (o preflight passa ".")', () => {
    const { archiveDir } = buildLintArgs('.');
    expect(archiveDir.startsWith('/')).toBe(true);
    expect(archiveDir.endsWith('/.agents/runs/archive')).toBe(true);
  });
});

describe('checkArchiveIntegrity', () => {
  it('estado real do repo: verde', async () => {
    const r = await checkArchiveIntegrity(REPO);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('arquivo INVÁLIDO no archive REAL deixa o check vermelho', async () => {
    // Este é o RED que o B19 impossibilitava. Antes do fix, o check seguia
    // verde porque o linter olhava outro diretório.
    writeFileSync(PLANTED, INVALID);
    const r = await checkArchiveIntegrity(REPO);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('2026-10-05-prova-plantada.md');
  });

  it('arquivo inválido no diretório ERRADO não altera o resultado', async () => {
    // Guarda de direcionalidade pelo lado inverso: depois do fix, o diretório
    // onde o bug lia precisa ser irrelevante.
    mkdirSync(WRONG_DIR, { recursive: true });
    writeFileSync(join(WRONG_DIR, 'sujeira.md'), INVALID);
    const r = await checkArchiveIntegrity(REPO);
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('archive ausente → skipped com motivo, nunca ok silencioso', async () => {
    const r = await checkArchiveIntegrity(join(REPO, 'package.json'));
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(true);
    expect(r.reason).toBeTruthy();
  });
});
