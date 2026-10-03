import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { checkPackageJsonDrift, extractTurboRunTasks } from './check-package-json-drift';
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

  /**
   * Cria um workspace mínimo: `pnpm-workspace.yaml` + `turbo.json` + 1 pacote.
   *
   * Sem isso o check se declara `skipped` e volta `ok: true` **sem verificar
   * nada** — foi exatamente assim que o fixture `valid` passou carregando duas
   * tasks fantasma. Todo teste positivo precisa de workspace, e precisa
   * afirmar `skipped` falsy, senão "verde" volta a significar "não olhei".
   */
  async function makeWorkspace(
    dir: string,
    opts: { turboTasks: string[]; packageScripts: string[] },
  ): Promise<void> {
    await fs.mkdir(path.join(dir, 'apps', 'api'), { recursive: true });
    await fs.writeFile(path.join(dir, 'pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n");
    await fs.writeFile(
      path.join(dir, 'turbo.json'),
      JSON.stringify({ tasks: Object.fromEntries(opts.turboTasks.map((t) => [t, {}])) }),
    );
    await fs.writeFile(
      path.join(dir, 'apps', 'api', 'package.json'),
      JSON.stringify({
        name: '@projeto/api',
        scripts: Object.fromEntries(opts.packageScripts.map((s) => [s, 'echo ok'])),
      }),
    );
  }

  it('deve passar quando package.json tem todos os scripts canônicos', async () => {
    const dir = path.join(tmpRoot, 'valid');
    await fs.mkdir(dir, { recursive: true });
    await makeWorkspace(dir, {
      turboTasks: ['build', 'dev', 'lint', 'typecheck', 'test'],
      packageScripts: ['ci:quality'],
    });
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
        },
      }),
    );

    const result = await checkPackageJsonDrift({ packageJsonPath: path.join(dir, 'package.json') });
    // O ponto do assert: `ok: true` aqui significa "verifiquei e passou",
    // não "não tinha o que verificar".
    expect(result.skipped).toBeFalsy();
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
    await makeWorkspace(dir, {
      turboTasks: ['build', 'dev', 'lint', 'typecheck', 'test'],
      packageScripts: ['ci:quality'],
    });
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
        },
      }),
    );

    const result = await checkPackageJsonDrift({ packageJsonPath: path.join(dir, 'package.json') });
    expect(result.skipped).toBeFalsy();
    expect(result.ok).toBe(true);
  });
});

describe('extractTurboRunTasks', () => {
  it('acha o `turbo run` de um segmento posterior, não só o primeiro', () => {
    // `exec` com regex sem /g para na 1ª ocorrência: a task fantasma do 2º
    // segmento nunca era vista, e o check ficava verde.
    expect(extractTurboRunTasks('turbo run lint && turbo run nao-existe')).toEqual([
      'lint',
      'nao-existe',
    ]);
  });

  it('para no separador colado, sem espaços', () => {
    // `clean&&rm` não é token exato de separador nem começa com `-`:
    // viraria "task fantasma" e bloquearia o push.
    expect(extractTurboRunTasks('turbo run clean&&rm -rf dist')).toEqual(['clean']);
  });

  it('ignora `turbo run` que está dentro de aspas', () => {
    expect(extractTurboRunTasks("echo 'turbo run nao-existe'")).toEqual([]);
    expect(extractTurboRunTasks('echo "turbo run nao-existe"')).toEqual([]);
  });
});
