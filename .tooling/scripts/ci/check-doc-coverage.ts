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
 *
 * ## O path que este gate mede é o do ARQUIVO, não o da URL
 *
 * A rota do catálogo é medida por **menção do path relativo do arquivo**
 * (`apps/web/app/admin/flags/page.tsx`), e não por derivação da URL. A
 * razão é do próprio App Router: derivar a URL da estrutura de diretórios
 * quebra em route groups `(x)`, slots paralelos `@x` e intercepting routes.
 * MEDIDO 2026-10-29 em `normalizeAppPath` (`vercel/next.js`): tanto
 * `isGroupSegment(segment)` quanto `segment[0] === '@'` são ignorados na
 * URL.
 *
 * A consequência é que o path de uma rota dentro de um route group **carrega
 * o grupo**: `apps/web/app/(marketing)/inicio/page.tsx` é o path do arquivo,
 * e é ele que o catálogo tem que mencionar. Remover o segmento faria o gate
 * exigir um path que **não existe no disco** — e o catálogo passaria a citar
 * um endereço que nenhum `ls` encontra.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { linhasDoRelato, type CheckResult } from './check-types';

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

/**
 * Diretório de **rota paralela** (`@slot`). A página dentro é renderizada
 * dentro do layout pai, no MESMO segmento de URL — ela não é um endereço
 * próprio, então não é uma rota do catálogo. MEDIDO 2026-10-29 no
 * `normalizeAppPath` do Next.js: `segment[0] === '@'` → o segmento é
 * ignorado na URL.
 *
 * ⚠️ **O outro caso é diferente e é o que dava o bug.** O **route group**
 * `(grupo)` também é ignorado na URL — `isGroupSegment(segment)` no mesmo
 * `normalizeAppPath` — mas a página DENTRO dele **é** uma rota normal:
 * `app/(marketing)/inicio/page.tsx` serve `/inicio`. Um `continue` no grupo
 * escondia a rota do gate inteiro, e ela nunca aparecia no catálogo sem
 * ninguém perceber. MEDIDO 2026-10-29: plantar
 * `apps/web/app/(marketing)/inicio/page.tsx` deixava o gate verde
 * (`ok=true, errors=0`).
 */
const SEGMENTO_DE_SLOT = /^@/;

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
        // Só o slot paralelo é pulado. O route group (grupo) é DESCIDO: a
        // página dentro dele é uma rota (só o segmento do grupo não vai
        // para a URL).
        if (SEGMENTO_DE_SLOT.test(e.name)) continue; // @slot
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
 * Colunas da tabela de exceções, por NOME (nunca por índice).
 *
 * A mesma doutrina de `check-test-set-covered.ts` (que lê `tdd.md`): índice
 * funciona até alguém reordenar a tabela, e aí falha cobrindo exatamente a
 * forma que existe hoje — a classe 2 com outro nome.
 */
export const COLS_EXCECAO = ['Unidade', 'Motivo'] as const;

/** A convenção que declara as exceções — a única fonte. */
export const CONVENCAO = '.agents/specs/conventions/documentacao.md';

/**
 * Lê a tabela de exceções da convenção.
 *
 * Devolve `unidade → motivo`. A unidade é o **caminho da unidade de código**
 * (o mesmo que a matriz §3 nomeia), e o motivo é texto livre — ele é o que
 * torna a exceção **declarada** em vez de silenciosa.
 *
 * A tabela é procurada pelo **heading** (§"Exceções declaradas"), e as
 * colunas são lidas por NOME. Uma tabela futura no mesmo arquivo não é lida
 * por acidente.
 */
