import { describe, it, expect, beforeAll } from 'vitest';
import { checkEslintDrift } from './check-eslint-drift';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('checkEslintDrift', () => {
  let tmpRoot: string;

  beforeAll(async () => {
    // Fixtures herméticas (Task 3 pattern): diretório temporário único
    // por test run, sem dependência de /tmp/ci-fixtures.
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'eslint-drift-test-'));

    // Fixtures "flat-only": apenas eslint.config.* (sem .eslintrc legada).
    const flatOnlyDir = path.join(tmpRoot, 'flat-only', 'app1');
    await fs.mkdir(flatOnlyDir, { recursive: true });
    await fs.writeFile(path.join(flatOnlyDir, 'eslint.config.mjs'), 'export default [];\n');

    // Fixtures "has-legacy": contém .eslintrc.js (config legada).
    const hasLegacyDir = path.join(tmpRoot, 'has-legacy', 'app2');
    await fs.mkdir(hasLegacyDir, { recursive: true });
    await fs.writeFile(path.join(hasLegacyDir, '.eslintrc.js'), 'module.exports = {};\n');

    // Fixtures "allowlist": contém .eslintrc.js mas no caminho allowlist.
    const allowlistDir = path.join(tmpRoot, 'allowlist', 'app3');
    await fs.mkdir(allowlistDir, { recursive: true });
    await fs.writeFile(path.join(allowlistDir, '.eslintrc.js'), 'module.exports = {};\n');

    // Fixtures "empty": appsRoot sem configs (sem erro).
    const emptyDir = path.join(tmpRoot, 'empty');
    await fs.mkdir(emptyDir, { recursive: true });

    // Fixtures "mixed": flat + legacy no mesmo workspace (deve falhar).
    const mixedDir = path.join(tmpRoot, 'mixed', 'app4');
    await fs.mkdir(mixedDir, { recursive: true });
    await fs.writeFile(path.join(mixedDir, 'eslint.config.mjs'), 'export default [];\n');
    await fs.writeFile(path.join(mixedDir, '.eslintrc.cjs'), 'module.exports = {};\n');
  });

  it('deve passar quando todos os apps usam eslint.config.* (flat config)', async () => {
    const result = await checkEslintDrift({
      appsRoot: path.join(tmpRoot, 'flat-only'),
      allowlist: [],
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('deve falhar quando um app ainda usa .eslintrc.js legada', async () => {
    const result = await checkEslintDrift({
      appsRoot: path.join(tmpRoot, 'has-legacy'),
      allowlist: [],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('.eslintrc.js'))).toBe(true);
  });

  it('deve ignorar arquivos .eslintrc.js que estão na allowlist', async () => {
    // O allowlist é comparado contra path.relative(appsRoot, file),
    // portanto o caminho é relativo ao appsRoot passado, não absoluto.
    const result = await checkEslintDrift({
      appsRoot: path.join(tmpRoot, 'allowlist'),
      allowlist: ['app3/.eslintrc.js'],
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('deve passar quando appsRoot está vazio (sem configs)', async () => {
    const result = await checkEslintDrift({
      appsRoot: path.join(tmpRoot, 'empty'),
      allowlist: [],
    });
    expect(result.ok).toBe(true);
  });

  it('deve falhar quando há flat e legacy misturados no mesmo workspace', async () => {
    const result = await checkEslintDrift({
      appsRoot: path.join(tmpRoot, 'mixed'),
      allowlist: [],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('.eslintrc.cjs'))).toBe(true);
  });
});
