import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { checkPackageJsonDrift } from './check-package-json-drift';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('checkPackageJsonDrift', () => {
  let tmpRoot: string;

  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pkg-drift-test-'));
  });

  afterAll(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('deve passar quando package.json tem todos os scripts canônicos', async () => {
    const dir = path.join(tmpRoot, 'valid');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'turbo run build',
          dev: 'turbo run dev',
          lint: 'turbo run lint',
          typecheck: 'turbo run typecheck',
          test: 'turbo run test',
          'ci:preflight': 'echo ok',
          'ci:local':
            'pnpm ci:preflight && pnpm stack:review && pnpm docs:sync && turbo run ci:quality',
          'tdd:check': 'turbo run tdd:check',
        },
      }),
    );

    const result = await checkPackageJsonDrift({ packageJsonPath: path.join(dir, 'package.json') });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('deve falhar se faltar script canônico crítico (ci:preflight)', async () => {
    const dir = path.join(tmpRoot, 'missing');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'turbo run build',
          'ci:local': 'echo local',
        },
      }),
    );

    const result = await checkPackageJsonDrift({ packageJsonPath: path.join(dir, 'package.json') });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('ci:preflight'))).toBe(true);
  });

  it('deve falhar se package.json for JSON inválido', async () => {
    const dir = path.join(tmpRoot, 'bad-json');
    await fs.mkdir(dir, { recursive: true });
    const p = path.join(dir, 'package.json');
    await fs.writeFile(p, '{ broken: }');

    const result = await checkPackageJsonDrift({ packageJsonPath: p });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('json'))).toBe(true);
  });

  it('deve falhar se um script referenciar um arquivo inexistente (script fantasma)', async () => {
    const dir = path.join(tmpRoot, 'phantom');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'turbo run build',
          'ci:preflight': 'tsx .tooling/scripts/ci/preflight.ts',
          'ci:local': 'echo local',
          'tdd:check': 'tsx tooling/scripts/this-file-does-not-exist.ts',
        },
      }),
    );

    const result = await checkPackageJsonDrift({
      packageJsonPath: path.join(dir, 'package.json'),
      projectRoot: dir,
    });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some(
        (e) => e.includes('script fantasma') && e.includes('this-file-does-not-exist.ts'),
      ),
    ).toBe(true);
  });

  it('deve falhar se um script `turbo run <task>` apontar para task inexistente', async () => {
    const dir = path.join(tmpRoot, 'turbo-phantom');
    await fs.mkdir(path.join(dir, 'apps', 'api'), { recursive: true });
    await fs.writeFile(path.join(dir, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
    await fs.writeFile(
      path.join(dir, 'turbo.json'),
      JSON.stringify({ tasks: { build: {}, lint: {} } }),
    );
    await fs.writeFile(
      path.join(dir, 'apps', 'api', 'package.json'),
      JSON.stringify({ name: '@projeto/api', scripts: { build: 'nest build' } }),
    );
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'turbo run build',
          dev: 'echo dev',
          lint: 'turbo run lint',
          typecheck: 'echo tc',
          test: 'echo test',
          'ci:preflight': 'echo ok',
          'ci:local': 'echo local',
          'tdd:check': 'turbo run tdd:check',
        },
      }),
    );

    const result = await checkPackageJsonDrift({ packageJsonPath: path.join(dir, 'package.json') });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("'tdd:check'") && e.includes('turbo'))).toBe(true);
  });

  it('deve aceitar task não declarada no turbo.json mas resolvível por script de pacote', async () => {
    // Task implícita: o turbo resolve qualquer script declarado em um pacote do
    // workspace, mesmo sem entrada em turbo.json (que só customiza cache). Se
    // este check acusasse, `test:e2e` seria falso positivo.
    const dir = path.join(tmpRoot, 'turbo-implicit');
    await fs.mkdir(path.join(dir, 'apps', 'api'), { recursive: true });
    await fs.writeFile(path.join(dir, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
    await fs.writeFile(
      path.join(dir, 'turbo.json'),
      JSON.stringify({ tasks: { build: {}, lint: {} } }),
    );
    await fs.writeFile(
      path.join(dir, 'apps', 'api', 'package.json'),
      JSON.stringify({
        name: '@projeto/api',
        scripts: { build: 'nest build', 'test:e2e': 'vitest run' },
      }),
    );
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'turbo run build',
          dev: 'echo dev',
          lint: 'turbo run lint',
          typecheck: 'echo tc',
          test: 'echo test',
          'ci:preflight': 'echo ok',
          'ci:local': 'echo local',
          'test:e2e': 'turbo run test:e2e',
        },
      }),
    );

    const result = await checkPackageJsonDrift({ packageJsonPath: path.join(dir, 'package.json') });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('deve extrair todas as tasks de `turbo run a b c --filter=x` e parar em &&', async () => {
    const dir = path.join(tmpRoot, 'turbo-multi');
    await fs.mkdir(path.join(dir, 'apps', 'api'), { recursive: true });
    await fs.writeFile(path.join(dir, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
    await fs.writeFile(
      path.join(dir, 'turbo.json'),
      JSON.stringify({ tasks: { build: {}, lint: {}, typecheck: {} } }),
    );
    await fs.writeFile(
      path.join(dir, 'apps', 'api', 'package.json'),
      JSON.stringify({ name: '@projeto/api', scripts: { build: 'nest build' } }),
    );
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'turbo run build',
          dev: 'echo dev',
          lint: 'turbo run lint',
          typecheck: 'echo tc',
          test: 'echo test',
          'ci:preflight': 'echo ok',
          // `typecheck` existe, `nao-existe` nao -> erro. O `&& rm -rf` depois
          // nao deve ser lido como task.
          'ci:local': 'pnpm turbo run build typecheck nao-existe --filter=@x && rm -rf dist',
        },
      }),
    );

    const result = await checkPackageJsonDrift({ packageJsonPath: path.join(dir, 'package.json') });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("'nao-existe'"))).toBe(true);
    expect(result.errors.some((e) => e.includes('rm -rf'))).toBe(false);
  });

  it('deve declarar skipped quando o workspace não tem pnpm-workspace.yaml', async () => {
    // Sem lista de pacotes não dá para resolver task implícita. Falhar aqui
    // seria erro falso; passar em silêncio seria gate que não pode falhar.
    const dir = path.join(tmpRoot, 'turbo-no-workspace');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'turbo run build',
          dev: 'echo dev',
          lint: 'echo lint',
          typecheck: 'echo tc',
          test: 'echo test',
          'ci:preflight': 'echo ok',
          'ci:local': 'echo local',
          'tdd:check': 'turbo run tdd:check',
        },
      }),
    );

    const result = await checkPackageJsonDrift({ packageJsonPath: path.join(dir, 'package.json') });
    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/pnpm-workspace\.yaml/);
  });

  it('deve aceitar scripts não-arquivo (comandos compostos via pnpm/&&)', async () => {
    const dir = path.join(tmpRoot, 'composite');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'package.json'),
      JSON.stringify({
        scripts: {
          build: 'turbo run build',
          dev: 'turbo run dev',
          lint: 'turbo run lint',
          typecheck: 'turbo run typecheck',
          test: 'turbo run test',
          'ci:local': 'pnpm ci:preflight && pnpm stack:review && turbo run ci:quality',
          'ci:preflight': 'echo ok',
          'tdd:check': 'echo ok',
        },
      }),
    );

    const result = await checkPackageJsonDrift({ packageJsonPath: path.join(dir, 'package.json') });
    expect(result.ok).toBe(true);
  });
});
