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
 * Camada NORMATIVA: onde uma declaração de fato manda um agente agir.
 *
 * `.agents/runs/` fica de fora, e o motivo está escrito aqui porque a
 * exclusão sem motivo é a armadilha que a 2.3 proíbe: um run record e um
 * backlog item **descrevem** o achado — citam o path de máquina como
 * evidência de que ele existia. Não são uma segunda declaração do destino;
 * são o registro da auditoria que o compte. Incluí-los faz o check acusar o
 * próprio relatório dele (classe 3: guard que dispara em si mesmo), e o
 * remédio — editar ou apagar o registro — seria pior que a disease.
 */
const SCAN_DIRS = ['specs', 'skills', 'workflows', 'agents', 'memory'];

/**
 * As notações que o repo já usou para declarar o destino. Cada uma é uma
 * divergência quando aparece FORA da seção canônica.
 *
 * Uma guarda que cobrisse só `claude/projects` deixaria passar as outras 5 —
 * que foi exatamente o erro do guard de redirect do PR #43 (classe 2: só a
 * forma comum). Por isso a lista é explícita e o spec cobre uma por uma.
 */
const DECLARATION_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
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

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, acc);
    else if (entry.name.endsWith('.md')) acc.push(p);
  }
  return acc;
}

/**
 * Varre todo `.md` sob `.agents` e devolve as declarações do destino que NÃO
 * estão na seção canônica. Lista vazia = concordância.
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

  const files = SCAN_DIRS.flatMap((d) => {
    const p = join(agentsRoot, d);
    return existsSync(p) ? walk(p) : [];
  });

  const out: Divergence[] = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    const isCanon = file === canonPath;
    for (let i = 0; i < lines.length; i++) {
      const n = i + 1;
      if (isCanon && canonRange && n >= canonRange.start && n <= canonRange.end) continue;
      const line = lines[i]!;
      for (const { pattern, reason } of DECLARATION_PATTERNS) {
        if (pattern.test(line)) {
          out.push({
            file: relative(repoRoot, file),
            line: n,
            reason,
            text: line.trim().slice(0, 120),
          });
          break;
        }
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
