import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkDockerDrift } from './check-docker-drift';

describe('checkDockerDrift', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'docker-drift-test-'));
    mkdirSync(join(repoRoot, 'apps/api'), { recursive: true });
    mkdirSync(join(repoRoot, 'apps/web'), { recursive: true });
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it('passa quando .dockerignore existe', () => {
    writeFileSync(join(repoRoot, '.dockerignore'), 'node_modules\n');
    const result = checkDockerDrift(repoRoot);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('passa quando ambos Dockerfiles existem com base image correta', () => {
    writeFileSync(join(repoRoot, '.dockerignore'), 'node_modules\n');
    writeFileSync(join(repoRoot, 'apps/api/Dockerfile'), 'FROM node:22-bookworm-slim\n');
    writeFileSync(join(repoRoot, 'apps/web/Dockerfile'), 'FROM node:22-bookworm-slim\n');
    const result = checkDockerDrift(repoRoot);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('falha se .dockerignore ausente', () => {
    const result = checkDockerDrift(repoRoot);
    expect(result.ok).toBe(false);
    expect(result.errors.some((f) => f.includes('.dockerignore'))).toBe(true);
  });

  it('falha se Dockerfile > 100 linhas (over-engineering)', () => {
    writeFileSync(join(repoRoot, '.dockerignore'), 'node_modules\n');
    const lines = Array(101).fill('# padding line').join('\n');
    writeFileSync(join(repoRoot, 'apps/api/Dockerfile'), `FROM node:22-bookworm-slim\n${lines}\n`);
    writeFileSync(join(repoRoot, 'apps/web/Dockerfile'), 'FROM node:22-bookworm-slim\n');
    const result = checkDockerDrift(repoRoot);
    expect(result.ok).toBe(false);
    expect(result.errors.some((f) => f.includes('apps/api/Dockerfile'))).toBe(true);
  });

  // ── Issue #48: major do Node ≠ distro ───────────────────────────────────
  //
  // O guard embedava a MAJOR (`REQUIRED_BASE_IMAGE = 'node:20-bookworm-slim'`)
  // numa constante cujo motivo declarado é a DISTRO (glibc do Prisma 6).
  // `node:20-alpine` (problema real de glibc) e `node:22-bookworm-slim`
  // (glibc, perfeitamente válido) produziam a MESMA mensagem — e o controle
  // negativo antigo não distinguia os dois, então a confusão não tinha onde
  // aparecer. Isto é a separação: major e distro são duas propriedades, e o
  // erro cita a causa real.

  it('base image na major ATUALIZADA com bookworm-slim é VERDE (issue #48)', () => {
    writeFileSync(join(repoRoot, '.dockerignore'), 'node_modules\n');
    writeFileSync(join(repoRoot, 'apps/api/Dockerfile'), 'FROM node:22-bookworm-slim\n');
    writeFileSync(join(repoRoot, 'apps/web/Dockerfile'), 'FROM node:22-bookworm-slim\n');
    const result = checkDockerDrift(repoRoot);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('base image MAJOR desatualizada é vermelha, e o erro fala da major', () => {
    writeFileSync(join(repoRoot, '.dockerignore'), 'node_modules\n');
    writeFileSync(join(repoRoot, 'apps/api/Dockerfile'), 'FROM node:20-bookworm-slim\n');
    writeFileSync(join(repoRoot, 'apps/web/Dockerfile'), 'FROM node:22-bookworm-slim\n');
    const result = checkDockerDrift(repoRoot);
    expect(result.ok).toBe(false);
    const err = result.errors.find((f) => f.includes('apps/api/Dockerfile')) ?? '';
    expect(err).toMatch(/major/i);
    // A distro está correta aqui — o erro NÃO pode ser sobre glibc/alpine.
    expect(err).not.toMatch(/alpine/i);
  });

  it('base image em alpine é VERMELHA por glibc — e o erro diz glibc', () => {
    // A distro é a propriedade que o guard existe para proteger: Prisma 6
    // traz engine binary que exige glibc. Este é o caso que a major embutida
    // denunciava pela razão errada.
    writeFileSync(join(repoRoot, '.dockerignore'), 'node_modules\n');
    writeFileSync(join(repoRoot, 'apps/api/Dockerfile'), 'FROM node:22-alpine\n');
    writeFileSync(join(repoRoot, 'apps/web/Dockerfile'), 'FROM node:22-bookworm-slim\n');
    const result = checkDockerDrift(repoRoot);
    expect(result.ok).toBe(false);
    const err = result.errors.find((f) => f.includes('apps/api/Dockerfile')) ?? '';
    expect(err).toMatch(/glibc/i);
  });

  it('alpine e major desatualizada são motivos DIFERENTES, não a mesma mensagem', () => {
    // Este é o teste que a issue pede (critério 4): as duas propriedades não
    // podem colapsar numa mensagem só.
    writeFileSync(join(repoRoot, '.dockerignore'), 'node_modules\n');
    writeFileSync(join(repoRoot, 'apps/api/Dockerfile'), 'FROM node:22-alpine\n');
    const alpine = checkDockerDrift(repoRoot);

    writeFileSync(join(repoRoot, 'apps/api/Dockerfile'), 'FROM node:20-bookworm-slim\n');
    const majorVelha = checkDockerDrift(repoRoot);

    const msgAlpine = alpine.errors.find((f) => f.includes('apps/api/Dockerfile')) ?? '';
    const msgMajor = majorVelha.errors.find((f) => f.includes('apps/api/Dockerfile')) ?? '';
    expect(msgAlpine).not.toBe('');
    expect(msgMajor).not.toBe('');
    expect(msgAlpine).not.toBe(msgMajor);
  });
});
