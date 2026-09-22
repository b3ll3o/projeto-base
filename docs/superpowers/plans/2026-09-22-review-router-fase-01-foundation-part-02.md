### Task 1.3: Implementar path glob matcher (TDD)

**Files:**
- Modify: `tooling/scripts/review-router.ts`
- Modify: `tooling/scripts/review-router.spec.ts`

- [ ] **Step 1: Adicionar testes para path glob matcher**

```typescript
// Adicionar em review-router.spec.ts
describe('matchPathGlobs()', () => {
  it('matches apps/api/**/domain/** to nestjs-specialist', () => {
    const rules: PathGlobRule[] = [
      { pattern: 'apps/api/**/domain/**', reviewers: ['nestjs-specialist', 'stack-code-reviewer'] }
    ];
    const result = matchPathGlobs(['apps/api/src/users/domain/user.aggregate.ts'], rules);
    expect(result).toHaveLength(1);
    expect(result[0].reviewers).toContain('nestjs-specialist');
  });

  it('returns empty when no match', () => {
    const rules: PathGlobRule[] = [
      { pattern: 'apps/api/**/domain/**', reviewers: ['nestjs-specialist'] }
    ];
    const result = matchPathGlobs(['apps/web/app/page.tsx'], rules);
    expect(result).toEqual([]);
  });

  it('matches multiple patterns to same file', () => {
    const rules: PathGlobRule[] = [
      { pattern: 'apps/api/**/*.ts', reviewers: ['nestjs-specialist'] },
      { pattern: '**/*.controller.ts', reviewers: ['nestjs-specialist', 'stack-code-reviewer'] }
    ];
    const result = matchPathGlobs(['apps/api/src/users.controller.ts'], rules);
    const allReviewers = result.flatMap(m => m.reviewers);
    expect(new Set(allReviewers)).toEqual(new Set(['nestjs-specialist', 'stack-code-reviewer']));
  });
});
```

- [ ] **Step 2: Rodar testes (esperar FAIL)**

```bash
cd tooling/scripts && pnpm test -- review-router.spec.ts
```

Expected: FAIL — `matchPathGlobs` not exported.

- [ ] **Step 3: Implementar matchPathGlobs**

```typescript
// Adicionar em review-router.ts
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
function globToRegex(glob: string): RegExp {
  // Escapar caracteres especiais do regex
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    // ** → .* (qualquer path, incluindo /)
    .replace(/\\\*\\\*/g, '.*')
    // * → [^/]* (apenas dentro de um segmento)
    .replace(/\\\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}

export function matchPathGlobs(paths: string[], rules: PathGlobRule[]): PathMatch[] {
  const matches: PathMatch[] = [];
  for (const rule of rules) {
    const regex = globToRegex(rule.pattern);
    const filesMatched = paths.filter(p => regex.test(p));
    if (filesMatched.length > 0) {
      matches.push({
        pattern: rule.pattern,
        reviewers: rule.reviewers,
        files_matched: filesMatched
      });
    }
  }
  return matches;
}
```

- [ ] **Step 4: Atualizar `classify()` para usar matchPathGlobs**

```typescript
// Substituir classify() em review-router.ts
export function classify(input: ClassifyInput, rules?: { path_globs: PathGlobRule[] }): ClassifyResult {
  const evidence: EvidenceItem[] = [];
  const reviewers = new Set<string>();

  // 1. Path globs
  if (rules?.path_globs) {
    const pathMatches = matchPathGlobs(input.paths, rules.path_globs);
    for (const m of pathMatches) {
      m.reviewers.forEach(r => reviewers.add(r));
      evidence.push({
        signal: 'path_glob',
        pattern: m.pattern,
        reviewers_added: m.reviewers
      });
    }
  }

  return {
    domains: [],
    reviewers: Array.from(reviewers),
    evidence
  };
}
```

- [ ] **Step 5: Rodar testes (esperar PASS)**

```bash
cd tooling/scripts && pnpm test -- review-router.spec.ts
```

Expected: PASS — 5 testes verde.

- [ ] **Step 6: Commit**

```bash
git add tooling/scripts/review-router.ts tooling/scripts/review-router.spec.ts
git commit -m "feat(tooling): path glob matcher with TDD coverage"
```

### Task 1.4: Implementar commit type parser (TDD)

