import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CheckResult } from './check-types';

/**
 * Detecta drift em configs ESLint dentro de um workspace. Garante que
 * apenas flat config (`eslint.config.{js,mjs,cjs}`) seja usado e que
 * nenhum `.eslintrc.*` legado permaneça — exceto quando explicitamente
 * allowlisted (ex.: `apps/api/.eslintrc.js` é convenção NestJS válida).
 *
 * Caso de uso: a falha #1 (35763332088) e #2 (35767879661) do CI foram
 * causadas por ESLint rules duplicadas em múltiplos configs legados.
 * Após migração para flat config (`eslint.config.mjs`), qualquer
 * `.eslintrc.{js,cjs,json,yaml,yml}` remanescente indica drift e pode
 * reintroduzir regras conflitantes.
 *
 * Estratégia:
 * - Recursão `walk` para encontrar qualquer arquivo de nome legado.
 * - Skip de `node_modules` para não escanear dependências.
 * - Allowlist por path relativo (relativo a `appsRoot`) para exceções
 *   legítimas. Comparação exata — substring match seria fonte de
 *   falsos negativos (ex.: `apps/api/.eslintrc.js` allowlist
 *   silenciaria `apps/api-fork/.eslintrc.js`).
 */
const LEGACY_NAMES = [
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.json',
  '.eslintrc.yaml',
  '.eslintrc.yml',
];

export async function checkEslintDrift(opts: {
  appsRoot: string;
  allowlist: string[];
}): Promise<CheckResult> {
  const errors: string[] = [];
  const root = path.resolve(opts.appsRoot);

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      // appsRoot inexistente: comportamento idêntico a diretório vazio
      // (sem erro), para não falhar builds em workspaces parciais.
      return;
    }
    for (const entry of entries) {
      // Exclui dependências publicadas.
      if (entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (LEGACY_NAMES.includes(entry.name)) {
        const rel = path.relative(root, full);
        if (opts.allowlist.includes(rel)) continue;
        errors.push(
          `${rel}: ESLint config legada encontrada. Migrar para eslint.config.* (flat config).`,
        );
      }
    }
  }

  await walk(root);
  return { ok: errors.length === 0, errors };
}
