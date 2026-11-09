/**
 * SEM shebang, de propósito.
 *
 * Fecha uma lacuna que MEDI em 2026-11-09: nenhum gate do repo media se o
 * **mesmo pacote** é declarado em **versões diferentes** em workspaces
 * diferentes. MEDIDO: 4 pacotes divergiam —
 *
 *   @types/node   ^20.16.0 (raiz, api, web)  x  ^20.11.0 (tooling/scripts)
 *   tsx           ^4.19.0  (raiz)            x  ^4.7.0   (tooling/scripts)
 *   typescript    ^5.6.0   (raiz, api, web, shared-types) x ^5.3.3 (tooling/scripts)
 *   vitest        ^2.1.9   (raiz, api)        x  ^2.1.0   (web)
 *
 * `check-package-json-drift.ts` confere os **scripts**; `check-engines-consistency.ts`
 * confere as **engines**. Nenhum dos dois olha as **versões declaradas**.
 *
 * Por que isso é erro, e não gosto:
 * - O lockfile passa a instalar **duas cópias** do mesmo pacote. O
 *   `check-bloco-duplicado` mede código duplicado no repo, NÃO dependências
 *   duplicadas no `node_modules` — o furo é real.
 * - O `typecheck` de cada app roda contra a versão que ele declarou, e o
 *   `lint` da raiz contra a outra. Dois TypeScript diferentes no mesmo
 *   repositório produzem diagnósticos que não reproduzem no CI.
 * - Um comportamento observável numa versão de lib e não na outra é um
 *   bug que só aparece na máquina de quem rodou.
 *
 * A regra: o mesmo pacote, declarado em 2+ `package.json` do workspace, tem
 * que ter a **mesma faixa de versão** em todos — salvo uma **exceção
 * declarada** num arquivo versionado, com o motivo.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { type CheckResult, linhasDoRelato } from './check-types';

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

/** Um pacote declarado em mais de um lugar, com as faixas que aparecem. */
export interface Divergencia {
  pacote: string;
  /** Faixa de versão -> arquivos que a declaram. */
  porFaixa: Record<string, string[]>;
}

/** Uma exceção declarada: pacote + a faixa que pode divergir + o motivo. */
export interface ExcecaoDeclarada {
  pacote: string;
  /** A faixa que é permitida divergir das outras. */
  faixa: string;
  /** Por que a divergência é intencional. */
  motivo: string;
}

/** Os workspaces varridos: a raiz, `apps/*`, `packages/*` e `tooling/*`. */
export const DIRETORIOS_WORKSPACE = ['apps', 'packages', 'tooling'];

/**
 * Extrai as versões declaradas de um `package.json`.
 *
 * `workspace:` é ignorado de propósito: a spec `workspace:*` não é uma
 * versão — é um link interno, e todo workspace linkado tem o mesmo valor.
 */
export function versoesDeclaradas(pkg: PackageJson): Map<string, string> {
  const out = new Map<string, string>();
  for (const secao of ['dependencies', 'devDependencies'] as const) {
    for (const [nome, spec] of Object.entries(pkg[secao] ?? {})) {
      if (typeof spec !== 'string') continue;
      if (spec.startsWith('workspace:')) continue;
      out.set(nome, spec);
    }
  }
  return out;
}

/**
 * Agrupa as declarações por pacote e devolve só os que têm **mais de uma
 * faixa** — ou seja, os que divergem de verdade.
 */
export function acharDivergencias(
  porArquivo: { arquivo: string; versoes: Map<string, string> }[],
): Divergencia[] {
  const agrupado = new Map<string, Map<string, string[]>>();
  for (const { arquivo, versoes } of porArquivo) {
    for (const [pacote, faixa] of versoes) {
      const faixas = agrupado.get(pacote) ?? new Map<string, string[]>();
      const arquivos = faixas.get(faixa) ?? [];
      arquivos.push(arquivo);
      faixas.set(faixa, arquivos);
      agrupado.set(pacote, faixas);
    }
  }

  const divergencias: Divergencia[] = [];
  for (const [pacote, faixas] of agrupado) {
    if (faixas.size < 2) continue;
    const porFaixa: Record<string, string[]> = {};
    for (const [faixa, arquivos] of faixas) {
      porFaixa[faixa] = [...arquivos].sort();
    }
    divergencias.push({ pacote, porFaixa });
  }
  return divergencias.sort((a, b) => a.pacote.localeCompare(b.pacote));
}

/**
 * Uma divergência está **coberta** por uma exceção declarada?
 *
 * A exceção nomeia o pacote e a faixa que pode divergir das outras. Se as
 * faixas declaradas forem exatamente {excecao.faixa, ...outras}, a divergência
 * foi autorizada. Uma exceção que não corresponde a nenhuma divergência real
 * é reportada como **envelhecida** — a exceção ficou para trás da mudança que
 * ela autorizava, e isso é um defeito (a lista mente).
 */
