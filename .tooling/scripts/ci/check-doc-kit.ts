/**
 * SEM shebang, de propósito — ver `check-harness-owner.ts`: um arquivo de
 * `.tooling/scripts/ci/` que não comece com `check-`, não termine em
 * `.spec.ts` e TENHA shebang é classificado como harness órfão.
 *
 * Mede a **cobertura do kit de documentação moderna** — os 14 itens dos 5
 * pilares da convenção [`kit-documentacao.md`](../../.agents/specs/conventions/kit-documentacao.md).
 *
 * ## Por que este gate existe
 *
 * A convenção `kit-documentacao` é a que torna o kit **obrigatório**: cada um
 * dos 14 itens tem um doc canônico, um specialist dono e um auditor. Sem
 * instrumento, "obrigatório" é prosa — e a prosa envelhece sem ninguém
 * perceber. Este gate é o instrumento: ele lê a matriz da convenção **por nome
 * de coluna** e mede, para cada item:
 *
 *   1. o doc canônico existe (e, para `familia`, cada arquivo do glob);
 *   2. o doc contém **todas** as âncoras mínimas declaradas;
 *   3. o índice do item existe e **cita** o doc canônico;
 *   4. o specialist e o auditor existem em `.agents/agents/`;
 *   5. os itens condicionais: o gatilho dispara → o doc é exigido, e a
 *      declaração de não-aplicabilidade tem de ter saído; o gatilho não
 *      dispara → a não-aplicabilidade tem de estar **declarada**.
 *
 * ## A matriz é a fonte da verdade
 *
 * O gate **não** tem a lista dos 14 itens no código: ele lê a tabela da
 * convenção. É o mesmo padrão de `check-doc-coverage` (que lê a tabela de
 * exceções de `documentacao.md`) e de `check-test-set-covered` (que lê a
 * `tdd.md`). Uma lista no código e outra na convenção divergem — e a que
 * diverge é a que o gate não acusa.
 *
 * ## O que este gate NÃO mede
 *
 * - **Frescor do texto.** O gate vê se a âncora existe, não se a frase ainda
 *   diz a verdade. Quem pega o resto é o `doc-sync` e a auditoria do
 *   `documentation-specialist`.
 * - **Qualidade da prosa** e **acerto do quadrante Diátaxis** — julgamento
 *   editorial.
 * - **O conteúdo do artefato gerado** (`apps/api/openapi.json`): o frescor do
 *   contrato contra o código é do `check-openapi-contract`.
 *
 * Dizer que este gate cobre frescor **todo** seria a classe 1 de
 * `guard-classes.md` — condição inalcançável.
 */
import { readFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { linhasDoRelato, type CheckResult } from './check-types';

/** A convenção que declara a matriz do kit — a única fonte. */
export const CONVENCAO = '.agents/specs/conventions/kit-documentacao.md';

/** Onde vivem os agents canônicos (specialist e auditor). */
export const DIR_AGENTS = path.join('.agents', 'agents');

/** Os 5 pilares do kit. Um pilar sem item é um kit que encolheu. */
export const PILARES = [1, 2, 3, 4, 5] as const;

/** Os tipos de doc que o gate sabe medir. */
export type TipoDeDoc = 'arquivo' | 'familia' | 'artefato';

/** Um item do kit, lido da matriz. */
export interface ItemDoKit {
  /** O número da linha na matriz (`#`). */
  numero: string;
  /** O nome do item, como está na matriz. */
  item: string;
  /** O pilar (1..5), derivado da seção onde a tabela vive. */
  pilar: number;
  /** O doc canônico: um caminho, ou um glob. */
  doc: string;
  /** Como medir o doc. */
  tipo: TipoDeDoc;
  /** As seções mínimas que o doc tem que conter. */
  ancoras: string[];
  /** O índice que lista as instâncias do item — `null` quando não há. */
  indice: string | null;
  /** `obrigatorio` ou `condicional`. */
  condicao: 'obrigatorio' | 'condicional';
  /** O agent dono do item. */
  specialist: string;
  /** O agent que audita o item. */
  auditor: string;
  /** A linha onde o item foi lido — para a mensagem apontar o lugar. */
  linha: number;
}

/** A declaração de um item condicional (a §4 da convenção). */
export interface DeclaracaoCondicional {
  /** O nome do item, como está na §4. */
  item: string;
  /** O texto da coluna "Gatilho". */
  gatilho: string;
  /** Os globs da coluna "Sonda". */
  sondas: string[];
  /** O padrão da coluna "Padrão". */
  padrao: string;
  /** A declaração de não-aplicabilidade (vazia = não declarada). */
  declaracao: string;
  /** A linha onde foi lida. */
  linha: number;
}

/** Uma tabela markdown lida: o cabeçalho e as linhas de dados. */
interface Tabela {
  cabecalho: string[];
  linhas: string[][];
  /** A linha (1-based) do cabeçalho no arquivo. */
  linha: number;
}

/**
 * Divide uma linha de tabela markdown nas células.
 *
 * A célula pode conter `|` escapado (`\|`) — e o padrão da §4 da convenção
 * usa isso (`"bullmq"\|"kafkajs"`). Uma divisão ingênua quebraria essa linha
 * em mais células do que a tabela tem.
 */
export function celulasDaLinha(linha: string): string[] {
  const semBorda = linha.trim().replace(/^\|/, '').replace(/\|$/, '');
  const celulas: string[] = [];
  let atual = '';
  for (let i = 0; i < semBorda.length; i++) {
    const c = semBorda[i]!;
    if (c === '\\' && semBorda[i + 1] === '|') {
      atual += '|';
      i++;
      continue;
    }
    if (c === '|') {
      celulas.push(atual.trim());
      atual = '';
      continue;
    }
    atual += c;
  }
  celulas.push(atual.trim());
  return celulas;
}

/** A linha é aseparatora de uma tabela markdown? */
function ehSeparador(celulas: string[]): boolean {
  return celulas.length > 0 && celulas.every((c) => /^:?-{2,}:?$/.test(c));
}

/**
 * Lê todas as tabelas markdown de um texto, com o heading anterior.
 *
 * O **pilar** de cada tabela vem do heading `### §2.N Pilar N — ...` que a
 * precede: é o heading que diz a qual pilar os itens pertencem, e ele é a
 * única forma de saber que um pilar inteiro sumiu.
 */
export function lerTabelas(md: string): { tabela: Tabela; heading: string }[] {
  const linhas = md.split('\n');
  const achadas: { tabela: Tabela; heading: string }[] = [];
  let heading = '';
  let i = 0;
  while (i < linhas.length) {
    const linha = linhas[i]!;
    if (/^#{2,4}\s/.test(linha)) {
      heading = linha;
      i++;
      continue;
    }
    if (!linha.trimStart().startsWith('|')) {
      i++;
      continue;
    }
    // A tabela começa aqui: cabeçalho + separador + dados.
    const cabecalho = celulasDaLinha(linha);
    const separador = i + 1 < linhas.length ? celulasDaLinha(linhas[i + 1]!) : [];
    if (!ehSeparador(separador) || separador.length !== cabecalho.length) {
      i++;
      continue;
    }
    const dados: string[][] = [];
    let j = i + 2;
    for (; j < linhas.length && linhas[j]!.trimStart().startsWith('|'); j++) {
      const cels = celulasDaLinha(linhas[j]!);
      if (ehSeparador(cels)) continue;
      dados.push(cels);
    }
    achadas.push({ tabela: { cabecalho, linhas: dados, linha: i + 1 }, heading });
    i = j;
  }
  return achadas;
}

/**
 * O índice da coluna pelo NOME — nunca por posição.
 *
 * O nome casa **exato** ou por **prefixo**: o cabeçalho da §4 é
 * `Sonda (glob)`, e um casamento exato não a encontraria — e a coluna
 * faltando faria o gate ler a coluna errada em silêncio.
 */
export function coluna(cabecalho: string[], nome: string): number {
  const alvo = nome.toLowerCase();
  const exato = cabecalho.findIndex((c) => c.trim().toLowerCase() === alvo);
  if (exato >= 0) return exato;
  return cabecalho.findIndex((c) => c.trim().toLowerCase().startsWith(alvo));
}

/** Limpa o valor de uma célula: tira crase e espaço. */
function valor(celula: string | undefined): string {
  return (celula ?? '').replace(/`/g, '').trim();
}

/** O pilar do heading — `### §2.1 Pilar 1 — ...` → 1. */
export function pilarDoHeading(heading: string): number | null {
  const m = /Pilar\s+(\d+)/i.exec(heading);
  return m === null ? null : Number(m[1]);
}

/**
 * Lê a matriz do kit da convenção.
 *
 * @returns os itens e as declarações condicionais.
 */
export function lerMatriz(md: string): {
  itens: ItemDoKit[];
  condicionais: DeclaracaoCondicional[];
  pilaresVistos: number[];
} {
  const tabelas = lerTabelas(md);
  const itens: ItemDoKit[] = [];
  const condicionais: DeclaracaoCondicional[] = [];
  const pilaresVistos = new Set<number>();

  for (const { tabela, heading } of tabelas) {
    const colDoc = coluna(tabela.cabecalho, 'Doc canônico');
    if (colDoc >= 0) {
      const pilar = pilarDoHeading(heading);
      const cols = {
        numero: coluna(tabela.cabecalho, '#'),
        item: coluna(tabela.cabecalho, 'Item'),
        tipo: coluna(tabela.cabecalho, 'Tipo'),
        ancoras: coluna(tabela.cabecalho, 'Âncoras'),
        indice: coluna(tabela.cabecalho, 'Índice'),
        condicao: coluna(tabela.cabecalho, 'Condição'),
        specialist: coluna(tabela.cabecalho, 'Specialist'),
        auditor: coluna(tabela.cabecalho, 'Auditor'),
      };
      for (const dados of tabela.linhas) {
        const doc = valor(dados[colDoc]);
        if (doc === '') continue;
        const tipo = valor(dados[cols.tipo]) as TipoDeDoc;
        if (pilar !== null) pilaresVistos.add(pilar);
        itens.push({
          numero: valor(dados[cols.numero]),
          item: valor(dados[cols.item]),
          pilar: pilar ?? 0,
          doc,
          tipo,
          ancoras: valor(dados[cols.ancoras])
            .split(';')
            .map((a) => a.trim())
            .filter((a) => a !== ''),
          indice: valor(dados[cols.indice]) === '—' ? null : valor(dados[cols.indice]),
          condicao: valor(dados[cols.condicao]) === 'condicional' ? 'condicional' : 'obrigatorio',
          specialist: valor(dados[cols.specialist]),
          auditor: valor(dados[cols.auditor]),
          linha: tabela.linha,
        });
      }
      continue;
    }

    const colSonda = coluna(tabela.cabecalho, 'Sonda');
    if (colSonda >= 0) {
      const colItem = coluna(tabela.cabecalho, 'Item');
      const colGatilho = coluna(tabela.cabecalho, 'Gatilho');
      const colPadrao = coluna(tabela.cabecalho, 'Padrão');
      const colDeclaracao = coluna(tabela.cabecalho, 'Não aplicável declarado');
      for (const dados of tabela.linhas) {
        const item = valor(dados[colItem]);
        if (item === '') continue;
        condicionais.push({
          item,
          gatilho: valor(dados[colGatilho]),
          sondas: valor(dados[colSonda])
            .split(';')
            .map((s) => s.trim())
            .filter((s) => s !== ''),
          padrao: valor(dados[colPadrao]),
          declaracao: valor(dados[colDeclaracao]),
          linha: tabela.linha,
        });
      }
    }
  }

  return { itens, condicionais, pilaresVistos: [...pilaresVistos].sort() };
}

/** Converte um glob em regex — `**` atravessa diretórios, `*` não. */
export function globParaRegex(glob: string): RegExp {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    const c = glob[i]!;
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          out += '(?:[^/]+/)*';
          i += 3;
          continue;
        }
        out += '.*';
        i += 2;
        continue;
      }
      out += '[^/]*';
      i += 1;
      continue;
    }
    if (c === '?') {
      out += '[^/]';
      i += 1;
      continue;
    }
    out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    i += 1;
  }
  return new RegExp('^' + out + '$');
}

