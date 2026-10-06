import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckResult } from './check-types';

/**
 * Limite de linhas para Dockerfiles. Acima disso é over-engineering
 * (multi-stage + Prisma + healthcheck deveria caber em ~80 linhas).
 */
const MAX_DOCKERFILE_LINES = 100;

/**
 * Major do Node que os Dockerfiles devem usar.
 *
 * Casa com `package.json` -> `engines.node: ">=22.6.0"`. Build e suite rodam
 * em node 22 no CI (`node-version: 22`); a producao rodava em 20, sem nada que
 * comparasse os dois. O CI provava que a imagem **monta**, nao que ela roda
 * sobre o contrato que o proprio repo declara.
 */
const REQUIRED_NODE_MAJOR = 22;

/**
 * Distro canonica dos Dockerfiles. Prisma 6 exige **glibc** por causa do
 * engine binary, entao `bookworm-slim` e o piso minimo compativel; `alpine`
 * usa musl e o engine binary do Prisma nao roda.
 *
 * ## Por que major e distro sao DUAS constantes (issue #48)
 *
 * A versao anterior tinha `REQUIRED_BASE_IMAGE = 'node:20-bookworm-slim'` -- a
 * major do Node embutida numa constante cujo motivo declarado e a distro.
 * Consequencia: `node:20-alpine` (problema real de glibc) e
 * `node:22-bookworm-slim` (glibc, perfeitamente valido) produziam a **mesma**
 * mensagem de erro, e ela atribuia bump de major a um problema de alpine.
 *
 * Trocar a major entao **quebrava o gate**: rodar `checkDockerDrift()` contra
 * uma arvore ja corrigida devolvia `ok = false` com a mensagem de alpine. O
 * guard era escrito de proposito -- estava so descrevendo duas propriedades
 * como uma. Separadas, cada uma tem seu motivo e sua mensagem.
 */
const REQUIRED_DISTRO_SUFFIX = 'bookworm-slim';

/**
 * Apps que devem ter Dockerfile no monorepo.
 */
const REQUIRED_DOCKERFILES = ['apps/api/Dockerfile', 'apps/web/Dockerfile'] as const;

/**
 * Os erros de base image de um Dockerfile, um por propriedade violada.
 *
 * A distro e a major sao guardadas SEPARADAMENTE, e cada mensagem nomeia a
 * causa real. Um `FROM node:20-alpine` falha **pela distro** (musl, sem glibc
 * para o engine binary do Prisma 6); um `FROM node:20-bookworm-slim` falha
 * **pela major** (o repo declara `engines.node >=22.6` e o CI roda node 22).
 *
 * Quando as duas falham, sao dois erros — nao um compounded. Uma mensagem unica
 * apontaria para uma causa e deixaria a outra invisivel, que era exatamente a
 * falha de leitura do guard anterior.
 */
export function checkBaseImage(dockerfileRelPath: string, content: string): string[] {
  const errors: string[] = [];
  // O primeiro FROM e o que define a base; estagios posteriores (`FROM ... AS
  // prod`) reaproveitam a mesma imagem ou sao explicitos, entao o primeiro
  // FROM e a ancora que casa com o resto do Dockerfile.
  const from = /^FROM\s+(\S+)/m.exec(content);
  if (!from) return errors; // sem FROM — nao e erro deste check

  const image = from[1] ?? '';
  const [name, tag] = splitImageTag(image);

  // Guarda 1 — DISTRO (glibc vs musl). A razao que o guard foi escrito.
  if (name === 'node' && !tag.includes(REQUIRED_DISTRO_SUFFIX)) {
    errors.push(
      `${dockerfileRelPath} usa base image ${image}, que não é glibc — ` +
        `Prisma 6 exige engine binary sobre glibc; use node:${REQUIRED_NODE_MAJOR}-${REQUIRED_DISTRO_SUFFIX} ` +
        `(alpine usa musl e o engine não roda)`,
    );
  }

  // Guarda 2 — MAJOR do Node (o contrato declarado pelo repo).
  if (name === 'node') {
    const major = /^(\d+)/.exec(tag)?.[1];
    if (major !== String(REQUIRED_NODE_MAJOR)) {
      errors.push(
        `${dockerfileRelPath} usa major do Node ${major ?? 'desconhecida'} — ` +
          `o repo declara engines.node ">=22.6.0" e o CI roda node ${REQUIRED_NODE_MAJOR} ` +
          `(imagem de produção em major diferente da de build)`,
      );
    }
  }

  return errors;
}

/** `node:22-bookworm-slim` → `['node', '22-bookworm-slim']`. */
function splitImageTag(image: string): [string, string] {
  const colon = image.indexOf(':');
  if (colon === -1) return [image, ''];
  return [image.slice(0, colon), image.slice(colon + 1)];
}

/**
 * Detecta drift na configuração de Docker do monorepo.
 *
 * Drifts capturados:
 * 1. .dockerignore ausente (vaza build context com node_modules/.git/.cache)
 * 2. Dockerfile > 100 linhas (over-engineering)
 * 3. Base image: distro sem glibc (incompatibilidade Prisma 6) OU major do Node diferente de package.json engines
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

    // Base image: DISTRO e MAJOR sao propriedades separadas, e cada uma tem
    // seu motivo. A versao anterior as colapsava em uma unica comparacao
    // contra `node:20-bookworm-slim`, o que fazia um alpine (problema de
    // glibc) e um node:22-bookworm-slim (perfeitamente valido) produzirem a
    // MESMA mensagem -- e atribuia bump de major a um problema de distro.
    for (const error of checkBaseImage(dockerfileRelPath, content)) {
      errors.push(error);
    }
  }

  return { ok: errors.length === 0, errors };
}
