// tooling/scripts/lint-review-routing.ts
//
// pt-BR: Lint da matriz de roteamento definida em
// `.agents/specs/conventions/review-routing.md`. Valida:
// - LOC da convenção (≤ 300 linhas, regra de tamanho/revisão)
// - YAML válido em todos os blocos
// - Duplicate pattern em path_globs
// - Reviewer refs existem em `.agents/agents/*.md` (warning)
// - Regex válida em diff_patterns
// - Bloco YAML presente mas matriz vazia (todos os blocos falharam parse)
//
// Falha com exit 1 se qualquer erro. Warnings não bloqueiam.
//
// v1.3 (PR #21): lint WARNING quando path_globs tem `blocking: true`
// mas o pattern casa apenas paths ilegíveis (inexistentes no repo OU
// todos em .gitignore). Pattern morto é dead rule que nunca dispararia
// — visibility sem breaking change (warnings não bloqueiam exit).

import {
  loadMatrixComDiagnostico,
  nomeDoTipoYaml,
  YAML_BLOCK_RE,
  type CommitTypeRule,
  type DiffPatternRule,
  type PathGlobRule,
} from './review-router.js';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

export interface LintResult {
  errors: string[];
  warnings: string[];
  info: string[];
}

const MAX_LOC = 300;

// pt-BR: replica local de `review-router.ts:68-77` (`globToRegex` é PRIVADA
// no módulo, não exportada — cópia intencional para evitar expandir API
// pública do classificador com uma helper de regex). Ambos arquivos vivem no
// mesmo package `@repo/review-router-tooling`, então não há isolation por
// package a manter; a razão da duplicação é puramente o escopo de export.
function globToRegexLocal(glob: string): RegExp {
  const P_DBL = '\x00GLOBSTAR_DBL\x00';
  const P_SGL = '\x00GLOBSTAR_SGL\x00';
  const transformed = glob.replace(/\*\*/g, P_DBL).replace(/\*/g, P_SGL);
  const escaped = transformed.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const final = escaped
    .replace(new RegExp(P_DBL, 'g'), '.*')
    .replace(new RegExp(P_SGL, 'g'), '[^/]*');
  return new RegExp(`^${final}$`);
}

// pt-BR: detecta a raiz do repo via `git rev-parse --show-toplevel`.
// Necessário porque o lint pode rodar de qualquer cwd (ex: tooling/scripts)
// e `git ls-files` retorna paths relativos ao cwd, não ao repo root.
// Memoizado em `cachedRepoRoot` para evitar N execSyncs de `git rev-parse`
// quando `isPathGitignored()` é invocado em loop sobre matched files.
let cachedRepoRoot: string | null | undefined = undefined;
function getRepoRoot(cwd: string = '.'): string | null {
  if (cwd === '.' && cachedRepoRoot !== undefined) {
    return cachedRepoRoot;
  }
  try {
    const stdout = execSync('git rev-parse --show-toplevel', {
      cwd,
      encoding: 'utf-8',
    });
    const result = stdout.trim();
    if (cwd === '.') cachedRepoRoot = result;
    return result;
  } catch {
    if (cwd === '.') cachedRepoRoot = null;
    return null;
  }
}

// pt-BR: lista os tracked files do repo e filtra pelos que casam o glob.
// Usa `git ls-files` (não `glob()`) para ser determinístico e respeitar
// .gitignore nativo — patterns gitignored nem aparecem na saída.
// SEMPRE roda do repo root para retornar paths repo-relative (assivos o
// regex contra `rule.pattern` — também repo-relative — bate corretamente).
function getTrackedFiles(): string[] {
  const root = getRepoRoot();
  if (!root) return [];
  try {
    const stdout = execSync('git ls-files', { cwd: root, encoding: 'utf-8' });
    return stdout.split('\n').filter((f) => f.trim());
  } catch {
    return [];
  }
}

