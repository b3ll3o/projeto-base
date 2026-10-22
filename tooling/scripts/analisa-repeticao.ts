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
 * O texto SEM COMENTÁRIOS.
 *
 * ⚠️ Por que isto existe: um literal citado em comentário NÃO é um termo
 * "usado" — e a regra é sobre uso. MEDIDO 2026-10-22: `convite` aparece em
 * `feature-flag.guard.ts` só dentro de um comentário que explica o
 * `destino.tipo`, e contá-lo como uso inflava a medição com arquivos que não
 * têm NADA a importar. Uma régua que mede outro objeto é a classe de
 * defeito que `guard-classes.md` §4 proíbe.
 *
 * O recorte é por ESTADO (código / string / comentário), e não por regex: um
 * `'http://x'` tem `//` no meio, e um corte ingênuo comeria a linha. A
 * máquina de estados é o que separa "comentário" de "string".
 */
export function removeComentarios(texto: string): string {
  let saida = '';
  let i = 0;
  let estado: 'codigo' | 'linha' | 'bloco' | 'aspas-simples' | 'aspas-duplas' | 'template' =
    'codigo';
  while (i < texto.length) {
    const c = texto[i] ?? '';
    const d = texto[i + 1] ?? '';
    if (estado === 'codigo') {
      if (c === '/' && d === '/') {
        estado = 'linha';
        i += 2;
        continue;
      }
      if (c === '/' && d === '*') {
        estado = 'bloco';
        i += 2;
        continue;
      }
      if (c === "'") estado = 'aspas-simples';
      else if (c === '"') estado = 'aspas-duplas';
      else if (c === '`') estado = 'template';
      saida += c;
      i += 1;
      continue;
    }
    if (estado === 'linha') {
      if (c === '\n') {
        estado = 'codigo';
        saida += '\n';
      }
      i += 1;
      continue;
    }
    if (estado === 'bloco') {
      if (c === '*' && d === '/') {
        estado = 'codigo';
        i += 2;
        continue;
      }
      if (c === '\n') saida += '\n';
      i += 1;
      continue;
    }
    // Dentro de string: o conteúdo é o que é, e a string termina na aspa
    // que a abre (sem escape).
    saida += c;
    i += 1;
    if (c === '\\' && d !== '') {
      saida += d;
      i += 1;
      continue;
    }
    if (
      (estado === 'aspas-simples' && c === "'") ||
      (estado === 'aspas-duplas' && c === '"') ||
      (estado === 'template' && c === '`')
    ) {
      estado = 'codigo';
    }
  }
  return saida;
}

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
  // ⚠️ O BACKTICK é o terceiro formato, e ele faltava. MEDIDO 2026-10-22: um
  // termo de domínio hardcoded em template literal (`const p = \`gerente\``)
  // era INVISÍVEL para os dois instrumentos — o analyzer não o contava e o
  // gate (`arquivosQueHardcodam`) não o achava. Um literal que o instrumento
  // não vê é um termo que nunca entra na lista de exceções, e um termo que
  // nunca entra na lista nunca é medido.
  const re = /'([^'\\\n]{2,60})'|"([^"\\\n]{2,60})"|`([^`\\\n]{2,60})`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto)) !== null) {
    const valor = m[1] ?? m[2] ?? m[3];
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

/** Arquivo → literais que ele carrega (COMENTÁRIOS fora — ver `removeComentarios`). */
export function varreLiterais(raiz: string): Map<string, string[]> {
  const porArquivo = new Map<string, string[]>();
  for (const arquivo of varreArquivos(raiz)) {
    porArquivo.set(arquivo, extraiLiterais(removeComentarios(readFileSync(arquivo, 'utf8'))));
  }
  return porArquivo;
}

/** Uma sequência de linhas normalizadas que aparece em mais de um arquivo. */
export interface BlocoDuplicado {
  /** As linhas do bloco (normalizadas). */
  linhas: string[];
  /** Quantos arquivos distintos carregam o bloco. */
  arquivos: number;
  /** Os arquivos, relativos à raiz da varredura. */
  onde: string[];
  /** Quantas vezes o bloco aparece (no total). */
  ocorrencias: number;
}

/**
 * Normaliza uma linha para a comparação: sem espaço nas pontas e sem
 * comentário.
 *
 * ⚠️ Sem isso, dois blocos IGUAIS com indentação diferente (o mesmo código
 * dentro de uma função e fora) não casam — e a indentação é a diferença que
 * o olho ignora e a máquina não devia.
 */
export function normalizaLinha(linha: string): string {
  // ⚠️ `removeComentarios` e NÃO um corte com regex: o corte ingênuo
  // (`/\/\/.*$/`) come o `//` de uma URL DENTRO de uma string, e duas linhas
  // que só diferem no host viravam a MESMA linha — que é exatamente o que o
  // gate de lógica acusa como "cópia". MEDIDO 2026-10-22:
  // `normalizaLinha("const url = 'https://a.example/x';")` e
  // `normalizaLinha("const url = 'https://b.example/y';")` davam as duas
  // `"const url = 'https:"`. A máquina de estados (a mesma de
  // `removeComentarios`) separa "comentário" de "string", e é o que fecha.
  const semComentario = removeComentarios(linha).trim();
  return semComentario.replace(/\s+/g, ' ');
}

