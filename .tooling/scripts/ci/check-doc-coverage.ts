/**
 * SEM shebang, de propósito — ver `check-harness-owner.ts`: um arquivo de
 * `.tooling/scripts/ci/` que não comece com `check-`, não termine em
 * `.spec.ts` e TENHA shebang é classificado como harness órfão.
 *
 * A regra "documentação é parte do código" (`documentacao.md` §3) não tinha
 * instrumento. MEDIDO 2026-10-29: `apps/api/src/modules/` tem 6 bounded
 * contexts e `docs/api/` tem 2 docs — `feature-flags`, `health`, `profiles` e
 * `tenancy` não têm NENHUMA referência, e nada reprovava. O `doc-sync` não
 * cobre: o mapeamento dele é uma lista de 5 caminhos hardcoded
 * (`tooling/scripts/doc-sync.ts:68-112`), e nenhum deles é genérico — um
 * módulo novo não gera ação, não gera alerta, não sai vermelho.
 *
 * Este gate mede **cobertura**: existe um doc canônico para cada unidade de
 * código da matriz da convenção?
 *
 *   | Unidade                        | Doc canônico                    |
 *   |--------------------------------|---------------------------------|
 *   | BC `apps/api/src/modules/<bc>` | `docs/api/<bc>.md`              |
 *   | Rota `apps/web/app/**`         | `docs/web/rotas.md` (catálogo)  |
 *   | Package `packages/<pkg>`       | `packages/<pkg>/README.md`      |
 *
 * **O que este gate NÃO mede** (e é humano):
 * - **Frescor.** O gate vê se o doc EXISTE, não se ele ainda diz a verdade.
 *   Um doc que descreve um endpoint removido continua "coberto".
 * - **Qualidade da prosa.** "Claro" não é propriedade mecânica.
 * - **O tamanho do doc.** O teto de 300 linhas é de `tamanho-e-revisao.md` e
 *   vive na auditoria (skill `documentation-audit`), não aqui.
 *
 * Dizer que este gate cobre frescor seria a classe 1 de `guard-classes.md` —
 * condição inalcançável.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CheckResult } from './check-types';

/** Onde vive o doc de referência de um bounded context do backend. */
export const DOC_DE_BC = (bc: string): string => path.join('docs', 'api', `${bc}.md`);

/** Catálogo de rotas do frontend. */
export const DOC_DE_ROTAS = 'docs/web/rotas.md';

/** README canônico de um package do workspace. */
export const README_DE_PACKAGE = (pkg: string): string => path.join('packages', pkg, 'README.md');

/** Raízes que o gate lê, relativas à raiz do repo. */
export const RAIZES = {
  modulos: path.join('apps', 'api', 'src', 'modules'),
  rotas: path.join('apps', 'web', 'app'),
  packages: 'packages',
} as const;

/** Subdiretórios que nunca são um BC (infraestrutura dentro de `modules/`). */
const IGNORADOS_NA_MODULOS = new Set(['__tests__', 'shared']);

/** Extensões que são uma rota do App Router. `layout.tsx` não é rota. */
const ARQUIVOS_DE_ROTA = ['page.tsx', 'route.ts'];

/** Nomes de diretório que o App Router não materializa como URL. */
const SEGMENTOS_NAO_ROTA = /^[()@]/;

