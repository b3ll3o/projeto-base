// tooling/scripts/lint-review-routing.spec.ts
//
// pt-BR: Testes do lint da matriz de roteamento. Cobre `lintMatrix()`
// que valida estrutura YAML, refs de reviewers, regex de diff_patterns,
// e limites de LOC da convenção markdown.

import { describe, it, expect } from 'vitest';
import { lintMatrix } from './lint-review-routing.js';

describe('lintMatrix()', () => {
  it('passes for valid matrix', () => {
    const valid = `
\`\`\`yaml
path_globs:
  - pattern: "apps/api/**"
    reviewers: [nestjs-specialist]
\`\`\`
`;
    const result = lintMatrix(valid);
    expect(result.errors).toEqual([]);
  });

  it('reports error for malformed YAML', () => {
    const md = `\`\`\`yaml\npath_globs:\n  - pattern: [invalid\n\`\`\``;
    const result = lintMatrix(md);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/yaml/i);
  });

  it('warns when referenced reviewer does not exist', () => {
    const md = `\`\`\`yaml\npath_globs:\n  - pattern: "x"\n    reviewers: [non-existent-agent]\n\`\`\``;
    const result = lintMatrix(md, ['existing-agent']);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toMatch(/non-existent-agent/);
  });

  it('rejects duplicate pattern definitions', () => {
    const md = `
\`\`\`yaml
path_globs:
  - pattern: "apps/api/**"
    reviewers: [a]
  - pattern: "apps/api/**"
    reviewers: [b]
\`\`\``;
    const result = lintMatrix(md);
    expect(result.errors.some((e) => e.includes('duplicate'))).toBe(true);
  });

  it('checks LOC limit (max 300 lines)', () => {
    const md = 'x\n'.repeat(350);
    const result = lintMatrix(md);
    expect(result.errors.some((e) => e.includes('LOC'))).toBe(true);
  });
});
