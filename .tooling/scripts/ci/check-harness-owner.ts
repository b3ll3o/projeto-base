#!/usr/bin/env tsx
/**
 * Detecta **controle desligado** — task 3.4 do plano
 * docs/superpowers/plans/2026-10-03-guard-classes.md.
 *
 * Regra geral, duas instâncias:
 *
 *   (a) todo harness referenciado é INVOCADO por algo;
 *   (b) todo destino declarado tem um guard LIGADO.
 *
 * ## O que é um harness
 *
 * Um **gate** decide: recebe entrada, devolve `ok`. Um **harness** mede: roda
 * contra o sistema real, e é o próprio script que aborta quando a medida não
 * faz sentido — `turbo-redirect-differential.sh` aborta se o turbo não
 * executou, ou se o parser não carregou, porque um instrumento quebrado
 * produzindo `[]` nos dois lados casaria e reportaria `ok`. Essa
 * autoverificação é o que o torna o instrumento mais forte do diretório, e
 * também o que o torna o mais fácil de deixar desligado: ele não é chamado
 * por nada, é executado à mão quando alguém lembra.
 *
 * A B11 mediu: 2 menções no repo, ambas em comentário, **0 invocações**. O
 * backlog X11 descreve o instrumento como se estivesse rodando.
 *
 * ## O discriminador, e por que não é o nome da extensão
 *
 * A primeira versão deste check varria `*.sh`. Isso é a classe 2 — cobre a
 * forma que existe hoje e só ela — e o repo já pagou por essa forma duas
 * vezes: a task B29 precisou de um wrapper `.mts` para rodar um parser sob
 * ESM, e o próximo instrumento pode ser `.mjs`, `.cjs` ou um `.ts` com shebang.
 *
 * A regra adotada é semântica e cobre todas essas: **executado por um runtime
 * que não seja o preflight**. Concretamente, um harness é um arquivo sob
 * `.tooling/scripts/ci/` que tem shebang ou extensão executável, e cujo nome
 * não começa com `check-` (esses são módulos de gate, e o dono deles é o
 * preflight por construção) nem é um dos dois arquivos de infraestrutura do
 * diretório.
 *
 * `INFRASTRUCTURE` é uma lista de dois nomes, e é uma lista fechada de
 * propósito — com o risco escrito: **ela erra para o vermelho**, nunca para o
 * verde. Um arquivo de infraestrutura novo no diretório aparece como órfão, o
 * preflight falha, e alguém o adiciona à lista em trinta segundos. O
 * erro silencioso, que é o que este plano existe para caçar, seria uma lista
 * que aceita qualquer coisa — e aí ela deixa de ser uma lista.
 *
 * ## Instância (b): o destino declara a si mesmo
 *
 * A lista de destinos não vive aqui. Cada guard que protege um destino o
 * exporta (`PROTECTED_DESTINATION`, no `check-memory-dir-concordance`) e este
 * arquivo lê a união. Uma lista re-declarada aqui envelheceria exatamente no
 * cenário em que este check é necessário.
 *
 * ## Nasce vermelho
 *
 * A instância (a) só esverdeia na task 4.1, quando o differential ganha dono.
 * Isso é o desenho, não um bug: um detector de dívida que nasce verde não
 * mede nada, descreve como o mundo deveria ficar. O aceite desta task é o
 * check **disparar** e nomear o órfão — e o seu spec provar que um segundo
 * órfão também é nomeado, que é o que separa um detector de uma lista.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PROTECTED_DESTINATION } from './check-memory-dir-concordance.js';
import type { CheckResult } from './check-types';
import { linhasDoRelato } from './check-types';

const GATES_DIR = '.tooling/scripts/ci';
const PREFLIGHT_FILE = `${GATES_DIR}/preflight.ts`;

/**
 * Arquivos de infraestrutura do diretório de gates — o runner e o módulo de
 * tipos. Não são harness porque ninguém os executa: eles SÃO a execução.
 */
const INFRASTRUCTURE = new Set([`${GATES_DIR}/preflight.ts`, `${GATES_DIR}/check-types.ts`]);

/** Extensões que um shell ou um runtime de node executa diretamente. */
const EXECUTABLE_EXT = /\.(?:sh|bash|zsh|mjs|cjs|mts|cts)$/;
const SHEBANG = /^#![^\n]*\n/;

/** Um destino que um guard declarou proteger. */
export interface DestinationRule {
  destino: string;
  fonteCanonica: string;
  /** Id do guard — casa com o basename do path no `preflight.ts`. */
  guard: string;
}

/**
 * A união do que os guards declaram. Um guard novo que protege um destino
 * novo se declara; não há lista para lembrar de atualizar.
 */
