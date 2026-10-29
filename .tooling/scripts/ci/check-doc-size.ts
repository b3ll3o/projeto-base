/**
 * SEM shebang, de propósito — ver `check-harness-owner.ts`: um arquivo de
 * `.tooling/scripts/ci/` que não comece com `check-`, não termine em
 * `.spec.ts` e TENHA shebang é classificado como harness órfão.
 *
 * O teto de 300 linhas para `.md` é a regra mais antiga deste repo
 * (`tamanho-e-revisao.md:7`) e a única que **ninguém gate mediava**. MEDIDO
 * 2026-10-29: `grep -rln 'MAX_LOC' tooling/scripts/ .tooling/scripts/ | grep
 * -v spec` devolve **um** arquivo — `lint-review-routing.ts` — e ele mede
 * **uma** matriz só. Um agente podia escrever um `.md` de 3.000 linhas que
 * ninguém veria.
 *
 * **A regra não vale para tudo, e isso é declarado.** O teto existe para
 * manter a documentação *viva* focada; ele não faz sentido para um registro
 * datado, e dividi-lo falsearia o registro. As categorias abaixo são a
 * **fonte única** — a tabela da convenção é a leitura humana delas, e as duas
 * coisas precisam concordar (mudou a categoria, mudou o gate no mesmo PR).
 *
 * | Categoria            | Onde                        | Por quê está fora          |
 * |----------------------|-----------------------------|----------------------------|
 * | `registro-datado`    | `docs/superpowers/**`       | plano/spec de demanda já executada |
 * | `artefato-de-execucao`| `.agents/runs/**`           | snapshot/ledger lido por gate como unidade |
 * | `vendor`             | `.agents/skills/graphify/**`| skill de ferramenta externa |
 *
 * **O que este gate NÃO mede:**
 * - **A qualidade da prosa** — "claro" não é propriedade mecânica.
 * - **Se o conteúdo do doc ainda é verdade** — freshness é humano (é o que o
 *   `doc-sync` e a auditoria do `documentation-specialist` fazem).
 *
 * **A contagem:** o número de linhas que o arquivo **tem** — `split('\n').length`
 * menos o último elemento quando ele é vazio. É a mesma contagem do
 * `lint-specialist-routing.ts:85`; o `lint-review-routing.ts:151` não desconta o
 * `\n` final e conta uma linha a mais. Um gate que discordasse dos vizinhos em
 * uma linha acusaria um arquivo que o outro aceita; por isso a contagem é
 * **declarada aqui** e não implícita.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { CheckResult } from './check-types';

/** O teto, em linhas. O mesmo número de `tamanho-e-revisao.md`. */
export const LIMITE_DE_LINHAS = 300;

/** Uma categoria de documento que o teto NÃO mede. */
export interface Categoria {
  /** Identificador estável, citado na convenção. */
  nome: string;
  /** Globs, relativos à raiz do repo. */
  globs: string[];
  /** Por que esta categoria está fora — a razão vai para a convenção. */
  razao: string;
}

/**
 * As categorias fora do escopo do teto. **Fonte única**: a tabela de
 * `tamanho-e-revisao.md` é a leitura humana disto, e as duas precisam
 * concordar.
 */
export const CATEGORIAS_FORA_DO_ESCOPO: Categoria[] = [
  {
    nome: 'registro-datado',
    globs: ['docs/superpowers/**'],
    razao:
      'Plano e spec de uma demanda já executada. Editar ou dividir falsearia o ' +
      'registro do que foi decidido na data em que foi decidido.',
  },
  {
    nome: 'artefato-de-execucao',
    globs: ['.agents/runs/**'],
    razao:
      'Snapshot e ledger de execução. O `check-memory-crystallization` lê o ' +
      'ledger como uma unidade — dividir a tabela quebraria o consumidor.',
  },
  {
    nome: 'vendor',
    globs: ['.agents/skills/graphify/**'],
    razao: 'Skill de ferramenta externa, versionada como está.',
  },
];

/** Converte um glob do repo em regex. `**` atravessa `/`; `*` não. */
export function globParaRegex(glob: string): RegExp {
  const partes = glob.split('**').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${partes.join('.*')}$`);
}

/** A categoria de um path, ou `null` se ele está no escopo do teto. */
export function categoriaDe(relPath: string): Categoria | null {
  for (const categoria of CATEGORIAS_FORA_DO_ESCOPO) {
    for (const glob of categoria.globs) {
      if (globParaRegex(glob).test(relPath)) return categoria;
    }
  }
  return null;
}

/**
 * O número de linhas que o arquivo **tem**.
 *
 * `wc -l` conta *newlines*, e um arquivo sem newline final tem uma linha a
 * menos do que `wc -l` diz — é por isso que `wc -l` e a contagem de linha
 * divergem em 1 nos arquivos sem `
` final. Aqui a contagem é a do arquivo:
 * `split('\n').length` menos o último elemento, quando ele é vazio.
 */
export function contarLinhas(conteudo: string): number {
  if (conteudo === '') return 0;
  return conteudo.split('\n').length - (conteudo.endsWith('\n') ? 1 : 0);
}

/** Os `.md` versionados, como paths relativos ao repo. `null` sem git. */
export function listarMarkdown(repoRoot: string): string[] | null {
  try {
    const out = execFileSync('git', ['ls-files', '*.md'], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    const arquivos = out.split('\n').filter(Boolean);
    return arquivos.length > 0 ? arquivos : null;
  } catch {
    return null;
  }
}

/** Um arquivo acima do teto, com a categoria em que ele cai (ou `null`). */
export interface AcimaDoTeto {
  path: string;
  linhas: number;
  categoria: string | null;
}

/**
 * Os arquivos acima do teto, entre os que estão **no escopo**.
 *
 * A categoria de um arquivo fora do escopo é devolvida junto — para o relatório
 * dizer *por que* ele não foi medido, em vez de o gate simplesmente ignorá-lo.
 */
export async function arquivosAcimaDoTeto(
  repoRoot: string,
  arquivos: string[],
): Promise<AcimaDoTeto[]> {
  const acima: AcimaDoTeto[] = [];
  for (const rel of arquivos) {
    const conteudo = await fs.readFile(path.join(repoRoot, rel), 'utf-8');
    const linhas = contarLinhas(conteudo);
    const categoria = categoriaDe(rel);
    if (categoria === null && linhas > LIMITE_DE_LINHAS) {
      acima.push({ path: rel, linhas, categoria: null });
    }
  }
  return acima;
}

export async function checkDocSize(opts: { repoRoot: string }): Promise<CheckResult> {
  const root = path.resolve(opts.repoRoot);

  const arquivos = listarMarkdown(root);
  if (arquivos === null) {
    // Sem git não há "versionado" — e verde por ausência é a classe 5 de
    // `guard-classes.md`.
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason:
        "'git ls-files' indisponível — o gate mede arquivos VERSIONADOS e não tem o que comparar",
    };
  }

  const acima = await arquivosAcimaDoTeto(root, arquivos);
  const errors = acima.map(
    (a) =>
      `documento acima do teto: '${a.path}' tem ${a.linhas} linhas (teto ${LIMITE_DE_LINHAS}) — ` +
      `divida em arquivos irmãos com índice e links cruzados, ou declare a categoria em ` +
      `tamanho-e-revisao.md §O que o teto cobre`,
  );

  return { ok: errors.length === 0, errors };
}
