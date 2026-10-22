// tooling/scripts/analisa-repeticao.ts
//
// pt-BR: mede os literais de texto que se REPETEM em vários arquivos.
//
// Exit: 0 = ok (é um analisador, não um gate), 1 = erro inesperado.
//
// ── POR QUE ESTA FERRAMENTA EXISTE ──────────────────────────────────────────
//
// MEDIDO 2026-10-22 (PR #116): renomear o perfil `dono` → `gerente` tocou
// **14 arquivos** — o catálogo, o repositório, o caso de uso, as portas, o
// schema, a assinatura da membership e N specs. E o nome estava **hardcoded**
// em cada um deles.
//
// O termo de domínio tem UM DONO, e quem usa deveria IMPORTAR o dono. Onde o
// dono já existe (`permissions-catalog.ts`, `perfis-da-empresa.ts`, o catálogo
// de feature flags), o problema não é falta de enum: é o consumidor repetir
// o literal em vez de importar.
//
// Esta ferramenta mede a repetição — o insumo da regra "um termo, um dono" e
// do gate que vai medir se ela está sendo aplicada.
//
// ── O QUE ELA NÃO FAZ ──────────────────────────────────────────────────────
//
// Ela não sabe o que é "termo de domínio" e o que é ruído (`'vitest'`,
// `'acme'`). Ela CONTA, e a decisão é de quem lê: um relatório que só
// mostra o que a máquina achou seria mais um número para gastar atenção.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export interface LiteralRepetido {
  /** O texto repetido, sem as aspas. */
  valor: string;
  /** Quantos arquivos distintos o carregam. */
  arquivos: number;
  /** Quantas vezes aparece, no total. */
  ocorrencias: number;
  /** Os arquivos, relativos à raiz da varredura. */
  onde: string[];
}

/** Diretórios que nunca entram na medição (gerados ou externos). */
export const IGNORADOS = ['node_modules', 'dist', '.next', 'coverage', '.turbo', '.git'];

/** Extensões varridas. */
export const EXTENSOES = ['.ts', '.tsx', '.mts'];

/**
 * Os literais de um texto.
 *
 * ⚠️ Aspas simples e duplas são os dois formatos; o que está entre elas não
 * pode conter a própria aspa nem quebra de linha. A alternativa seria um
 * parser de TypeScript — e o ganho não paga o custo, porque o que a
 * ferramenta mede é a REPETIÇÃO, e um literal mal contado muda a contagem em
 * uma unidade, não a ordem do relatório.
 */
export function extraiLiterais(texto: string): string[] {
  const achados: string[] = [];
  const re = /'([^'\\\n]{2,60})'|"([^"\\\n]{2,60})"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const valor = m[1] ?? m[2];
    if (valor !== undefined && valor.trim() !== '') achados.push(valor);
  }
  return achados;
}

/** Os arquivos de código sob uma raiz (recursivo, pulando os ignorados). */
export function varreArquivos(raiz: string): string[] {
  if (!existsSync(raiz)) return [];
  const encontrados: string[] = [];
  const anda = (dir: string): void => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORADOS.includes(entrada.name)) continue;
      const caminho = join(dir, entrada.name);
      if (entrada.isDirectory()) anda(caminho);
      else if (EXTENSOES.some((ext) => entrada.name.endsWith(ext))) encontrados.push(caminho);
    }
  };
  anda(raiz);
  return encontrados.sort();
}

/** Arquivo → literais que ele carrega. */
export function varreLiterais(raiz: string): Map<string, string[]> {
  const porArquivo = new Map<string, string[]>();
  for (const arquivo of varreArquivos(raiz)) {
    porArquivo.set(arquivo, extraiLiterais(readFileSync(arquivo, 'utf8')));
  }
  return porArquivo;
}

/**
 * Os literais repetidos, do mais repetido para o menos.
 *
 * ⚠️ O DESEMPATE é estável: valor em ordem alfabética. Sem ele, dois
 * relatórios da mesma árvore saem diferentes, e um relatório que muda de
 * ordem entre duas execuções não serve para comparar duas execuções.
 */
export function contaPorArquivo(porArquivo: Map<string, string[]>): LiteralRepetido[] {
  const arquivosDe = new Map<string, Set<string>>();
  const ocorrenciasDe = new Map<string, number>();
  for (const [arquivo, literais] of porArquivo) {
    for (const literal of literais) {
      if (!arquivosDe.has(literal)) arquivosDe.set(literal, new Set());
      arquivosDe.get(literal)?.add(arquivo);
      ocorrenciasDe.set(literal, (ocorrenciasDe.get(literal) ?? 0) + 1);
    }
  }
  const lista: LiteralRepetido[] = [];
  for (const [valor, arquivos] of arquivosDe) {
    if (arquivos.size < 2) continue;
    lista.push({
      valor,
      arquivos: arquivos.size,
      ocorrencias: ocorrenciasDe.get(valor) ?? 0,
      onde: [...arquivos].sort(),
    });
  }
  return lista.sort((a, b) => b.arquivos - a.arquivos || a.valor.localeCompare(b.valor));
}

function main(): number {
  const args = process.argv.slice(2);
  const raizRepo = resolve(args.find((a) => !a.startsWith('-')) ?? process.cwd());
  const min = Number(args.find((a) => a.startsWith('--min='))?.split('=')[1] ?? '2');
  const comoJson = args.includes('--json');

  const raizes = [
    'apps/api/src',
    'apps/api/test',
    'apps/web/app',
    'apps/web/lib',
    'apps/web/components',
    'apps/web/e2e',
    'packages/shared-types/src',
  ].map((r) => join(raizRepo, r));

  const porArquivo = new Map<string, string[]>();
  for (const raiz of raizes) {
    for (const [arquivo, literais] of varreLiterais(raiz)) {
      porArquivo.set(relative(raizRepo, arquivo), literais);
    }
  }

  const repetidos = contaPorArquivo(porArquivo).filter((l) => l.arquivos >= min);
  if (comoJson) {
    console.log(JSON.stringify(repetidos, null, 2));
    return 0;
  }
  console.log(`literais repetidos em ${min}+ arquivo(s): ${repetidos.length}`);
  for (const l of repetidos) {
    console.log(
      `${String(l.arquivos).padStart(3)} arquivo(s) ${String(l.ocorrencias).padStart(4)}x  ${l.valor}`,
    );
  }
  return 0;
}

if (process.argv[1]?.includes('analisa-repeticao')) {
  try {
    process.exitCode = main();
  } catch (erro) {
    console.error(
      'analisa-repeticao: FALHA —',
      erro instanceof Error ? erro.message : String(erro),
    );
    process.exitCode = 1;
  }
}
