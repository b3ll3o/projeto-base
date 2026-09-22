import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { checkTurboDrift } from './check-turbo-drift';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

describe('checkTurboDrift', () => {
  let tmpRoot: string;

  beforeAll(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'turbo-drift-test-'));
  });

  afterAll(async () => {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('deve passar quando turbo.json é válido, tem $schema, tasks e pipeline canônico', async () => {
    const turboDir = path.join(tmpRoot, 'valid');
    await fs.mkdir(turboDir, { recursive: true });
    await fs.writeFile(
      path.join(turboDir, 'turbo.json'),
      JSON.stringify({
        $schema: 'https://turbo.build/schema.json',
        tasks: {
          build: { dependsOn: ['^build'], outputs: ['dist/**'] },
          dev: { cache: false, persistent: true },
          lint: { outputs: [] },
        },
      }),
    );

    const result = await checkTurboDrift({ turboPath: path.join(turboDir, 'turbo.json') });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('deve falhar se turbo.json não existir', async () => {
    const result = await checkTurboDrift({
      turboPath: path.join(tmpRoot, 'nao-existe-turbo.json'),
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('não encontrado'))).toBe(true);
  });

  it('deve falhar se turbo.json for JSON inválido', async () => {
    const badDir = path.join(tmpRoot, 'invalid-json');
    await fs.mkdir(badDir, { recursive: true });
    const badPath = path.join(badDir, 'turbo.json');
    await fs.writeFile(badPath, '{ isto não é JSON válido }');

    const result = await checkTurboDrift({ turboPath: badPath });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('json'))).toBe(true);
  });

  it('deve falhar se faltar $schema (drift detectável)', async () => {
    const noSchemaDir = path.join(tmpRoot, 'no-schema');
    await fs.mkdir(noSchemaDir, { recursive: true });
    const noSchemaPath = path.join(noSchemaDir, 'turbo.json');
    await fs.writeFile(
      noSchemaPath,
      JSON.stringify({
        tasks: { build: { dependsOn: ['^build'] } },
      }),
    );

    const result = await checkTurboDrift({ turboPath: noSchemaPath });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('$schema'))).toBe(true);
  });

  it('deve falhar se task tiver nome inválido (caracteres não permitidos)', async () => {
    const badNameDir = path.join(tmpRoot, 'bad-name');
    await fs.mkdir(badNameDir, { recursive: true });
    await fs.writeFile(
      path.join(badNameDir, 'turbo.json'),
      JSON.stringify({
        $schema: 'https://turbo.build/schema.json',
        tasks: {
          'Bad-Name': { dependsOn: ['^build'] },
          build: { dependsOn: ['^build'] },
        },
      }),
    );

    const result = await checkTurboDrift({ turboPath: path.join(badNameDir, 'turbo.json') });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('Bad-Name'))).toBe(true);
  });

  it('deve falhar em cache:false com outputs declarado (contradição semântica)', async () => {
    const contradictionDir = path.join(tmpRoot, 'contradiction');
    await fs.mkdir(contradictionDir, { recursive: true });
    await fs.writeFile(
      path.join(contradictionDir, 'turbo.json'),
      JSON.stringify({
        $schema: 'https://turbo.build/schema.json',
        tasks: {
          bad: { cache: false, outputs: ['dist/**'] },
        },
      }),
    );

    const result = await checkTurboDrift({
      turboPath: path.join(contradictionDir, 'turbo.json'),
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('cache:false') && e.includes('outputs'))).toBe(
      true,
    );
  });
});