async function existe(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** Diretórios de bounded context: `apps/api/src/modules/<bc>/`. */
export async function listarModulos(repoRoot: string): Promise<string[]> {
  const base = path.join(repoRoot, RAIZES.modulos);
  try {
    const entradas = await fs.readdir(base, { withFileTypes: true });
    return entradas
      .filter(
        (e) => e.isDirectory() && !IGNORADOS_NA_MODULOS.has(e.name) && !e.name.startsWith('.'),
      )
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** Arquivos de rota do App Router, como path relativo ao repo. */
export async function listarRotas(repoRoot: string): Promise<string[]> {
  const base = path.join(repoRoot, RAIZES.rotas);
  const achados: string[] = [];

  async function andar(dir: string): Promise<void> {
    let entradas: import('node:fs').Dirent[];
    try {
      entradas = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entradas) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (SEGMENTOS_NAO_ROTA.test(e.name)) continue; // (grupo), @slot
        await andar(full);
        continue;
      }
      if (ARQUIVOS_DE_ROTA.includes(e.name)) {
        achados.push(path.relative(repoRoot, full).split(path.sep).join('/'));
      }
    }
  }

  await andar(base);
  return achados.sort();
}

/** Packages do workspace: `packages/<pkg>/`. */
export async function listarPackages(repoRoot: string): Promise<string[]> {
  const base = path.join(repoRoot, RAIZES.packages);
  try {
    const entradas = await fs.readdir(base, { withFileTypes: true });
    return entradas
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/**
 * Uma linha do gate: falta doc para esta unidade?
 *
 * A rota é medida por **menção do path** no catálogo — o gate pergunta "o
 * catálogo conhece este arquivo?", não "o catálogo descreve a rota". A segunda
 * é judging editorial; a primeira é mecânica.
 */
export function coberturaFaltando(entradas: {
  modulos: string[];
  rotas: string[];
  packages: string[];
  /** Docs de BC que EXISTEM em disco, como path relativo ao repo. */
  docsDeBc: Set<string>;
  docDeBc: (bc: string) => string;
  docDeRotas: string;
  docDeRotasExiste: boolean;
  catalogoDeRotas: string;
  /** READMEs que EXISTEM em disco, como path relativo ao repo. */
  readmesDePackage: Set<string>;
  readmeDePackage: (pkg: string) => string;
}): string[] {
  const errors: string[] = [];

  for (const bc of entradas.modulos) {
    if (!entradas.docsDeBc.has(entradas.docDeBc(bc))) {
      errors.push(
        `documentação ausente: o bounded context '${bc}' (${RAIZES.modulos}/${bc}/) não tem ` +
          `doc canônico — crie '${entradas.docDeBc(bc)}' (regra: convenção documentacao.md §3)`,
      );
    }
  }

  if (entradas.rotas.length > 0) {
    if (!entradas.docDeRotasExiste) {
      errors.push(
        `documentação ausente: o catálogo de rotas '${entradas.docDeRotas}' não existe, e há ` +
          `${entradas.rotas.length} rota(s) do App Router para documentar`,
      );
    } else {
      for (const rota of entradas.rotas) {
        if (!entradas.catalogoDeRotas.includes(rota)) {
          errors.push(
            `documentação ausente: a rota '${rota}' não aparece em '${entradas.docDeRotas}'`,
          );
        }
      }
    }
  }

  for (const pkg of entradas.packages) {
    if (!entradas.readmesDePackage.has(entradas.readmeDePackage(pkg))) {
      errors.push(
        `documentação ausente: o package '${RAIZES.packages}/${pkg}' não tem README — crie ` +
          `'${entradas.readmeDePackage(pkg)}' (regra: convenção documentacao.md §3)`,
      );
    }
  }

  return errors;
}

export async function checkDocCoverage(opts: { repoRoot: string }): Promise<CheckResult> {
  const root = path.resolve(opts.repoRoot);

  const modulos = await listarModulos(root);
  const rotas = await listarRotas(root);
  const packages = await listarPackages(root);

  // Corpus vazio = o gate não tem o que medir. `skipped` COM MOTIVO, nunca
  // verde por ausência (classe 5 de `guard-classes.md`).
  if (modulos.length === 0 && rotas.length === 0 && packages.length === 0) {
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason:
        `nenhuma unidade de código encontrada em '${RAIZES.modulos}', '${RAIZES.rotas}' ou ` +
        `'${RAIZES.packages}' — gate não tem o que comparar`,
    };
  }

  const docDeBcExiste = new Set<string>();
  for (const bc of modulos) {
    const rel = DOC_DE_BC(bc);
    if (await existe(path.join(root, rel))) docDeBcExiste.add(rel);
  }

  const docDeRotas = DOC_DE_ROTAS;
  const docDeRotasExiste = await existe(path.join(root, docDeRotas));
  const catalogoDeRotas = docDeRotasExiste
    ? await fs.readFile(path.join(root, docDeRotas), 'utf-8')
    : '';

  const readmeDePackageExiste = new Set<string>();
  for (const pkg of packages) {
    const rel = README_DE_PACKAGE(pkg);
    if (await existe(path.join(root, rel))) readmeDePackageExiste.add(rel);
  }

  const errors = coberturaFaltando({
    modulos,
    rotas,
    packages,
    docsDeBc: docDeBcExiste,
    docDeBc: DOC_DE_BC,
    docDeRotas,
    docDeRotasExiste,
    catalogoDeRotas,
    readmesDePackage: readmeDePackageExiste,
    readmeDePackage: README_DE_PACKAGE,
  });

  return { ok: errors.length === 0, errors };
}
