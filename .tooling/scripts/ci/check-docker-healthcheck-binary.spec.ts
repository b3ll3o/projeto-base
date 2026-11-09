// .tooling/scripts/ci/check-docker-healthcheck-binary.spec.ts
//
// Spec do gate que fecha a classe do #139: o `HEALTHCHECK` precisa de um
// binário que EXISTE na imagem do stage que o serviço de fato constrói.
//
// ⚠️ O QUE ESTE SPEC PROVE, E O QUE ELE NÃO PROVE
//
// Ele prova a RELAÇÃO entre o que o probe chama e o que a imagem instala —
// que é a parte estática do defeito. Ele NÃO prova que o binário existe de
// fato (isso é do `docker build`), e o próprio gate diz isso.
//
// ⚠️ A ARMADILHA que o DIFFERENCIAL monta: o `curl` do #139 ESTAVA instalado
// no stage `prod` do mesmo Dockerfile. Um gate que só verificasse "o binário
// está instalado em algum lugar do arquivo" passaria — e o defeito
// continuaria vivo. Por isso o gate mede o COMPOSE (o `build.target` efetivo
// de cada serviço, com o overlay) — e o diferencial reproduz o estado
// QUEBRADO: o compose de dev troca o stage da api para `dev`, que não tem o
// `curl` do probe herdado do compose base.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  checkDockerHealthcheckBinary,
  stagesDeDockerfile,
  binarioDoHealthcheck,
  pacotesDoAptGet,
  servicosDoCompose,
  comandoDoHealthcheck,
  type CheckResult,
} from './check-docker-healthcheck-binary.js';

/** Um Dockerfile de teste, com a mesma FORMA dos do repo. */
const DOCKERFILE_SAUDIAVEL = `# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim@sha256:abc AS base
RUN corepack enable
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS dev
CMD ["pnpm", "dev"]

FROM node:22-bookworm-slim@sha256:abc AS prod
RUN apt-get update && apt-get install -y --no-install-recommends openssl curl && rm -rf /var/lib/apt/lists/*
HEALTHCHECK --interval=10s --timeout=3s \\
  CMD curl -fsS http://localhost:3000/health || exit 1
CMD ["node", "dist/main.js"]
`;

/** O compose base: a api faz o build do stage `prod`, e o probe é de `curl`. */
const COMPOSE_BASE = `services:
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      target: prod
    healthcheck:
      test:
        [
          'CMD-SHELL',
          'curl -fsS http://localhost:3000/api/v1/health || exit 1',
        ]
`;

/** O overlay de dev: a api faz o build do stage `dev` — que não tem `curl`. */
const COMPOSE_DEV = `services:
  api:
    build: { target: dev }
`;

function repoCom(
  dockerfile: string,
  compose: string = COMPOSE_BASE,
  overlays: Record<string, string> = {},
): string {
  const raiz = mkdtempSync(join(tmpdir(), 'gate-healthcheck-'));
  mkdirSync(join(raiz, 'apps', 'api'), { recursive: true });
  writeFileSync(join(raiz, 'apps', 'api', 'Dockerfile'), dockerfile, 'utf-8');
  writeFileSync(join(raiz, 'docker-compose.yml'), compose, 'utf-8');
  for (const [nome, conteudo] of Object.entries(overlays)) {
    writeFileSync(join(raiz, nome), conteudo, 'utf-8');
  }
  return raiz;
}

describe('binarioDoHealthcheck()', () => {
  it('lê o binário do comando em forma de shell', () => {
    expect(binarioDoHealthcheck('CMD curl -fsS http://localhost/health')).toBe('curl');
  });

  it('lê o binário do comando em forma exec', () => {
    expect(binarioDoHealthcheck('CMD ["curl", "-fsS", "http://localhost/health"]')).toBe('curl');
  });

  it('lê o binário de um probe `node -e "…"`', () => {
    expect(binarioDoHealthcheck("CMD node -e \"require('http').get('http://x')\"")).toBe('node');
  });

  it('ignora uma ATRIBUIÇÃO de variável no começo do comando', () => {
    // O probe da api é `NODE_OPTIONS= node -e "…"` — e o `NODE_OPTIONS` (que
    // auto-carrega o SDK de telemetria) tem de sair do caminho do probe.
    expect(binarioDoHealthcheck('CMD NODE_OPTIONS= node -e "require(\'http\')"')).toBe('node');
  });

  it('devolve null quando não há comando', () => {
    expect(binarioDoHealthcheck('')).toBeNull();
  });
});