/** As entradas que a medição precisa — injetáveis para a spec. */
export interface Entradas {
  itens: ItemDoKit[];
  condicionais: DeclaracaoCondicional[];
  /** O doc canônico existe? */
  existe: (caminho: string) => boolean;
  /** O conteúdo do arquivo (string vazia se não existe). */
  ler: (caminho: string) => string;
  /** Expande um glob nos arquivos que ele casa. */
  arquivos: (glob: string) => string[];
  /** O agent existe em `.agents/agents/`? */
  agentExiste: (nome: string) => boolean;
  /** O gatilho do item condicional disparou? */
  sondaDispara: (declaracao: DeclaracaoCondicional) => boolean;
}

/**
 * A medição — pura, para a spec exercitar sem passar pelo disco.
 */
export function lacunasDoKit(entradas: Entradas): string[] {
  const errors: string[] = [];

  if (entradas.itens.length === 0) {
    return [
      `a matriz do kit em ${CONVENCAO} não tem item nenhum — o gate não tem o que ` +
        'medir (verde por ausência é a classe 5 de `guard-classes.md`)',
    ];
  }

  // Um pilar sem item é um kit que encolheu em silêncio.
  const pilares = new Set(entradas.itens.map((i) => i.pilar));
  for (const pilar of PILARES) {
    if (!pilares.has(pilar)) {
      errors.push(
        `o kit perdeu o Pilar ${pilar} — nenhum item da matriz §2.${pilar} declara ` +
          `pilar ${pilar}. O kit é o que a convenção diz que é.`,
      );
    }
  }

  const vistos = new Set<string>();
  for (const item of entradas.itens) {
    const quem = `item ${item.numero} ("${item.item}")`;

    if (vistos.has(item.item)) {
      errors.push(`${quem}: o item está repetido na matriz — um item por linha.`);
    }
    vistos.add(item.item);

    if (!(['arquivo', 'familia', 'artefato'] as string[]).includes(item.tipo)) {
      errors.push(
        `${quem}: tipo "${item.tipo}" não é um tipo que o gate sabe medir ` +
          '(arquivo, familia ou artefato).',
      );
    }

    // ── Os condicionais (ANTES do doc: um item N/A não exige doc) ─────────
    //
    // A ORDEM importa: exigir o doc de um item condicional cuja não-aplicabilidade
    // está DECLARADA é cobrar um arquivo que, por decisão registrada, ainda não
    // existe — o gate acusaria uma lacuna que não é lacuna. O dono continua
    // sendo exigido: o item tem specialist e auditor mesmo sem doc.
    let naoAplicavel = false;
    if (item.condicao === 'condicional') {
      const declaracao = entradas.condicionais.find((d) => d.item === item.item);
      if (declaracao === undefined) {
        errors.push(
          `${quem}: item condicional sem declaração na §4 da convenção — o gatilho ` +
            'não disparou e ninguém escreveu por que o item não se aplica.',
        );
      } else {
        const disparou = entradas.sondaDispara(declaracao);
        if (disparou && declaracao.declaracao !== '') {
          errors.push(
            `${quem}: a declaração de não-aplicabilidade parou de valer — o gatilho ` +
              `disparou ("${declaracao.gatilho}"). Remova a declaração.`,
          );
        }
        if (!disparou && declaracao.declaracao === '') {
          errors.push(`${quem}: item condicional sem declaração de não-aplicabilidade (§4).`);
        }
        naoAplicavel = !disparou && declaracao.declaracao !== '';
      }
    }

    // ── O doc canônico ──────────────────────────────────────────────────────
    const arquivos = item.tipo === 'familia' ? entradas.arquivos(item.doc) : [item.doc];
    if (naoAplicavel) {
      // Não aplicável: o doc não é exigido. O dono continua exigido abaixo.
    } else if (item.tipo !== 'familia' && !entradas.existe(item.doc)) {
      errors.push(
        `${quem}: o doc canônico "${item.doc}" não existe ` +
          `(regra: convenção kit-documentacao.md §2).`,
      );
    } else if (arquivos.length === 0) {
      errors.push(
        `${quem}: o doc canônico "${item.doc}" não existe ` +
          `(regra: convenção kit-documentacao.md §2).`,
      );
    } else {
      for (const arquivo of arquivos) {
        const conteudo = entradas.ler(arquivo);
        if (conteudo.trim() === '') {
          errors.push(`${quem}: o doc canônico "${arquivo}" está vazio.`);
        }
        for (const ancora of item.ancoras) {
          if (!conteudo.includes(ancora)) {
            errors.push(
              `${quem}: o doc canônico "${arquivo}" não tem a âncora "${ancora}" ` +
                `(regra: convenção kit-documentacao.md §2, coluna Âncoras).`,
            );
          }
        }
      }
    }

    // ── O índice ────────────────────────────────────────────────────────────
    if (item.indice !== null && !naoAplicavel) {
      if (!entradas.existe(item.indice)) {
        errors.push(`${quem}: o índice "${item.indice}" não existe — o item declara quem o lista.`);
      } else {
        const conteudo = entradas.ler(item.indice);
        for (const arquivo of arquivos) {
          const base = path.posix.basename(arquivo);
          if (!conteudo.includes(base)) {
            errors.push(
              `${quem}: o índice "${item.indice}" não cita "${base}" — um índice que ` +
                'não lista o que existe é índice de ficção.',
            );
          }
        }
      }
    }

    // ── Os donos ─────────────────────────────────────────────────────────────
    if (item.specialist === '' || !entradas.agentExiste(item.specialist)) {
      errors.push(
        `${quem}: o specialist "${item.specialist}" não existe em ${DIR_AGENTS}/ — ` +
          'um item sem dono é um item que ninguém repara.',
      );
    }
    if (item.auditor === '' || !entradas.agentExiste(item.auditor)) {
      errors.push(
        `${quem}: o auditor "${item.auditor}" não existe em ${DIR_AGENTS}/ — ` +
          'um item sem auditor é um item que ninguém confere.',
      );
    }
  }

  // O sentido inverso: uma §4 que declara um item que não é condicional.
  for (const declaracao of entradas.condicionais) {
    const item = entradas.itens.find((i) => i.item === declaracao.item);
    if (item === undefined) {
      errors.push(
        `a §4 da convenção declara "${declaracao.item}", que não é um item da matriz — ` +
          'a declaração não exclui nada.',
      );
    } else if (item.condicao !== 'condicional') {
      errors.push(
        `a §4 da convenção declara "${declaracao.item}" como condicional, mas a matriz ` +
          '§2 diz que ele é obrigatório — as duas tabelas discordam.',
      );
    }
  }

  return errors;
}

