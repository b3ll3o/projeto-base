/**
 * SEM shebang, de propósito.
 *
 * Gate que fecha a classe do issue #139: o `HEALTHCHECK` de uma imagem
 * precisa de um BINÁRIO que existe NAQUELA imagem — e não só na imagem de
 * produção.
 *
 * MEDIDO em 2026-11-02: o `HEALTHCHECK` do `apps/api/Dockerfile` usava
 * `curl -fsS`, e o `docker-compose.dev.yml` troca o `build.target` para
 * `dev` (que herda de `base`, onde só há `openssl`). O probe herdado falhava
 * com "curl: not found": a api nunca ficava `healthy`, e o `web` — que
 * depende dela com `condition: service_healthy` — não subia. O sintoma era
 * "o web não sobe", e a causa (um binário ausente) não estava no probe.
 *
 * ⚠️ A ARMADILHA, E POR QUE O GATE LÊ O COMPOSE:
 *
 * O `curl` estava instalado NO STAGE `prod` do mesmo Dockerfile. Um gate que
 * só verificasse "o binário está instalado em algum lugar do arquivo"
 * passaria — e o defeito continuaria. Pior: o probe que roda **no compose de
 * dev** nem está no stage `dev` — o `HEALTHCHECK` é uma instrução da IMAGEM,
 * e o stage `dev` não tem um; o que o compose de dev herda é o `healthcheck`
 * do compose base, e ele roda no stage que o `build.target` manda.
 *
 * Por isso o gate mede as DUAS coisas:
 *
 *   1. o `HEALTHCHECK` de cada stage do Dockerfile, contra os binários
 *      daquele stage (e dos stages de que ele herda);
 *   2. o `healthcheck` de cada serviço do COMPOSE, contra os binários do
 *      stage que o `build.target` do serviço manda — e o `build.target` é o
 *      do OVERLAY quando existe (é o `docker-compose.dev.yml` que troca o
 *      stage da api).
 *
 * ⚠️ O QUE ESTE GATE NÃO FAZ: ele não sobe a imagem nem executa o probe.
 * Ele mede a RELAÇÃO entre o que o probe chama e o que a imagem instala —
 * que é a parte estática do defeito. A outra parte (o binário existir de
 * fato) é do `docker build` e do `docker compose ps`.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

export interface CheckResult {
  ok: boolean;
  errors: string[];
  advisories: string[];
}

/**
 * Os binários que a imagem `node:*` JÁ tem, e que o probe pode usar sem
 * instalar nada.
 *
 * ⚠️ MEDIDO 2026-11-02 (varredura das camadas OCI de `node:22-bookworm-slim`):
 * existem `bash`, `dash`, `sh`, `corepack` e `node`. Nenhum `curl`, nenhum
 * `wget`. E `node` é o que os DOIS healthchecks do repo já usam no web.
 * (`env` é do coreutils, que também está na imagem.)
 */
export const BINARIOS_NATOS_DA_IMAGEM_NODE = ['node', 'sh', 'bash', 'dash', 'corepack', 'env'];

/** Um stage de um Dockerfile: o nome, o pai e os pacotes que ele instala. */
export interface Stage {
  nome: string;
  /** O stage de que este herda (`base` → `dev`), ou `null` se é raiz. */
  pai: string | null;
  /** Os pacotes que um `apt-get install` instala neste stage. */
  pacotes: string[];
  /** O comando do `HEALTHCHECK` deste stage, ou `null`. */
  healthcheck: string | null;
}