export const DESTINATIONS: DestinationRule[] = [PROTECTED_DESTINATION];

// ── (a) o que é harness ─────────────────────────────────────────────────────

/**
 * Os harnesses de um conjunto `path → conteúdo`.
 *
 * Puro de propósito: a primeira versão lia o disco dentro do filtro, o que
 * transformava "esse path é harness" numa pergunta que só o repo real
 * respondia — e o spec passava por paths fictícios que o disco não tinha, sem
 * que a diferença aparecesse em lugar nenhum. Mesma disciplina do `strip` do
 * `check-self-firing-guard`: a função mede o que lhe derem, não o que ela
 * supõe que existe.
 */
export function harnessFiles(files: Record<string, string>): string[] {
  return Object.keys(files)
    .filter((p) => {
      if (!p.startsWith(`${GATES_DIR}/`)) return false;
      const base = p.slice(GATES_DIR.length + 1);
      if (base.startsWith('check-') || base.endsWith('.spec.ts')) return false;
      if (INFRASTRUCTURE.has(p)) return false;
      return EXECUTABLE_EXT.test(p) || SHEBANG.test(files[p] ?? '');
    })
    .sort();
}

// ── (a) quem é o dono ────────────────────────────────────────────────────────

/** Valores `file:` do array `checks` — é assim que o preflight declara posse. */
const PREFLIGHT_FILE_FIELD = /\bfile\s*:\s*(['"`])([^'"`]*)\1/g;

/**
 * As PALAVRAS de um comando de shell, com noção de aspas.
 *
 * A primeira versão dividia por `[\s;&|()<>{}'"`]` — ou seja, também quebrava
 * dentro de aspas. O efeito medido: `echo "veja x.sh no backlog"` produzia a
 * palavra `x.sh` e o check dava o crédito a uma menção. Era a classe 1 com o
 * nome mais caro: um guard que reconhece a própria ausência.
 *
 * Com noção de aspas, `"veja x.sh no backlog"` é UMA palavra, e o path é
 * parte dela, não a palavra. A regra passa a ser a do shell: um path só é
 * executado se for uma palavra INTEIRA, em posição de comando ou de argumento.
 */
export function shellWords(command: string): string[] {
  const words: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaped = false;

  const push = (): void => {
    if (current.length > 0) words.push(current);
    current = '';
  };

  for (const ch of command) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote !== null) {
      // A aspa fecha a palavra, mas fica FORA dela — é o que faz
      // `bash "x.sh"` continuar sendo a palavra `x.sh`.
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (/[\s;&|()<>{}\[\]]/.test(ch)) {
      push();
      continue;
    }
    current += ch;
  }
  push();
  return words;
}

export interface OwnerSources {
  preflightSource: string;
  packageJsonScripts: Record<string, string>;
}

/**
 * Os DONOS de um harness, cada um nomeado.
 *
 * Invariante fixada pelo plano: *"existe um invocador em `preflight.ts` **ou**
 * em `package.json#scripts`"*. Reconhecer só o primeiro tornaria a task 4.1
 * ssh um beco sem saída — ela tem duas respostas válidas, e um check que só
 * aceita uma delas rejeita a correção.
 *
 * Duas recusas explícitas, ambas já medidas no repo:
 *
 * - **menção em comentário do preflight** — os docstrings citam paths o tempo
 *   todo; aceitar citação como registro é o que deixaria o differential
 *   "desligado" passar com o check dizendo que está ligado;
 * - **menção no corpo de um script** — `echo "veja x.sh"` cita e não executa.
 *   Por isso o casamento é por TOKEN, não por substring.
 */
export function findOwners(harness: string, sources: OwnerSources): string[] {
  const owners: string[] = [];

  PREFLIGHT_FILE_FIELD.lastIndex = 0;
  for (const m of sources.preflightSource.matchAll(PREFLIGHT_FILE_FIELD)) {
    if (m[2] === harness) {
      owners.push('preflight.ts#checks');
      break;
    }
  }

  for (const [script, command] of Object.entries(sources.packageJsonScripts)) {
    if (shellWords(String(command)).includes(harness)) {
      owners.push(`package.json#scripts.${script}`);
    }
  }
  return owners;
}

export interface OrphanResult extends CheckResult {
  /** Os paths órfãos, na ordem em que foram detectados. */
  orphans: string[];
}

export function orphanHarnesses(params: {
  harnesses: string[];
  preflightSource: string;
  packageJsonScripts: Record<string, string>;
}): OrphanResult {
  const orphans = params.harnesses.filter((h) => findOwners(h, { ...params }).length === 0);
  return {
    ok: orphans.length === 0,
    errors: orphans.map(
      (h) =>
        `${h} — HARNESS ÓRFÃO: mede contra o sistema real e não é executado por nada. ` +
        `Registre-o no array "checks" do preflight.ts (campo "file") ou invoque-o ` +
        `por um script de package.json#scripts. Enquanto isso ele é o que a B11 ` +
        `mediu: 2 menções, 0 invocações.`,
    ),
    orphans,
  };
}

// ── (b) todo destino declarado tem guard ligado ──────────────────────────────

/** O path que o preflight carrega para um id de guard. */
function guardPath(guard: string): string {
  return `${GATES_DIR}/${guard}.ts`;
}

export function orphanDestinationRules(params: {
  destinations: DestinationRule[];
  /** Paths declarados no array `checks` do preflight. */
  wiredGuards: string[];
}): { ok: boolean; orphans: string[] } {
  const wired = new Set(params.wiredGuards);
  const orphans = params.destinations
    .filter((d) => !wired.has(guardPath(d.guard)))
    .map((d) => d.guard);
  return { ok: orphans.length === 0, orphans };
}

// ── Camada 1: o repo de verdade ─────────────────────────────────────────────

function readRepoSources(): OwnerSources & { wiredGuards: string[] } {
  let preflightSource = '';
  try {
    preflightSource = readFileSync(join(process.cwd(), PREFLIGHT_FILE), 'utf8');
  } catch {
    // Falha explícita abaixo: um preflight ilegível tornaria todo harness
    // órfão, e "tudo vermelho" é indistinguível de "o instrumento quebrou".
  }

  let scripts: Record<string, string> = {};
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    scripts = pkg.scripts ?? {};
  } catch {
    // idem.
  }

  PREFLIGHT_FILE_FIELD.lastIndex = 0;
  const wiredGuards = [...preflightSource.matchAll(PREFLIGHT_FILE_FIELD)]
    // `m[2]` é `string | undefined` sob `noUncheckedIndexedAccess` porque o
    // grupo é opcional no tipo da regex. Aqui nunca é: o padrão tem um grupo
    // capturado obrigatório, e o filtro abaixo deixa isso explícito em vez de
    // mendigar um `as string[]` que o compilador aceitaria e o leitor não.
    .map((m) => m[2])
    .filter((file): file is string => file !== undefined);
  return { preflightSource, packageJsonScripts: scripts, wiredGuards };
}

