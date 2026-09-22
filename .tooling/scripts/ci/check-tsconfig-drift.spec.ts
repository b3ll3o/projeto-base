import { describe, it, expect, beforeAll } from 'vitest';
import { checkTsconfigDrift } from './check-tsconfig-drift';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('checkTsconfigDrift', () => {
  let tmpRoot: string;

  beforeAll(async () => {
    // Cria fixtures em diretório temporário único por test run
    // para garantir hermeticidade mesmo se /tmp/ci-fixtures não existir.
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tsconfig-drift-test-'));

    // Fixtures "consistent": todos definem os mesmos valores
    const consistentDir = path.join(tmpRoot, 'consistent');
    await fs.mkdir(consistentDir, { recursive: true });
    await fs.writeFile(
      path.join(consistentDir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true, noUncheckedIndexedAccess: true } }),
    );
    await fs.writeFile(
      path.join(consistentDir, 'tsconfig.app.json'),
      JSON.stringify({ compilerOptions: { strict: true, noUncheckedIndexedAccess: true } }),
    );

    // Fixtures "drift": tsconfig.app.json diverge
    const driftDir = path.join(tmpRoot, 'drift');
    await fs.mkdir(driftDir, { recursive: true });
    await fs.writeFile(
      path.join(driftDir, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true, noUncheckedIndexedAccess: true } }),
    );
    await fs.writeFile(
      path.join(driftDir, 'tsconfig.app.json'),
      JSON.stringify({ compilerOptions: { strict: true, noUncheckedIndexedAccess: false } }),
    );
  });

  it('deve passar quando strict e noUncheckedIndexedAccess são consistentes', async () => {
    const result = await checkTsconfigDrift({
      tsconfigsRoot: path.join(tmpRoot, 'consistent'),
      consistentKeys: ['strict', 'noUncheckedIndexedAccess'],
    });
    expect(result.ok).toBe(true);
  });

  it('deve falhar quando noUncheckedIndexedAccess=true em um tsconfig e false em outro', async () => {
    const result = await checkTsconfigDrift({
      tsconfigsRoot: path.join(tmpRoot, 'drift'),
      consistentKeys: ['strict', 'noUncheckedIndexedAccess'],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('noUncheckedIndexedAccess'))).toBe(true);
  });
});
