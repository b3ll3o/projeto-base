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
  rules?: { path_globs: PathGlobRule[] },
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

  return {
    domains: [],
    reviewers: Array.from(reviewers),
    evidence,
  };
}

// CLI entrypoint (placeholder — implementação completa em Task 1.7)
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('CLI not yet implemented');
}
