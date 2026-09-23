// tooling/scripts/lint-specialist-routing.ts
// pt-BR: Lint da matriz specialist (`.agents/specs/conventions/specialist-routing.md`).
// Valida frontmatter, LOC (≤300), YAML, globs em path_globs, regex em
// demand_keywords, refs de specialists (WARNING per matriz §6 G1 —
// docker-specialist pendente Task 9) e blocking sem rationale (parity
// review-router v1.3). Exit: 0=ok, 1=errors.

import * as YAML from 'yaml';
import * as path from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

export interface LintOptions {
  agentsDir: string;
  repoRoot?: string;
}

export interface LintResult {
  errors: string[];
  warnings: string[];
  info: string[];
  file?: string;
}

const MAX_LOC = 300;
const REQUIRED_FM = ['name', 'version', 'updated', 'maintainer', 'description'];

// pt-BR: memoiza repo root via `git rev-parse --show-toplevel` (espelha fix Task 4 em lint-review-routing.ts, commit 38d4442).
let cachedRepoRoot: string | null | undefined;
function getRepoRoot(): string | null {
  if (cachedRepoRoot !== undefined) return cachedRepoRoot;
  try {
    cachedRepoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  } catch {
    cachedRepoRoot = null;
  }
  return cachedRepoRoot;
}

function resolveAgentsDir(agentsDir: string, repoRoot?: string): string {
  if (path.isAbsolute(agentsDir)) return agentsDir;
  const root = repoRoot ?? getRepoRoot();
  return root ? path.join(root, agentsDir) : agentsDir;
}

// pt-BR: detecta brackets desbalanceados (sintaxe glob inválida comum).
function isValidGlob(pattern: string): boolean {
  let depth = 0;
  for (const ch of pattern) {
    if (ch === '[') depth++;
    else if (ch === ']' && --depth < 0) return false;
  }
  return depth === 0;
}

// pt-BR: SEM flag `g` para evitar reter `lastIndex` entre execuções.
const YAML_BLOCK_RE = /```yaml\n([\s\S]*?)```/;
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---(?:\n|$)/;

// pt-BR: aceita string/number/Date (YAML parseia `1.0` como number).
function checkFrontmatter(content: string): { ok: true } | { ok: false; error: string } {
  const m = FRONTMATTER_RE.exec(content);
  if (!m) return { ok: false, error: 'frontmatter ausente (bloco --- ausente)' };
  const fm = YAML.parse(m[1]) as Record<string, unknown> | null;
  if (!fm || typeof fm !== 'object') return { ok: false, error: 'frontmatter inválido (YAML)' };
  for (const field of REQUIRED_FM) {
    const v = fm[field];
    if (v === null || v === undefined || String(v).trim() === '') {
      return { ok: false, error: `frontmatter campo obrigatório ausente: ${field}` };
    }
  }
  return { ok: true };
}

function warnSpecialist(w: string[], known: string[], sp: string, ctx: string): void {
  if (known.length > 0 && !known.includes(sp))
    w.push(`specialist não encontrado em agentsDir: ${sp} (${ctx})`);
}

