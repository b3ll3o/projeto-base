import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkTeethCount } from './check-teeth-count';

describe('checkTeethCount', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'check-teeth-count-'));
  });
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  function writeFile(relPath: string, content: string = '') {
    const full = join(tmp, relPath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }

  it('verde quando name count === array length, e file count < name count', async () => {
    // 3 entries, 2 arquivos únicos (eslint-drift entra 2x)
    writeFile(
      '.tooling/scripts/ci/preflight-gates.ts',
      `export const PREFLIGHT_CHECKS = [
  { name: 'a', file: '.tooling/scripts/ci/check-x.ts', id: 'a' },
  { name: 'b', file: '.tooling/scripts/ci/check-x.ts', id: 'b' },
  { name: 'c', file: '.tooling/scripts/ci/check-y.ts', id: 'c' },
];`,
    );
    writeFile('.tooling/scripts/ci/check-x.ts');
    writeFile('.tooling/scripts/ci/check-y.ts');
    const r = await checkTeethCount({ repoRoot: tmp });
    expect(r.ok).toBe(true);
  });

  it('vermelho quando o grep acha MENOS `name:` do que o array tem (entry sem nome)', async () => {
    // Cenário: alguém adicionou uma entry sem o campo `name:` (provavelmente
    // WIP), e o array tem 2 mas o grep só vê 1.
    writeFile(
      '.tooling/scripts/ci/preflight-gates.ts',
      `export const PREFLIGHT_CHECKS = [
  { file: '.tooling/scripts/ci/check-x.ts', id: 'sem-nome' },
  { name: 'com-nome', file: '.tooling/scripts/ci/check-y.ts', id: 'com-nome' },
];`,
    );
    writeFile('.tooling/scripts/ci/check-x.ts');
    writeFile('.tooling/scripts/ci/check-y.ts');
    const r = await checkTeethCount({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/DIVERGE/);
    expect(r.errors[0]).toMatch(/1 linhas/);
    expect(r.errors[0]).toMatch(/2 entradas/);
  });

  it('vermelho quando o par name/file quebra (file count === name count)', async () => {
    // 2 entries, 2 arquivos únicos — quebra a relação esperada (diferença = 1).
    writeFile(
      '.tooling/scripts/ci/preflight-gates.ts',
      `export const PREFLIGHT_CHECKS = [
  { name: 'a', file: '.tooling/scripts/ci/check-x.ts', id: 'a' },
  { name: 'b', file: '.tooling/scripts/ci/check-y.ts', id: 'b' },
];`,
    );
    writeFile('.tooling/scripts/ci/check-x.ts');
    writeFile('.tooling/scripts/ci/check-y.ts');
    const r = await checkTeethCount({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/paridade quebrada/);
  });

  it('vermelho quando preflight-gates.ts não existe', async () => {
    const r = await checkTeethCount({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/PREFLIGHT_CHECKS/);
  });
});