// pt-BR: `git check-ignore` retorna exit 0 se path é gitignored, exit 1 se não.
// Roda do repo root (cached) porque `filePath` é repo-relative.
function isPathGitignored(filePath: string): boolean {
  const root = getRepoRoot();
  if (!root) return false;
  try {
    execSync(`git check-ignore ${JSON.stringify(filePath)}`, {
      cwd: root,
      stdio: 'pipe',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Devolve a chave como lista, ou devolve lista vazia **e um erro** se ela veio
 * como outra coisa.
 *
 * MEDIDO 2026-10-08: `for (const rule of matrix.path_globs ?? [])` com
 * `path_globs` escrito como mapa (sem o `-`) não itera — `for...of` sobre objeto
 * lança `TypeError`, que sai de `lintMatrix` como exceção crua em vez de
 * diagnóstico. E `?? []` não protege: ele só cobre ausência, não o tipo errado.
 */
function exigirLista<T>(valor: unknown, chave: string, errors: string[]): T[] {
  if (valor === undefined || valor === null) return [];
  if (Array.isArray(valor)) return valor as T[];
  errors.push(
    `\`${chave}\` precisa ser uma lista no arquivo; o YAML devolveu ${nomeDoTipoYaml(valor)} — nenhuma regra dela foi verificada`,
  );
  return [];
}

/** Mesma ideia de `exigirLista`, para a chave que é mapa por contrato. */
function exigirMapa<T>(valor: unknown, chave: string, errors: string[]): Record<string, T> {
  if (valor === undefined || valor === null) return {};
  if (typeof valor === 'object' && !Array.isArray(valor)) return valor as Record<string, T>;
  errors.push(
    `\`${chave}\` precisa ser um mapa no arquivo; o YAML devolveu ${nomeDoTipoYaml(valor)} — nenhuma regra dele foi verificada`,
  );
  return {};
}

export function lintMatrix(markdown: string, knownReviewers?: string[]): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  // LOC check
  const lineCount = markdown.split('\n').length;
  if (lineCount > MAX_LOC) {
    errors.push(`LOC ${lineCount} exceeds maximum ${MAX_LOC}`);
  }

  // Parse matrix, com o diagnóstico do que ficou de fora. MEDIDO 2026-10-08: o
  // `try/catch` que existia aqui era inalcançável — `loadMatrix` engole o erro de
  // YAML bloco a bloco e, para todo `string`, não lança. Um guard que não pode
  // disparar é documentação de uma intenção, não verificação.
  const { matrix, invalidos, naoMapas } = loadMatrixComDiagnostico(markdown);
  for (const { bloco, motivo } of invalidos) {
    errors.push(`bloco yaml #${bloco} inválido: ${motivo} — as regras dele NÃO entraram na matriz`);
  }
  for (const { bloco, tipo } of naoMapas) {
    errors.push(
      `bloco yaml #${bloco} não é um mapa (o YAML devolveu ${tipo}) — nenhuma regra dele foi verificada`,
    );
  }

  const seenPatterns = new Set<string>();

  // pt-BR: cache de tracked files (lazy) para evitar N execuções de
  // `git ls-files` quando múltiplos path_globs têm `blocking: true`.
  // Matrix atual tem 2 rules blocking → 2 execSyncs → após hoist: 1.
  let trackedFiles: string[] | null = null;

  // Check path_globs
  for (const rule of exigirLista<PathGlobRule>(matrix.path_globs, 'path_globs', errors)) {
    if (seenPatterns.has(rule.pattern)) {
      errors.push(`duplicate pattern: ${rule.pattern}`);
    }
    seenPatterns.add(rule.pattern);

    if (knownReviewers) {
      for (const reviewer of rule.reviewers) {
        if (!knownReviewers.includes(reviewer)) {
          warnings.push(`reviewer not found in .agents/agents/: ${reviewer}`);
        }
      }
    }

    // v1.3 (PR #21): warn quando `blocking: true` casa apenas files
    // ilegíveis — pattern morto (dead rule) que nunca dispararia.
    // Cache de tracked files compartilhado entre todas as rules blocking
    // do loop (lazy init na primeira vez que precisamos).
    if (rule.blocking === true) {
      if (trackedFiles === null) {
        trackedFiles = getTrackedFiles();
      }
      const regex = globToRegexLocal(rule.pattern);
      const matchedFiles = trackedFiles.filter((f) => regex.test(f));
      if (matchedFiles.length === 0) {
        warnings.push(
          `path_glob with blocking: true matches no files in repo: ${rule.pattern} (ilegível — dead pattern)`,
        );
      } else if (matchedFiles.every((f) => isPathGitignored(f))) {
        warnings.push(
          `path_glob with blocking: true matches only .gitignored files: ${rule.pattern} (ilegível — blocking nunca dispararia)`,
        );
      }
    }
  }

  // Check commit_types reviewers
  for (const [type, rule] of Object.entries(
    exigirMapa<CommitTypeRule>(matrix.commit_types, 'commit_types', errors),
  )) {
    if (knownReviewers) {
      for (const reviewer of rule.reviewers_added ?? []) {
        if (!knownReviewers.includes(reviewer)) {
          warnings.push(
            `reviewer not found in .agents/agents/: ${reviewer} (commit_type: ${type})`,
          );
        }
      }
    }
  }

  // Check diff_patterns reviewers (assimetria com commit_types — antes só validava
  // regex, não refs de reviewer)
  for (const rule of exigirLista<DiffPatternRule>(matrix.diff_patterns, 'diff_patterns', errors)) {
    if (knownReviewers) {
      for (const reviewer of rule.reviewers_added) {
        if (!knownReviewers.includes(reviewer)) {
          warnings.push(
            `reviewer not found in .agents/agents/: ${reviewer} (diff_pattern: ${rule.regex})`,
          );
        }
      }
    }
  }

  // Check diff_patterns regex validity
  for (const rule of exigirLista<DiffPatternRule>(matrix.diff_patterns, 'diff_patterns', errors)) {
    try {
      new RegExp(rule.regex);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`invalid regex in diff_patterns: ${rule.regex} (${msg})`);
    }
  }

  // Rede final: há bloco(s) ```yaml no documento e nenhum deles produziu regra.
  // Os dois laços acima já cobrem bloco inválido e bloco não-mapa; o que sobra
  // para cá é o mapa vazio (`{}`), que passa pelos dois e não entra na matriz.
  if (Object.keys(matrix).length === 0 && YAML_BLOCK_RE.test(markdown)) {
    errors.push('há bloco(s) ```yaml no documento e nenhum virou regra — a matriz saiu vazia');
  }
  YAML_BLOCK_RE.lastIndex = 0; // `/g`: `test` deixa o cursor colado para o próximo uso

  return { errors, warnings, info };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const matrixFile = args.find((a) => a.startsWith('--matrix='))?.split('=')[1];
  const agentsDir = args.find((a) => a.startsWith('--agents='))?.split('=')[1] ?? '.agents/agents/';

  if (!matrixFile) {
    console.error('Usage: lint-review-routing.ts --matrix=<file> [--agents=<dir>]');
    process.exit(2);
  }

  const content = readFileSync(matrixFile, 'utf-8');
  const knownReviewers = existsSync(agentsDir)
    ? readdirSync(agentsDir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.replace('.md', ''))
    : undefined;

  const result = lintMatrix(content, knownReviewers);

  for (const e of result.errors) console.error(`ERROR: ${e}`);
  for (const w of result.warnings) console.warn(`WARN: ${w}`);
  for (const i of result.info) console.log(`INFO: ${i}`);

  process.exit(result.errors.length > 0 ? 1 : 0);
}
