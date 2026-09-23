#!/usr/bin/env tsx
/**
 * Valida integridade dos arquivos em `.agents/runs/archive/`.
 *
 * Garante que arquivos arquivados seguem o frontmatter canônico definido
 * em `.agents/specs/conventions/demand-archiving.md` §3:
 * - Todos os campos obrigatórios presentes
 * - `improvements` ≥ 1 item não-zero (sem melhorias = não arquivar)
 * - `prs` ≥ 1 PR mergeado (sem PR = não implementado)
 * - `status` ∈ {archived, cancelled}
 * - `archived_at` ISO 8601
 * - `demand_slug` kebab-case
 * - `tags` array
 * - `retro_refs` ≥ 1 ref
 *
 * Nota: diretório ausente (monorepos novos) é OK — não falha preflight.
 * Apenas arquivos .md existentes são validados.
 *
 * Retorna `CheckResult` no formato padrão do preflight.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckResult } from './check-types';

/**
 * Import dinâmico via execSync — `tooling/scripts/archive-lint.ts` é
 * package isolado no monorepo (evita cross-package import).
 */
async function checkArchiveIntegrity(repoRoot: string): Promise<CheckResult> {
  const archiveDir = join(repoRoot, '.agents/runs/archive');
  const lintScript = join(repoRoot, 'tooling/scripts/archive-lint.ts');

  if (!existsSync(archiveDir)) {
    // Sem archive dir ainda (B23 acabou de criar a convenção) — não falha.
    return { ok: true, errors: [] };
  }

  if (!existsSync(lintScript)) {
    // Script não existe (pré-B23) — não bloqueia preflight, mas avisa.
    return {
      ok: true,
      errors: [],
    };
  }

  const { execSync } = await import('node:child_process');
  try {
    execSync('pnpm archive:lint', { stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, errors: [] };
  } catch (err: unknown) {
    const e = err as {
      stderr?: { toString(): string };
      stdout?: { toString(): string };
      message: string;
    };
    const stderr = (e.stderr?.toString() ?? '').trim();
    const stdout = (e.stdout?.toString() ?? '').trim();
    const detail = stderr || stdout || e.message;
    return {
      ok: false,
      errors: [`archive:lint falhou:\n${detail}`],
    };
  }
}

// Export nomeado para testabilidade (preflight.spec.ts espelha).
export { checkArchiveIntegrity };