export async function lintMatrix(content: string, opts: LintOptions): Promise<LintResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  if (content.split('\n').length > MAX_LOC) {
    errors.push(`LOC ${content.split('\n').length} exceeds maximum ${MAX_LOC}`);
  }

  const yamlMatch = YAML_BLOCK_RE.exec(content);
  let parsedYaml: Record<string, unknown> = {};
  if (yamlMatch) {
    try {
      parsedYaml = (YAML.parse(yamlMatch[1]) as Record<string, unknown>) ?? {};
    } catch (e) {
      errors.push(`YAML parse error: ${e instanceof Error ? e.message : String(e)}`);
      return { errors, warnings, info };
    }
  } else {
    errors.push('bloco YAML ausente na matriz');
  }

  const fm = checkFrontmatter(content);
  if (!fm.ok) {
    errors.push(fm.error);
    return { errors, warnings, info };
  }
  if (errors.length > 0) return { errors, warnings, info };

  let knownSpecialists: string[] = [];
  try {
    knownSpecialists = readdirSync(resolveAgentsDir(opts.agentsDir, opts.repoRoot))
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace('.md', ''));
  } catch {
    knownSpecialists = [];
  }

  for (const rule of (parsedYaml.path_globs as unknown[] | undefined) ?? []) {
    const r = rule as Record<string, unknown>;
    const pattern = typeof r.pattern === 'string' ? r.pattern : '';
    if (!pattern) {
      errors.push('path_globs: rule sem campo `pattern`');
      continue;
    }
    if (!isValidGlob(pattern)) errors.push(`path_globs: glob inválido: ${pattern}`);
    const specialists = Array.isArray(r.specialists) ? (r.specialists as string[]) : [];
    if (specialists.length === 0) errors.push(`path_globs: rule ${pattern} sem specialists`);
    for (const sp of specialists)
      warnSpecialist(warnings, knownSpecialists, sp, `path_glob: ${pattern}`);
    if (r.blocking === true && (typeof r.rationale !== 'string' || r.rationale.trim() === '')) {
      warnings.push(`path_glob com blocking:true sem rationale (illegível): ${pattern}`);
    }
  }

  for (const rule of (parsedYaml.demand_keywords as unknown[] | undefined) ?? []) {
    const r = rule as Record<string, unknown>;
    const regex = typeof r.regex === 'string' ? r.regex : '';
    if (!regex) {
      errors.push('demand_keywords: rule sem campo `regex`');
      continue;
    }
    try {
      // V8 rejeita `(?i)` inline + flag `i` — strip antes de validar.
      new RegExp(regex.replace(/^\(\?[a-z-]+\)/i, ''));
    } catch (e) {
      errors.push(
        `demand_keywords: regex inválida: ${regex} (${e instanceof Error ? e.message : String(e)})`,
      );
    }
    for (const sp of Array.isArray(r.specialists) ? (r.specialists as string[]) : []) {
      warnSpecialist(warnings, knownSpecialists, sp, `demand_keyword: ${regex}`);
    }
  }

  for (const [scope, raw] of Object.entries(
    (parsedYaml.demand_scopes as Record<string, unknown> | undefined) ?? {},
  )) {
    const added = Array.isArray((raw as Record<string, unknown>).specialists_added)
      ? ((raw as Record<string, unknown>).specialists_added as string[])
      : [];
    for (const sp of added)
      warnSpecialist(warnings, knownSpecialists, sp, `demand_scope: ${scope}`);
  }

  for (const sp of (parsedYaml.always_on as unknown[] | undefined) ?? []) {
    if (typeof sp === 'string') warnSpecialist(warnings, knownSpecialists, sp, 'always_on');
  }

  return { errors, warnings, info };
}

export async function lintMatrixFromFile(
  matrixPath: string,
  opts: LintOptions & { repoRoot: string },
): Promise<LintResult> {
  try {
    return { ...(await lintMatrix(readFileSync(matrixPath, 'utf-8'), opts)), file: matrixPath };
  } catch (e) {
    return {
      errors: [
        `arquivo de matriz não encontrado: ${matrixPath} (${e instanceof Error ? e.message : String(e)})`,
      ],
      warnings: [],
      info: [],
      file: matrixPath,
    };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const matrixFile = args.find((a) => a.startsWith('--matrix='))?.split('=')[1];
  const agentsDir = args.find((a) => a.startsWith('--agents='))?.split('=')[1];
  if (!matrixFile || !agentsDir) {
    console.error('Usage: lint-specialist-routing.ts --matrix=<file> --agents=<dir>');
    process.exit(2);
  }
  lintMatrixFromFile(matrixFile, { agentsDir, repoRoot: process.cwd() }).then((result) => {
    for (const e of result.errors) console.error(`ERROR: ${e}`);
    for (const w of result.warnings) console.warn(`WARN: ${w}`);
    for (const i of result.info) console.log(`INFO: ${i}`);
    process.exit(result.errors.length > 0 ? 1 : 0);
  });
}
