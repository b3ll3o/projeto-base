// .tooling/scripts/ci/check-memory-dir-concordance.ts
//
// pt-BR: Check de CONCORDÂNCIA do destino do result file da retrospectiva.
//
// Task 1.3 do plano docs/superpowers/plans/2026-10-03-guard-classes.md.
//
// O problema que este check existe para impedir: o destino da retrospectiva já
// foi declarado 10 vezes, em 7 arquivos, em 6 notações, sem fonte única. Uma
// delas — um `test -f` com path de máquina num fence `bash` — era falsa em toda
// máquina. Declarar o símbolo uma vez não resolve: a divergência volta em
// silêncio na próxima vez que alguém escreve a caminho em vez de linkar.
//
// Este check é a 1ª instância do 3.4(b) generalizado. Ele NÃO verifica o que o
// result file contém — verifica que existe UM lugar que o declara.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { CheckResult } from './check-types.js';

const CANONICAL_FILE = '.agents/specs/conventions/retrospective-capture.md';
const CANONICAL_SECTION = '## Destino canônico do result file';

/**
 * A única exclusão da varredura, e o motivo está escrito aqui porque exclusão
 * sem motivo é a armadilha que a task 2.3 proíbe.
 *
 * `.agents/runs/` é o **registro** da auditoria, não a camada normativa: um run
 * record e um backlog item citam o path de máquina como evidência de que ele
 * existia. Não são uma segunda declaração do destino; são o relato que o
 * compte. Incluí-los faz o check acusar o próprio relatório dele (classe 3:
 * guard que dispara em si mesmo), e o remédio — editar ou apagar o registro —
 * seria pior que a disease.
 *
 * A varredura é sobre `.agents` INTEIRO, menos este diretório. A versão
 * anterior enumerava `['specs','skills','workflows','agents','memory']`, o que
 * deixava `.agents/WORKFLOWS.md` — o índice de workflows, o tipo de arquivo
 * que alguém edita achando que é só uma lista de links — fora do alcance, e
 * fazia qualquer diretório novo nascer cego. Lista fechada de caminhos é a
 * classe 2 com outro nome: cobre a forma que você conhece e só ela.
 */
const SKIP_DIRS = new Set(['runs']);

/**
 * As notações que o repo já usou para declarar o destino. Cada uma é uma
 * divergência quando aparece FORA da seção canônica.
 *
 * Uma guarda que cobrisse só `claude/projects` deixaria passar as outras 5 —
 * que foi exatamente o erro do guard de redirect do PR #43 (classe 2: só a
 * forma comum). Por isso a lista é explícita e o spec cobre uma por uma.
 */
export const DECLARATION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  {
    pattern: /memory-dir/,
    reason: 'usa o símbolo `memory-dir` em vez de referenciar a seção canônica',
  },
  {
    pattern: /claude\/projects/,
    reason: 'escreve o caminho `.claude/projects` em vez de referenciar a seção canônica',
  },
  {
    pattern: /memory\/b<N/,
    reason: 'escreve o caminho `memory/b<N>` em vez de referenciar a seção canônica',
  },
  { pattern: /\/home\/[a-z]/, reason: 'contém path absoluto de máquina (`/home/...`)' },
];

/**
 * `MEMORY_DIR` é caso aparte, e a distinção é executável-vs-especificação.
 *
 * Num fence `bash` o símbolo é uma variável de shell que DERIVA da fonte
 * única — uso legítimo, e é o consumidor que a task 1.1 criou. Em qualquer
 * outro lugar (prosa, ou fence `yaml`/`text`/`json`) ele é uma
 * re-declaração: ninguém sabe mais o valor, e o símbolo envelhece sem nunca
 * ter sido tied a um diretório real.
 *
 * A notação escapou do guard por essa razão: `retrospective-mode.md` trocou
 * `memory/b<N>-result.md` (pego pelo padrão de path) por `<MEMORY_DIR>/...`
 * dentro de um handoff **yaml** (não pego por nenhum), trocando uma divergência
 * detectada por uma invisível. Por isso "dentro de fence" não basta: um fence
 * `yaml` é especificação, e especificação envelhece tanto quanto prosa.
 *
 * Um padrão bruto para `MEMORY_DIR` acusaria o fence bash legítimo — seria a
 * classe 2 pelo outro lado, um guard que corta a forma comum. Daí a distinção
 * ser estrutural (linguagem do fence) e não por allowlist de arquivo, que
 * envelheceria junto com o bug.
 */
