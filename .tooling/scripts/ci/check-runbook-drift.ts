/**
 * SEM shebang, de propósito.
 *
 * `docs/como-rodar.md` é o mapa de execução por ambiente. Ele envelhece sem
 * aviso: um script sai do `package.json`, uma chave de env some do
 * `.env.example`, e o runbook segue mandando o leitor copiar um comando que não
 * existe mais. Nenhum gate cobria isso — `check-doc-refs` só checa se o arquivo
 * é citado, não se o que ele diz ainda é verdade.
 *
 * Duas classes de claim, as duas verificáveis sem executar nada:
 *
 * 1. **Comandos** — todo `pnpm <script>` que o runbook manda copiar tem que
 *    existir como script em algum `package.json` do workspace.
 * 2. **Chaves de env** — toda chave da tabela "Variáveis de ambiente" tem que
 *    existir em algum `.env.example` / `.env.production.example` do repo.
 *
 * Uma classe que não tem como ser medida é declarada `skipped` COM MOTIVO, nunca
 * `ok: true` silencioso (classe 5 de guard-classes.md).
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CheckResult } from './check-types';

/** `pnpm exec X`, `pnpm --filter P X`, `pnpm turbo run X` — o token seguinte NÃO é script da raiz. */
const FORMAS_NAO_SCRIPT = new Set(['exec', 'turbo', 'dlx', 'create', 'add', 'remove', 'install']);

/**
 * Conteúdo dos blocos cercados (``` ... ```), com a indentação removida.
 *
 * Só bloco de código é comando copiável. MEDIDO 2026-10-16: varrer o doc
 * inteiro acusou 5 falsos positivos no runbook real — "pnpm nativo" (título de
 * seção), "pnpm responde" (prosa), "workspace pnpm as deps" (frase), e as
 * referências a `pnpm prune`/`pnpm deploy` da seção de diagnóstico. Gate
 * vermelho em repo correto treina o descaso com o gate.
 */
function blocosDeCodigo(doc: string): string[] {
  const out: string[] = [];
  const linhas = doc.split('\n');
  let dentro = false;
  let buffer: string[] = [];
  for (const linha of linhas) {
    if (/^\s*```/.test(linha)) {
      if (dentro) {
        out.push(buffer.join('\n'));
        buffer = [];
      }
      dentro = !dentro;
      continue;
    }
    if (dentro) buffer.push(linha.replace(/^\s{0,3}/, ''));
  }
  return out;
}

/**
 * Scripts `pnpm <nome>` citados nos blocos de código do doc. Devolve nomes
 * únicos, na ordem em que o leitor encontra.
 */
export function extrairScriptsPnpm(doc: string): string[] {
  const out: string[] = [];
  for (const bloco of blocosDeCodigo(doc)) {
    for (const m of bloco.matchAll(/\bpnpm\s+(--?[\w-]+|[\w:.-]+)/g)) {
      const token = m[1]!;
      if (token.startsWith('-')) continue; // flag: `--filter`, `--version`
      if (FORMAS_NAO_SCRIPT.has(token)) continue; // subcomando do pnpm, não script
      if (!out.includes(token)) out.push(token);
    }
  }
  return out;
}

/** Chaves da tabela "Variáveis de ambiente": a primeira coluna de uma linha `| \`KEY\` | ...`. */
export function extrairChavesEnv(doc: string): string[] {
  const out: string[] = [];
  for (const linha of doc.split('\n')) {
    const m = linha.match(/^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/);
    if (m && !out.includes(m[1]!)) out.push(m[1]!);
  }
  return out;
}

interface PackageJson {
  scripts?: Record<string, string>;
}

async function lerJson(p: string): Promise<PackageJson | null> {
  try {
    return JSON.parse(await fs.readFile(p, 'utf-8')) as PackageJson;
  } catch {
    return null;
  }
}

/** Scripts de todos os `package.json` do workspace (raiz + `apps/*` + `packages/*`). */
async function scriptsDoWorkspace(repoRoot: string): Promise<Set<string>> {
  const out = new Set<string>();
  const raiz = await lerJson(path.join(repoRoot, 'package.json'));
  for (const s of Object.keys(raiz?.scripts ?? {})) out.add(s);
  for (const grupo of ['apps', 'packages']) {
    let entradas: import('node:fs').Dirent[];
    try {
      entradas = await fs.readdir(path.join(repoRoot, grupo), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entradas) {
      if (!e.isDirectory()) continue;
      const pkg = await lerJson(path.join(repoRoot, grupo, e.name, 'package.json'));
      for (const s of Object.keys(pkg?.scripts ?? {})) out.add(s);
    }
  }
  return out;
}

/** Chaves declaradas em qualquer `.env.example` / `.env.production.example` do repo. */
async function chavesDeEnvExample(repoRoot: string): Promise<Set<string>> {
  const out = new Set<string>();
  const candidatos = [
    '.env.example',
    '.env.production.example',
    'apps/api/.env.example',
    'apps/web/.env.example',
  ];
  for (const rel of candidatos) {
    try {
      const raw = await fs.readFile(path.join(repoRoot, rel), 'utf-8');
      for (const linha of raw.split('\n')) {
        const m = linha.match(/^([A-Z][A-Z0-9_]*)=/);
        if (m) out.add(m[1]!);
      }
    } catch {
      // arquivo ausente: segue para o próximo
    }
  }
  return out;
}

export async function checkRunbookDrift(opts: {
  repoRoot: string;
  docPath?: string;
}): Promise<CheckResult> {
  const root = path.resolve(opts.repoRoot);
  const docPath = opts.docPath ?? path.join(root, 'docs/como-rodar.md');

  let doc: string;
  try {
    doc = await fs.readFile(docPath, 'utf-8');
  } catch {
    // Template sem runbook não é erro — é ausência do que julgar. `skipped` COM
    // MOTIVO: verde por ausência é a classe 5 de guard-classes.md.
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `runbook ausente: '${path.relative(root, docPath)}' — gate não tem o que comparar`,
    };
  }

  const errors: string[] = [];
  const scripts = await scriptsDoWorkspace(root);
  for (const s of extrairScriptsPnpm(doc)) {
    if (!scripts.has(s)) {
      errors.push(
        `runbook desatualizado: o doc manda rodar 'pnpm ${s}' mas nenhum package.json do ` +
          `workspace define o script '${s}' — corrija o runbook ou restaure o script`,
      );
    }
  }

  const envExamples = await chavesDeEnvExample(root);
  if (envExamples.size > 0) {
    for (const k of extrairChavesEnv(doc)) {
      if (!envExamples.has(k)) {
        errors.push(
          `runbook desatualizado: a tabela de variáveis cita '${k}' mas essa chave não está em ` +
            `nenhum .env.example do repo — corrija o runbook ou o exemplo`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
