// tooling/scripts/review-router.spec.ts
//
// pt-BR: Testes do classificador review-router. Cobre a função
// `classify()` que recebe paths + commits + diff e retorna reviewers
// despachados baseado na matriz de roteamento.
//
// Estado em Task 1.2: skeleton mínimo. Cobertura real virá em
// Tasks 1.3 (path glob), 1.4 (commit type), 1.5 (diff pattern).

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import * as path from 'node:path';
import {
  classify,
  matchPathGlobs,
  parseCommitType,
  matchCommitTypes,
  matchDiffPatterns,
  loadMatrix,
  type PathGlobRule,
  type CommitTypeRule,
  type DiffPatternRule,
} from './review-router.js';

describe('review-router classifier', () => {
  describe('classify()', () => {
    it('returns empty classification for empty inputs', () => {
      const result = classify({
        paths: [],
        commits: [],
        diff: '',
      });
      expect(result.domains).toEqual([]);
      expect(result.reviewers).toEqual([]);
      expect(result.evidence).toEqual([]);
    });

    it('classifies nestjs path glob', () => {
      const result = classify(
        {
          paths: ['apps/api/src/users/users.controller.ts'],
          commits: ['feat(api): add user endpoint'],
          diff: '',
        },
        {
          path_globs: [
            {
              pattern: 'apps/api/**/*.ts',
              reviewers: ['nestjs-specialist', 'stack-code-reviewer'],
            },
          ],
        },
      );
      expect(result.reviewers).toContain('nestjs-specialist');
    });
  });

  describe('matchPathGlobs()', () => {
    it('matches apps/api/**/domain/** to nestjs-specialist', () => {
      const rules: PathGlobRule[] = [
        {
          pattern: 'apps/api/**/domain/**',
          reviewers: ['nestjs-specialist', 'stack-code-reviewer'],
        },
      ];
      const result = matchPathGlobs(['apps/api/src/users/domain/user.aggregate.ts'], rules);
      expect(result).toHaveLength(1);
      expect(result[0].reviewers).toContain('nestjs-specialist');
    });

    it('returns empty when no match', () => {
      const rules: PathGlobRule[] = [
        { pattern: 'apps/api/**/domain/**', reviewers: ['nestjs-specialist'] },
      ];
      const result = matchPathGlobs(['apps/web/app/page.tsx'], rules);
      expect(result).toEqual([]);
    });

    it('matches multiple patterns to same file', () => {
      const rules: PathGlobRule[] = [
        { pattern: 'apps/api/**/*.ts', reviewers: ['nestjs-specialist'] },
        { pattern: '**/*.controller.ts', reviewers: ['nestjs-specialist', 'stack-code-reviewer'] },
      ];
      const result = matchPathGlobs(['apps/api/src/users.controller.ts'], rules);
      const allReviewers = result.flatMap((m) => m.reviewers);
      expect(new Set(allReviewers)).toEqual(new Set(['nestjs-specialist', 'stack-code-reviewer']));
    });
  });

  describe('parseCommitType()', () => {
    it('parses feat(api): ... as type=feat scope=api', () => {
      expect(parseCommitType('feat(api): add user endpoint')).toEqual({
        type: 'feat',
        scope: 'api',
        breaking: false,
        subject: 'add user endpoint',
      });
    });

    it('parses feat(api)!: ... as breaking=true', () => {
      expect(parseCommitType('feat(api)!: breaking change')).toEqual({
        type: 'feat',
        scope: 'api',
        breaking: true,
        subject: 'breaking change',
      });
    });

    it('falls back to chore when no prefix', () => {
      expect(parseCommitType('random commit message')).toEqual({
        type: 'chore',
        scope: undefined,
        breaking: false,
        subject: 'random commit message',
      });
    });

    it('parses fix: ... without scope', () => {
      expect(parseCommitType('fix: bug in login')).toEqual({
        type: 'fix',
        scope: undefined,
        breaking: false,
        subject: 'bug in login',
      });
    });
  });

  describe('matchCommitTypes()', () => {
    it('adds stack-code-reviewer for feat type', () => {
      const rules: Record<string, CommitTypeRule> = {
        feat: { reviewers_added: ['stack-code-reviewer'] },
      };
      const result = matchCommitTypes(['feat(api): new feature'], rules);
      expect(result).toContain('stack-code-reviewer');
    });

    it('returns empty for unknown type without matching rule', () => {
      const rules: Record<string, CommitTypeRule> = {
        feat: { reviewers_added: ['stack-code-reviewer'] },
      };
      const result = matchCommitTypes(['random commit'], rules);
      expect(result).toEqual([]);
    });
  });

  describe('matchDiffPatterns()', () => {
    it('adds security-auditor for bcrypt pattern', () => {
      const rules: DiffPatternRule[] = [
        { regex: 'bcrypt|argon2', reviewers_added: ['security-auditor'], blocking: true },
      ];
      const result = matchDiffPatterns('const hash = await bcrypt.hash(pwd);', rules);
      expect(result.reviewers).toContain('security-auditor');
      expect(result.blocking).toBe(true);
    });

    it('adds nestjs-specialist for @Injectable pattern', () => {
      const rules: DiffPatternRule[] = [
        { regex: '@(Injectable|Controller|Module)', reviewers_added: ['nestjs-specialist'] },
      ];
      const result = matchDiffPatterns('@Injectable()\nexport class UserService {}', rules);
      expect(result.reviewers).toContain('nestjs-specialist');
      expect(result.blocking).toBe(false);
    });

    it('returns empty for diff without matching patterns', () => {
      const rules: DiffPatternRule[] = [{ regex: 'bcrypt', reviewers_added: ['security-auditor'] }];
      const result = matchDiffPatterns('const x = 1;', rules);
      expect(result.reviewers).toEqual([]);
    });

    it('respects 50KB cap and truncates with warning', () => {
      const rules: DiffPatternRule[] = [{ regex: 'bcrypt', reviewers_added: ['security-auditor'] }];
      const bigDiff = 'x'.repeat(60_000) + '\nbcrypt here';
      const result = matchDiffPatterns(bigDiff, rules);
      expect(result.truncated).toBe(true);
      expect(result.reviewers).toEqual([]); // bcrypt after truncation
    });
  });

  describe('loadMatrix()', () => {
    it('parses YAML blocks from review-routing.md', () => {
      const md = `
# Title
\`\`\`yaml
path_globs:
  - pattern: "apps/api/**"
    reviewers: [nestjs-specialist]
\`\`\`
`;
      const result = loadMatrix(md);
      expect(result.path_globs).toHaveLength(1);
      expect(result.path_globs![0].pattern).toBe('apps/api/**');
    });

    it('returns empty matrix when no YAML blocks found', () => {
      const md = '# Just markdown, no YAML';
      const result = loadMatrix(md);
      expect(result.path_globs).toBeUndefined();
    });

    it('extracts multiple YAML blocks (path_globs, commit_types, diff_patterns)', () => {
      const md = `
\`\`\`yaml
path_globs:
  - pattern: "apps/api/**"
    reviewers: [nestjs-specialist]
\`\`\`
\`\`\`yaml
commit_types:
  feat:
    reviewers_added: [stack-code-reviewer]
\`\`\`
`;
      const result = loadMatrix(md);
      expect(result.path_globs).toHaveLength(1);
      expect(result.commit_types?.feat?.reviewers_added).toContain('stack-code-reviewer');
    });
  });

  describe('CLI entrypoint', () => {
    it('reads paths from --paths file, diff from stdin, emits YAML', () => {
      const tmpPaths = '/tmp/test-paths.txt';
      writeFileSync(tmpPaths, 'apps/api/src/users.controller.ts\napps/api/prisma/schema.prisma');
      const tmpMatrix = '/tmp/test-matrix.md';
      writeFileSync(
        tmpMatrix,
        `
\`\`\`yaml
path_globs:
  - pattern: "apps/api/**/*.ts"
    reviewers: [nestjs-specialist]
\`\`\`
`,
      );

      try {
        const scriptDir = path.resolve(__dirname);
        const result = execSync(
          `node --import tsx review-router.ts --paths=${tmpPaths} --matrix=${tmpMatrix}`,
          {
            cwd: scriptDir,
            input: '@Injectable()\nclass FooService {}',
            encoding: 'utf-8',
          },
        );

        expect(result).toContain('nestjs-specialist');
      } finally {
        unlinkSync(tmpPaths);
        unlinkSync(tmpMatrix);
      }
    });
  });
});
