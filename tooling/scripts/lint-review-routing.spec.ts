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

  it('reports error for invalid regex in diff_patterns', () => {
    const md = `\`\`\`yaml
diff_patterns:
  - regex: "[invalid-regex("
    reviewers_added: [nestjs-specialist]
\`\`\``;
    const result = lintMatrix(md);
    expect(result.errors.some((e) => e.includes('invalid regex'))).toBe(true);
  });

  it('reports error when YAML blocks present but all invalid', () => {
    const md = `\`\`\`yaml
this is: [not valid yaml at all
\`\`\``;
    const result = lintMatrix(md);
    expect(result.errors.some((e) => e.includes('YAML blocks present'))).toBe(true);
  });

  it('passes LOC at exactly 300 lines', () => {
    // 300 linhas sem \n trailing (split('\n') deve dar exatamente 300 elementos).
    // 'x\n'.repeat(300) terminaria em \n → split daria 301 (off-by-one); usamos
    // 299 'x\n' + 'x' final para fechar exatamente 300 linhas.
    const md = 'x\n'.repeat(299) + 'x';
    const result = lintMatrix(md);
    expect(result.errors.some((e) => e.includes('LOC'))).toBe(false);
  });

  it('fails LOC at 301 lines', () => {
    const md = 'x\n'.repeat(301);
    const result = lintMatrix(md);
    expect(result.errors.some((e) => e.includes('LOC'))).toBe(true);
  });
});

describe('lintMatrix() — path_globs blocking on illegible files (gap P2 #5)', () => {
  it('warns when blocking: true glob matches no files in repo', () => {
    const md = `
\`\`\`yaml
path_globs:
  - pattern: ".agents/nonexistent-dir-xyz123/**"
    reviewers: [doc-sync]
    blocking: true
\`\`\``;
    const result = lintMatrix(md, ['doc-sync']);
    expect(result.warnings.some((w) => w.match(/no files matched|ilegível|illegible/i))).toBe(true);
  });

  it('warns when blocking: true glob matches only .gitignored paths', () => {
    // .gitignore tem: dist/, .turbo/, node_modules/, coverage/.
    const md = `
\`\`\`yaml
path_globs:
  - pattern: "dist/**"
    reviewers: [monorepo-specialist]
    blocking: true
\`\`\``;
    const result = lintMatrix(md, ['monorepo-specialist']);
    expect(result.warnings.some((w) => w.match(/gitignore|ilegível|illegible/i))).toBe(true);
  });

  it('does NOT warn when blocking: true glob matches existing, non-ignored files', () => {
    const md = `
\`\`\`yaml
path_globs:
  - pattern: "package.json"
    reviewers: [monorepo-specialist]
    blocking: true
\`\`\``;
    const result = lintMatrix(md, ['monorepo-specialist']);
    expect(result.warnings.some((w) => w.match(/ilegível|illegible|gitignore/i))).toBe(false);
  });

  it('does NOT warn when blocking: false (no severity escalation)', () => {
    const md = `
\`\`\`yaml
path_globs:
  - pattern: ".agents/nonexistent-dir-xyz123/**"
    reviewers: [doc-sync]
    blocking: false
\`\`\``;
    const result = lintMatrix(md, ['doc-sync']);
    expect(result.warnings.some((w) => w.match(/ilegível|illegible|gitignore/i))).toBe(false);
  });
});