const MEMORY_DIR_IN_PROSE = /\bMEMORY_DIR\b/;
const FENCE_OPEN_RE = /^\s*(?:```|~~~)\s*([A-Za-z0-9_+-]*)/;
const EXECUTABLE_FENCE_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'shellsession']);

/** O nome deste arquivo — que contém o token `memory-dir` que ele procura. */
const SELF_NAME = 'check-memory-dir-concordance';

/** Exportado para o `check-self-firing-guard` (task 3.3), que mede o
 *  diferencial desta isenção. Ver aquele arquivo para por que o diferential
 *  — e não o código daqui — é a propriedade que tem dentes. */
export const SELF_EXEMPTION = { name: SELF_NAME, strip: stripSelfName };

/**
 * Remove as menções ao PRÓPRIO NOME do check antes de casar os padrões.
 *
 * O nome do arquivo contém `memory-dir`, e documentar o guard é trabalho
 * obrigatório de quem escreve convenção — a `guard-classes` cita este check
 * pelo nome. Sem isto, citar o guard dispara nele.
 *
 * A alternativa era reescrever a convenção para não citar o check pelo nome, e
 * isso é pior: **um guard que não pode ser nomeado sem disparar empurra quem
 * escreve a contornar o nome**, e um guard contornado é um guard desligado com
 * outra forma. O custo da isenção é baixo porque ela é exata — o nome inteiro
 * sai, o resto da linha continua sendo testado normalmente.
 *
 * Isto **não** é a cegueira de "hit legítimo" que a §3 de `guard-classes`
 * declara: ali a separação entre hit legítimo e hit indevido exige julgamento
 * humano; aqui é mecânica — ou a ocorrência é o nome do check, ou não é.
 */
function stripSelfName(line: string): string {
  return line.replaceAll(SELF_NAME, '');
}

export interface Divergence {
  file: string;
  line: number;
  reason: string;
  text: string;
}

/**
 * Linhas (1-indexed, inclusivo) do bloco da seção canônica dentro do arquivo
 * canônico. A definição é o único lugar permitido declarar o caminho — o resto
 * do arquivo, inclusive, é território de divergência.
 */
export function canonicalLineRange(content: string): { start: number; end: number } | null {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.trim() === CANONICAL_SECTION);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i]!.startsWith('## ')) {
      end = i;
      break;
    }
  }
  return { start: start + 1, end };
}

/**
 * Todos os `.md` sob um diretório, pulando `SKIP_DIRS`.
 *
 * O nome do diretório pulado é testado contra o NOME, não contra o caminho
 * inteiro: `SKIP_DIRS` guarda nomes, e assim qualquer `.agents` aninhado —
 * até um que nem existe ainda — herda a mesma política sem mais código.
 */
function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), acc);
    } else if (entry.name.endsWith('.md')) {
      acc.push(join(dir, entry.name));
    }
  }
  return acc;
}

/**
 * As LINHAS que este guard varre, com o arquivo e o número de cada uma.
 *
 * Exportado para o `check-self-firing-guard` (task 3.3) medir o diferencial
 * da isenção do próprio nome. Existe como função, e não como reimplementação
 * lá dentro, para que a política de exclusão (`SKIP_DIRS`, escopo `.agents`)
 * tenha UMA definição: um detector que varre um conjunto diferente do guard
 * mede um Corpus que não é o Corpus, e o verde dele não descreve nada.
 */
export function sweptCorpus(repoRoot: string): Array<{ file: string; line: number; text: string }> {
  const root = resolve(repoRoot);
  const agentsRoot = join(root, '.agents');
  if (!existsSync(agentsRoot)) return [];

  const canonPath = join(root, CANONICAL_FILE);
  const canonRange = existsSync(canonPath)
    ? canonicalLineRange(readFileSync(canonPath, 'utf8'))
    : null;

  const out: Array<{ file: string; line: number; text: string }> = [];
  for (const file of walk(agentsRoot)) {
    const isCanon = file === canonPath;
    const lines = readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const n = i + 1;
      // A seção canônica é a única lugar onde declarar é permitido — logo
      // ela NÃO faz parte do que o guard varre. Sem esta linha, o corpus
      // daqui é MAIOR que o do guard, e o `check-self-firing-guard` acusa
      // linhas que o guard jamais acusaria. Foi o que aconteceu na primeira
      // execução: `retrospective-capture.md:90` casou `claude/projects`
      // sendo que está dentro da seção canônica.
      if (isCanon && canonRange && n >= canonRange.start && n <= canonRange.end) continue;
      out.push({ file: relative(root, file), line: n, text: lines[i]! });
    }
  }
  return out;
}

/**
 * Varre todo `.md` sob `.agents` (menos `runs/`) e devolve as declarações do
 * destino que NÃO estão na seção canônica. Lista vazia = concordância.
 */
export function findDivergentDeclarations(repoRoot: string): Divergence[] {
  // `repoRoot` pode chegar como '.' (o preflight passa assim). Sem resolver,
  // o slug esperado viraria '-' e o check acusaria a derivação correta.
  repoRoot = resolve(repoRoot);
  const agentsRoot = join(repoRoot, '.agents');
  if (!existsSync(agentsRoot)) return [];

  const canonPath = join(repoRoot, CANONICAL_FILE);
  const canonRange = existsSync(canonPath)
    ? canonicalLineRange(readFileSync(canonPath, 'utf8'))
    : null;

  const out: Divergence[] = [];
  for (const file of walk(agentsRoot)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    const isCanon = file === canonPath;
    // `false` = fora de fence (prosa); `true` = dentro de fence EXECUTÁVEL
    // (bash/sh/...), onde o símbolo é uma variável que deriva. Um fence yaml/
    // text/json é especificação e conta como prosa.
    let inExecFence = false;
    for (let i = 0; i < lines.length; i++) {
      const n = i + 1;
      if (isCanon && canonRange && n >= canonRange.start && n <= canonRange.end) continue;
      const line = lines[i]!;
      // O trecho canônico inteiro é ignorado, fences inclusive, então o
      // balanceamento de fences não é afetado por pulá-lo.
      const open = FENCE_OPEN_RE.exec(line);
      if (open) {
        // Abertura tem linguagem; fechamento é um fence vazio.
        const lang = (open[1] ?? '').toLowerCase();
        inExecFence = lang !== '' ? EXECUTABLE_FENCE_LANGS.has(lang) : false;
        continue;
      }
      for (const { pattern, reason } of DECLARATION_PATTERNS) {
        if (pattern.test(stripSelfName(line))) {
          out.push({
            file: relative(repoRoot, file),
            line: n,
            reason,
            text: line.trim().slice(0, 120),
          });
          break;
        }
      }
      if (!inExecFence && MEMORY_DIR_IN_PROSE.test(stripSelfName(line))) {
        out.push({
          file: relative(repoRoot, file),
          line: n,
          reason:
            'usa o símbolo `MEMORY_DIR` em prosa/especificação em vez de referenciar a seção canônica',
          text: line.trim().slice(0, 120),
        });
      }
    }
  }
  return out;
}

/**
 * Executa a derivação canônica DE UM SUBDIRECTÓRIO e confere que o slug
 * describe o repositório, não o diretório corrente.
 *
 * Rodar da raiz não provaria nada: `pwd` e `git rev-parse --show-toplevel`
 * coincidem lá. A divergência só aparece de um subdir — que é onde um agente
 * lendo a skill costuma estar.
 */
function verifyDerivation(repoRoot: string): string | null {
  const canonPath = join(repoRoot, CANONICAL_FILE);
  const content = readFileSync(canonPath, 'utf8');
  const line = content.split('\n').find((l) => l.startsWith('MEMORY_DIR='));
  if (!line) return 'a seção canônica não declara `MEMORY_DIR=`';

  const expectedSlug = `-${repoRoot.replace(/^\//, '').replace(/\//g, '-')}`;
  const subdir = join(repoRoot, '.tooling');
  if (!existsSync(subdir)) return `não há subdiretório de teste (${subdir})`;

  try {
    // A linha só ATRIBUI a variável; sem imprimir, stdout sai vazio e o
    // check acusaria divergência numa derivação que funciona.
    const out = execFileSync('bash', ['-c', `${line}; printf %s "$MEMORY_DIR"`], {
      cwd: subdir,
      encoding: 'utf8',
      env: { ...process.env, HOME: process.env.HOME ?? '' },
    }).trim();
    if (!out.endsWith(`/${expectedSlug}/memory`)) {
      return `a derivação canônica produziu "${out}", que não termina em /${expectedSlug}/memory — rodada de um subdiretório, ela descreveu o cwd e não o repo`;
    }
  } catch (err) {
    return `a derivação canônica não executou de um subdiretório: ${(err as Error).message.split('\n')[0]}`;
  }
  return null;
}

export function checkMemoryDirConcordance(opts: { repoRoot: string }): CheckResult {
  const repoRoot = resolve(opts.repoRoot);
  const canonPath = join(repoRoot, CANONICAL_FILE);
  if (!existsSync(canonPath)) {
    // Sem a fonte única não há o que comparar. Isso é `skipped`, nunca `✓`:
    // reportar sucesso aqui seria a classe 1 que este check existe para caçar.
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `fonte única ausente (${CANONICAL_FILE})`,
    };
  }
  if (canonicalLineRange(readFileSync(canonPath, 'utf8')) === null) {
    return {
      ok: false,
      errors: [`fonte única sem a seção "${CANONICAL_SECTION}" em ${CANONICAL_FILE}`],
    };
  }

  const errors: string[] = [];

  const derivationError = verifyDerivation(repoRoot);
  if (derivationError) errors.push(derivationError);

  const divergences = findDivergentDeclarations(repoRoot);
  for (const d of divergences) {
    errors.push(`${d.file}:${d.line} — ${d.reason}\n    ${d.text}`);
  }
  if (divergences.length > 0) {
    errors.push(
      `fonte única: ${CANONICAL_FILE} §"${CANONICAL_SECTION}". As ${divergences.length} declaração(ões) acima devem referenciar essa seção, não repeti-la.`,
    );
  }

  return { ok: errors.length === 0, errors };
}
