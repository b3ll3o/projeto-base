### Task 1.5: Implementar diff pattern matcher (TDD)

**Files:**
- Modify: `tooling/scripts/review-router.ts`
- Modify: `tooling/scripts/review-router.spec.ts`

- [ ] **Step 1: Adicionar testes**

```typescript
// Adicionar em review-router.spec.ts
describe('matchDiffPatterns()', () => {
  it('adds security-auditor for bcrypt pattern', () => {
    const rules = [
      { regex: 'bcrypt|argon2', reviewers_added: ['security-auditor'], blocking: true }
    ];
    const result = matchDiffPatterns('const hash = await bcrypt.hash(pwd);', rules);
    expect(result.reviewers).toContain('security-auditor');
    expect(result.blocking).toBe(true);
  });

  it('adds nestjs-specialist for @Injectable pattern', () => {
    const rules = [
      { regex: '@(Injectable|Controller|Module)', reviewers_added: ['nestjs-specialist'] }
    ];
    const result = matchDiffPatterns('@Injectable()\nexport class UserService {}', rules);
    expect(result.reviewers).toContain('nestjs-specialist');
    expect(result.blocking).toBe(false);
  });

  it('returns empty for diff without matching patterns', () => {
    const rules = [
      { regex: 'bcrypt', reviewers_added: ['security-auditor'] }
    ];
    const result = matchDiffPatterns('const x = 1;', rules);
    expect(result.reviewers).toEqual([]);
  });

  it('respects 50KB cap and truncates with warning', () => {
    const rules = [{ regex: 'bcrypt', reviewers_added: ['security-auditor'] }];
    const bigDiff = 'x'.repeat(60_000) + '\nbcrypt here';
    const result = matchDiffPatterns(bigDiff, rules);
    expect(result.truncated).toBe(true);
    expect(result.reviewers).toEqual([]); // bcrypt after truncation
  });
});
```

- [ ] **Step 2: Rodar testes (esperar FAIL)**

```bash
cd tooling/scripts && pnpm test -- review-router.spec.ts
```

Expected: FAIL — `matchDiffPatterns` not exported.

- [ ] **Step 3: Implementar**

```typescript
// Adicionar em review-router.ts
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
      rule.reviewers_added.forEach(r => reviewers.add(r));
      if (rule.blocking) blocking = true;
      evidence.push({
        signal: 'diff_pattern',
        pattern: rule.regex,
        reviewers_added: rule.reviewers_added
      });
    }
  }

  return { reviewers: Array.from(reviewers), blocking, truncated, evidence };
}
```

- [ ] **Step 4: Atualizar `classify()` para integrar diff patterns**

```typescript
// Substituir classify() em review-router.ts
export function classify(
  input: ClassifyInput,
  rules?: {
    path_globs: PathGlobRule[];
    commit_types?: Record<string, CommitTypeRule>;
    diff_patterns?: DiffPatternRule[];
  }
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
      evidence.push({ signal: 'commit_type', pattern: types.join(','), reviewers_added: ctReviewers });
    }
  }

  if (rules?.diff_patterns) {
    const dpResult = matchDiffPatterns(input.diff, rules.diff_patterns);
    dpResult.reviewers.forEach(r => reviewers.add(r));
    evidence.push(...dpResult.evidence);
  }

  return { domains: [], reviewers: Array.from(reviewers), evidence };
}
```

- [ ] **Step 5: Rodar testes (esperar PASS)**

```bash
cd tooling/scripts && pnpm test -- review-router.spec.ts
```

Expected: PASS — 13 testes verde.

- [ ] **Step 6: Commit**

```bash
git add tooling/scripts/review-router.ts tooling/scripts/review-router.spec.ts
git commit -m "feat(tooling): diff pattern matcher with 50KB cap + TDD"
```

