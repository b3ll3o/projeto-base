import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export interface CheckResult {
  ok: boolean;
  errors: string[];
}

/**
 * Valida que links relativos em arquivos markdown (.md) dentro de docsRoot
 * apontam para arquivos existentes no filesystem.
 *
 * Limitações conhecidas (Task 2 — TDD preflight):
 * - Não valida anchors (#secao) - apenas paths
 * - Não valida links para arquivos fora de docsRoot
 * - Apenas formato markdown link: [texto](path)
 */
export async function checkDocRefs(opts: { docsRoot: string }): Promise<CheckResult> {
  const errors: string[] = [];
  const root = path.resolve(opts.docsRoot);

  async function validateFile(file: string): Promise<void> {
    const content = await fs.readFile(file, 'utf-8');
    // Exibe o caminho incluindo o basename do docsRoot para facilitar
    // localização do erro (ex.: `docs/foo.md` em vez de `foo.md`).
    const rel = path.relative(path.dirname(root), file);
    // Match markdown links: [text](path)
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = linkRegex.exec(content)) !== null) {
      const target = match[2];
      // Skip external links and pure anchors
      if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('#')) {
        continue;
      }
      // Strip anchor if present
      const [filePath] = target.split('#');
      const resolved = path.resolve(path.dirname(file), filePath);
      try {
        await fs.access(resolved);
      } catch {
        errors.push(`${rel}: link para '${target}' quebrado`);
      }
    }
  }

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.name.endsWith('.md')) {
        await validateFile(full);
      }
    }
  }

  try {
    await walk(root);
  } catch (err) {
    errors.push(`docsRoot '${opts.docsRoot}' não existe ou não é acessível: ${err}`);
  }

  return { ok: errors.length === 0, errors };
}
