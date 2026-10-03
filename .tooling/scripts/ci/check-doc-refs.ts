import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CheckResult } from './check-types';

/**
 * Valida que links relativos em arquivos markdown (.md) apontam para arquivos
 * existentes no filesystem.
 *
 * Escopo (F2-T2): por padrão valida **todo `.md` versionado** sob `docsRoot`
 * (`git ls-files '*.md'`). Sem git disponível — ou fora de um repo — cai no
 * `walk` dos diretorios em `docsRoots` (ou de `docsRoot`), **avisando**:
 * um gate cujo escopo encolhe em silêncio é exatamente a falha que este
 * check existe para eliminar.
 *
 * Limitações conhecidas (Task 2 — TDD preflight):
 * - Não valida anchors (#secao) - apenas paths
 * - Não valida links para arquivos fora do repo
 * - Apenas formato markdown link: [texto](path)
 * - Pula refs dentro de fenced code blocks (``` ``` e ~~~ ~~~) e mascara
 *   refs dentro de inline code (` `) para evitar falsos positivos com
 *   código TypeScript/grep que contém `[X](Y)` por coincidência.
 */

/** Diretórios que nunca contêm documentação versionada válida. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', '.next', '.turbo']);

/**
 * Targets que NÃO são caminhos resolvíveis: placeholders de template,
 * artefatos que a própria convenção manda gerar depois, e memória do agent
 * que vive fora do repo.
 *
 * Chaveado por **substring do target**, nunca por arquivo: um link novo
 * quebrado no mesmo arquivo continua sendo pego. Allowlist por arquivo
 * instala falso negativo permanente e silencioso.
 */
const TARGET_ALLOWLIST: RegExp[] = [
  /^\.\.?\/evals\//, // .agents/specs/templates/** — saída da convenção evals
  /^\.\/contracts\//, // placeholder de template
  /^\.\/(plan|tasks)\.md$/, // placeholders de template
  /^\.\.\/\.\.\/\.\.\/docs\/(domain|architecture)\//, // docs gerados
];

function isAllowlisted(target: string): boolean {
  return TARGET_ALLOWLIST.some((re) => re.test(target));
}

export async function checkDocRefs(opts: {
  docsRoot: string;
  docsRoots?: string[];
}): Promise<CheckResult> {
  const errors: string[] = [];
  const root = path.resolve(opts.docsRoot);
  const declared = opts.docsRoots?.length ? opts.docsRoots : [opts.docsRoot];

  async function validateFile(file: string, base: string): Promise<void> {
    const raw = await fs.readFile(file, 'utf-8');
    // Exibe o caminho incluindo o basename da raiz para facilitar
    // localização do erro (ex.: `docs/foo.md` em vez de `foo.md`).
    const rel = path.relative(base, file);

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

    // Inline code `código` — MASCARADO (preserva offset), nao removido.
    // Remover quebrava o offset e fazia um link cujo label é 100% inline-code
    // colapsar para `[]()`, que nunca casa com /\[([^\]]+)\]/ (label 1+ char):
    // o gate reportava verde sobre um link quebrado.
    content = content.replace(/`[^`\n]+`/g, (s) => ' '.repeat(s.length));

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
      if (isAllowlisted(filePath)) continue;
      const resolved = path.resolve(path.dirname(file), filePath);
      try {
        await fs.access(resolved);
      } catch {
        // O texto do link entra no relatorio: num gate que acusa 58 links em
        // 34 arquivos, o trecho que o autor escreveu localiza melhor que o
        // path repetido. `match[1]` pode vir mascarado (inline code) e vazio.
        const label = match[1].trim();
        errors.push(`${rel}: link para '${target}' quebrado${label ? ` (texto: "${label}")` : ''}`);
      }
    }
  }

  async function walk(dir: string, base: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(full, base);
      } else if (entry.name.endsWith('.md')) {
        await validateFile(full, base);
      }
    }
  }

  /**
   * Lista os `.md` versionados sob `dir`. Retorna `null` quando o git não
   * está disponível ou `dir` não está dentro de um repo — o caller então
   * **avisa** e cai no `walk`.
   */
  async function collectVersioned(dir: string): Promise<string[] | null> {
    try {
      const { execFileSync } = await import('node:child_process');
      const out = execFileSync('git', ['ls-files', '*.md'], { cwd: dir, encoding: 'utf8' });
      const files = out
        .split('\n')
        .filter(Boolean)
        .map((f) => path.resolve(dir, f));
      return files.length > 0 ? files : null;
    } catch {
      return null;
    }
  }

  const versioned = await collectVersioned(root);
  if (versioned) {
    for (const file of versioned) {
      try {
        await validateFile(file, root);
      } catch (err) {
        errors.push(`não foi possível ler '${file}': ${err}`);
      }
    }
  } else {
    console.warn(
      `[checkDocRefs] AVISO: 'git ls-files' indisponível em '${root}'. O escopo caiu ` +
        `para o walk de ${declared.length} raiz(es) — links em .md não versionados ` +
        `NÃO serão verificados. Um gate que encolhe em silêncio é pior que nenhum gate.`,
    );
    for (const dir of declared) {
      const abs = path.resolve(dir);
      try {
        await walk(abs, path.dirname(abs));
      } catch (err) {
        errors.push(`docsRoot '${dir}' não existe ou não é acessível: ${err}`);
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