/**
 * Os blocos de código duplicados entre arquivos.
 *
 * ⚠️ A JANELA é o que decide o sinal: com 6 linhas, quase tudo casa (a
 * geração de um caso de teste e o `try/catch` de uma borda se repetem em
 * todo lugar); com 12, o que repete é REPETição de verdade. O tamanho é
 * parâmetro, e o chamador escolhe.
 *
 * ⚠️ Uma linha em BRANCO é fronteira de bloco: `const a = 1;\n\nconst b = 2;`
 * e `const a = 1;\nconst b = 2;` são o MESMO bloco. Sem essa regra, a
 * comparação ignoraria a diferença entre o bloco partido e o bloco inteiro.
 */
export function achaBlocosDuplicados(
  porArquivo: Map<string, string[]>,
  tamanhoJanela: number,
): BlocoDuplicado[] {
  const ocorrencias = new Map<string, { linhas: string[]; arquivos: Set<string>; total: number }>();
  for (const [arquivo, linhas] of porArquivo) {
    const normalizadas = linhas.map(normalizaLinha);
    for (let i = 0; i + tamanhoJanela <= normalizadas.length; i += 1) {
      const janela = normalizadas.slice(i, i + tamanhoJanela);
      // Uma janela com linha em branco é uma fronteira, não um bloco.
      if (janela.some((l) => l === '')) continue;
      const chave = janela.join('\n');
      const atual = ocorrencias.get(chave);
      if (atual === undefined) {
        ocorrencias.set(chave, { linhas: janela, arquivos: new Set([arquivo]), total: 1 });
        continue;
      }
      atual.arquivos.add(arquivo);
      atual.total += 1;
    }
  }
  const blocos: BlocoDuplicado[] = [];
  for (const [chave, info] of ocorrencias) {
    if (info.arquivos.size < 2) continue;
    blocos.push({
      linhas: info.linhas,
      arquivos: info.arquivos.size,
      onde: [...info.arquivos].sort(),
      ocorrencias: info.total,
    });
  }
  return blocos.sort((a, b) => b.arquivos - a.arquivos || b.linhas.length - a.linhas.length);
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

/**
 * A raiz do repo, pelo `pnpm-workspace.yaml`.
 *
 * ⚠️ O `process.cwd()` não serve: o script npm roda de `tooling/scripts`
 * (`cd tooling/scripts && pnpm ...`), e de lá a raiz seria `tooling/scripts` —
 * a varredura mediria o diretório errado e sairia com "0 literais", que é o
 * verde que não mede nada.
 */
export function raizDoRepo(de: string): string {
  let atual = resolve(de);
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(join(atual, 'pnpm-workspace.yaml'))) return atual;
    const pai = join(atual, '..');
    if (pai === atual) break;
    atual = pai;
  }
  return resolve(de);
}

/** Arquivo → suas LINHAS (comentários fora — ver `removeComentarios`). */
export function varreLinhas(raiz: string): Map<string, string[]> {
  const porArquivo = new Map<string, string[]>();
  for (const arquivo of varreArquivos(raiz)) {
    porArquivo.set(arquivo, removeComentarios(readFileSync(arquivo, 'utf8')).split('\n'));
  }
  return porArquivo;
}

function main(): number {
  const args = process.argv.slice(2);
  const raizRepo = raizDoRepo(args.find((a) => !a.startsWith('-')) ?? process.cwd());
  const min = Number(args.find((a) => a.startsWith('--min='))?.split('=')[1] ?? '2');
  const comoJson = args.includes('--json');
  const bloco = Number(args.find((a) => a.startsWith('--bloco='))?.split('=')[1] ?? '0');
  const soProducao = args.includes('--producao');

  const raizes = [
    'apps/api/src',
    'apps/api/test',
    'apps/web/app',
    'apps/web/lib',
    'apps/web/components',
    'apps/web/e2e',
    'packages/shared-types/src',
  ].map((r) => join(raizRepo, r));

  if (bloco > 0) {
    const porArquivo = new Map<string, string[]>();
    for (const raiz of raizes) {
      for (const [arquivo, linhas] of varreLinhas(raiz)) {
        if (soProducao && arquivo.includes('.spec.')) continue;
        porArquivo.set(relative(raizRepo, arquivo), linhas);
      }
    }
    const blocos = achaBlocosDuplicados(porArquivo, bloco);
    if (comoJson) {
      console.log(JSON.stringify(blocos, null, 2));
      return 0;
    }
    console.log(`blocos de ${bloco}+ linhas repetidos: ${blocos.length}`);
    for (const b of blocos) {
      console.log(`${String(b.arquivos).padStart(3)} arquivo(s)  ${b.linhas[0]?.slice(0, 70)}`);
    }
    return 0;
  }

  const porArquivo = new Map<string, string[]>();
  for (const raiz of raizes) {
    for (const [arquivo, literais] of varreLiterais(raiz)) {
      if (soProducao && arquivo.includes('.spec.')) continue;
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