/** As pastas que a varredura não desce. */
const IGNORADOS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'coverage',
  '.turbo',
  'graphify-out',
  '.agents/runs',
]);

async function listarArquivos(repoRoot: string, base = ''): Promise<string[]> {
  const achados: string[] = [];
  let entradas: import('node:fs').Dirent[];
  try {
    entradas = await fs.readdir(path.join(repoRoot, base), { withFileTypes: true });
  } catch {
    return achados;
  }
  for (const entrada of entradas) {
    if (entrada.name.startsWith('.') && entrada.name !== '.agents') continue;
    const relativo = base === '' ? entrada.name : `${base}/${entrada.name}`;
    if (IGNORADOS.has(relativo)) continue;
    if (entrada.isDirectory()) {
      achados.push(...(await listarArquivos(repoRoot, relativo)));
    } else if (entrada.isFile()) {
      achados.push(relativo);
    }
  }
  return achados.sort();
}

export async function checkDocKit(opts: { repoRoot: string }): Promise<CheckResult> {
  const root = path.resolve(opts.repoRoot);

  let md: string;
  try {
    md = await fs.readFile(path.join(root, CONVENCAO), 'utf-8');
  } catch (err) {
    return {
      ok: false,
      errors: [
        `não foi possível ler ${CONVENCAO} (${(err as Error).message}) — a matriz do kit ` +
          'é a única fonte dos 14 itens, então sem ela este check é teatro',
      ],
    };
  }

  const matriz = lerMatriz(md);
  if (matriz.itens.length === 0) {
    return {
      ok: false,
      errors: [
        `a convenção ${CONVENCAO} não tem a tabela da matriz do kit (§2) — a matriz ` +
          'é a única fonte dos itens, então sem ela este check é teatro',
      ],
    };
  }

  const todos = await listarArquivos(root);
  const cache = new Map<string, string[]>();
  const casaCom = (glob: string): string[] => {
    const achados = cache.get(glob);
    if (achados !== undefined) return achados;
    const re = globParaRegex(glob);
    const lista = todos.filter((a) => re.test(a));
    cache.set(glob, lista);
    return lista;
  };

  const existe = (caminho: string): boolean => todos.includes(caminho);
  const ler = (caminho: string): string => {
    try {
      return readFileSync(path.join(root, caminho), 'utf-8');
    } catch {
      return '';
    }
  };
  const agentExiste = (nome: string): boolean => existe(path.join(DIR_AGENTS, `${nome}.md`));

  const sondaDispara = (declaracao: DeclaracaoCondicional): boolean => {
    if (declaracao.padrao === '') return false;
    let re: RegExp;
    try {
      re = new RegExp(declaracao.padrao);
    } catch {
      return false;
    }
    for (const sonda of declaracao.sondas) {
      for (const arquivo of casaCom(sonda)) {
        if (re.test(ler(arquivo))) return true;
      }
    }
    return false;
  };

  const errors = lacunasDoKit({
    itens: matriz.itens,
    condicionais: matriz.condicionais,
    existe,
    ler,
    arquivos: casaCom,
    agentExiste,
    sondaDispara,
  });

  const advisories: string[] = [];
  advisories.push(
    `medido: ${matriz.itens.length} item(ns) do kit em ${matriz.pilaresVistos.length} pilar(es).`,
  );

  return { ok: errors.length === 0, errors, advisories };
}

// Executado como CLI.
//
// Sem este bloco, `pnpm exec tsx .tooling/scripts/ci/check-doc-kit.ts`
// devolvia `exit 0` e nenhuma saída — o gate só media alguma coisa pelo mapa
// `RUNNERS` do preflight. O mesmo modo de falha do `check-doc-coverage`.
if (process.argv[1]?.endsWith('check-doc-kit.ts')) {
  checkDocKit({ repoRoot: '.' }).then((r) => {
    for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
    process.exit(r.ok ? 0 : 1);
  });
}
