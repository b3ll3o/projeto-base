// tooling/scripts/archive-lint.spec.ts
//
// pt-BR: Testes do validador de arquivos de archive em `.agents/runs/archive/`.
// Espelha padrão dos lints `lint-review-routing` e `lint-specialist-routing`
// (vitest, ESM `.js` import suffixes). Cobre `validateArchive()` validando:
// - frontmatter com todos os campos obrigatórios passa
// - frontmatter sem `archived_at` falha
// - frontmatter sem `original_run` falha
// - `improvements` vazio (sem melhorias = não arquivar) falha
// - `prs` vazio (sem PR = não implementado) falha
// - `status` inválido (não archived nem cancelled) falha
// - `tags` ausente falha
// - ISO 8601 inválido em `archived_at` falha
// - `demand_slug` não kebab-case falha
// - `validateArchivesDir()` varre todos .md em `.agents/runs/archive/`

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArchiveFile, validateArchive, validateArchivesDir } from './archive-lint.js';

const VALID_FRONT = {
  archived_at: '2026-09-23T15:00:00Z',
  original_run: '2026-09-22-pilot-001.md',
  demand_slug: 'review-router-pilot-001',
  prs: [12],
  retro_refs: ['b16-result.md'],
  improvements: { memory_updated: 1 },
  status: 'archived' as const,
  tags: ['pilot'],
};

describe('validateArchive', () => {
  it('passa quando frontmatter tem todos os campos obrigatórios', () => {
    const r = validateArchive({ frontmatter: VALID_FRONT, body: '# Title\n\nBody' });
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('falha quando frontmatter missing archived_at', () => {
    const { archived_at: _, ...fm } = VALID_FRONT;
    const r = validateArchive({ frontmatter: fm as Partial<typeof VALID_FRONT>, body: '# Title' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('archived_at'))).toBe(true);
  });

  it('falha quando frontmatter missing original_run', () => {
    const { original_run: _, ...fm } = VALID_FRONT;
    const r = validateArchive({ frontmatter: fm as Partial<typeof VALID_FRONT>, body: '# Title' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('original_run'))).toBe(true);
  });

  it('falha quando improvements é vazio (sem melhorias = não arquivar)', () => {
    const r = validateArchive({
      frontmatter: { ...VALID_FRONT, improvements: {} },
      body: '# Title',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('improvements'))).toBe(true);
  });

  it('falha quando prs é vazio (sem PR = não implementado)', () => {
    const r = validateArchive({ frontmatter: { ...VALID_FRONT, prs: [] }, body: '# Title' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('prs'))).toBe(true);
  });

  it('falha quando status é inválido (não archived nem cancelled)', () => {
    const r = validateArchive({
      frontmatter: { ...VALID_FRONT, status: 'unknown' } as unknown as Partial<typeof VALID_FRONT>,
      body: '# Title',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('status'))).toBe(true);
  });

  it('falha quando tags é ausente', () => {
    const { tags: _, ...fm } = VALID_FRONT;
    const r = validateArchive({ frontmatter: fm as Partial<typeof VALID_FRONT>, body: '# Title' });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('tags'))).toBe(true);
  });

  it('passa quando status é cancelled', () => {
    const r = validateArchive({
      frontmatter: { ...VALID_FRONT, status: 'cancelled' },
      body: '# Title',
    });
    expect(r.valid).toBe(true);
  });

  it('falha quando archived_at não é ISO 8601', () => {
    const r = validateArchive({
      frontmatter: { ...VALID_FRONT, archived_at: 'ontem' },
      body: '# Title',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('ISO 8601'))).toBe(true);
  });

  it('falha quando demand_slug não é kebab-case', () => {
    const r = validateArchive({
      frontmatter: { ...VALID_FRONT, demand_slug: 'CamelCase_Slug' },
      body: '# Title',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('demand_slug'))).toBe(true);
  });

  it('falha quando retro_refs é vazio', () => {
    const r = validateArchive({
      frontmatter: { ...VALID_FRONT, retro_refs: [] },
      body: '# Title',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('retro_refs'))).toBe(true);
  });

  it('falha quando improvements é string (não objeto)', () => {
    const r = validateArchive({
      frontmatter: {
        ...VALID_FRONT,
        improvements: 'foo' as Partial<typeof VALID_FRONT>['improvements'],
      },
      body: '# Title',
    });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('improvements'))).toBe(true);
  });
});

describe('validateArchivesDir', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'archive-lint-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('retorna valid=true para archiveDir inexistente (sem archives = ok)', async () => {
    const r = await validateArchivesDir('/tmp/nonexistent-archive-dir-xyz');
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });

  it('retorna valid=true para tmpDir com 1 arquivo .md válido (happy path)', async () => {
    const content = `---
archived_at: ${VALID_FRONT.archived_at}
original_run: ${VALID_FRONT.original_run}
demand_slug: ${VALID_FRONT.demand_slug}
prs: [12]
retro_refs: [${VALID_FRONT.retro_refs[0]}]
improvements: ${JSON.stringify(VALID_FRONT.improvements)}
status: archived
tags: [${VALID_FRONT.tags[0]}]
---

# Body

Texto livre.
`;
    writeFileSync(join(tmpDir, 'archive-valid.md'), content, 'utf-8');
    const r = await validateArchivesDir(tmpDir);
    expect(r.valid).toBe(true);
    expect(r.errors).toHaveLength(0);
  });
});

describe('parseArchiveFile', () => {
  it('retorna { frontmatter, body } para conteúdo com frontmatter válido', () => {
    const content = `---
archived_at: 2026-09-23T15:00:00Z
demand_slug: foo
---

# Body content
`;
    const r = parseArchiveFile(content);
    expect(r).not.toBeNull();
    expect(r?.frontmatter.demand_slug).toBe('foo');
    expect(r?.body).toContain('# Body content');
  });

  it('retorna null quando frontmatter ausente (sem delimitador ---)', () => {
    const r = parseArchiveFile('# Title\n\nBody sem frontmatter');
    expect(r).toBeNull();
  });
});