/** O binário que o comando do healthcheck chama. */
export function binarioDoHealthcheck(comando: string): string | null {
  // ⚠️ O comando pode vir em `CMD-SHELL` (o shell do container executa) ou
  // em forma exec (`CMD ["curl", "-fsS", ...]`). Nos dois, o primeiro token
  // é o binário.
  const limpo = comando
    .trim()
    .replace(/^CMD-SHELL\s+/i, '')
    .replace(/^CMD\s+/i, '');
  // A forma EXEC começa com `[` — e o primeiro elemento é o binário.
  const exec = /^\[\s*"([^"]+)"/.exec(limpo);
  if (exec) return exec[1] ?? null;

  // ⚠️ Uma ATRIBUIÇÃO de variável no começo (`NODE_OPTIONS= node -e …`) não é
  // o binário — é o prefixo que o tira do caminho do Node.
  const tokens = limpo.split(/\s+/).filter((t) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(t));
  const primeiro = tokens[0]?.replace(/^["']/, '').replace(/["']$/, '');
  if (primeiro === undefined || primeiro === '') return null;
  return primeiro;
}

/**
 * Os stages de um Dockerfile, na ordem em que aparecem.
 *
 * O parser é deliberadamente SIMPLES: `FROM ... AS <nome>` abre um stage, e
 * o que vier antes do próximo `FROM` é o corpo dele. A herança vem do
 * `FROM <stage-local>` (sem `AS`), e os pacotes vêm das linhas de
 * `apt-get install`.
 */
export function stagesDeDockerfile(texto: string): Stage[] {
  const linhas = texto.split('\n');
  const stages: Stage[] = [];
  let atual: Stage | null = null;
  // O `HEALTHCHECK` pode ter o comando na MESMA linha
  // (`HEALTHCHECK CMD curl …`) ou na SEGUINTE, quando a linha termina em
  // `\` (a forma `HEALTHCHECK --interval=… \` + `CMD …`).
  let aguardandoComando = false;

  for (const linha of linhas) {
    const from = /^FROM\s+(\S+)(?:\s+AS\s+(\S+))?\s*$/i.exec(linha.trim());
    if (from) {
      const base = from[1] ?? '';
      const nome = from[2] ?? base;
      // `FROM base AS dev` herda de um stage LOCAL; `FROM node:22 AS prod`
      // herda da imagem base (e não de nenhum stage do arquivo).
      const pai = from[2] !== undefined && !base.includes(':') && !base.includes('@') ? base : null;
      atual = { nome, pai, pacotes: [], healthcheck: null };
      stages.push(atual);
      aguardandoComando = false;
      continue;
    }
    if (atual === null) continue;

    const apt = pacotesDoAptGet(linha);
    if (apt.length > 0) atual.pacotes.push(...apt);

    if (/^HEALTHCHECK\b/i.test(linha.trim())) {
      // As OPÇÕES do healthcheck (`--interval=… --timeout=… --retries=…`)
      // saem primeiro — e são todas, não só a primeira.
      const resto = linha
        .trim()
        .replace(/^HEALTHCHECK\s*/i, '')
        .replace(/^(?:--[^\s]+\s*)+/, '')
        .replace(/\\\s*$/, '')
        .trim();
      if (resto === '') {
        // O comando vem na LINHA SEGUINTE (continuação com `\`).
        aguardandoComando = true;
      } else {
        atual.healthcheck = resto;
        aguardandoComando = false;
      }
      continue;
    }

    if (aguardandoComando) {
      if (/^CMD\b/i.test(linha.trim())) {
        atual.healthcheck = linha
          .trim()
          .replace(/^CMD\s*/i, '')
          .replace(/\\\s*$/, '')
          .trim();
      }
      // ⚠️ Qualquer outra linha cancela a espera: o `CMD` de um stage pode
      // vir DEPOIS do HEALTHCHECK (o web tem `CMD ["node", "server.js"]`),
      // e pegá-lo como se fosse o probe seria medir a instrução errada.
      aguardandoComando = false;
      continue;
    }
  }
  return stages;
}

/**
 * Os pacotes que uma linha de `apt-get install` instala.
 *
 * ⚠️ O que NÃO é pacote: as FLAGS (`--no-install-recommends`) e o que vem
 * DEPOIS do comando (`&& rm -rf …`). MEDIDO 2026-11-08: o parser anterior
 * colava `rm` e `-rf` na lista — e um probe que chamasse `rm` passaria.
 */
export function pacotesDoAptGet(linha: string): string[] {
  const apt = /apt-get\s+install\s+([^\n\\&|]+)/.exec(linha);
  if (apt === null) return [];
  const pacotes: string[] = [];
  for (const bruto of (apt[1] ?? '').split(/\s+/)) {
    if (bruto === '') continue;
    // Uma flag (`-y`, `--no-install-recommends`) não é pacote.
    if (bruto.startsWith('-')) continue;
    pacotes.push(bruto.replace(/[^\w.+-]/g, ''));
  }
  return pacotes.filter((p) => p !== '');
}

/** Os binários disponíveis num stage — os dele E os dos stages de que ele herda. */
export function binariosDoStage(stages: Stage[], nome: string): Set<string> {
  const disponiveis = new Set<string>();
  const stage = stages.find((s) => s.nome === nome);
  if (stage === undefined) return disponiveis;
  if (stage.pai !== null) {
    for (const bin of binariosDoStage(stages, stage.pai)) disponiveis.add(bin);
  }
  for (const pacote of stage.pacotes) disponiveis.add(pacote);
  return disponiveis;
}

// ─── O COMPOSE ──────────────────────────────────────────────────────────────

/** Um serviço do compose, do que interessa ao probe. */
export interface ServicoCompose {
  nome: string;
  /** O `build.target` declarado (ou `null`). */
  target: string | null;
  /** O `build.dockerfile` declarado (ou `null` → `Dockerfile`). */
  dockerfile: string | null;
  /** O comando do `healthcheck` (ou `null`). */
  healthcheck: string | null;
}

/**
 * Os serviços de um compose, com o `build.target` e o `healthcheck`.
 *
 * ⚠️ O parser é de LINHA (o mesmo padrão do `check-dockerfile-hardening.ts`),
 * e não de YAML: o `.tooling/scripts/ci` não tem `yaml` como dependência, e
 * o repo já resolveu esse problema uma vez (os gates que leem compose leem
 * por linha).
 */
export function servicosDoCompose(texto: string): ServicoCompose[] {
  const linhas = texto.split('\n');
  const servicos: ServicoCompose[] = [];
  let dentroDeServicos = false;
  let atual: ServicoCompose | null = null;
  // As linhas do serviço em curso — o `healthcheck` precisa delas inteiras
  // (a sequência de fluxo pode ocupar várias).
  let linhasDoServico: string[] = [];

  const fechar = (): void => {
    if (atual !== null) {
      atual.healthcheck = comandoDoHealthcheck(linhasDoServico);
      servicos.push(atual);
      atual = null;
      linhasDoServico = [];
    }
  };

  for (const linha of linhas) {
    if (/^services:\s*$/.test(linha)) {
      dentroDeServicos = true;
      continue;
    }
    if (!dentroDeServicos) continue;
    // Um bloco no nível de topo fecha a seção de serviços.
    if (/^[A-Za-z]/.test(linha)) {
      fechar();
      dentroDeServicos = false;
      continue;
    }
    // Um serviço novo começa em `  nome:` (2 espaços).
    const novo = /^ {2}([\w.-]+):\s*$/.exec(linha);
    if (novo) {
      fechar();
      atual = {
        nome: novo[1] ?? '',
        target: null,
        dockerfile: null,
        healthcheck: null,
      };
      linhasDoServico = [];
      continue;
    }
    if (atual === null) continue;
    linhasDoServico.push(linha);

    // O `target` aparece em duas formas: `build: { target: dev }` (uma linha)
    // e `build:` + `target: prod` (a linha seguinte).
    const target = /(?:^|[{,])\s*target:\s*([\w.-]+)/.exec(linha);
    if (target) atual.target = target[1] ?? null;
    const dockerfile = /(?:^|[{,])\s*dockerfile:\s*([\w./-]+)/.exec(linha);
    if (dockerfile) atual.dockerfile = dockerfile[1] ?? null;
  }
  fechar();
  return servicos;
}

/**
 * O comando do `healthcheck` de um bloco de serviço, ou `null`.
 *
 * ⚠️ O `test:` pode ser uma SEQUÊNCIA DE FLUXO (`['CMD-SHELL', 'curl …']`),
 * e ela pode ocupar VÁRIAS linhas. O `CMD-SHELL` é o COMO; o comando é o
 * segundo elemento. Na forma exec (`['CMD', 'curl', '-f', …]`), o comando é
 * o segundo elemento também — e o resto é o argv.
 */
export function comandoDoHealthcheck(linhas: string[]): string | null {
  const i = linhas.findIndex((l) => /^\s*test:\s*/.test(l));
  if (i === -1) return null;

  const resto = linhas[i]!.replace(/^\s*test:\s*/, '').trim();
  let bruto = resto;
  if (!bruto.startsWith('[')) {
    // A sequência abre na linha seguinte.
    bruto = '';
    for (let j = i + 1; j < linhas.length; j++) {
      bruto += linhas[j]!.trim();
      if (bruto.includes(']')) break;
    }
  }
  const elementos = [...bruto.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2] ?? '');
  if (elementos.length === 0) return null;
  const primeiro = elementos[0] ?? '';
  if (primeiro.toUpperCase() === 'CMD-SHELL' || primeiro.toUpperCase() === 'CMD') {
    return elementos[1] ?? null;
  }
  // A forma `test: curl …` (o comando direto).
  return primeiro;
}

// ─── O GATE ─────────────────────────────────────────────────────────────────

/** O gate. */
export function checkDockerHealthcheckBinary(opts: { repoRoot: string }): CheckResult {
  const errors: string[] = [];
  const advisories: string[] = [];
  const root = path.resolve(opts.repoRoot);
  const appsRoot = path.join(root, 'apps');

  if (!existsSync(appsRoot)) {
    return { ok: true, errors, advisories: [`${appsRoot} ausente — nada a medir`] };
  }

  let healthchecks = 0;
  const dockerfiles = new Map<string, Stage[]>();

  // (1) O `HEALTHCHECK` de cada stage do Dockerfile, contra os binários
  // daquele stage.
  for (const app of readdirSync(appsRoot).sort()) {
    const arquivo = path.join(appsRoot, app, 'Dockerfile');
    if (!existsSync(arquivo)) continue;
    const stages = stagesDeDockerfile(readFileSync(arquivo, 'utf-8'));
    dockerfiles.set(path.join(appsRoot, app, 'Dockerfile'), stages);

    for (const stage of stages) {
      if (stage.healthcheck === null) continue;
      healthchecks++;
      const binario = binarioDoHealthcheck(stage.healthcheck);
      if (binario === null) continue;

      if (BINARIOS_NATOS_DA_IMAGEM_NODE.includes(binario)) continue;
      const disponiveis = binariosDoStage(stages, stage.nome);
      if (disponiveis.has(binario)) continue;

      errors.push(
        `apps/${app}/Dockerfile: o HEALTHCHECK do stage '${stage.nome}' chama ` +
          `\`${binario}\`, e o binário não está na imagem — nem é nativo da ` +
          `node:*, nem instalado por um apt-get deste stage ou de um stage de ` +
          `que ele herda. O probe falha com "not found" em runtime, e o ` +
          `serviço fica UNHEALTHY para sempre (#139).`,
      );
    }
  }

  // (2) O `healthcheck` de cada serviço do COMPOSE, contra os binários do
  // stage que o `build.target` do serviço manda — e o `build.target` efetivo
  // é o do OVERLAY quando existe.
  const composeBase = path.join(root, 'docker-compose.yml');
  if (existsSync(composeBase)) {
    const base = servicosDoCompose(readFileSync(composeBase, 'utf-8'));
    // Os overlays: `docker-compose.<algo>.yml`. O Compose mescla serviço a
    // serviço, e o overlay TROCA o `build.target` sem declarar healthcheck —
    // e o healthcheck herdado do compose base é o que roda.
    const overlays = readdirSync(root)
      .filter((n) => /^docker-compose\..+\.ya?ml$/.test(n))
      .sort();
    for (const overlay of overlays) {
      const Over = servicosDoCompose(readFileSync(path.join(root, overlay), 'utf-8'));
      for (const servico of Over) {
        const original = base.find((s) => s.nome === servico.nome);
        if (original === undefined) continue;
        if (servico.target !== null) original.target = servico.target;
        if (servico.healthcheck !== null) original.healthcheck = servico.healthcheck;
      }
    }

    for (const servico of base) {
      if (servico.healthcheck === null || servico.target === null) continue;
      const binario = binarioDoHealthcheck(servico.healthcheck);
      if (binario === null) continue;
      healthchecks++;

      const dockerfile = path.join(
        root,
        servico.dockerfile ?? path.join('apps', servico.nome, 'Dockerfile'),
      );
      const stages = dockerfiles.get(dockerfile);
      if (stages === undefined) continue; // sem Dockerfile, nada a medir
      if (BINARIOS_NATOS_DA_IMAGEM_NODE.includes(binario)) continue;
      const disponiveis = binariosDoStage(stages, servico.target);
      if (disponiveis.has(binario)) continue;

      errors.push(
        `docker-compose: o serviço '${servico.nome}' faz o build do target ` +
          `\`${servico.target}\` e o healthcheck chama \`${binario}\` — e o ` +
          `binário não está NAQUELE stage. O probe falha com "not found" em ` +
          `runtime, e o serviço fica UNHEALTHY para sempre (#139).`,
      );
    }
  }

  if (healthchecks === 0) {
    advisories.push('nenhum HEALTHCHECK encontrado — nada a medir');
  } else {
    advisories.push(`HEALTHCHECK verificados: ${healthchecks}`);
  }

  return { ok: errors.length === 0, errors, advisories };
}