function readGateDir(): Record<string, string> {
  const files: Record<string, string> = {};
  try {
    for (const entry of readdirSync(join(process.cwd(), GATES_DIR), { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const rel = `${GATES_DIR}/${entry.name}`;
      try {
        files[rel] = readFileSync(join(process.cwd(), rel), 'utf8');
      } catch {
        // Um arquivo ilegível não pode virar "não é harness" por omissão: um
        // gate que não consegue ler não tem autorização para calar. Ele sai
        // do conjunto, e a contagem de harnesses abaixa sem ninguém ter
        // acrescentado nada — que é a pista, visível no painel.
        continue;
      }
    }
  } catch {
    return {};
  }
  return files;
}

export function checkHarnessOwner(): OrphanResult {
  const { preflightSource, packageJsonScripts, wiredGuards } = readRepoSources();
  if (preflightSource === '') {
    return {
      ok: false,
      errors: [
        `não foi possível ler ${PREFLIGHT_FILE} — sem ele todo harness parece órfão, e um vermelho que significa "instrumento quebrado" é indistinguível de um vermelho que significa dívida.`,
      ],
      orphans: [],
    };
  }

  const orphans: string[] = [];
  const errors: string[] = [];

  const a = orphanHarnesses({
    harnesses: harnessFiles(readGateDir()),
    preflightSource,
    packageJsonScripts,
  });
  orphans.push(...a.orphans);
  errors.push(...a.errors);

  const b = orphanDestinationRules({ destinations: DESTINATIONS, wiredGuards });
  orphans.push(...b.orphans);
  for (const guard of b.orphans) {
    const rule = DESTINATIONS.find((d) => d.guard === guard);
    errors.push(
      `${guardPath(guard)} — guard desligado: o destino "${rule?.destino}" declara ` +
        `fonte canônica em ${rule?.fonteCanonica}, e nenhum check o protege, porque ` +
        `ele não está no array "checks" do preflight.`,
    );
  }

  return { ok: errors.length === 0, errors, orphans };
}

if (process.argv[1]?.endsWith('check-harness-owner.ts')) {
  const r = checkHarnessOwner();
  for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
  process.exit(r.ok ? 0 : 1);
}
