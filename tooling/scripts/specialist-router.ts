// tooling/scripts/specialist-router.ts
//
// pt-BR: Classificador headless do specialist-router (review-router
// mirror). Recebe demand+paths+scope, retorna specialists conforme
// matriz `.agents/specs/conventions/specialist-routing.md` (v1.0).
// CLI: `pnpm specialist:route --demand=<file> --paths=<file>
// --matrix=<file> [--scope=<v>] [--output=<file>]`. Exit: 0/2/3/4.

import * as YAML from 'yaml';
import { execSync } from 'node:child_process';
import * as path from 'node:path';

export type PathGlobRule = {
  pattern: string;
  specialists: string[];
  blocking?: boolean;
  domain?: string;
  rationale?: string;
  stacks?: string[];
};
export type DemandKeywordRule = { regex: string; specialists: string[]; rationale?: string };
export type DemandScopeRule = { specialists_added: string[]; rationale?: string };
export type Matrix = {
  path_globs: PathGlobRule[];
  demand_keywords: DemandKeywordRule[];
  demand_scopes: Record<string, DemandScopeRule>;
  skip_rules?: Record<string, { skip_if: string; rationale?: string }>;
  always_on?: string[];
};
export type ClassifyInput = { demand: string; paths: string[]; scope: string };
export type ClassifyResult = {
  specialists: string[];
  evidence: Record<string, string[]>;
  blocking: boolean;
  gap_detected: boolean;
  suggested_specialist?: string;
};

// pt-BR: single-pass glob→regex. `**/` opcional (casa raiz OU subpath),
// `**` cruza `/`, `*` não. review-router.ts:68-77 falha em paths raiz
// (ex: `docker-compose.dev.yml`) pois trata `**` como `.*` puro.
function globToRegex(glob: string): RegExp {
  let r = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (glob.startsWith('**/', i)) {
      r += '(?:.*\\/)?';
      i += 2;
    } else if (glob.startsWith('**', i)) {
      r += '.*';
      i += 1;
    } else if (ch === '*') r += '[^/]*';
    else if (/[.+^${}()|[\]\\]/.test(ch)) r += '\\' + ch;
    else r += ch;
  }
  return new RegExp(`^${r}$`);
}
const parseScopes = (s: string) =>
  s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

// pt-BR: matriz §4 descreve skip_if em texto; codificamos cada condição
// programaticamente para comportamento determinístico.
const SKIP_RULES: Record<string, (i: ClassifyInput) => boolean> = {
  'nestjs-specialist': ({ paths, demand }) =>
    paths.length > 0 &&
    paths.every((p) => p.startsWith('apps/web/')) &&
    !paths.some((p) => p.startsWith('apps/api/')) &&
    !/\b(nestjs|fastify|prisma|controller|module)\b/i.test(demand),
  'nextjs-specialist': ({ paths, demand }) =>
    paths.length > 0 &&
    paths.every((p) => p.startsWith('apps/api/')) &&
    !paths.some((p) => p.startsWith('apps/web/')) &&
    !/\b(nextjs|react|tailwind|rsc)\b/i.test(demand),
  'docker-specialist': ({ paths, demand, scope }) =>
    !parseScopes(scope).includes('infra') &&
    !/\b(docker|container|compose)\b/i.test(demand) &&
    !paths.some((p) => /Dockerfile|docker-compose|\.dockerignore/.test(p)),
  'security-auditor': ({ demand, scope }) =>
    !parseScopes(scope).includes('security') &&
    !/seguran[çc]a|vulnerab|owasp|secrets?|cve|exploit|\b(auth|jwt)\b/i.test(demand),
  refactorer: ({ paths, demand, scope }) =>
    !parseScopes(scope).includes('refactor') &&
    !paths.some(
      (p) =>
        p.startsWith('tooling/scripts/') || p.startsWith('.agents/') || p.includes('/.agents/'),
    ) &&
    !/\b(refactor|simplificar|simplify|dry|limpar|cleanup)\b/i.test(demand),
};
const shouldSkip = (sp: string, i: ClassifyInput) => SKIP_RULES[sp]?.(i) ?? false;

// pt-BR: V8 rejeita `(?i)` inline + flag `i` trailing ("Invalid group");
// stripping centraliza a flag no trailing.
const buildKwRegex = (src: string) => new RegExp(src.replace(/^\(\?[a-z-]+\)/i, ''), 'i');

export function matchPathGlobs(paths: string[], matrix: Matrix) {
  const specialists = new Set<string>();
  let blocking = false;
  for (const rule of matrix.path_globs || [])
    if (paths.some((p) => globToRegex(rule.pattern).test(p))) {
      rule.specialists.forEach((s) => specialists.add(s));
      if (rule.blocking) blocking = true;
    }
  return { specialists, blocking };
}
export function matchDemandKeywords(demand: string, matrix: Matrix): Set<string> {
  const specialists = new Set<string>();
  for (const rule of matrix.demand_keywords || [])
    try {
      if (buildKwRegex(rule.regex).test(demand))
        rule.specialists.forEach((s) => specialists.add(s));
    } catch {}
  return specialists;
}
export function matchDemandScopes(scope: string, matrix: Matrix): string[] {
  const specialists = new Set<string>();
  for (const s of parseScopes(scope))
    matrix.demand_scopes?.[s]?.specialists_added?.forEach((sp) => specialists.add(sp));
  return Array.from(specialists);
}

