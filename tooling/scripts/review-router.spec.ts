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

    it('classify sets blocking when path_glob rule has blocking=true', () => {
      // Gap P1 #1 da matrix v1.1 Seção 6 — `blocking: true` em path_globs
      // deve propagar para a final exit code decision do classifier.
      const result = classify(
        {
          paths: ['pnpm-workspace.yaml'],
          diff: '',
          commits: [],
        },
        {
          path_globs: [
            {
              pattern: 'pnpm-workspace.yaml',
              reviewers: ['monorepo-specialist'],
              blocking: true,
            },
          ],
        },
      );
      expect(result.blocking).toBe(true);
      expect(result.reviewers).toContain('monorepo-specialist');
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

    it('matchPathGlobs propagates blocking flag from rule', () => {
      // Gap P1 #1 da matrix v1.1 Seção 6 — matchPathGlobs() deve ler
      // `rule.blocking` e popular PathMatch.blocking com o valor declarado.
      const rules: PathGlobRule[] = [
        {
          pattern: 'pnpm-workspace.yaml',
          reviewers: ['monorepo-specialist'],
          blocking: true,
        },
      ];
      const result = matchPathGlobs(['pnpm-workspace.yaml'], rules);
      expect(result[0].blocking).toBe(true);
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

    it('narrowed regex does not match fixture/spec/doc content (regression for FP pilot Task 1)', () => {
      // Gap P1 #2 da matrix v1.1 Seção 6 — regex broad `bcrypt|argon2|hash\(|jwt\.sign|jwt\.verify`
      // produzia 10 FPs no pilot Task 1 (commit 7ddb93e), todos em test fixtures /
      // plan docs / spec docs / matrix YAML. Narrowing para call-site anchored deve
      // zerar matches em conteúdo representativo (sem call sites reais).
      //
      // pt-BR: a fixture abaixo replica as fontes de FP do pilot Task 1:
      // - nomes de teste com `bcrypt` (linha 148 original)
      // - regex literal `'bcrypt|argon2'` em test code (linha 150 original)
      // - regex literal `'bcrypt'` em test code (linhas 167, 173 originais)
      // - string de teste `'\nbcrypt here'` (linha 174 original)
      // NENHUMA contém call site real (`bcrypt.hash(` etc), por isso o regex
      // narrow (call-site anchored) deve ter 0 matches.
      const fixtureContent = `
    it('adds security-auditor for bcrypt pattern', () => {
      const rules: DiffPatternRule[] = [
        { regex: 'bcrypt|argon2', reviewers_added: ['security-auditor'], blocking: true },
      ];
      expect(result.reviewers).toContain('security-auditor');
      expect(result.blocking).toBe(true);
    });
    // ... outros casos omitidos ...
    it('respects 50KB cap and truncates with warning', () => {
      const rules: DiffPatternRule[] = [{ regex: 'bcrypt', reviewers_added: ['security-auditor'] }];
      const bigDiff = 'x'.repeat(60_000) + '\\nbcrypt here';
      const result = matchDiffPatterns(bigDiff, rules);
      expect(result.truncated).toBe(true);
      expect(result.reviewers).toEqual([]);
    });
  `;
      const narrowRegex =
        'bcrypt\\.hash(?:Sync)?\\(|bcrypt\\.compare(?:Sync)?\\(|argon2\\.hash(?:Sync)?\\(|argon2\\.verify\\(|jwt\\.(?:sign|verify|decode)\\(';
      const rules: DiffPatternRule[] = [
        { regex: narrowRegex, reviewers_added: ['security-auditor'], blocking: true },
      ];
      const result = matchDiffPatterns(fixtureContent, rules);
      expect(result.reviewers).not.toContain('security-auditor');
      expect(result.blocking).toBe(false);
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

    it('exits 2 when --paths is missing', () => {
      const scriptDir = path.resolve(__dirname);
      let exitCode = -1;
      try {
        execSync(`node --import tsx review-router.ts --matrix=/tmp/nonexistent`, {
          cwd: scriptDir,
          stdio: 'pipe',
        });
      } catch (err: any) {
        exitCode = err.status;
      }
      expect(exitCode).toBe(2);
    });

    it('exits 1 when paths file does not exist', () => {
      const scriptDir = path.resolve(__dirname);
      const fakePaths = `/tmp/nonexistent-${Date.now()}-paths.txt`;
      let exitCode = -1;
      try {
        execSync(
          `node --import tsx review-router.ts --paths=${fakePaths} --matrix=/tmp/nonexistent-matrix`,
          {
            cwd: scriptDir,
            stdio: 'pipe',
          },
        );
      } catch (err: any) {
        exitCode = err.status;
      }
      expect(exitCode).toBe(1);
    });

    it('handles empty stdin gracefully and exits 0 without blocking', () => {
      const tmpPaths = '/tmp/test-paths-empty.txt';
      const tmpMatrix = '/tmp/test-matrix-empty.md';
      writeFileSync(tmpPaths, '');
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
            input: '',
            encoding: 'utf-8',
          },
        );
        expect(result).toBeDefined();
        // Sem diff → sem match em diff_patterns blocking → exit 0
      } finally {
        unlinkSync(tmpPaths);
        unlinkSync(tmpMatrix);
      }
    });
  });
});
