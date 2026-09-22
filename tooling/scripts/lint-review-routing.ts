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

import { loadMatrix } from './review-router.js';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

export interface LintResult {
  errors: string[];
  warnings: string[];
  info: string[];
}

const MAX_LOC = 300;

export function lintMatrix(markdown: string, knownReviewers?: string[]): LintResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  // LOC check
  const lineCount = markdown.split('\n').length;
  if (lineCount > MAX_LOC) {
    errors.push(`LOC ${lineCount} exceeds maximum ${MAX_LOC}`);
  }

  // Parse matrix (loadMatrix já trata YAML inválido com skip)
  let matrix;
  try {
    matrix = loadMatrix(markdown);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(`YAML parse error: ${msg}`);
    return { errors, warnings, info };
  }

  const seenPatterns = new Set<string>();

  // Check path_globs
  for (const rule of matrix.path_globs ?? []) {
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
  }

  // Check commit_types reviewers
  for (const [type, rule] of Object.entries(matrix.commit_types ?? {})) {
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
  for (const rule of matrix.diff_patterns ?? []) {
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
  for (const rule of matrix.diff_patterns ?? []) {
    try {
      new RegExp(rule.regex);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`invalid regex in diff_patterns: ${rule.regex} (${msg})`);
    }
  }

  // Se há blocos YAML mas nenhum deles parseou, reporta erro
  const yamlBlocks = markdown.match(/```yaml\n[\s\S]*?```/g);
  if (yamlBlocks && yamlBlocks.length > 0 && Object.keys(matrix).length === 0) {
    errors.push('YAML blocks present but matrix is empty (all blocks invalid)');
  }

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
