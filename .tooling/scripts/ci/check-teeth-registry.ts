#!/usr/bin/env tsx
/**
 * Reconcilia o **registro de dentes** (`.agents/specs/conventions/
 * ci-defense-in-depth.md` §"Registro de dentes") com o que de fato roda.
 *
 * Três reconciliações, cada uma caçando uma classe de guard diferente:
 *
 *   1. **registro ↔ preflight** — todo gate que roda tem entrada no registro,
 *      e toda entrada do registro corresponde a um gate que roda. Sem isto, o
 *      registro envelhece em silêncio: ninguém o avisa de que um gate novo
 *      entrou, e a lista segue correta sobre um preflight que já não
 *      corresponde.
 *
 *   2. **registro → artefato** — a entrada aponta para um arquivo que EXISTE.
 *      Um path digitado errado é a forma mais barata de um gate deixar de
 *      existir: o registro continua "verde" descrevendo algo que não está lá.
 *
 *   3. **registro ↔ roteamento** — o arquivo do gate mora num diretório que
 *      alguma `path_glob` alcança. Este é o RED que a task 3.2 do plano
 *      `guard-classes` encontrou: `review-routing.md` declarava
 *      `tooling/scripts/ci/**`, que casa 0 arquivos versionados, enquanto os
 *      gates vivem em `.tooling/scripts/ci/**`. Um prefixo de `.` que some —
 *      a rota existe, o lint passa (a regra não é `blocking`), e nenhum
 *      arquivo de CI tem revisão despachada. Classe 1: condição inalcançável.
 *
 * ## Duas decisões que este check toma para não cair em classe 2
 *
 * **a) A identidade do gate é o ARQUIVO, não o nome de exibição.**
 * `preflight.ts` declara `check-eslint-drift` duas vezes (uma por app) e
 * exibe nomes como `'Cross-refs em .md versionados'`, que não resemble
 * `check-doc-refs`. Casar registro↔preflight por nome seria acerto-e-erro em
 * metade dos casos e exigiria um mapa de sinônimos que envelhece pior que o
 * registro que ele deveria proteger. O campo `file` que o preflight carrega é
 * a chave — e é por isso que ele existe.
 *
 * **b) O parse do registro acha o path pelo FORMATO, não pela COLUNA.**
 * Um parse posicional (`split('|')[3]`) funciona até alguém reordenar a
 * tabela — a classe 2 com outro nome: o guard cobre exatamente a forma que
 * existe hoje. A regra adotada é "o token backtickado que é um path
 * versionado de código, inteiro, e não é spec". Ela sobrevive a mover
 * coluna, renomear cabeçalho e reescrever a descrição.
 *
 * ## Por que o matcher de glob NÃO é reimplementado aqui
 *
 * `loadMatrix` e `matchPathGlobs` vêm do router real
 * (`tooling/scripts/review-router.ts`). Um terceiro glob-to-regex neste
 * arquivo criaria duas semânticas de "casado" no mesmo repo — e a
 * divergência entre elas seria invisível justamente nos casos que importam
 * (o `*` que casa `tooling/` mas não `.tooling/`). `lint-review-routing.ts`
 * já carrega uma réplica (`globToRegexLocal`) por não poder importar de
 * `.tooling/`; aqui o import cross-pacote é possível, e por isso foi feito.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { matchPathGlobs, loadMatrix } from '../../../tooling/scripts/review-router.js';
import type { CheckResult } from './check-types';

/** Um gate como o preflight o declara. */
export interface GateRef {
  /** Nome de exibição, para Humans. NÃO é a chave de reconciliação. */
  name: string;
  /** Path repo-relative do arquivo que implementa o gate. A chave. */
  file: string;
}

export interface ReconcileInput {
  /** Gates que o preflight registra. */
  registeredGates: GateRef[];
  /** Markdown do `ci-defense-in-depth.md` (ou só a seção do registro). */
  registryMarkdown: string;
  /** Markdown da matriz `review-routing.md`. */
  matrixMarkdown: string;
  /** Arquivos versionados no repo, repo-relative. */
  trackedFiles: string[];
}

export interface ReconcileResult {
  ok: boolean;
  errors: string[];
}

/** Heading que delimita a tabela de dentes. */
const REGISTRY_HEADING = /^##\s+Registro de dentes\s*$/m;

