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
 * ## Por que o archive vai por caminho ABSOLUTO (B19)
 *
 * A versão anterior chamava `execSync('pnpm archive:lint')` sem dizer ONDE
 * olhar. O script `archive:lint` do package.json raiz é
 * `cd tooling/scripts && pnpm archive:lint`, e o default do linter
 * (`archiveDir ?? '.agents/runs/archive'`) é relativo ao **cwd**. O `cd`
 * trorava o cwd, e o early-return do linter disparava em
 * `tooling/scripts/.agents/runs/archive` — que não existe. O archive real
 * nunca era lido, e o check renderizava `✓`.
 *
 * A assinatura do bug: o `existsSync` do próprio check passava, porque ele
 * conferia o caminho CERTO. Quem auditasse olhando o `existsSync` concluiria
 * que a checagem estava ancorada — a âncora e a execução estavam em sistemas
 * de arquivos diferentes. Passar o diretório absoluto é o que fecha a
 * distância entre as duas.
 *
 * Retorna `CheckResult` no formato padrão do preflight.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { CheckResult } from './check-types';

/**
 * Monta a invocação do linter com o archive por caminho absoluto.
 *
 * `repoRoot` pode chegar como `'.'` (é assim que o preflight chama) — resolver
 * aqui evita que o caminho absoluto saia como `.agents/runs/archive`, que
 * voltaria a ser relativo ao cwd do `cd`.
 */
export function buildLintArgs(repoRoot: string): { archiveDir: string; args: string[] } {
  const archiveDir = resolve(repoRoot, '.agents/runs/archive');
  return { archiveDir, args: ['archive:lint', `--archive-dir=${archiveDir}`] };
}

/**
 * Import dinâmico via subprocesso — `tooling/scripts/archive-lint.ts` é
 * package isolado no monorepo (evita cross-package import).
 */
export async function checkArchiveIntegrity(repoRoot: string): Promise<CheckResult> {
  const { archiveDir, args } = buildLintArgs(repoRoot);
  const lintScript = join(resolve(repoRoot), 'tooling/scripts/archive-lint.ts');

  if (!existsSync(archiveDir)) {
    // Sem archive dir (B23 acabou de criar a convenção) — não falha, mas
    // também não verifica nada: o `✓` aqui era puro teatro.
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: 'diretório .agents/runs/archive não existe',
    };
  }

  if (!existsSync(lintScript)) {
    // Script não existe (pré-B23) — não bloqueia preflight, mas declara.
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: 'tooling/scripts/archive-lint.ts não existe',
    };
  }

  try {
    // `cwd` fixado na raiz E `--archive-dir` absoluto: as duas coisas juntas.
    // Qualquer uma sozinha bastaria; as duas fecham o B19 e a sua reincidência.
    execFileSync('pnpm', args, { cwd: resolve(repoRoot), stdio: ['ignore', 'pipe', 'pipe'] });
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
