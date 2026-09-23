// tooling/scripts/lint-specialist-routing.spec.ts
//
// pt-BR: Testes do lint da matriz de roteamento specialist. Espelha
// `lint-review-routing.spec.ts` (vitest, ESM `.js` import suffixes).
// Cobre `lintMatrix()` + `lintMatrixFromFile()` validando:
// - matriz v1.0 válida passa
// - YAML mal-formado falha
// - glob inválido em path_globs falha
// - regex inválida em demand_keywords falha
// - specialist ref inexistente em .agents/agents/ reporta WARNING
//   (NÃO error — gap G1 da matriz v1.0 lista `docker-specialist` como
//    pendente para Task 9; lint deve permitir ref enquanto agent não
//    existe, per matriz §6 mitigação)
// - LOC > 300 falha
// - frontmatter sem `version` falha
// - path_glob com blocking: true sem rationale emite WARNING
//   (parity com review-router v1.3 PR #21)
// - lintMatrixFromFile lê e valida a matriz canônica do repo

import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { lintMatrix, lintMatrixFromFile } from './lint-specialist-routing.js';

const VALID_MATRIX = `---
name: specialist-routing
version: 1.0
updated: 2026-09-23
maintainer: specialist-router
description: test
---

\`\`\`yaml
path_globs:
  - pattern: "apps/api/**"
    specialists: [nestjs-specialist]
    blocking: false
demand_keywords:
  - regex: "(?i)docker"
    specialists: [docker-specialist]
demand_scopes:
  feat:
    specialists_added: [test-writer]
skip_rules:
  nestjs-specialist:
    skip_if: "frontend only"
always_on: [monorepo-specialist]
\`\`\`
`;

describe('lintMatrix', () => {
  it('passa para matriz v1.0 válida', async () => {
    const result = await lintMatrix(VALID_MATRIX, { agentsDir: '.agents/agents/' });
    expect(result.errors).toHaveLength(0);
  });

  it('falha se YAML mal-formado', async () => {
    const result = await lintMatrix('---\nname: test\n```yaml\nINVALID: [unclosed\n```\n', {
      agentsDir: '.agents/agents/',
    });
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toMatch(/yaml|parse/i);
  });

  it('falha se glob inválido', async () => {
    const matrix =
      `---\nname: x\nversion: 1.0\nupdated: 2026-09-23\nmaintainer: x\ndescription: x\n---\n\n` +
      '```yaml\npath_globs:\n  - pattern: "[unclosed"\n    specialists: [a]\n```\n';
    const result = await lintMatrix(matrix, { agentsDir: '.agents/agents/' });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('falha se regex inválida', async () => {
    const matrix =
      `---\nname: x\nversion: 1.0\nupdated: 2026-09-23\nmaintainer: x\ndescription: x\n---\n\n` +
      '```yaml\ndemand_keywords:\n  - regex: "[unclosed("\n    specialists: [a]\n```\n';
    const result = await lintMatrix(matrix, { agentsDir: '.agents/agents/' });
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('emite warning se specialist ref não existe em .agents/agents/', async () => {
    // pt-BR: per matriz §6 G1, lint permite ref a specialist pendente
    // (warning, não error) — docker-specialist é referenciado em v1.0
    // mas agent definition só será criado na Task 9.
    const matrix =
      `---\nname: x\nversion: 1.0\nupdated: 2026-09-23\nmaintainer: x\ndescription: x\n---\n\n` +
      '```yaml\npath_globs:\n  - pattern: "x/**"\n    specialists: [nonexistent-specialist]\n```\n';
    const result = await lintMatrix(matrix, { agentsDir: '.agents/agents/' });
    expect(result.warnings.some((w) => /nonexistent-specialist/.test(w))).toBe(true);
  });

  it('falha se LOC > 300', async () => {
    // pt-BR: 310 linhas (> 300) — LOC é line count, não char count.
    // A spec do usuário usava 'a'.repeat(310) numa única linha, o que
    // testa char count mas não LOC; corrigido aqui para gerar > 300 lines.
    const matrix =
      `---\nname: x\nversion: 1.0\nupdated: 2026-09-23\nmaintainer: x\ndescription: x\n---\n\n` +
      '```yaml\n' +
      'x\n'.repeat(310) +
      '```\n';
    const result = await lintMatrix(matrix, { agentsDir: '.agents/agents/' });
    expect(result.errors.some((e) => /loc|300|lines/i.test(e))).toBe(true);
  });

  it('falha se version frontmatter ausente', async () => {
    const matrix =
      `---\nname: x\nupdated: 2026-09-23\nmaintainer: x\ndescription: x\n---\n\n` +
      '```yaml\npath_globs: []\n```\n';
    const result = await lintMatrix(matrix, { agentsDir: '.agents/agents/' });
    expect(result.errors.some((e) => /version/i.test(e))).toBe(true);
  });

  it('emite warning blocking-illegible (review-router v1.3 parity)', async () => {
    // Per review-router v1.3, emit warning se blocking flag lacks rationale.
    const matrix =
      `---\nname: x\nversion: 1.0\nupdated: 2026-09-23\nmaintainer: x\ndescription: x\n---\n\n` +
      '```yaml\npath_globs:\n  - pattern: "x/**"\n    specialists: [a]\n    blocking: true\n```\n';
    const result = await lintMatrix(matrix, { agentsDir: '.agents/agents/' });
    expect(result.warnings.some((w) => /blocking|illegible|rationale/i.test(w))).toBe(true);
  });

  it('passa matriz com agentsDir apontando para diretório existente', async () => {
    const matrix =
      `---\nname: x\nversion: 1.0\nupdated: 2026-09-23\nmaintainer: x\ndescription: x\n---\n\n` +
      '```yaml\npath_globs:\n  - pattern: "x/**"\n    specialists: [a]\n```\n';
    const tmp = path.resolve(__dirname, '../../.agents/agents/');
    const result = await lintMatrix(matrix, { agentsDir: tmp });
    expect(result.errors).toHaveLength(0);
  });

  it('não emite warning de specialist quando ref existe em agentsDir', async () => {
    // nestjs-specialist existe em .agents/agents/, então não deve warnar.
    const matrix =
      `---\nname: x\nversion: 1.0\nupdated: 2026-09-23\nmaintainer: x\ndescription: x\n---\n\n` +
      '```yaml\npath_globs:\n  - pattern: "x/**"\n    specialists: [nestjs-specialist]\n```\n';
    const tmp = path.resolve(__dirname, '../../.agents/agents/');
    const result = await lintMatrix(matrix, { agentsDir: tmp });
    expect(result.warnings.some((w) => /nestjs-specialist/.test(w))).toBe(false);
  });
});

describe('lintMatrixFromFile', () => {
  it('lê arquivo e valida matriz canônica sem errors', async () => {
    const matrixPath = path.resolve(
      __dirname,
      '../../.agents/specs/conventions/specialist-routing.md',
    );
    const result = await lintMatrixFromFile(matrixPath, {
      agentsDir: path.resolve(__dirname, '../../.agents/agents/'),
      repoRoot: path.resolve(__dirname, '../..'),
    });
    expect(result.errors).toHaveLength(0);
  });

  it('retorna erro claro quando arquivo não existe', async () => {
    const result = await lintMatrixFromFile('/tmp/does-not-exist-specialist-matrix.md', {
      agentsDir: path.resolve(__dirname, '../../.agents/agents/'),
      repoRoot: path.resolve(__dirname, '../..'),
    });
    expect(result.errors.some((e) => /not found|enoent|file/i.test(e))).toBe(true);
  });
});
