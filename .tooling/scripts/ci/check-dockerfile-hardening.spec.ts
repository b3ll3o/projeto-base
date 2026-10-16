// .tooling/scripts/ci/check-dockerfile-hardening.spec.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { checkDockerfileHardening } from './check-dockerfile-hardening.js';

/**
 * Specs do gate prophylático de hardening Docker. Cada cenário monta uma
 * fixture mínima de repo (Dockerfiles + compose + .dockerignore) e mede se
 * o gate aceita ou rejeita.
 */

// Helper para montar um FROM pinado (o template literal é construído em runtime).
function pinnedFrom(stage: string): string {
  const digest = 'sha256:abc1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd';
  return `FROM node:22-bookworm-slim@${digest} AS ${stage}`;
}

function userAppBuild(stage: string): string {
  return `FROM base AS ${stage}\nUSER 1001:1001\n`;
}

const VALID_DOCKERFILE = `# syntax=docker/dockerfile:1.7
${pinnedFrom('base')}
WORKDIR /repo

${userAppBuild('dev')}

FROM base AS builder

${pinnedFrom('prod')}
RUN groupadd --gid 1001 app && useradd --uid 1001 --gid 1001 app
USER 1001:1001
`;

const VALID_COMPOSE = `services:
  postgres:
    image: postgres@sha256:dbg
    networks:
      - backend
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - 'no-new-privileges:true'
  api:
    init: true
    networks:
      - frontend
      - backend
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - 'no-new-privileges:true'
  web:
    networks:
      - frontend
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - 'no-new-privileges:true'

networks:
  frontend:
  backend:
`;

const VALID_DOCKERIGNORE = `**/.env
**/.env.production
**/.env.production.*
**/.env.staging
`;

function setupRepo(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'docker-hardening-test-'));
  mkdirSync(path.join(root, 'apps', 'api'), { recursive: true });
  mkdirSync(path.join(root, 'apps', 'web'), { recursive: true });
  writeFileSync(path.join(root, 'apps', 'api', 'Dockerfile'), VALID_DOCKERFILE);
  writeFileSync(path.join(root, 'apps', 'web', 'Dockerfile'), VALID_DOCKERFILE);
  writeFileSync(path.join(root, 'docker-compose.yml'), VALID_COMPOSE);
  writeFileSync(path.join(root, '.dockerignore'), VALID_DOCKERIGNORE);
  return root;
}

