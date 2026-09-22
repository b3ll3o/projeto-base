// tooling/scripts/review-router.spec.ts
//
// pt-BR: Testes do classificador review-router. Cobre a função
// `classify()` que recebe paths + commits + diff e retorna reviewers
// despachados baseado na matriz de roteamento.
//
// Estado em Task 1.2: skeleton mínimo. Cobertura real virá em
// Tasks 1.3 (path glob), 1.4 (commit type), 1.5 (diff pattern).

import { describe, it, expect } from 'vitest';
import { classify, matchPathGlobs, type PathGlobRule } from './review-router.js';

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
});
