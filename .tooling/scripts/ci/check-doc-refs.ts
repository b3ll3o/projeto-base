import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CheckResult } from './check-types';

/**
 * Valida que links relativos em arquivos markdown (.md) dentro de docsRoot
 * apontam para arquivos existentes no filesystem.
 *
 * Limitações conhecidas (Task 2 — TDD preflight):
 * - Não valida anchors (#secao) - apenas paths
 * - Não valida links para arquivos fora de docsRoot
 * - Apenas formato markdown link: [texto](path)
 * - Pula refs dentro de fenced code blocks (``` ``` e ~~~ ~~~) e inline
 *   code (` `) para evitar falsos positivos com código TypeScript/grep
 *   que contém `[X](Y)` por coincidência.
 */
export async function checkDocRefs(opts: { docsRoot: string }): Promise<CheckResult> {
  const errors: string[] = [];
  const root = path.resolve(opts.docsRoot);

  async function validateFile(file: string): Promise<void> {
    const raw = await fs.readFile(file, 'utf-8');
    // Exibe o caminho incluindo o basename do docsRoot para facilitar
    // localização do erro (ex.: `docs/foo.md` em vez de `foo.md`).
    const rel = path.relative(path.dirname(root), file);

    // Strip conteúdo que não deve ser interpretado como markdown link
    // para evitar falsos positivos com sintaxe `[X](Y)` que aparece
    // naturalmente em código TypeScript/grep/regex/etc.
    //
    // IMPORTANTE: processar fenced code blocks linha-a-linha, rastreando
    // se estamos dentro de um bloco. Regex global com `[\s\S]*?` falha
    // quando o markdown contém code blocks aninhados dentro de outros
    // code blocks (ex.: bloco ```markdown que mostra ```bash).
    const lines = raw.split('\n');
    const filtered: string[] = [];
    let inFence = false;
    let fenceMarker = '';
    for (const line of lines) {
      const trimmed = line.trimStart();
      // Detecta abertura/fechamento de fenced code block (``` ou ~~~).
      if (!inFence) {
        if (/^```/.test(trimmed) || /^~~~/.test(trimmed)) {
          inFence = true;
          fenceMarker = trimmed.slice(0, 3);
          continue;
        }
      } else {
        // Dentro de um fence: linha que contém só o marker fecha o bloco.
        if (trimmed.startsWith(fenceMarker) && trimmed.replace(/[`~]/g, '') === '') {
          inFence = false;
          fenceMarker = '';
          continue;
        }
        // Linha dentro do fence: descartar.
        continue;
      }
      // Indented code blocks (4+ espaços ou tab no início da linha)
      if (/^( {4,}|\t)/.test(line)) {
        continue;
      }
      filtered.push(line);
    }
    let content = filtered.join('\n');

    // Inline code spans `código`
    content = content.replace(/`[^`\n]+`/g, '');

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
