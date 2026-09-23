// tooling/scripts/archive-lint.ts
//
// pt-BR: Validador dos arquivos de archive em `.agents/runs/archive/`.
// Confere frontmatter canônico definido em
// `.agents/specs/conventions/demand-archiving.md` §3.
//
// Exit: 0 = ok, 1 = errors, 2 = erro inesperado.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import * as YAML from 'yaml';

export interface ArchiveFrontmatter {
  archived_at: string;
  original_run: string;
  demand_slug: string;
  prs: number[];
  retro_refs: string[];
  improvements: Record<string, number>;
  status: 'archived' | 'cancelled';
  tags: string[];
  [k: string]: unknown;
}

export interface ArchiveInput {
  frontmatter: ArchiveFrontmatter;
  body: string;
}

export interface LintResult {
  valid: boolean;
  errors: string[];
}

const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;
const KEBAB_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const REQUIRED_FIELDS = [
  'archived_at',
  'original_run',
  'demand_slug',
  'prs',
  'retro_refs',
  'improvements',
  'status',
  'tags',
] as const;
const VALID_STATUS = new Set(['archived', 'cancelled']);
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function validateArchive(input: ArchiveInput): LintResult {
  const errors: string[] = [];
  const fm = input.frontmatter;

  if (!fm || typeof fm !== 'object') {
    return { valid: false, errors: ['frontmatter ausente ou não-objeto'] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (fm[field] === undefined || fm[field] === null) {
      errors.push(`frontmatter campo obrigatório ausente: ${field}`);
    }
  }

  if (typeof fm.archived_at === 'string' && !ISO_8601_RE.test(fm.archived_at)) {
    errors.push(`archived_at inválido: "${fm.archived_at}" (esperado ISO 8601)`);
  }

  if (typeof fm.demand_slug === 'string' && !KEBAB_CASE_RE.test(fm.demand_slug)) {
    errors.push(`demand_slug inválido: "${fm.demand_slug}" (esperado kebab-case)`);
  }

  if (Array.isArray(fm.prs)) {
    if (fm.prs.length === 0) {
      errors.push('prs vazio (sem PR mergeado = demanda não implementada)');
    } else if (!fm.prs.every((p) => typeof p === 'number')) {
      errors.push('prs contém item não-numérico');
    }
  }

  if (Array.isArray(fm.retro_refs) && fm.retro_refs.length === 0) {
    errors.push('retro_refs vazio (sem b<N>-result.md referenciado)');
  }

  if (fm.improvements !== undefined && fm.improvements !== null) {
    if (typeof fm.improvements !== 'object' || Array.isArray(fm.improvements)) {
      errors.push(
        `improvements deve ser objeto (string/número/array rejeitados): ${typeof fm.improvements}`,
      );
    } else {
      let hasNonZero = false;
      let invalidItem: string | null = null;
      for (const [k, v] of Object.entries(fm.improvements)) {
        if (typeof v !== 'number') {
          invalidItem = k;
          break;
        }
        if (v > 0) hasNonZero = true;
      }
      if (invalidItem !== null) {
        errors.push(
          `improvements["${invalidItem}"] não é número: ${typeof fm.improvements[invalidItem]}`,
        );
      } else if (!hasNonZero) {
        errors.push('improvements vazio ou zero (sem melhorias aplicadas = não arquivar)');
      }
    }
  }

  if (typeof fm.status === 'string' && !VALID_STATUS.has(fm.status)) {
    errors.push(`status inválido: "${fm.status}" (esperado archived|cancelled)`);
  }

  if (fm.tags !== undefined && !Array.isArray(fm.tags)) {
    errors.push('tags deve ser array');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Extrai frontmatter YAML + body de um arquivo .md usando yaml lib.
 */
export function parseArchiveFile(content: string): ArchiveInput | null {
  const m = FRONTMATTER_RE.exec(content);
  if (!m) return null;

  const fm = YAML.parse(m[1]) as Record<string, unknown> | null;
  if (!fm || typeof fm !== 'object') return null;

  return { frontmatter: fm as ArchiveFrontmatter, body: m[2] ?? '' };
}

/**
 * Varre um diretório de archives e valida cada .md.
 * Diretório inexistente → valid=true (sem archives = ok).
 */
export async function validateArchivesDir(archiveDir: string): Promise<LintResult> {
  if (!existsSync(archiveDir)) {
    return { valid: true, errors: [] };
  }

  const errors: string[] = [];
  const files = readdirSync(archiveDir).filter((f) => f.endsWith('.md'));

  for (const file of files) {
    const filePath = path.join(archiveDir, file);
    const content = readFileSync(filePath, 'utf-8');
    const parsed = parseArchiveFile(content);

    if (!parsed) {
      errors.push(`${file}: frontmatter YAML ausente ou inválido`);
      continue;
    }

    const result = validateArchive(parsed);
    if (!result.valid) {
      errors.push(`${file}:`);
      for (const err of result.errors) {
        errors.push(`  - ${err}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const archivePath = args.find((a) => a.startsWith('--archive='))?.split('=')[1];
  const archiveDir = args.find((a) => a.startsWith('--archive-dir='))?.split('=')[1];

  const run = async () => {
    if (archivePath) {
      if (!existsSync(archivePath)) {
        console.error(`Arquivo não encontrado: ${archivePath}`);
        process.exit(2);
      }
      const content = readFileSync(archivePath, 'utf-8');
      const parsed = parseArchiveFile(content);
      if (!parsed) {
        console.error(`Frontmatter ausente em ${archivePath}`);
        process.exit(1);
      }
      const result = validateArchive(parsed);
      for (const err of result.errors) console.error(`ERROR: ${err}`);
      process.exit(result.valid ? 0 : 1);
    }

    const target = archiveDir ?? '.agents/runs/archive';
    const result = await validateArchivesDir(target);
    for (const err of result.errors) console.error(`ERROR: ${err}`);
    process.exit(result.valid ? 0 : 1);
  };

  run().catch((err) => {
    console.error('Erro inesperado:', err);
    process.exit(2);
  });
}
