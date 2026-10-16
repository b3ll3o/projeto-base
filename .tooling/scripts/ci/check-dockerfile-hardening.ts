/**
 * SEM shebang, de propósito.
 *
 * Gate prophylático que valida o hardening de Dockerfiles prod + compose
 * + .dockerignore. Fica em pé sozinho: rodada 1 deste gate PRECEDE o
 * regresso das issues 83, 84, 88, 89, 90, 91, 92, então ele documenta o
 * estado-novo (verde) e bloqueia regressões silenciosas em PRs futuros
 * (classe 5 de guard-classes.md).
 *
 * O gate cobre 6 propriedades, todas refletidas nas correções do PR:
 *   1. apps Dockerfile: FROM tem @sha256: pin
 *   2. apps Dockerfile stage prod: tem USER 1001:1001 (não "node")
 *   3. docker-compose.yml service api: tem init: true
 *   4. docker-compose.yml services prod: read_only/cap_drop/security_opt
 *   5. docker-compose.yml: tem top-level networks: + services NÃO usam default
 *   6. .dockerignore: exclui .env.production*
 *
 * O gate é "documento" do contrato: ele NÃO valida semântica runtime (a
 * classe 1 já tem check-docker-drift e docker-build-prod CI), mas falha
 * barulhento se algum dos toggles for removido acidentalmente.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CheckResult } from './check-types';

interface DockerfileInfo {
  file: string;
  text: string;
}

/** Encontra todos os Dockerfiles de app em `apps/<app>/Dockerfile`. */
async function findDockerfiles(appsRoot: string): Promise<DockerfileInfo[]> {
  const out: DockerfileInfo[] = [];
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(appsRoot, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const candidate = path.join(appsRoot, e.name, 'Dockerfile');
    try {
      const text = await fs.readFile(candidate, 'utf-8');
      out.push({ file: path.relative(process.cwd(), candidate), text });
    } catch {
      // não tem Dockerfile nesse app — pula
    }
  }
  return out;
}

/**
 * Extrai a string completa do `FROM ... AS <stage>` para o stage pedido.
 * Devolve `null` se o stage não existe.
 */
function extractFrom(text: string, stage: string): string | null {
  const re = new RegExp(`^FROM\\s+(\\S+)\\s+AS\\s+${stage}\\s*$`, 'm');
  const m = text.match(re);
  return m ? m[1]! : null;
}

/**
 * Verifica se um FROM ... contém digest pin @sha256:...
 *
 * Casos aceitos:
 * 1. Digest literal: `node:...@sha256:abc...` (64 hex chars)
 * 2. ARG resolvido: `node:...@${NODE_DIGEST}` desde que `ARG NODE_DIGEST=sha256:abc...`
 *    esteja declarado no Dockerfile. O ARG sem default = sha256: NÃO conta como pin.
 */
function hasDigestPin(text: string, fromLine: string): boolean {
  if (/@sha256:[a-f0-9]{64}/.test(fromLine)) return true;
  // Detecta `@${VAR}` no FROM e checa se VAR tem default = sha256:...
  const argMatch = fromLine.match(/@\$\{([A-Z_][A-Z0-9_]*)\}/);
  if (argMatch) {
    const varName = argMatch[1];
    // Procura `ARG <varName>=sha256:...` no texto inteiro do Dockerfile
    const argRe = new RegExp(`^ARG\\s+${varName}\\s*=\\s*sha256:[a-f0-9]{64}`, 'm');
    if (argRe.test(text)) return true;
  }
  return false;
}