describe('pacotesDoAptGet()', () => {
  it('lê os pacotes e NÃO as flags nem o que vem depois do comando', () => {
    // MEDIDO 2026-11-08: o parser anterior colava `rm` e `-rf` na lista —
    // e um probe que chamasse `rm` passaria.
    expect(
      pacotesDoAptGet(
        'RUN apt-get update && apt-get install -y --no-install-recommends openssl curl && rm -rf /var/lib/apt/lists/*',
      ),
    ).toEqual(['openssl', 'curl']);
  });
});

describe('stagesDeDockerfile()', () => {
  it('separa os stages e resolve a herança', () => {
    const stages = stagesDeDockerfile(DOCKERFILE_SAUDIAVEL);

    expect(stages.map((s) => s.nome)).toEqual(['base', 'dev', 'prod']);
    expect(stages.find((s) => s.nome === 'dev')?.pai).toBe('base');
    expect(stages.find((s) => s.nome === 'prod')?.pai).toBeNull();
  });

  it('lê o que cada stage instala', () => {
    const stages = stagesDeDockerfile(DOCKERFILE_SAUDIAVEL);

    expect(stages.find((s) => s.nome === 'base')?.pacotes).toContain('openssl');
    expect(stages.find((s) => s.nome === 'prod')?.pacotes).toContain('curl');
  });
});

describe('servicosDoCompose()', () => {
  it('lê o `build.target` (nas duas formas) e o healthcheck', () => {
    const servicos = servicosDoCompose(COMPOSE_BASE);

    expect(servicos).toHaveLength(1);
    expect(servicos[0]?.nome).toBe('api');
    expect(servicos[0]?.target).toBe('prod');
    expect(servicos[0]?.dockerfile).toBe('apps/api/Dockerfile');
    expect(servicos[0]?.healthcheck).toContain('curl -fsS');
  });

  it('lê o `target` da forma inline (`build: { target: dev }`)', () => {
    const servicos = servicosDoCompose(COMPOSE_DEV);

    expect(servicos[0]?.target).toBe('dev');
    // O overlay NÃO declara healthcheck — o que roda é o do compose base.
    expect(servicos[0]?.healthcheck).toBeNull();
  });

  it('lê o healthcheck de uma linha', () => {
    expect(comandoDoHealthcheck(["    test: ['CMD-SHELL', 'curl -fsS http://x']"])).toBe(
      'curl -fsS http://x',
    );
  });
});