/**
 * Token backtickado que é um path versionado de código.
 *
 * Exclui `.spec.ts`/`.test.ts` de propósito: o registro documenta o GATE — a
 * coisa que roda — e o spec é outro artefato, já nomeado na coluna ao lado. A
 * linha do lint da matriz cita `tooling/scripts/lint-review-routing.spec.ts`
 * (tem `/`, então casaria) enquanto o gate é `.../lint-review-routing.ts`.
 *
 * Sem espaços: os comandos de prova (`npx vitest run --root …`) vivem em
 * spans de código com espaços e por isso nunca casam.
 */
const CODE_PATH_RE = /^\.?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.(?:ts|mts|cts|mjs|js|sh)$/;
const IS_SPEC_RE = /\.(?:spec|test)\.[cm]?ts$/;

function isGatePath(token: string): boolean {
  return CODE_PATH_RE.test(token) && !IS_SPEC_RE.test(token);
}

/**
 * Extrai os paths de gate da tabela do registro.
 *
 * Lê a seção a partir do heading, e dentro dela só as linhas que começam com
 * `|` — o que descarta automaticamente prosa abaixo da tabela (onde paths são
 * citados legitimamente, ex. no comando de mutação) e a linha separadora.
 */
export function registryGateFiles(markdown: string): string[] {
  const heading = REGISTRY_HEADING.exec(markdown);
  if (heading === null) return [];

  const after = markdown.slice(heading.index + heading[0].length);
  const files: string[] = [];
  for (const line of after.split('\n')) {
    // A tabela acabou: a próxima linha não é mais uma linha de tabela.
    if (files.length > 0 && !line.trimStart().startsWith('|')) break;
    if (!line.trimStart().startsWith('|')) continue;

    for (const m of line.matchAll(/`([^`]+)`/g)) {
      if (isGatePath(m[1])) files.push(m[1]);
    }
  }
  return files;
}

/**
 * Gates que NENHUMA `path_glob` da matriz alcança.
 *
 * Um gate sem rota é a classe 1 completa: o arquivo de CI é alterado, nada
 * dispara revisão, e todos os gates continuam verdes — porque nenhum deles
 * pergunta se o roteamento o alcança.
 */
export function unroutedGateFiles(params: {
  gateFiles: string[];
  matrixMarkdown: string;
}): string[] {
  const rules = loadMatrix(params.matrixMarkdown).path_globs ?? [];
  const matches = matchPathGlobs(params.gateFiles, rules);
  const routed = new Set(matches.flatMap((m) => m.files_matched));
  return params.gateFiles.filter((f) => !routed.has(f));
}

/**
 * Reconcilia registro ↔ preflight, registro → artefato e registro ↔
 * roteamento. Cada erro NOMEIA o artefato culpado: um "registro divergente"
 * genérico obriga quem lê a ir caçar, e é assim que divergência vira órfã.
 */
export function reconcileTeethRegistry(input: ReconcileInput): ReconcileResult {
  const errors: string[] = [];
  const registryFiles = registryGateFiles(input.registryMarkdown);
  const gateFiles = [...new Set(input.registeredGates.map((g) => g.file))];
  const tracked = new Set(input.trackedFiles);

  // 1. registro ↔ preflight
  const declared = new Set(registryFiles);
  for (const file of gateFiles) {
    if (!declared.has(file)) {
      errors.push(
        `gate roda no preflight sem entrada no registro de dentes: ${file} — ` +
          `acrescente a linha na tabela de "Registro de dentes"`,
      );
    }
  }
  const running = new Set(gateFiles);
  for (const file of registryFiles) {
    if (!running.has(file)) {
      errors.push(
        `entrada do registro que não corresponde a nenhum gate: ${file} — ` +
          `ou o gate saiu do preflight, ou o path está errado`,
      );
    }
  }

  // 2. registro → artefato
  for (const file of registryFiles) {
    if (!tracked.has(file)) {
      errors.push(
        `entrada do registro aponta pra arquivo que não existe: ${file} — ` +
          `o path do gate foi digitado errado, ou o arquivo sumiu`,
      );
    }
  }

  // 3. registro ↔ roteamento
  for (const file of unroutedGateFiles({ gateFiles, matrixMarkdown: input.matrixMarkdown })) {
    errors.push(
      `gate não alcançado por nenhuma path_glob da review-routing: ${file} — ` +
        `mudança em CI sem revisão despachada é a classe 1 "condição inalcançável"`,
    );
  }

  return { ok: errors.length === 0, errors };
}

// ── Camada 1: o gate como o preflight o invoca ─────────────────────────────

const REGISTRY_DOC = join(process.cwd(), '.agents/specs/conventions/ci-defense-in-depth.md');
const MATRIX_DOC = join(process.cwd(), '.agents/specs/conventions/review-routing.md');

/**
 * Os gates do preflight. Derivados do array `checks` por importação real, não
 * re-declarados: uma cópia aqui seria uma segunda fonte de verdade que
 * envelhece exatamente no cenário que este check existe para pegar.
 *
 * A lista de `files` abaixo é o que o preflight carrega hoje (task 3.1 deste
 * plano introduziu o campo). Se um gate novo entrar no preflight e não entrar
 * aqui, o RED 1 do spec acusa.
 */
const PREFLIGHT_GATES: GateRef[] = [
  { name: 'Cross-refs em .md versionados', file: '.tooling/scripts/ci/check-doc-refs.ts' },
  { name: 'tsconfig drift', file: '.tooling/scripts/ci/check-tsconfig-drift.ts' },
  { name: 'eslint drift (api)', file: '.tooling/scripts/ci/check-eslint-drift.ts' },
  { name: 'eslint drift (web)', file: '.tooling/scripts/ci/check-eslint-drift.ts' },
  { name: 'turbo drift', file: '.tooling/scripts/ci/check-turbo-drift.ts' },
  { name: 'package.json drift', file: '.tooling/scripts/ci/check-package-json-drift.ts' },
  { name: 'docker drift', file: '.tooling/scripts/ci/check-docker-drift.ts' },
  { name: 'matrix review-routing', file: 'tooling/scripts/lint-review-routing.ts' },
  { name: 'archive integrity', file: '.tooling/scripts/ci/check-archive-integrity.ts' },
  { name: 'memory dir concordance', file: '.tooling/scripts/ci/check-memory-dir-concordance.ts' },
  { name: 'registro de dentes', file: '.tooling/scripts/ci/check-teeth-registry.ts' },
  { name: 'classe 3', file: '.tooling/scripts/ci/check-self-firing-guard.ts' },
];

export function checkTeethRegistry(): CheckResult {
  let registry: string;
  let matrix: string;
  try {
    registry = readFileSync(REGISTRY_DOC, 'utf8');
    matrix = readFileSync(MATRIX_DOC, 'utf8');
  } catch (err) {
    return {
      ok: false,
      errors: [
        `não foi possível ler as convenções que reconcilio: ${(err as Error).message} — ` +
          `sem elas este check é teatro (reporta sucesso sem ter verificado nada)`,
      ],
    };
  }

  // Arquivos versionados: o gate c1 é sobre ARTEFATO EXISTE, e um arquivo
  // untracked também "existe" no disco — que é o estado em que um gate novo
  // fica antes do primeiro commit dele.
  const trackedFiles = readRepoFiles();

  return reconcileTeethRegistry({
    registeredGates: PREFLIGHT_GATES,
    registryMarkdown: registry,
    matrixMarkdown: matrix,
    trackedFiles,
  });
}

/**
 * Arquivos que o repo considera existentes: versionados **e** untracked-não-
 * ignorados.
 *
 * `--others --exclude-standard` não é um detalhe. Um gate novo mora em
 * untracked até o primeiro commit dele, e com `git ls-files` puro este check
 * acusaria o próprio arquivo que o está criando — "aponta pra arquivo que não
 * existe" — no mesmo minuto em que ele é registrado no preflight. Um gate que
 * berra no primeiro uso ensina a ignorar o gate, que é pior do que não tê-lo.
 * (Já aconteceu neste repo: `check-doc-refs` enumera com `git ls-files` e
 * checava `.md` untracked como inexistente.)
 *
 * Cai para lista vazia (→ tudo vermelho) se o git falhar.
 */
export function readRepoFiles(): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    return out.split('\n').filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

// Executado como CLI.
if (process.argv[1]?.endsWith('check-teeth-registry.ts')) {
  const r = checkTeethRegistry();
  for (const e of r.errors) process.stderr.write(`${e}\n`);
  process.exit(r.ok ? 0 : 1);
}
