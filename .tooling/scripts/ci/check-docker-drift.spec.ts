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
    writeFileSync(join(repoRoot, 'apps/api/Dockerfile'), 'FROM node:20-bookworm-slim\n');
    writeFileSync(join(repoRoot, 'apps/web/Dockerfile'), 'FROM node:20-bookworm-slim\n');
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
    writeFileSync(join(repoRoot, 'apps/api/Dockerfile'), `FROM node:20-bookworm-slim\n${lines}\n`);
    writeFileSync(join(repoRoot, 'apps/web/Dockerfile'), 'FROM node:20-bookworm-slim\n');
    const result = checkDockerDrift(repoRoot);
    expect(result.ok).toBe(false);
    expect(result.errors.some((f) => f.includes('apps/api/Dockerfile'))).toBe(true);
  });

  it('falha se base image != node:20-bookworm-slim', () => {
    writeFileSync(join(repoRoot, '.dockerignore'), 'node_modules\n');
    writeFileSync(join(repoRoot, 'apps/api/Dockerfile'), 'FROM node:20-alpine\n');
    writeFileSync(join(repoRoot, 'apps/web/Dockerfile'), 'FROM node:20-bookworm-slim\n');
    const result = checkDockerDrift(repoRoot);
    expect(result.ok).toBe(false);
    expect(result.errors.some((f) => f.includes('node:20-bookworm-slim'))).toBe(true);
  });
});
