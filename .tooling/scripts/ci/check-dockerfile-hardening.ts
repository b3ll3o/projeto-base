/**
 * SEM shebang, de propósito.
 *
 * Gate prophylático que valida o hardening de Dockerfiles prod + compose
 * + .dockerignore. Fica em pé sozinho: rodada 1 deste gate PRECEDE o
 * regresso das issues 83, 84, 88, 89, 90, 91, 92, então ele documenta o
 * estado-novo (verde) e bloqueia regressões silenciosas em PRs futuros
 * (classe 5 de guard-classes.md).
 *
 * O gate cobre 7 propriedades, todas refletidas nas correções do PR:
 *   1. apps Dockerfile: FROM tem @sha256: pin
 *   2. apps Dockerfile stage prod: tem USER 1001:1001 (não "node")
 *   3. docker-compose.yml service api: tem init: true
 *   4. docker-compose.yml services prod: read_only/cap_drop/security_opt
 *   5. docker-compose.yml: tem top-level networks: + services NÃO usam default
 *   6. docker-compose.yml services: deploy.resources.limits.memory
 *   7. .dockerignore: exclui .env.production*
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
 * Nomes dos serviços do bloco `services:` do compose.
 *
 * Chave de 2 espaços distingue serviço de chave interna (4 espaços) e de
 * chave top-level (coluna 0, como `networks:`/`volumes:`). Devolve `[]` se o
 * bloco não casar — quem chama precisa tratar isso como erro, porque um
 * `for` sobre `[]` itera zero vezes e passa sem olhar nada.
 */
