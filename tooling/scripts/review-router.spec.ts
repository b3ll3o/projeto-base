// tooling/scripts/review-router.spec.ts
//
// pt-BR: Testes do classificador review-router. Cobre a função
// `classify()` que recebe paths + commits + diff e retorna reviewers
// despachados baseado na matriz de roteamento.
//
// Estado em Task 1.2: skeleton mínimo. Cobertura real virá em
// Tasks 1.3 (path glob), 1.4 (commit type), 1.5 (diff pattern).

import { describe, it, expect } from 'vitest';
import { classify } from './review-router.js';

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

    it('classifies nestjs path glob (esperado FAIL até Task 1.3)', () => {
      const result = classify({
        paths: ['apps/api/src/users/users.controller.ts'],
        commits: ['feat(api): add user endpoint'],
        diff: '',
      });
      expect(result.domains).toContain('nestjs');
      expect(result.reviewers).toContain('nestjs-specialist');
    });
  });
});
