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
});