export function divergenciaCoberta(
  divergencia: Divergencia,
  excecoes: ExcecaoDeclarada[],
): boolean {
  return excecoes.some(
    (e) => e.pacote === divergencia.pacote && Object.hasOwn(divergencia.porFaixa, e.faixa),
  );
}

/** O arquivo de exceções, versionado, ao lado do gate. */
export const ARQUIVO_EXECOES = path.join(
  '.tooling',
  'scripts',
  'ci',
  'excecoes-de-dependencias-drift.json',
);

/** Lê as exceções declaradas. Arquivo ausente = nenhuma exceção. */
export async function lerExcecoes(repoRoot: string): Promise<ExcecaoDeclarada[]> {
  try {
    const raw = await fs.readFile(path.join(repoRoot, ARQUIVO_EXECOES), 'utf-8');
    const dados = JSON.parse(raw) as { excecoes?: ExcecaoDeclarada[] };
    return dados.excecoes ?? [];
  } catch {
    return [];
  }
}

/** Lista os `package.json` do workspace: a raiz e os workspaces aninhados. */
export async function listarPackageJsons(repoRoot: string): Promise<string[]> {
  const out: string[] = ['package.json'];
  for (const dir of DIRETORIOS_WORKSPACE) {
    let entradas: import('node:fs').Dirent[];
    try {
      entradas = await fs.readdir(path.join(repoRoot, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entradas) {
      if (!e.isDirectory()) continue;
      const rel = path.join(dir, e.name, 'package.json');
      try {
        await fs.access(path.join(repoRoot, rel));
        out.push(rel);
      } catch {
        // o diretório não tem package.json — não é um workspace
      }
    }
  }
  return out.sort();
}

export async function checkDependencyDrift(opts: {
  repoRoot: string;
  packageJsons?: string[];
}): Promise<CheckResult> {
  const errors: string[] = [];
  const advisories: string[] = [];
  const root = path.resolve(opts.repoRoot);

  const arquivos = opts.packageJsons ?? (await listarPackageJsons(root));
  const porArquivo: { arquivo: string; versoes: Map<string, string> }[] = [];

  for (const arquivo of arquivos) {
    try {
      const raw = await fs.readFile(path.join(root, arquivo), 'utf-8');
      const pkg = JSON.parse(raw) as PackageJson;
      porArquivo.push({ arquivo, versoes: versoesDeclaradas(pkg) });
    } catch {
      // Um package.json ilegível é problema do repo, e outros gates cobrem
      // (check-package-json-drift). Aqui, seguir sem ele silenciosamente
      // reduziria a cobertura sem avisar — a advisory abaixo registra.
      advisories.push(`'${arquivo}' não pôde ser lido — a cobertura deste gate ficou menor`);
    }
  }

  if (porArquivo.length < 2) {
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `só ${porArquivo.length} package.json legível(vel) — nada a comparar`,
    };
  }

  const excecoes = await lerExcecoes(root);
  const divergencias = acharDivergencias(porArquivo);

  for (const divergencia of divergencias) {
    if (divergenciaCoberta(divergencia, excecoes)) continue;
    const faixas = Object.entries(divergencia.porFaixa)
      .map(([faixa, arqs]) => `'${faixa}' (${arqs.join(', ')})`)
      .join('  x  ');
    errors.push(
      `drift de versão: '${divergencia.pacote}' é declarado com faixas diferentes — ${faixas}. ` +
        `O lockfile instala 2 cópias do pacote e cada app typecheca contra a sua. ` +
        `Alinhe as faixas (declare a exceção em '${ARQUIVO_EXECOES}' se a divergência for intencional).`,
    );
  }

  // Uma exceção que não casa com nenhuma divergência real envelheceu: a
  // mudança que ela autorizava já aconteceu e a lista ficou para trás.
  for (const excecao of excecoes) {
    const existe = divergencias.some((d) => d.pacote === excecao.pacote);
    if (!existe) {
      errors.push(
        `exceção envelhecida: '${excecao.pacote}' ('${excecao.faixa}') está declarada em ` +
          `'${ARQUIVO_EXECOES}', mas não há mais divergência de versão para esse pacote. ` +
          `A exceção authorizes uma divergência que não existe — remova-a.`,
      );
    }
  }

  return { ok: errors.length === 0, errors, advisories };
}

// Executado como CLI.
//
// `check{...}` é **assíncrono**, então o bloco usa `.then()` — o mesmo padrão
// de `check-skill-coverage.ts`. Um `const r = check{...}(...)` sem `await`
// daria `r.ok === undefined` e sairia **1** sempre.
//
// Sem este bloco, rodar o gate pela linha de comando não mede nada: ele
// importa o módulo, não chama a função, e sai **0** — o verde-por-ignorância
// que `guard-classes.md` chama de classe 5. MEDIDO 2026-11-09: as 3 mutações
// que deveriam reprovar este gate passavam com exit 0 por causa deste bloco
// ausente.
if (process.argv[1]?.endsWith('check-dependency-drift.ts')) {
  checkDependencyDrift({ repoRoot: '.' }).then((r) => {
    for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
    process.exit(r.ok ? 0 : 1);
  });
}