**Files:**
- Modify: `tooling/scripts/review-router.ts`
- Modify: `tooling/scripts/review-router.spec.ts`

- [ ] **Step 1: Adicionar testes**

```typescript
// Adicionar em review-router.spec.ts
describe('parseCommitType()', () => {
  it('parses feat(api): ... as type=feat scope=api', () => {
    expect(parseCommitType('feat(api): add user endpoint')).toEqual({
      type: 'feat', scope: 'api', breaking: false, subject: 'add user endpoint'
    });
  });

  it('parses feat(api)!: ... as breaking=true', () => {
    expect(parseCommitType('feat(api)!: breaking change')).toEqual({
      type: 'feat', scope: 'api', breaking: true, subject: 'breaking change'
    });
  });

  it('falls back to chore when no prefix', () => {
    expect(parseCommitType('random commit message')).toEqual({
      type: 'chore', scope: undefined, breaking: false, subject: 'random commit message'
    });
  });

  it('parses fix: ... without scope', () => {
    expect(parseCommitType('fix: bug in login')).toEqual({
      type: 'fix', scope: undefined, breaking: false, subject: 'bug in login'
    });
  });
});

describe('matchCommitTypes()', () => {
  it('adds stack-code-reviewer for feat type', () => {
    const rules = { feat: { reviewers_added: ['stack-code-reviewer'] } };
    const result = matchCommitTypes(['feat(api): new feature'], rules);
    expect(result).toContain('stack-code-reviewer');
  });

  it('returns empty for unknown type without matching rule', () => {
    const rules = { feat: { reviewers_added: ['stack-code-reviewer'] } };
    const result = matchCommitTypes(['random commit'], rules);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar testes (esperar FAIL)**

```bash
cd tooling/scripts && pnpm test -- review-router.spec.ts
```

Expected: FAIL — `parseCommitType` not exported.

- [ ] **Step 3: Implementar**

```typescript
// Adicionar em review-router.ts
export interface ParsedCommit {
  type: string;
  scope?: string;
  breaking: boolean;
  subject: string;
}

const COMMIT_TYPES = ['feat', 'fix', 'refactor', 'perf', 'docs', 'chore', 'ci', 'test', 'build', 'style'];

export function parseCommitType(message: string): ParsedCommit {
  // Pattern: type(scope)!: subject | type!: subject | type: subject | type(scope): subject
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
  rules: Record<string, CommitTypeRule>
): string[] {
  const reviewers = new Set<string>();
  for (const msg of commits) {
    const parsed = parseCommitType(msg);
    const rule = rules[parsed.type];
    if (rule?.reviewers_added) {
      rule.reviewers_added.forEach(r => reviewers.add(r));
    }
  }
  return Array.from(reviewers);
}
```

- [ ] **Step 4: Atualizar `classify()` para integrar commit types**

```typescript
// Substituir classify() em review-router.ts
export function classify(
  input: ClassifyInput,
  rules?: { path_globs: PathGlobRule[]; commit_types?: Record<string, CommitTypeRule> }
): ClassifyResult {
  const evidence: EvidenceItem[] = [];
  const reviewers = new Set<string>();

  if (rules?.path_globs) {
    const pathMatches = matchPathGlobs(input.paths, rules.path_globs);
    for (const m of pathMatches) {
      m.reviewers.forEach(r => reviewers.add(r));
      evidence.push({ signal: 'path_glob', pattern: m.pattern, reviewers_added: m.reviewers });
    }
  }

  if (rules?.commit_types) {
    const ctReviewers = matchCommitTypes(input.commits, rules.commit_types);
    ctReviewers.forEach(r => reviewers.add(r));
    if (ctReviewers.length > 0) {
      const types = input.commits.map(c => parseCommitType(c).type);
      evidence.push({
        signal: 'commit_type',
        pattern: types.join(','),
        reviewers_added: ctReviewers
      });
    }
  }

  return { domains: [], reviewers: Array.from(reviewers), evidence };
}
```

- [ ] **Step 5: Rodar testes (esperar PASS)**

```bash
cd tooling/scripts && pnpm test -- review-router.spec.ts
```

Expected: PASS — 9 testes verde.

- [ ] **Step 6: Commit**

```bash
git add tooling/scripts/review-router.ts tooling/scripts/review-router.spec.ts
git commit -m "feat(tooling): commit type parser (Conventional Commits) + TDD"
```