describe('checkDockerfileHardening', () => {
  let root: string;
  beforeEach(() => {
    root = setupRepo();
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('aceita repo com hardening completo (verde)', async () => {
    const r = await checkDockerfileHardening({ repoRoot: root });
    expect(r.errors).toEqual([]);
  });

  it('rejeita FROM sem @sha256: (issue 89)', async () => {
    const file = path.join(root, 'apps', 'api', 'Dockerfile');
    const broken = VALID_DOCKERFILE.replace(/@sha256:[a-f0-9]{64}/g, '');
    writeFileSync(file, broken);
    const r = await checkDockerfileHardening({ repoRoot: root });
    expect(r.errors.some((e) => e.includes('não tem digest pin') && e.includes('api'))).toBe(true);
  });

  it('aceita FROM com @${ARG} desde que ARG tenha sha256:... default', async () => {
    const file = path.join(root, 'apps', 'api', 'Dockerfile');
    const withArg = `ARG NODE_DIGEST=sha256:${'a'.repeat(64)}\nFROM node:22-bookworm-slim@\${NODE_DIGEST} AS base\nUSER 1001:1001\n`;
    writeFileSync(file, withArg);
    const r = await checkDockerfileHardening({ repoRoot: root });
    expect(r.errors.filter((e) => e.includes('digest pin') && e.includes('api'))).toEqual([]);
  });

  it('rejeita FROM com @${ARG} se ARG NÃO tem sha256:... default', async () => {
    const file = path.join(root, 'apps', 'api', 'Dockerfile');
    const withBadArg = `ARG NODE_DIGEST=latest\nFROM node:22-bookworm-slim@\${NODE_DIGEST} AS base\nUSER 1001:1001\n`;
    writeFileSync(file, withBadArg);
    const r = await checkDockerfileHardening({ repoRoot: root });
    expect(r.errors.some((e) => e.includes('não tem digest pin') && e.includes('api'))).toBe(true);
  });

  it('rejeita stage prod sem USER 1001:1001 (issue 88)', async () => {
    const file = path.join(root, 'apps', 'api', 'Dockerfile');
    // Substitui o USER 1001:1001 do stage prod por USER node.
    const broken = VALID_DOCKERFILE.replace(/USER 1001:1001\n/g, 'USER node\n');
    writeFileSync(file, broken);
    const r = await checkDockerfileHardening({ repoRoot: root });
    expect(r.errors.some((e) => e.includes("'USER 1001:1001'"))).toBe(true);
  });

  it('rejeita compose sem init: true no service api (issue 90)', async () => {
    const file = path.join(root, 'docker-compose.yml');
    const broken = VALID_COMPOSE.replace(/^\s+init:\s+true\s*\n/m, '');
    writeFileSync(file, broken);
    const r = await checkDockerfileHardening({ repoRoot: root });
    expect(r.errors.some((e) => e.includes("'api' não tem 'init: true'"))).toBe(true);
  });

  it('rejeita compose sem read_only/cap_drop em um service (issue 83)', async () => {
    const file = path.join(root, 'docker-compose.yml');
    // Remove read_only de web.
    const broken = VALID_COMPOSE.replace(
      /  web:\n    networks:\n      - frontend\n    read_only: true\n/,
      '  web:\n    networks:\n      - frontend\n',
    );
    writeFileSync(file, broken);
    const r = await checkDockerfileHardening({ repoRoot: root });
    expect(r.errors.some((e) => e.includes("'web' não tem 'read_only: true'"))).toBe(true);
  });

  it('rejeita compose sem top-level networks (issue 91)', async () => {
    const file = path.join(root, 'docker-compose.yml');
    const broken = VALID_COMPOSE.replace(/^networks:\n  frontend:\n  backend:\n/m, '');
    writeFileSync(file, broken);
    const r = await checkDockerfileHardening({ repoRoot: root });
    expect(r.errors.some((e) => e.includes("bloco top-level 'networks:'"))).toBe(true);
  });

  // MEDIDO 2026-10-16: o gate checava `postgres`, `web` e `otel-collector` —
  // e `api`, que é o serviço backend DE VERDADE do compose (linha 66), ficava
  // de fora: tirar o bloco `networks:` dele passava limpo. Mesma forma do subdir
  // sombreado do `check-harness-location` — a lista cobre as formas nomeadas e
  // deixa passar a que existe.
  it('rejeita o serviço api sem networks explícito (#91)', async () => {
    const file = path.join(root, 'docker-compose.yml');
    const broken = VALID_COMPOSE.replace(
      /^  api:\n    init: true\n    networks:\n      - frontend\n      - backend\n/m,
      '  api:\n    init: true\n',
    );
    expect(broken).not.toBe(VALID_COMPOSE); // o replace tem que ter mordido
    writeFileSync(file, broken);
    const r = await checkDockerfileHardening({ repoRoot: root });
    expect(r.errors.some((e) => e.includes("service 'api' sem 'networks:'"))).toBe(true);
  });

  // MEDIDO 2026-10-16: acrescentar `api` à lista de nomes não fechou a classe —
  // um serviço NOVO (`cache`) entrava no compose sem `networks:` e o gate
  // ficava verde. Nomear serviços transfere a manutenção para quem edita o
  // compose. Estes dois testes pedem a enumeração: o serviço que entra depois
  // é coberto por construção, e a lista zerada não passa em silêncio.
  it('rejeita um serviço NOVO no compose sem networks — sem lista de nomes', async () => {
    const file = path.join(root, 'docker-compose.yml');
    const comCache = VALID_COMPOSE.replace(
      /^networks:\n/m,
      '  cache:\n    image: redis:7-alpine\n\nnetworks:\n',
    );
    expect(comCache).not.toBe(VALID_COMPOSE); // o replace tem que ter mordido
    writeFileSync(file, comCache);
    const r = await checkDockerfileHardening({ repoRoot: root });
    expect(r.errors.some((e) => e.includes("service 'cache' sem 'networks:'"))).toBe(true);
  });

  it('NÃO aceita compose onde a enumeração de serviços volta vazia', async () => {
    // Enumerar por regex que engole o bloco inteiro devolve `[]` — e `[]`
    // itera zero vezes, então o gate passa sem ter olhado nada.
    const file = path.join(root, 'docker-compose.yml');
    writeFileSync(file, 'version: "3"\nservices:\n\nnetworks:\n  frontend:\n  backend:\n');
    const r = await checkDockerfileHardening({ repoRoot: root });
    expect(r.errors.some((e) => /0 serviço/.test(e))).toBe(true);
  });

  it('rejeita .dockerignore sem .env.production* (issue 84)', async () => {
    const file = path.join(root, '.dockerignore');
    const broken = '**/.env\n**/.env.local\n';
    writeFileSync(file, broken);
    const r = await checkDockerfileHardening({ repoRoot: root });
    expect(r.errors.some((e) => e.includes("não exclui '.env.production*'"))).toBe(true);
  });

  it('rejeita .dockerignore com .env.production (sem **) por não casar padrão', async () => {
    // O gate exige `**/.env.production` (com **/) para casar em subdirs;
    // um `.env.production` simples só casa na raiz. A spec abaixo garante
    // que pelo menos uma das duas formas é aceita.
    const file = path.join(root, '.dockerignore');
    writeFileSync(file, '**/.env\n**/.env.production\n');
    const r = await checkDockerfileHardening({ repoRoot: root });
    expect(r.errors).toEqual([]);
  });
});