describe('checkDockerHealthcheckBinary()', () => {
  it('CONTROLE POSITIVO: o Dockerfile saudável fica VERDE', () => {
    const res: CheckResult = checkDockerHealthcheckBinary({
      repoRoot: repoCom(DOCKERFILE_SAUDIAVEL),
    });

    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it('⚠️ DIFERENCIAL: um probe que chama um binário ausente fica VERMELHO', () => {
    const quebrado = DOCKERFILE_SAUDIAVEL.replace(
      'CMD curl -fsS http://localhost:3000/health || exit 1',
      'CMD wget -qO- http://localhost:3000/health || exit 1',
    );

    const res = checkDockerHealthcheckBinary({ repoRoot: repoCom(quebrado) });

    expect(res.ok).toBe(false);
    expect(res.errors.join('\n')).toContain('wget');
  });

  it('⚠️ DIFERENCIAL: o probe de um stage que herda de outro SEM o binário fica VERMELHO', () => {
    const quebrado = `
FROM node:22-bookworm-slim@sha256:abc AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

FROM base AS dev
HEALTHCHECK --interval=10s --timeout=3s \\
  CMD curl -fsS http://localhost:3000/health || exit 1

FROM node:22-bookworm-slim@sha256:abc AS prod
RUN apt-get update && apt-get install -y --no-install-recommends openssl curl && rm -rf /var/lib/apt/lists/*
HEALTHCHECK --interval=10s --timeout=3s \\
  CMD curl -fsS http://localhost:3000/health || exit 1
`;

    const res = checkDockerHealthcheckBinary({ repoRoot: repoCom(quebrado) });

    expect(res.ok).toBe(false);
    // O erro é do stage `dev` — e o `prod` (que TEM o curl) não é acusado.
    expect(res.errors.join('\n')).toContain("stage 'dev'");
    expect(res.errors.join('\n')).not.toContain("stage 'prod'");
  });

  // ⚠️⚠️ ESTE É O DIFFERENCIAL QUE IMPORTA: o estado QUEBRADO REAL do #139.
  //
  // O `curl` está instalado no stage `prod` do Dockerfile — então um gate
  // que só olhasse o Dockerfile passaria VERDE. O que quebra é o OVERLAY de
  // dev: ele troca o `build.target` da api para `dev` (que não tem `curl`) e
  // NÃO declara healthcheck — o probe que roda é o do compose base, herdado.
  it('⚠️ DIFERENCIAL: o COMPOSE de dev (que troca o stage) reprova — o estado real do #139', () => {
    const res = checkDockerHealthcheckBinary({
      repoRoot: repoCom(DOCKERFILE_SAUDIAVEL, COMPOSE_BASE, {
        'docker-compose.dev.yml': COMPOSE_DEV,
      }),
    });

    expect(res.ok).toBe(false);
    expect(res.errors.join('\n')).toContain('dev');
    expect(res.errors.join('\n')).toContain('curl');
  });

  it('CONTROLE POSITIVO: com o probe em `node`, o compose de dev fica VERDE', () => {
    // O probe que o repo usa hoje: `node -e "…"`, e o `node` está nas DUAS
    // imagens (a `base` do stage `dev` e a `prod`).
    const comNode = DOCKERFILE_SAUDIAVEL.replace(
      'CMD curl -fsS http://localhost:3000/health || exit 1',
      "CMD NODE_OPTIONS= node -e \"require('http').get('http://localhost:3000/health')\"",
    );
    const composeComNode = COMPOSE_BASE.replace(
      "'curl -fsS http://localhost:3000/api/v1/health || exit 1'",
      "'NODE_OPTIONS= node -e \"require(\'http\').get(\'http://localhost:3000/api/v1/health\')\"'",
    );

    const res = checkDockerHealthcheckBinary({
      repoRoot: repoCom(comNode, composeComNode, { 'docker-compose.dev.yml': COMPOSE_DEV }),
    });

    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it('o binário NATIVO da imagem node é aceito sem instalar nada', () => {
    const comNode = DOCKERFILE_SAUDIAVEL.replace(
      'CMD curl -fsS http://localhost:3000/health || exit 1',
      "CMD node -e \"require('http').get('http://localhost:3000/health')\"",
    );

    const res = checkDockerHealthcheckBinary({ repoRoot: repoCom(comNode) });

    expect(res.ok).toBe(true);
  });

  it('o repo REAL está VERDE (o probe da api usa `node`, e o do web também)', () => {
    const res = checkDockerHealthcheckBinary({ repoRoot: process.cwd() });

    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  // ⚠️ (#147) O probe EMBRULHADO: `sh -c "curl …"`.
  //
  // O primeiro token do comando é o SHELL — e `sh` é NATIVO da imagem, então
  // o gate passava sem olhar o binário de verdade. É exatamente a forma do
  // #139 que o gate diz fechar.
  it('⚠️ DIFERENCIAL: o probe EMBRULHADO em `sh -c` fica VERMELHO (#147)', () => {
    const semCurl = `FROM node:22-bookworm-slim@sha256:abc AS base
FROM base AS prod
HEALTHCHECK --interval=10s --timeout=3s \\
  CMD sh -c "curl -fsS http://localhost:3000/health || exit 1"
`;
    // ⚠️ O compose é o de probe em `node` — senão o erro viria do COMPOSE
    // (que também acusaria o `curl`) e o teste passaria pelo motivo errado.
    const composeVerde = COMPOSE_BASE.replace(
      "'curl -fsS http://localhost:3000/api/v1/health || exit 1'",
      '\'node -e "process.exit(0)"\'',
    );

    const res = checkDockerHealthcheckBinary({ repoRoot: repoCom(semCurl, composeVerde) });

    expect(res.ok).toBe(false);
    expect(res.errors.join('\n')).toContain('curl');
  });

  it('⚠️ DIFERENCIAL: o COMPOSE com probe EMBRULHADO reprova (#147)', () => {
    const composeEmbrulhado = COMPOSE_BASE.replace(
      "'curl -fsS http://localhost:3000/api/v1/health || exit 1'",
      `'sh -c "curl -fsS http://localhost:3000/api/v1/health || exit 1"'`,
    );

    const res = checkDockerHealthcheckBinary({
      repoRoot: repoCom(DOCKERFILE_SAUDIAVEL, composeEmbrulhado, {
        'docker-compose.dev.yml': COMPOSE_DEV,
      }),
    });

    expect(res.ok).toBe(false);
    expect(res.errors.join('\n')).toContain('curl');
  });

  // ⚠️ (#147) O gate fundia os overlays num `target` só — e o ÚLTIMO
  // (alfabético) vencia. MEDIDO: com o overlay de dev quebrado e o de prod
  // inteiro, o gate passava — e o stack de dev (o que sobe na máquina de
  // quem desenvolve) deixava de ser medido.
  it('⚠️ DIFERENCIAL: com DOIS overlays, o de DEV quebrado reprova (#147)', () => {
    const res = checkDockerHealthcheckBinary({
      repoRoot: repoCom(DOCKERFILE_SAUDIAVEL, COMPOSE_BASE, {
        'docker-compose.dev.yml': COMPOSE_DEV,
        'docker-compose.prod.yml': `services:\n  api:\n    build: { target: prod }\n`,
      }),
    });

    expect(res.ok).toBe(false);
    // E o erro NOMEIA o stage `dev` — e não o `prod`, que tem o `curl`.
    expect(res.errors.join('\n')).toContain('dev');
    expect(res.errors.join('\n')).not.toContain('target `prod`');
  });

  // ⚠️ (#147) Um serviço que existe SÓ no overlay nunca era verificado — e
  // o próximo serviço que nascer no `docker-compose.dev.yml` passava sem
  // ninguém olhar.
  it('⚠️ DIFERENCIAL: um serviço que existe SÓ no overlay é verificado (#147)', () => {
    const overlayComNovo = `services:
  api:
    build: { target: dev }
  worker:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
      target: dev
    healthcheck:
      test: ['CMD-SHELL', 'curl -fsS http://localhost:3000/worker/health || exit 1']
`;

    const res = checkDockerHealthcheckBinary({
      repoRoot: repoCom(DOCKERFILE_SAUDIAVEL, COMPOSE_BASE, {
        'docker-compose.dev.yml': overlayComNovo,
      }),
    });

    expect(res.ok).toBe(false);
    expect(res.errors.join('\n')).toContain('worker');
  });

  // ⚠️ (#147) `HEALTHCHECK NONE` é a forma documentada pelo Docker de
  // desligar um probe herdado — e o gate lia `NONE` como nome de binário.
  it('o `HEALTHCHECK NONE` é "sem probe" — e não o nome de um binário (#147)', () => {
    const semProbe = DOCKERFILE_SAUDIAVEL.replace(
      'CMD curl -fsS http://localhost:3000/health || exit 1',
      'CMD NONE',
    );

    const res = checkDockerHealthcheckBinary({ repoRoot: repoCom(semProbe) });

    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  // ⚠️ (#147) Sem `build.target`, o Docker constrói o ÚLTIMO stage — e o
  // serviço era PULADO. Apagar a linha `target: prod` tirava a api do
  // alcance da medição.
  it('um serviço SEM `build.target` é medido no ÚLTIMO stage (#147)', () => {
    const composeSemTarget = `services:
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    healthcheck:
      test: ['CMD-SHELL', 'curl -fsS http://localhost:3000/api/v1/health || exit 1']
`;

    // O ÚLTIMO stage do Dockerfile de teste é o `prod` — que TEM o `curl`.
    const comCurl = checkDockerHealthcheckBinary({
      repoRoot: repoCom(DOCKERFILE_SAUDIAVEL, composeSemTarget),
    });
    expect(comCurl.ok).toBe(true);

    // E um Dockerfile cujo último stage NÃO tem o `curl` reprova.
    const semCurl = `FROM node:22-bookworm-slim@sha256:abc AS base
FROM base AS prod
`;
    const reprovado = checkDockerHealthcheckBinary({
      repoRoot: repoCom(semCurl, composeSemTarget),
    });
    expect(reprovado.ok).toBe(false);
    expect(reprovado.errors.join('\n')).toContain('curl');
  });

  // ⚠️ (#147) O Dockerfile vem do `build.dockerfile` do serviço — e um
  // Dockerfile fora de `apps/<nome>/Dockerfile` nunca era medido.
  it('um Dockerfile FORA de `apps/<nome>/Dockerfile` é medido (#147)', () => {
    const compose = `services:
  api:
    build:
      context: .
      dockerfile: infra/api.Dockerfile
      target: prod
    healthcheck:
      test: ['CMD-SHELL', 'curl -fsS http://localhost:3000/api/v1/health || exit 1']
`;
    const semCurl = `FROM node:22-bookworm-slim@sha256:abc AS base
FROM base AS prod
`;

    const raiz = repoCom(DOCKERFILE_SAUDIAVEL, compose);
    mkdirSync(join(raiz, 'infra'), { recursive: true });
    writeFileSync(join(raiz, 'infra', 'api.Dockerfile'), semCurl, 'utf-8');

    const res = checkDockerHealthcheckBinary({ repoRoot: raiz });

    expect(res.ok).toBe(false);
    expect(res.errors.join('\n')).toContain('curl');
  });
});