export function declaracoesDeExcecao(markdown: string): Map<string, string> {
  const out = new Map<string, string>();
  const linhas = markdown.split('\n');
  let dentro = false;
  let colUnidade = -1;
  let colMotivo = -1;

  for (const linha of linhas) {
    if (/^#{2,4}\s/.test(linha)) {
      // Saiu da seção: zera o cabeçalho, senão a tabela seguinte no mesmo
      // arquivo seria lida como se fosse a de exceções.
      dentro = false;
      colUnidade = -1;
      colMotivo = -1;
      if (/exce[çc][õo]es declaradas/i.test(linha)) dentro = true;
      continue;
    }
    if (!dentro) continue;
    if (!linha.trimStart().startsWith('|')) continue;

    const cells = linha.split('|').map((c) => c.trim());
    if (cells[0] === '---' || cells[1] === '---') continue;

    if (colUnidade === -1) {
      colUnidade = cells.indexOf(COLS_EXCECAO[0]);
      colMotivo = cells.indexOf(COLS_EXCECAO[1]);
      if (colUnidade === -1 || colMotivo === -1) {
        colUnidade = -1;
        colMotivo = -1;
      }
      continue;
    }

    const unidade = (cells[colUnidade] ?? '').replace(/`/g, '').trim();
    const motivo = (cells[colMotivo] ?? '').trim();
    // A linha de exemplo da convenção ("(nenhuma)") não é uma unidade.
    if (unidade.length === 0 || unidade.startsWith('(')) continue;
    if (motivo.length === 0) continue;
    out.set(unidade, motivo);
  }

  return out;
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
  /** Exceções declaradas: caminho da unidade → motivo. */
  excecoes?: Map<string, string>;
}): string[] {
  const errors: string[] = [];
  const excecoes = entradas.excecoes ?? new Map<string, string>();
  // Uma exceção declarada que **ainda vale** é a que cobriu uma falta real.
  // Toda outra declarada é documentation lie (a exceção não exclui nada).
  const queValem = new Set<string>();

  for (const bc of entradas.modulos) {
    const unidade = `${RAIZES.modulos}/${bc}`;
    if (!entradas.docsDeBc.has(entradas.docDeBc(bc))) {
      if (excecoes.has(unidade)) {
        queValem.add(unidade);
        continue;
      }
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
          if (excecoes.has(rota)) {
            queValem.add(rota);
            continue;
          }
          errors.push(
            `documentação ausente: a rota '${rota}' não aparece em '${entradas.docDeRotas}'`,
          );
        }
      }
    }
  }

  for (const pkg of entradas.packages) {
    const unidade = `${RAIZES.packages}/${pkg}`;
    if (!entradas.readmesDePackage.has(entradas.readmeDePackage(pkg))) {
      if (excecoes.has(unidade)) {
        queValem.add(unidade);
        continue;
      }
      errors.push(
        `documentação ausente: o package '${RAIZES.packages}/${pkg}' não tem README — crie ` +
          `'${entradas.readmeDePackage(pkg)}' (regra: convenção documentacao.md §3)`,
      );
    }
  }

  // O sentido INVERSO: uma exceção que não exclui nada é documentation lie.
  // Sem esta checagem, a tabela de exceções vira um arquivo de desculpas — e
  // a dívida que ela escondesse deixa de ser visível. Mesmo padrão de
  // `check-test-set-covered.ts` com a `tdd.md`.
  for (const [unidade, motivo] of excecoes) {
    if (queValem.has(unidade)) continue;
    errors.push(
      `exceção declarada que não se aplica: '${unidade}' em ${CONVENCAO} §"Exceções declaradas" ` +
        `— ou a unidade já tem doc canônico, ou deixou de existir. Remova a linha: exceção ` +
        `que não exclui nada é documentation lie. (motivo declarado: ${motivo})`,
    );
  }

  return errors;
}

export async function checkDocCoverage(opts: {
  repoRoot: string;
  /**
   * Exceções declaradas: caminho da unidade → motivo.
   *
   * Quando **omitido**, o gate LÊ a tabela da convenção (§"Exceções
   * declaradas" de `documentacao.md`). O parâmetro existe para o spec
   * plantar uma exceção sem escrever a convenção.
   */
  excecoes?: Map<string, string>;
}): Promise<CheckResult> {
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

  // A tabela de exceções é a **única** fonte das exceções. Sem ela, este
  // gate é teatro — a mesma razão que faz `check-test-set-covered.ts` tratar
  // a `tdd.md` ilegível como erro, e não como "sem exceções".
  let excecoes = opts.excecoes;
  if (excecoes === undefined) {
    try {
      const convencao = await fs.readFile(path.join(root, CONVENCAO), 'utf-8');
      excecoes = declaracoesDeExcecao(convencao);
    } catch (err) {
      return {
        ok: false,
        errors: [
          `não foi possível ler ${CONVENCAO} (${(err as Error).message}) — a tabela de ` +
            'exceções é a única fonte delas, então sem ela este check é teatro',
        ],
      };
    }
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
    excecoes,
  });

  return { ok: errors.length === 0, errors };
}

// Executado como CLI.
//
// MEDIDO 2026-10-29: sem este bloco, `pnpm exec tsx
// .tooling/scripts/ci/check-doc-coverage.ts` devolvia `exit 0` e **nenhuma
// saída** — com uma rota plantada no repo real E com o doc de um BC
// removido. O gate só media alguma coisa pelo mapa `RUNNERS` do preflight;
// invocado direto, ele não media NADA, e "verde" sem medição é a classe 6 do
// `guard-classes.md`.
//
// `linhasDoRelato`, e não `r.errors`: um `for` sobre `errors` aqui é o que
// mantinha a ressalva invisível neste caminho (ver `check-types.ts`).
if (process.argv[1]?.endsWith('check-doc-coverage.ts')) {
  checkDocCoverage({ repoRoot: '.' }).then((r) => {
    for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
    process.exit(r.ok ? 0 : 1);
  });
}
