/**
 * SEM shebang, de propósito.
 *
 * As regressões do `check-ci-prisma-client-ready`.
 *
 * A mutação que **provou** que o gate tem dente (MEDIDO 2026-11-09): remover
 * o `db:generate` do job `preflight` do `ci.yml` — o job que roda
 * `pnpm tooling:test` — fez o gate reprovar nomeando o job e a linha.
 *
 * A MUTAÇÃO 2 (o `db:generate` DEPOIS do teste) é a que importa mais: ela
 * mostra que o gate confere a ORDEM, não a presença.
 */
import { describe, expect, it } from 'vitest';
import {
  checkCiPrismaClientReady,
  geraClientDoPrisma,
  jobsDoWorkflow,
  ordemCorreta,
  rodaToolingTest,
} from './check-ci-prisma-client-ready';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

const WORKFLOW = [
  'name: ci',
  'on:',
  '  push:',
  '    branches: [main]',
  'jobs:',
  '  preflight:',
  '    runs-on: ubuntu-24.04',
  '    steps:',
  '      - uses: actions/checkout@abc',
  '      - run: pnpm install --frozen-lockfile',
  '      - run: pnpm turbo run db:generate --filter=@projeto/api',
  '      - name: Run tooling tests',
  '        run: pnpm tooling:test',
].join('\n');

describe('check-ci-prisma-client-ready — parser de workflow', () => {
  it('encontra o job e os comandos na ordem', () => {
    const jobs = jobsDoWorkflow(WORKFLOW, 'ci.yml');
    const preflight = jobs.find((j) => j.job === 'preflight');
    expect(preflight).toBeDefined();
    expect(preflight!.comandos).toContain('pnpm install --frozen-lockfile');
    expect(preflight!.comandos).toContain('pnpm turbo run db:generate --filter=@projeto/api');
    expect(preflight!.comandos).toContain('pnpm tooling:test');
  });

  it('a ORDEM dos comandos é preservada', () => {
    const jobs = jobsDoWorkflow(WORKFLOW, 'ci.yml');
    const c = jobs.find((j) => j.job === 'preflight')!.comandos;
    expect(c.indexOf('pnpm turbo run db:generate --filter=@projeto/api')).toBeLessThan(
      c.indexOf('pnpm tooling:test'),
    );
  });

  it('um job que nao tem comandos NAO fecha o job seguinte', () => {
    // `push:` e `pull_request:` sao jobs do `on:`, com chaves de indentacao 4
    // antes de `jobs:`. O parser nao pode confundir isso com um job.
    const jobs = jobsDoWorkflow(WORKFLOW, 'ci.yml');
    expect(jobs.find((j) => j.job === 'preflight')!.comandos.length).toBeGreaterThan(0);
  });

  it('comentarios de indentacao 4 nao fecham o job', () => {
    const comComentario = WORKFLOW.replace(
      '    runs-on: ubuntu-24.04',
      '    # um comentario de indentacao 4\n    runs-on: ubuntu-24.04',
    );
    const jobs = jobsDoWorkflow(comComentario, 'ci.yml');
    expect(jobs.find((j) => j.job === 'preflight')!.comandos).toContain('pnpm tooling:test');
  });

  it('um `run: |` (bloco literal) e lido', () => {
    const comBloco = [
      'jobs:',
      '  build:',
      '    steps:',
      '      - run: |',
      '        pnpm build',
      '        pnpm test',
      '      - run: pnpm tooling:test',
    ].join('\n');
    const jobs = jobsDoWorkflow(comBloco, 'ci.yml');
    expect(jobs.find((j) => j.job === 'build')!.comandos).toContain('pnpm build');
  });
});

describe('check-ci-prisma-client-ready — as regras', () => {
  it('reconhece o tooling:test', () => {
    expect(rodaToolingTest(['pnpm tooling:test'])).toBe(true);
    expect(rodaToolingTest(['pnpm ci:preflight'])).toBe(false);
  });

  it('reconhece o db:generate E o prisma generate', () => {
    expect(geraClientDoPrisma(['pnpm turbo run db:generate --filter=@projeto/api'])).toBe(true);
    expect(geraClientDoPrisma(['pnpm prisma generate'])).toBe(true);
    expect(geraClientDoPrisma(['pnpm install'])).toBe(false);
  });

  it('sem db:generate, a ordem esta errada', () => {
    const o = ordemCorreta(['pnpm install', 'pnpm tooling:test']);
    expect(o.ok).toBe(false);
    expect(o.indiceGenerate).toBe(-1);
  });

  it('com o db:generate DEPOIS do teste, a ordem esta errada', () => {
    const o = ordemCorreta(['pnpm tooling:test', 'pnpm db:generate']);
    expect(o.ok).toBe(false);
  });

  it('com o db:generate ANTES do teste, a ordem esta certa', () => {
    const o = ordemCorreta(['pnpm db:generate', 'pnpm tooling:test']);
    expect(o.ok).toBe(true);
  });

  it('um job que nao roda o tooling:test nao e julgado', () => {
    const o = ordemCorreta(['pnpm ci:preflight']);
    expect(o.ok).toBe(true);
  });
});

describe('check-ci-prisma-client-ready — fim a fim, num repo temporario', () => {
  async function repo(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'ci-client-'));
    await mkdir(path.join(dir, '.github', 'workflows'), { recursive: true });
    return dir;
  }

  async function escrever(dir: string, conteudo: string): Promise<void> {
    await writeFile(path.join(dir, '.github', 'workflows', 'ci.yml'), conteudo, 'utf-8');
  }

  it('PASSA quando o job gera o client antes de rodar o tooling:test', async () => {
    const dir = await repo();
    try {
      await escrever(dir, WORKFLOW);
      const r = await checkCiPrismaClientReady({ repoRoot: dir });
      expect(r.ok).toBe(true);
      expect(r.errors).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('REPROVA quando o job roda o tooling:test sem gerar o client', async () => {
    const dir = await repo();
    try {
      await escrever(
        dir,
        WORKFLOW.replace('      - run: pnpm turbo run db:generate --filter=@projeto/api\n', ''),
      );
      const r = await checkCiPrismaClientReady({ repoRoot: dir });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('sem gerar o client do Prisma antes');
      // a mensagem tem que nomear o job, senao quem le nao sabe onde corrigir
      expect(r.errors.join('\n')).toContain('preflight');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('REPROVA quando o db:generate vem DEPOIS do tooling:test', async () => {
    const dir = await repo();
    try {
      await escrever(
        dir,
        [
          'jobs:',
          '  preflight:',
          '    steps:',
          '      - name: Run tooling tests',
          '        run: pnpm tooling:test',
          '      - run: pnpm turbo run db:generate --filter=@projeto/api',
        ].join('\n'),
      );
      const r = await checkCiPrismaClientReady({ repoRoot: dir });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('DEPOIS do teste');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('skipped, com motivo, quando nao ha workflow', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'ci-client-vazio-'));
    try {
      const r = await checkCiPrismaClientReady({ repoRoot: dir });
      expect(r.ok).toBe(true);
      expect((r.advisories ?? []).join('\n')).toContain('nada a medir');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