export async function checkDockerfileHardening(opts: {
  repoRoot: string;
  appsRoots?: string[];
  composeFile?: string;
  dockerignoreFile?: string;
}): Promise<CheckResult> {
  const errors: string[] = [];
  const root = path.resolve(opts.repoRoot);
  const appsRoots = opts.appsRoots ?? [path.join(root, 'apps')];
  const composeFile = opts.composeFile ?? path.join(root, 'docker-compose.yml');
  const dockerignoreFile = opts.dockerignoreFile ?? path.join(root, '.dockerignore');

  // (1) e (2): validar Dockerfiles
  for (const appsRoot of appsRoots) {
    const dockerfiles = await findDockerfiles(appsRoot);
    for (const { file, text } of dockerfiles) {
      // (1) FROM com @sha256:
      // Stages intermediários (dev, builder) que herdam de outro stage local
      // (ex: `FROM base AS dev`) NÃO precisam de digest — o digest foi declarado
      // no FROM raiz. Exigir aqui seria falso positivo.
      const stages = ['base', 'dev', 'builder', 'prod'];
      for (const stage of stages) {
        const fromLine = extractFrom(text, stage);
        if (!fromLine) continue;
        // Se for referência a outro stage local (ex: `base`, `builder`), pula.
        if (/^(base|builder|dev|prod)$/.test(fromLine)) continue;
        if (!hasDigestPin(text, fromLine)) {
          errors.push(
            `${file}: FROM do stage '${stage}' não tem digest pin: '${fromLine}' — #89 exige @sha256:...`,
          );
        }
      }

      // (2) stage prod tem USER 1001:1001
      // Estratégia: divide o Dockerfile pelos `FROM ... AS <stage>` e
      // pega o bloco do stage prod.
      const prodMatch = text.match(/^FROM\s+\S+(\s+AS\s+prod|\s+AS\s+PROD)\s*$/m);
      if (prodMatch && prodMatch.index !== undefined) {
        const prodBlock = text.slice(prodMatch.index);
        // USER 1001:1001 antes de qualquer próximo FROM (que seria pós-prod,
        // improvável) ou fim de arquivo
        const nextFrom = prodBlock.slice(1).search(/^FROM\s/m);
        const prodEnd = nextFrom === -1 ? prodBlock.length : nextFrom + 1;
        const prodContent = prodBlock.slice(0, prodEnd);
        if (!/^USER\s+1001:1001\s*$/m.test(prodContent)) {
          errors.push(
            `${file}: stage prod não tem 'USER 1001:1001' (UID numérico) — #88 exige UID explícito, não 'USER node'`,
          );
        }
      }
    }
  }

  // (3) compose api tem init: true
  let composeText = '';
  try {
    composeText = await fs.readFile(composeFile, 'utf-8');
  } catch {
    errors.push(`docker-compose.yml não encontrado em '${composeFile}'`);
    return { ok: errors.length === 0, errors };
  }

  // Encontra o bloco do service `api:` (não api-migrate, api-..., etc).
  const apiBlockMatch = composeText.match(/^  api:\s*\n([\s\S]*?)(?=^  \w|^volumes:|^networks:)/m);
  if (!apiBlockMatch) {
    errors.push(`service 'api' não encontrado em '${composeFile}' — não posso validar #90`);
  } else {
    const apiBlock = apiBlockMatch[1]!;
    if (!/^\s+init:\s+true\s*$/m.test(apiBlock)) {
      errors.push(
        `docker-compose.yml: service 'api' não tem 'init: true' — #90 exige tini como PID 1 para SIGTERM forwarding`,
      );
    }
  }

  // (4) hardening runtime nos 3 services prod (postgres, api, web)
  const servicesToCheck = ['postgres', 'api', 'web'];
  for (const svc of servicesToCheck) {
    const svcRe = new RegExp(`^  ${svc}:\\s*\\n([\\s\\S]*?)(?=^  \\w|^volumes:|^networks:)`, 'm');
    const m = composeText.match(svcRe);
    if (!m) {
      errors.push(
        `docker-compose.yml: service '${svc}' não encontrado — não posso validar #83/#92`,
      );
      continue;
    }
    const block = m[1]!;
    if (!/^\s+read_only:\s+true\s*$/m.test(block)) {
      errors.push(
        `docker-compose.yml: service '${svc}' não tem 'read_only: true' — #83/#92 exige FS read-only`,
      );
    }
    if (!/^\s+cap_drop:\s*\n\s+-\s+ALL\s*$/m.test(block)) {
      errors.push(
        `docker-compose.yml: service '${svc}' não tem 'cap_drop: [ALL]' — #83/#92 exige cap_drop ALL`,
      );
    }
    if (!/^\s+security_opt:\s*\n\s+-\s+['"]?no-new-privileges:true['"]?\s*$/m.test(block)) {
      errors.push(
        `docker-compose.yml: service '${svc}' não tem 'security_opt: no-new-privileges' — #83/#92`,
      );
    }
  }

  // (5) network segmentation: top-level networks: + services não usam default
  if (!/^networks:\s*\n/m.test(composeText)) {
    errors.push(
      `docker-compose.yml: sem bloco top-level 'networks:' — #91 exige segmentação frontend/backend`,
    );
  } else {
    // Confere que pelo menos postgres e web declaram `networks:` (não usam default implícita).
    for (const svc of ['postgres', 'web', 'otel-collector']) {
      const svcRe = new RegExp(`^  ${svc}:\\s*\\n([\\s\\S]*?)(?=^  \\w|^volumes:|^networks:)`, 'm');
      const m = composeText.match(svcRe);
      if (m && !/^\s+networks:\s*\n/m.test(m[1]!)) {
        errors.push(
          `docker-compose.yml: service '${svc}' sem 'networks:' explícito — pode estar usando default — #91`,
        );
      }
    }
  }

  // (6) .dockerignore exclui .env.production*
  let dockerignoreText = '';
  try {
    dockerignoreText = await fs.readFile(dockerignoreFile, 'utf-8');
  } catch {
    errors.push(`.dockerignore não encontrado em '${dockerignoreFile}'`);
    return { ok: errors.length === 0, errors };
  }
  // Casa tanto `**/.env.production` quanto `.env.production` (sem /).
  if (!/(?:^|\s)\*\*\/?\.env\.production(?:\*|\b|\s|$)/m.test(dockerignoreText)) {
    errors.push(
      `.dockerignore: não exclui '.env.production*' — #84: build context vaza secrets em cache de layer`,
    );
  }

  return { ok: errors.length === 0, errors };
}