export function listComposeServices(composeText: string): string[] {
  const bloco = composeText.match(/^services:\s*\n([\s\S]*?)(?=^\S)/m)?.[1] ?? '';
  return [...bloco.matchAll(/^ {2}([\w.-]+):\s*$/gm)].map((m) => m[1]!);
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

/**
 * Corpo do bloco de um serviço, ou `null` se o serviço não casar.
 *
 * Extrair em UM lugar só: as três validações de serviço repetiam a mesma regex,
 * e uma delas (`limits.memory`) fazia `continue` em silêncio no `null` — a
 * forma de passar sem ter olhado. Caller trata `null` como erro.
 */
export function blocoDeServico(composeText: string, svc: string): string | null {
  const re = new RegExp(`^  ${svc}:\\s*\\n([\\s\\S]*?)(?=^  \\w|^volumes:|^networks:)`, 'm');
  return composeText.match(re)?.[1] ?? null;
}

/**
 * Diz se o bloco de um serviço declara `deploy.resources.limits.memory`.
 *
 * Percorre a cadeia `deploy:` → `resources:` → `limits:` → `memory:` e exige
 * que cada chave esteja MAIS aninhada que a anterior. Isso fecha duas formas que
 * uma regex solta aceitaria: chaves não consecutivas (`deploy:` num canto e
 * `memory:` num comentário) e `reservations.memory`, que é PISO, não teto.
 *
 * ⚠️ CORREÇÃO 2026-10-20: a primeira versão era uma regex única que exigia
 * `limits:\n\s+memory:` — isto é, `memory:` como PRIMEIRA chave sob `limits:`.
 * Ela pegava o `tempo` (onde `memory` é a primeira) e acusava `postgres` como
 * sem teto, sendo que o `postgres` tem `memory: 512M` em `docker-compose.yml`
 * logo depois de `cpus: '0.5'`. Predicado validado só no caminho onde ele
 * passava é o mesmo defeito do código que ele caça.
 */
function temTetoDeMemoria(block: string): boolean {
  const linhas = block.split('\n');
  const cadeia = ['deploy', 'resources', 'limits', 'memory'];
  let inicio = 0;
  let piso = 0; // indentação mínima que a PRÓXIMA chave da cadeia pode ter
  for (const chave of cadeia) {
    let achou = -1;
    for (let j = inicio; j < linhas.length; j++) {
      const linha = linhas[j]!;
      if (linha.trim() === '') continue;
      const recuo = linha.length - linha.trimStart().length;
      if (recuo < piso) break; // saiu do nível do pai
      if (linha.trim().split(':')[0] === chave) {
        achou = j;
        break;
      }
    }
    if (achou === -1) return false;
    piso = linhas[achou]!.length - linhas[achou]!.trimStart().length + 2;
    inicio = achou + 1;
  }
  return true;
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

  // (4) hardening runtime em TODO serviço do compose.
  //
  // MEDIDO 2026-10-19: esta lista era `['postgres','api','web']` hardcoded, e
  // o bloco (5), logo abaixo, foi deliberadamente enumerado com um comentário
  // que nomeia exatamente esse defeito ("uma lista de nomes transferia a
  // manutenção para quem edita o compose"). O mesmo valia para cá: os três
  // serviços de observabilidade que a branch `feat/stack-observabilidade`
  // adicionou (tempo, prometheus, grafana) entravam sem cobertura — apagar o
  // `cap_drop: ALL` do grafana deixava este gate verde.
  //
  // `otel-collector` era a ÚNICA exceção, por nome, e a razão ("dívida
  // PRÉ-EXISTENTE do `main`") caducou quando a branch `feat/stack-observabilidade`
  // reescreveu o serviço (portas em `127.0.0.1`, rede `observability`, `env_file`,
  // `deploy.resources`). A lista saiu junto: exceção por nome é o anti-padrão que o
  // bloco (5) logo abaixo diz ter eliminado, e serviço tocado em serviço não
  // endurecido é o que o `check-dockerfile-hardening` existe para impedir.
  // MEDIDO 2026-10-20: `infra/otelcol/config.yaml` não tem `file_storage` nem
  // `wal`, então o collector não escreve em disco e `read_only` é seguro.
  const servicesToCheck = listComposeServices(composeText);
  if (servicesToCheck.length === 0) {
    errors.push(
      'docker-compose.yml: 0 serviço(s) para checar hardening (#83/#92) — não posso validar',
    );
  }
  for (const svc of servicesToCheck) {
    const block = blocoDeServico(composeText, svc);
    if (block === null) {
      errors.push(
        `docker-compose.yml: service '${svc}' não encontrado — não posso validar #83/#92`,
      );
      continue;
    }
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
    // Confere que TODO serviço do compose declara `networks:` (não usa a
    // default implícita). **Enumerado, não hardcoded**: MEDIDO 2026-10-16, uma
    // lista de nomes transferia a manutenção para quem edita o compose — `api`
    // não era checado, e um serviço novo (`cache`) entrava sem `networks:` e o
    // gate ficava verde. Nomear aqui seria repetir o defeito que este bloco
    // existe para fechar.
    const services = listComposeServices(composeText);
    if (services.length === 0) {
      // `[]` itera zero vezes: sem este erro, uma regex que engole o bloco
      // inteiro passa o gate sem ter olhado serviço nenhum.
      errors.push(
        `docker-compose.yml: 0 serviço(s) enumerado(s) no bloco 'services:' — não posso validar #91`,
      );
    }
    for (const svc of services) {
      const block = blocoDeServico(composeText, svc);
      if (block === null) {
        errors.push(`docker-compose.yml: serviço '${svc}' não encontrado — não posso validar #91`);
        continue;
      }
      if (!/^\s+networks:\s*\n/m.test(block)) {
        errors.push(
          `docker-compose.yml: service '${svc}' sem 'networks:' explícito — pode estar usando default — #91`,
        );
      }
    }
  }

  // (6) teto de memória em TODO serviço.
  //
  // O caso que originou esta regra: `infra/otelcol/config.yaml` tem
  // `memory_limiter` com `limit_percentage: 80`, e o OTel lê o limite da CGROUP,
  // não um número do config. Apagar o `deploy:` do collector faria ele se
  // auto-limitar ao total da máquina em vez dos 512M — comportamento que o
  // próprio config nomeia como "512M → 410M" e que ninguém notaria até o dia em
  // que ele engolisse a máquina.
  //
  // MEDIDO 2026-10-20: os 7 serviços do compose JÁ declaram
  // `deploy.resources.limits.memory` (`postgres` incluído, `512M` em
  // `docker-compose.yml:65`). A regra nasce verde e não pede mudança nenhuma —
  // ela trava um estado que já é o de todo mundo.
  //
  // ⚠️ CORREÇÃO 2026-10-20: a primeira versão desta regra exigia o teto só em
  // serviço com `profiles: [observability]`, justificada por uma medição minha
  // de que o `postgres` não tinha teto. Era FALSA, e a revisão independente a
  // refutou com o número do próprio compose. Estreitar uma regra por um fato
  // que não existe deixa passar tudo que ela pegaria.
  for (const svc of listComposeServices(composeText)) {
    const block = blocoDeServico(composeText, svc);
    if (block === null) {
      errors.push(`docker-compose.yml: service '${svc}' não encontrado — não posso validar #113`);
      continue;
    }
    if (!temTetoDeMemoria(block)) {
      errors.push(
        `docker-compose.yml: service '${svc}' sem 'deploy.resources.limits.memory' — teto de memória ausente; o memory_limiter do collector lê a cgroup, então sem ele o serviço se auto-limita ao total da máquina (#113)`,
      );
    }
  }

  // (7) .dockerignore exclui .env.production*
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
