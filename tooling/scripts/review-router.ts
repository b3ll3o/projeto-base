// tooling/scripts/review-router.ts
//
// pt-BR: Classificador headless do review-router. Recebe paths +
// commits + diff, retorna reviewers despachados baseado na matriz
// de roteamento. Implementação completa virá em Tasks 1.3-1.7.

export interface ClassifyInput {
  paths: string[];
  commits: string[];
  diff: string;
}

export interface ClassifyResult {
  domains: string[];
  reviewers: string[];
  evidence: EvidenceItem[];
}

export interface EvidenceItem {
  signal: 'path_glob' | 'commit_type' | 'diff_pattern';
  pattern: string;
  reviewers_added: string[];
}

export interface PathGlobRule {
  pattern: string;
  reviewers: string[];
  stacks?: string[];
  rationale?: string;
  blocking_if_diff_matches?: string[];
}

export interface PathMatch {
  pattern: string;
  reviewers: string[];
  files_matched: string[];
}

// Converte glob pattern para regex
// pt-BR: usa placeholders para não confundir * com regex special chars;
// primeiro transforma ** -> GLOBSTAR_DBL e * -> GLOBSTAR_SGL, depois
// escapa chars especiais de regex (sem tocar nos placeholders), e
// por fim converte placeholders para quantifiers.
function globToRegex(glob: string): RegExp {
  const P_DBL = '\x00GLOBSTAR_DBL\x00';
  const P_SGL = '\x00GLOBSTAR_SGL\x00';
  const transformed = glob.replace(/\*\*/g, P_DBL).replace(/\*/g, P_SGL);
  const escaped = transformed.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const final = escaped
    .replace(new RegExp(P_DBL, 'g'), '.*')
    .replace(new RegExp(P_SGL, 'g'), '[^/]*');
  return new RegExp(`^${final}$`);
}

export function matchPathGlobs(paths: string[], rules: PathGlobRule[]): PathMatch[] {
  const matches: PathMatch[] = [];
  for (const rule of rules) {
    const regex = globToRegex(rule.pattern);
    const filesMatched = paths.filter((p) => regex.test(p));
    if (filesMatched.length > 0) {
      matches.push({
        pattern: rule.pattern,
        reviewers: rule.reviewers,
        files_matched: filesMatched,
      });
    }
  }
  return matches;
}

export function classify(
  input: ClassifyInput,
  rules?: {
    path_globs: PathGlobRule[];
    commit_types?: Record<string, CommitTypeRule>;
    diff_patterns?: DiffPatternRule[];
  },
): ClassifyResult {
  const evidence: EvidenceItem[] = [];
  const reviewers = new Set<string>();

  if (rules?.path_globs) {
    const pathMatches = matchPathGlobs(input.paths, rules.path_globs);
    for (const m of pathMatches) {
      m.reviewers.forEach((r) => reviewers.add(r));
      evidence.push({
        signal: 'path_glob',
        pattern: m.pattern,
        reviewers_added: m.reviewers,
      });
    }
  }

  if (rules?.commit_types) {
    const ctReviewers = matchCommitTypes(input.commits, rules.commit_types);
    ctReviewers.forEach((r) => reviewers.add(r));
    if (ctReviewers.length > 0) {
      const types = input.commits.map((c) => parseCommitType(c).type);
      evidence.push({
        signal: 'commit_type',
        pattern: types.join(','),
        reviewers_added: ctReviewers,
      });
    }
  }

  if (rules?.diff_patterns) {
    const dpResult = matchDiffPatterns(input.diff, rules.diff_patterns);
    dpResult.reviewers.forEach((r) => reviewers.add(r));
    evidence.push(...dpResult.evidence);
  }

  return {
    domains: [],
    reviewers: Array.from(reviewers),
    evidence,
  };
}

export interface ParsedCommit {
  type: string;
  scope?: string;
  breaking: boolean;
  subject: string;
}

const COMMIT_TYPES = [
  'feat',
  'fix',
  'refactor',
  'perf',
  'docs',
  'chore',
  'ci',
  'test',
  'build',
  'style',
];

export function parseCommitType(message: string): ParsedCommit {
  const match = message.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
  if (match) {
    const [, type, scope, bang, subject] = match;
    const validType = COMMIT_TYPES.includes(type) ? type : 'chore';
    return { type: validType, scope, breaking: !!bang, subject };
  }
  return { type: 'chore', scope: undefined, breaking: false, subject: message };
}

export interface CommitTypeRule {
  reviewers_added?: string[];
  may_skip?: string[];
  conditional?: Array<{ if_path_matches: string; reviewers_added: string[] }>;
  rationale?: string;
}

export function matchCommitTypes(
  commits: string[],
  rules: Record<string, CommitTypeRule>,
): string[] {
  const reviewers = new Set<string>();
  for (const msg of commits) {
    const parsed = parseCommitType(msg);
    const rule = rules[parsed.type];
    if (rule?.reviewers_added) {
      rule.reviewers_added.forEach((r) => reviewers.add(r));
    }
  }
  return Array.from(reviewers);
}

export interface DiffPatternRule {
  regex: string;
  reviewers_added: string[];
  blocking?: boolean;
  rationale?: string;
}

export interface DiffMatchResult {
  reviewers: string[];
  blocking: boolean;
  truncated: boolean;
  evidence: EvidenceItem[];
}

const DIFF_CAP_BYTES = 50_000;

export function matchDiffPatterns(diff: string, rules: DiffPatternRule[]): DiffMatchResult {
  const reviewers = new Set<string>();
  let blocking = false;
  let truncated = false;
  let effectiveDiff = diff;

  if (diff.length > DIFF_CAP_BYTES) {
    effectiveDiff = diff.slice(0, DIFF_CAP_BYTES);
    truncated = true;
  }

  const evidence: EvidenceItem[] = [];

  for (const rule of rules) {
    let regex: RegExp;
    try {
      regex = new RegExp(rule.regex, 'gm');
    } catch {
      continue; // skip invalid regex
    }
    if (regex.test(effectiveDiff)) {
      rule.reviewers_added.forEach((r) => reviewers.add(r));
      if (rule.blocking) blocking = true;
      evidence.push({
        signal: 'diff_pattern',
        pattern: rule.regex,
        reviewers_added: rule.reviewers_added,
      });
    }
  }

  return { reviewers: Array.from(reviewers), blocking, truncated, evidence };
}

// CLI entrypoint (placeholder — implementação completa em Task 1.7)
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('CLI not yet implemented');
}
