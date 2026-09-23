import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckResult } from './check-types';

/**
 * Limite de linhas para Dockerfiles. Acima disso é over-engineering
 * (multi-stage + Prisma + healthcheck deveria caber em ~80 linhas).
 */
const MAX_DOCKERFILE_LINES = 100;

/**
 * Base image canônica dos Dockerfiles. Prisma 6 requer glibc
 * (não alpine) por causa do engine binary, então bookworm-slim é
 * o piso mínimo de imagem compatível com o stack.
 */
const REQUIRED_BASE_IMAGE = 'node:20-bookworm-slim';

/**
 * Apps que devem ter Dockerfile no monorepo.
 */
const REQUIRED_DOCKERFILES = ['apps/api/Dockerfile', 'apps/web/Dockerfile'] as const;

/**
 * Detecta drift na configuração de Docker do monorepo.
 *
 * Drifts capturados:
 * 1. .dockerignore ausente (vaza build context com node_modules/.git/.cache)
 * 2. Dockerfile > 100 linhas (over-engineering)
 * 3. Base image != node:20-bookworm-slim (incompatibilidade Prisma 6)
 *
 * Nota: a presença/ausência dos Dockerfiles em si NÃO é checada —
 * este check é pensado para validar a configuração quando ela
 * existe. O orquestrador (preflight) controla se os Dockerfiles
 * precisam existir via gates separados (e.g. pipeline CI que faz
 * docker build falha naturalmente se faltarem).
 *
 * Retorna `CheckResult` no formato padrão do preflight para que o
 * orquestrador exiba os erros de forma consistente com os demais checks.
 */
export function checkDockerDrift(repoRoot: string): CheckResult {
  const errors: string[] = [];

  // 1. .dockerignore deve existir na raiz.
  const dockerignorePath = join(repoRoot, '.dockerignore');
  if (!existsSync(dockerignorePath)) {
    errors.push(
      `.dockerignore ausente em ${repoRoot} — protege o build context do Docker (exclui node_modules, .git, .turbo)`,
    );
  }

  // 2. Cada Dockerfile existente é inspecionado: tamanho + base image.
  for (const dockerfileRelPath of REQUIRED_DOCKERFILES) {
    const dockerfilePath = join(repoRoot, dockerfileRelPath);
    if (!existsSync(dockerfilePath)) {
      // Dockerfile ausente não é drift deste check — gates de CI
      // (docker build) cobrem isso no fluxo real.
      continue;
    }

    const content = readFileSync(dockerfilePath, 'utf-8');
    const lineCount = content.split('\n').length;

    if (lineCount > MAX_DOCKERFILE_LINES) {
      errors.push(
        `${dockerfileRelPath} tem ${lineCount} linhas (> ${MAX_DOCKERFILE_LINES}) — possível over-engineering (multi-stage + Prisma + healthcheck cabe em ~80 linhas)`,
      );
    }

    if (!content.includes(`FROM ${REQUIRED_BASE_IMAGE}`)) {
      errors.push(
        `${dockerfileRelPath} não usa base image ${REQUIRED_BASE_IMAGE} — Prisma 6 requer glibc (bookworm-slim); alpine não é compatível`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}
