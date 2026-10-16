/**
 * SEM shebang, de propósito.
 *
 * Cada agent em `.agents/agents/*.md` deve ser REFERENCIADO pela matriz
 * `specialist-routing.md` em pelo menos UM path-glob OU na seção de
 * `specialists`. Se um agent existe mas nunca é roteado, ele é orfão:
 * ninguém dispara a skill dele, e o gate detecta isso.
 *
 * Inverso também vale: a matriz referencia um agent que não existe
 * (.agents/agents/X.md ausente) — o classificador headless queima em
 * runtime. Esse gate captura os DOṠ lados.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import type { CheckResult } from './check-types';

/** Lê a lista canônica de agents em disco. */
export function listAgents(agentsDir: string): string[] {
  if (!existsSync(agentsDir)) return [];
  return readdirSync(agentsDir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, ''))
    .sort();
}

/** Extrai nomes de agents REFERENCIADOS pela matriz. */
export function referencedAgents(matrixPath: string): { named: Set<string>; missing: string[] } {
  if (!existsSync(matrixPath)) return { named: new Set(), missing: [] };
  const text = readFileSync(matrixPath, 'utf-8');
  // Listas inline: `specialists: [a, b, c]`
  const inline = [...text.matchAll(/specialists:\s*\[([^\]]+)\]/g)]
    .flatMap((m) => (m[1] ?? '').split(','))
    .map((s) => s.trim())
    .filter((s) => /^[a-z][a-z0-9-]+$/.test(s));
  // Linhas com ` - nome-agent` em `specialists:` de YAML list form
  const block = [...text.matchAll(/^\s*-\s+([a-z][a-z0-9-]+)$/gm)].map((m) => m[1] ?? '');
  const named = new Set<string>([...inline, ...block]);
  // "missing" = nomes que o texto cita como agent mas que não estão em disco
  // (não podemos afirmar isso só do YAML — checamos depois, no gate caller)
  return { named, missing: [] };
}

/** Listas A ∖ B e B ∖ A como strings ordenadas. */
export function diffAgents(
  real: string[],
  referenced: Set<string>,
): {
  orphans: string[];
  ghosts: string[];
} {
  const realSet = new Set(real);
  const orphans = real.filter((a) => !referenced.has(a)).sort();
  const ghosts = [...referenced].filter((a) => !realSet.has(a)).sort();
  return { orphans, ghosts };
}

export async function checkAgentRoutingCoverage(opts: { repoRoot: string }): Promise<CheckResult> {
  const root = path.resolve(opts.repoRoot);
  const agentsDir = path.join(root, '.agents/agents');
  const matrixPath = path.join(root, '.agents/specs/conventions/specialist-routing.md');

  if (!existsSync(agentsDir)) {
    return { ok: true, errors: [], skipped: true, reason: '.agents/agents/ não existe' };
  }
  if (!existsSync(matrixPath)) {
    return {
      ok: false,
      errors: ['matriz specialist-routing ausente em .agents/specs/conventions/'],
    };
  }

  const real = listAgents(agentsDir);
  const { named } = referencedAgents(matrixPath);
  const { orphans, ghosts } = diffAgents(real, named);

  const errors: string[] = [];
  if (orphans.length) {
    errors.push(
      `agents órfãos (existem em disco, sem roteamento na matriz): ${orphans.join(', ')}`,
    );
  }
  if (ghosts.length) {
    errors.push(
      `agents fantasma (citados na matriz, sem arquivo .md em .agents/agents/): ${ghosts.join(', ')}`,
    );
  }
  return { ok: errors.length === 0, errors };
}