// pt-BR: gap → primeiro keyword matched → sugere specialist para o
// controller dispatchar agent-architect e criar o ausente.
const inferSuggested = (input: ClassifyInput, matrix: Matrix): string | undefined => {
  for (const rule of matrix.demand_keywords || [])
    try {
      if (buildKwRegex(rule.regex).test(input.demand)) return rule.specialists[0];
    } catch {}
  return undefined;
};

export function classify(input: ClassifyInput, matrix: Matrix): ClassifyResult {
  const evidence: Record<string, string[]> = {
    path_glob: [],
    demand_keyword: [],
    demand_scope: [],
    always_on: [],
  };
  const specialists = new Set<string>();
  let blocking = false;

  const pm = matchPathGlobs(input.paths, matrix);
  pm.specialists.forEach((s) => specialists.add(s));
  if (pm.blocking) blocking = true;
  for (const r of matrix.path_globs || [])
    if (input.paths.some((p) => globToRegex(r.pattern).test(p))) evidence.path_glob.push(r.pattern);

  matchDemandKeywords(input.demand, matrix).forEach((s) => specialists.add(s));
  for (const r of matrix.demand_keywords || [])
    try {
      if (buildKwRegex(r.regex).test(input.demand)) evidence.demand_keyword.push(r.regex);
    } catch {}

  for (const s of parseScopes(input.scope)) {
    const rule = matrix.demand_scopes?.[s];
    if (rule?.specialists_added) {
      rule.specialists_added.forEach((sp) => specialists.add(sp));
      evidence.demand_scope.push(s);
    }
  }

  for (const s of Array.from(specialists)) if (shouldSkip(s, input)) specialists.delete(s);
  for (const sp of matrix.always_on || []) {
    specialists.add(sp);
    evidence.always_on.push(sp);
  }

  const gap = specialists.size === 0;
  return {
    specialists: Array.from(specialists).sort(),
    evidence,
    blocking,
    gap_detected: gap,
    suggested_specialist: gap ? inferSuggested(input, matrix) : undefined,
  };
}

export const YAML_BLOCK_RE = /```yaml\n([\s\S]*?)```/g;
export async function loadMatrix(matrixPath: string): Promise<Matrix> {
  const fs = await import('node:fs');
  const result: Partial<Matrix> = {};
  for (const m of fs.readFileSync(matrixPath, 'utf-8').matchAll(YAML_BLOCK_RE))
    try {
      Object.assign(result, YAML.parse(m[1]) as Partial<Matrix>);
    } catch {}
  return {
    path_globs: result.path_globs || [],
    demand_keywords: result.demand_keywords || [],
    demand_scopes: result.demand_scopes || {},
    skip_rules: result.skip_rules,
    always_on: result.always_on,
  };
}

// pt-BR: detecta a raiz do repo via `git rev-parse --show-toplevel`.
// Necessário porque o wrapper root faz `cd tooling/scripts && pnpm specialist:route`,
// mudando o cwd; default --matrix é resolvido a partir do repo root, não do cwd
// (espelha `tooling/scripts/lint-review-routing.ts:53-69`).
// Memoizado em `cachedRepoRoot` para evitar N execSyncs em chamadas repetidas.
let cachedRepoRoot: string | null | undefined = undefined;
export function getRepoRoot(cwd: string = '.'): string | null {
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

// pt-BR: resolve o caminho da matriz a partir do repo root quando o path
// é relativo. Cobre (a) --matrix omitido (usa default) e (b) --matrix=path
// relativo (ex: `.agents/specs/conventions/...`); paths absolutos passam
// inalterados. Self-correcting: rodar `pnpm specialist:route` de qualquer
// cwd resolve o matrix file no repo root.
export function resolveMatrixPath(matrixArg: string | undefined): string {
  const p = matrixArg ?? '.agents/specs/conventions/specialist-routing.md';
  if (path.isAbsolute(p)) return p;
  const root = getRepoRoot();
  return root ? path.join(root, p) : p;
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const get = (k: string) => args.find((a) => a.startsWith(k + '='))?.split('=')[1];
  const demandFile = get('--demand');
  const pathsFile = get('--paths');
  const matrixFile = resolveMatrixPath(get('--matrix'));
  const outputFile = get('--output');
  const scopeArg = get('--scope');
  if (!demandFile || !pathsFile || !matrixFile) {
    console.error(
      'Usage: specialist-router.ts --demand=<file> --paths=<file> --matrix=<file> [--scope=<v>] [--output=<file>]',
    );
    process.exit(2);
  }
  const fs = await import('node:fs');
  const demand = fs.readFileSync(demandFile, 'utf-8').trim();
  const paths = fs
    .readFileSync(pathsFile, 'utf-8')
    .split('\n')
    .filter((p) => p.trim());
  const result = classify({ demand, paths, scope: scopeArg ?? '' }, await loadMatrix(matrixFile));
  const yaml = YAML.stringify(result);
  if (outputFile) fs.writeFileSync(outputFile, yaml);
  else console.log(yaml);
  // 3 = gap_detected (BLOQUEIA planning, design §5.1 p5);
  // 4 = blocking (path_glob blocking=true, ex: pnpm-workspace).
  process.exit(result.gap_detected ? 3 : result.blocking ? 4 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error('FATAL:', e.message);
    process.exit(1);
  });
}
