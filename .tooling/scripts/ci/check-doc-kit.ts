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
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { lerFrontmatter } from './frontmatter';
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

/** O auditor e a skill de um pilar, lidos da §5.1 da convenção. */
export interface PilarDoKit {
  /** O número do pilar (1..5). */
  pilar: number;
  /** O auditor declarado para o pilar. */
  auditor: string;
  /** A skill de auditoria declarada para o pilar. */
  skill: string;
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
  /** As linhas de dado, cada uma com a linha onde está no arquivo. */
  linhas: { cels: string[]; linha: number }[];
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
export function lerTabelas(md: string): { tabela: Tabela; heading: string; erros: string[] }[] {
  const linhas = md.split('\n');
  const achadas: { tabela: Tabela; heading: string; erros: string[] }[] = [];
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
    const dados: { cels: string[]; linha: number }[] = [];
    const errosDaTabela: string[] = [];
    let j = i + 2;
    for (; j < linhas.length && linhas[j]!.trimStart().startsWith('|'); j++) {
      const cels = celulasDaLinha(linhas[j]!);
      if (ehSeparador(cels)) continue;
      // Uma linha com NÚMERO DIFERENTE de células desloca as demais na
      // leitura por nome — a coluna "Doc canônico" leria a célula do vizinho.
      // O gate prefere falhar alto a medir a coluna errada.
      if (cels.length !== cabecalho.length) {
        errosDaTabela.push(
          `a linha ${j + 1} da tabela tem ${cels.length} células e o cabeçalho tem ` +
            `${cabecalho.length} — a linha está fora da forma da tabela (regra: ` +
            'convenção kit-documentacao.md §2, formato das células).',
        );
        continue;
      }
      dados.push({ cels, linha: j + 1 });
    }
    achadas.push({
      tabela: { cabecalho, linhas: dados, linha: i + 1 },
      heading,
      erros: errosDaTabela,
    });
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
  pilares: PilarDoKit[];
  pilaresVistos: number[];
  erros: string[];
} {
  const tabelas = lerTabelas(md);
  const itens: ItemDoKit[] = [];
  const condicionais: DeclaracaoCondicional[] = [];
  const pilares: PilarDoKit[] = [];
  const erros: string[] = [];
  const pilaresVistos = new Set<number>();

  for (const { tabela, heading, erros: errosDaTabela } of tabelas) {
    erros.push(...errosDaTabela);
    const colDoc = coluna(tabela.cabecalho, 'Doc canônico');
    if (colDoc >= 0) {
      // Toda coluna da matriz é OBRIGATÓRIA: uma coluna renomeada faria
      // `dados[-1]` virar `undefined` e a medição daquele campo **desligar
      // em silêncio** (MEDIDO em 2026-11-18, falsificação do PR do kit: a
      // coluna `Âncoras` renomeada deixou os 14 itens sem âncora, verde).
      const obrigatorias = [
        'Item',
        'Doc canônico',
        'Tipo',
        'Âncoras',
        'Índice',
        'Condição',
        'Specialist',
        'Auditor',
      ];
      for (const nome of obrigatorias) {
        if (coluna(tabela.cabecalho, nome) < 0) {
          erros.push(
            `a matriz §2 (pilar ${pilarDoHeading(heading) ?? '?'}) não tem a coluna ` +
              `"${nome}" — a medição desse campo ficaria desligada em silêncio ` +
              '(regra: convenção kit-documentacao.md §2, formato das células).',
          );
        }
      }
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
      for (const { cels: dados, linha: linhaDoDado } of tabela.linhas) {
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
          linha: linhaDoDado,
        });
      }
      continue;
    }

    const colSkill = coluna(tabela.cabecalho, 'Skill de auditoria');
    const colPilar = coluna(tabela.cabecalho, 'Pilar');
    const colAuditor51 = coluna(tabela.cabecalho, 'Auditor');
    if (colPilar >= 0 && colSkill < 0) {
      // A §5.1 existe (tem a coluna Pilar) mas perdeu a coluna da skill: a
      // tabela inteira deixaria de ser lida, e com ela TODAS as reconciliações
      // de auditor (MEDIDO em 2026-11-18, falsificação do PR do kit).
      erros.push(
        'a §5.1 (pilar → auditor → skill) não tem a coluna "Skill de auditoria" — ' +
          'a tabela inteira deixaria de ser lida.',
      );
    }
    if (colSkill >= 0 && colPilar >= 0) {
      // A §5.1 — o auditor e a skill de CADA pilar. Ela é a fonte da segunda
      // reconciliação do gate: o auditor de um item tem que ser o do pilar
      // dele, e a skill tem que existir.
      const colAuditor = colAuditor51;
      for (const { cels: dados } of tabela.linhas) {
        const numero = valor(dados[colPilar]);
        const m = /(\d+)/.exec(numero);
        if (m === null) continue;
        pilares.push({
          pilar: Number(m[1]),
          auditor: valor(dados[colAuditor]),
          skill: valor(dados[colSkill]),
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
      for (const { cels: dados } of tabela.linhas) {
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

  // A §4 declara o padrão do gatilho em DUAS cópias: a célula da tabela e o
  // `grep -lE` da prosa logo abaixo. As duas têm que ser o mesmo padrão — um
  // typo em uma delas deixa o item sem doc PARA SEMPRE, com o gate verde
  // (MEDIDO em 2026-11-18, falsificação do PR do kit).
  const mComando = /grep -lE '([^']+)'/.exec(md);
  if (condicionais.length > 0) {
    if (mComando === null) {
      erros.push(
        'a §4 não traz o comando (grep -lE) que reproduz a medição do gatilho — ' +
          'a coluna "Padrão" sozinha não é um claim verificável.',
      );
    } else {
      const doComando = normalizarAlternativas(mComando[1]!);
      for (const d of condicionais) {
        const daCelula = normalizarAlternativas(d.padrao);
        if (daCelula.join('|') !== doComando.join('|')) {
          erros.push(
            `o padrão da coluna "${daCelula.join('|')}" e o comando da §4 ` +
              `"${doComando.join('|')}" não são o mesmo — o comando é o que ` +
              'reproduz a medição, e um dos dois desatualizado mede outra coisa.',
          );
        }
      }
    }
  }

  return {
    itens,
    condicionais,
    pilares,
    pilaresVistos: [...pilaresVistos].sort(),
    erros,
  };
}

/**
 * As alternativas de um padrão de regex: split por `|`, sem o escape de
 * markdown, ordenadas — para comparar duas cópias do mesmo padrão.
 */
export function normalizarAlternativas(padrao: string): string[] {
  return padrao
    .replace(/\\\|/g, '|')
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .sort();
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

/**
 * O resultado da sonda do item condicional.
 *
 * O terceiro estado (`erro`) é o que impede a **degradação silenciosa**: uma
 * sonda com regex inválida ou com glob que não casa nada NÃO pode virar
 * "não disparou" — porque "não disparou" é o estado que autoriza o item a
 * não ter doc. MEDIDO em 2026-11-18 (revisão do PR do kit): com o `catch`
 * devolvendo `false`, um typo no padrão deixava o AsyncAPI **para sempre**
 * sem doc, e o gate ficava verde.
 */
/**
 * A contagem de itens **declarada** no frontmatter da convenção (`itens: 14`).
 *
 * O frontmatter é a casa do dado versionado; a prosa do §1 cita o mesmo
 * número, e o gate compara os dois — a matriz que cresce em silêncio é a
 * classe 1 de `guard-classes.md`.
 */
export function itensDeclarados(md: string): number | null {
  const bloco = lerFrontmatter(md);
  if (!bloco.abre || bloco.fecha === null) return null;
  const campo = bloco.campos.find((c) => c.campo === 'itens');
  if (campo === undefined || campo.vazio) return null;
  const n = Number(campo.texto);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export type ResultadoDaSonda = 'disparou' | 'nao-disparou' | 'erro';

/** As entradas que a medição precisa — injetáveis para a spec. */
export interface Entradas {
  itens: ItemDoKit[];
  /**
   * A contagem de itens **declarada** na convenção (o frontmatter `itens`).
   *
   * MEDIDO em 2026-11-18 (falsificação do PR do kit): um 15º item, com doc,
   * âncoras e donos válidos, deixava o gate VERDE — o kit crescia em silêncio.
   * O número declarado é o dono do fato; o gate compara.
   */
  itensEsperados: number | null;
  condicionais: DeclaracaoCondicional[];
  /** Os pilares lidos da §5.1 (auditor e skill de cada um). */
  pilares: PilarDoKit[];
  /** O doc canônico existe? */
  existe: (caminho: string) => boolean;
  /** O conteúdo do arquivo (string vazia se não existe). */
  ler: (caminho: string) => string;
  /** Expande um glob nos arquivos que ele casa. */
  arquivos: (glob: string) => string[];
  /** O agent existe em `.agents/agents/`? */
  agentExiste: (nome: string) => boolean;
  /** A skill existe em `.agents/skills/`? */
  skillExiste: (nome: string) => boolean;
  /** O gatilho do item condicional: disparou, não disparou, ou a sonda não mede. */
  sonda: (declaracao: DeclaracaoCondicional) => ResultadoDaSonda;
}

/**
 * O índice **cita** o doc como link?
 *
 * ⚠️ O `includes(basename)` aceitava a menção do nome em qualquer prosa —
 * MEDIDO em 2026-11-18 (falsificação do PR do kit): o nome do arquivo
 * aparecendo numa frase já bastava. A citação de um índice é um **link**:
 * `](<caminho que termina no basename>)`.
 */
export function citaComoLink(indice: string, base: string): boolean {
  const alvo = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Duas formas de CITAÇÃO: link (`[texto](caminho)`) ou code span
  // (`` `arquivo.md` ``). Nenhuma delas é a menção em prosa — que é o que a
  // comparação por `includes` aceitava (MEDIDO em 2026-11-18, falsificação
  // do PR do kit).
  const re = new RegExp('(\\]\\([^)]*' + alvo + '\\)|`' + alvo + '`)');
  return re.test(indice);
}

/**
 * Normaliza o texto de uma célula para comparação: minúsculas, sem acento,
 * sem `**` e com espaço colapsado.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\*+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A célula da §4 declara a **não-aplicabilidade**?
 *
 * ⚠️ O teste "a célula está preenchida" não serve: o valor `**não**` (que
 * significa "o item **se aplica**") contava como declaração, e o doc deixava
 * de ser exigido. MEDIDO em 2026-11-18 (revisão do PR do kit). A célula só
 * declara não-aplicabilidade quando começa com **sim**.
 */
export function declaraNaoAplicavel(texto: string): boolean {
  return normalizar(texto).startsWith('sim');
}

/** A célula da §4 diz que o item **se aplica** (o valor "não")? */
export function declaraQueSeAplica(texto: string): boolean {
  return normalizar(texto).startsWith('nao');
}

/**
 * A âncora casa com o doc?
 *
 * Para doc **markdown**, a âncora é uma linha de heading. O `includes()` puro
 * aceitava `## Contexto do Negocio` como se fosse `## Contexto` — MEDIDO em
 * 2026-11-18 (revisão do PR do kit). A regra:
 *
 * - a âncora casa com um heading **igual** a ela; ou
 * - casa com um heading que **começa** por ela, **se** o último caractere da
 *   âncora não for letra ou dígito (o `## §1.` casa com `## §1. Ambiente 2 —
 *   ...`; o `## Contexto` NÃO casa com `## Contexto do Negocio`).
 *
 * Para o tipo `artefato` (JSON gerado), a âncora é uma **chave literal** e a
 * comparação é por substring — JSON não tem heading.
 */
export function casaAncora(ancora: string, conteudo: string, tipo: TipoDeDoc): boolean {
  // A âncora que começa com `#` é um HEADING; as outras são literais
  // (`erDiagram` dentro de um diagrama, `"paths"` dentro de um JSON).
  if (tipo === 'artefato' || !ancora.startsWith('#')) return conteudo.includes(ancora);
  const ultimo = [...ancora].at(-1) ?? '';
  const prefixo = !/[A-Za-z0-9]/.test(ultimo);
  let dentroDeCerca = false;
  for (const linha of conteudo.split('\n')) {
    const t = linha.trim();
    // Um heading DENTRO de um bloco de código é o **template** que o doc
    // oferece, não uma seção do doc: o `## Resumo` de um template de
    // post-mortem não é a seção "Resumo" do post-mortem.
    if (t.startsWith('```')) {
      dentroDeCerca = !dentroDeCerca;
      continue;
    }
    if (dentroDeCerca || !t.startsWith('#')) continue;
    if (t === ancora) return true;
    if (prefixo && t.startsWith(ancora)) return true;
  }
  return false;
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

  // A §5.1 (pilar → auditor → skill) é a fonte do auditor de cada item.
  // Sem uma linha por pilar, a reconciliação auditor↔pilar é pulada em
  // silêncio (MEDIDO em 2026-11-18, falsificação do PR do kit).
  if (entradas.pilares.length !== PILARES.length) {
    errors.push(
      `a §5.1 declara ${entradas.pilares.length} auditor(es) e o kit tem ` +
        `${PILARES.length} pilares — a reconciliação auditor↔pilar seria pulada em ` +
        'silêncio, e uma skill que sumisse do disco não seria notada.',
    );
  }
  for (const pilar of PILARES) {
    if (!entradas.pilares.some((p) => p.pilar === pilar)) {
      errors.push(`a §5.1 não declara o auditor do Pilar ${pilar}.`);
    }
  }

  if (entradas.itensEsperados === null) {
    errors.push(
      `a convenção não declara a contagem de itens (frontmatter "itens:") — o gate ` +
        'não pode inventar o número, e sem a declarado a contagem não é medida.',
    );
  } else if (entradas.itensEsperados > 0) {
    if (entradas.itens.length !== entradas.itensEsperados) {
      errors.push(
        `a matriz tem ${entradas.itens.length} item(ns) e a convenção declara ` +
          `${entradas.itensEsperados} — o kit mudou de tamanho sem a convenção ` +
          `mudar junto (fato com UM dono). A contagem é o frontmatter "itens:" de ` +
          `${CONVENCAO}.`,
      );
    }
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

  // A §5.1: o auditor de cada pilar e a skill que ele carrega.
  for (const pilar of entradas.pilares) {
    if (pilar.skill !== '' && !entradas.skillExiste(pilar.skill)) {
      errors.push(
        `Pilar ${pilar.pilar}: a skill de auditoria "${pilar.skill}" não existe em ` +
          '.agents/skills/ — a §5.1 declara uma skill que ninguém carrega.',
      );
    }
  }

  const vistos = new Set<string>();
  const vistosNumero = new Set<string>();
  for (const item of entradas.itens) {
    // A linha da convenção vai na mensagem: um erro que não diz ONDE corrigir
    // obriga o leitor a caçar a linha (MEDIDO em 2026-11-18, falsificação).
    const quem = `item ${item.numero} ("${item.item}") — ${CONVENCAO} linha ${item.linha}`;

    if (vistos.has(item.item)) {
      errors.push(`${quem}: o item está repetido na matriz — um item por linha.`);
    }
    vistos.add(item.item);
    if (item.numero !== '') {
      if (vistosNumero.has(item.numero)) {
        errors.push(
          `${quem}: o número "${item.numero}" já é de outro item — a numeração da ` +
            'matriz é única (a coluna `#` é o índice do item).',
        );
      }
      vistosNumero.add(item.numero);
    }

    if (!(['arquivo', 'familia', 'artefato'] as string[]).includes(item.tipo)) {
      errors.push(
        `${quem}: tipo "${item.tipo}" não é um tipo que o gate sabe medir ` +
          '(arquivo, familia ou artefato).',
      );
    }

    // O auditor do item tem que ser o do pilar dele (a §5.1 é a fonte).
    const pilar = entradas.pilares.find((p) => p.pilar === item.pilar);
    if (pilar !== undefined && pilar.auditor !== '' && item.auditor !== pilar.auditor) {
      errors.push(
        `${quem}: o auditor "${item.auditor}" não é o auditor do Pilar ${item.pilar} ` +
          `("${pilar.auditor}"), declarado na §5.1 da convenção.`,
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
        const resultado = entradas.sonda(declaracao);
        if (resultado === 'erro') {
          errors.push(
            `${quem}: a sonda do gatilho NÃO mede ("${declaracao.gatilho}") — uma ` +
              'sonda cega não autoriza a não-aplicabilidade, e o doc é exigido ' +
              'até a sonda medir (regra: convenção kit-documentacao.md §4).',
          );
        } else {
          const disparou = resultado === 'disparou';
          const dizSim = declaraNaoAplicavel(declaracao.declaracao);
          const dizNao = declaraQueSeAplica(declaracao.declaracao);
          if (disparou && dizSim) {
            errors.push(
              `${quem}: a declaração de não-aplicabilidade parou de valer — o gatilho ` +
                `disparou ("${declaracao.gatilho}"). Remova a declaração.`,
            );
          }
          if (!disparou && dizSim) {
            naoAplicavel = true;
          } else if (!disparou && !dizNao) {
            errors.push(`${quem}: item condicional sem declaração de não-aplicabilidade (§4).`);
          } else if (!disparou && dizNao) {
            errors.push(
              `${quem}: a §4 diz que o item SE APLICA, mas o gatilho não disparou — ` +
                'ou a sonda está errada, ou a declaração está.',
            );
          }
        }
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
          if (!casaAncora(ancora, conteudo, item.tipo)) {
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
          if (!citaComoLink(conteudo, base)) {
            errors.push(
              `${quem}: o índice "${item.indice}" não cita "${base}" como link nem ` +
                'como code span — um índice que não lista o que existe é índice de ' +
                'ficção.',
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

/**
 * Os arquivos **versionados** — o conjunto que o CI vai medir.
 *
 * ⚠️ A árvore de trabalho mentia: um arquivo no disco e **fora** do índice
 * (o `git rm --cached`) deixava o gate verde aqui e reprovava no CI, onde o
 * arquivo não existe. MEDIDO em 2026-11-18 (falsificação do PR do kit).
 * O `check-doc-coverage` já mede pelo `git ls-files` pelo mesmo motivo.
 *
 * Sem git (o gate roda num repo sem repositório?), a lista cai para a
 * varredura — e a ressalva diz isso, em vez de fingir que mediu o versionado.
 */
async function listarArquivos(
  repoRoot: string,
): Promise<{ arquivos: string[]; versionado: boolean }> {
  try {
    const saida = execFileSync('git', ['ls-files'], {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { arquivos: saida.split('\n').filter((l) => l.trim() !== ''), versionado: true };
  } catch {
    const arquivos = await listarArquivosNoDisco(repoRoot, '');
    return { arquivos, versionado: false };
  }
}

/** A varredura do disco — o plano B quando não há git. */
async function listarArquivosNoDisco(repoRoot: string, base = ''): Promise<string[]> {
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
      achados.push(...(await listarArquivosNoDisco(repoRoot, relativo)));
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

  const { arquivos: todos, versionado } = await listarArquivos(root);
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

  /**
   * A sonda do gatilho — com o terceiro estado.
   *
   * Uma sonda que NÃO mede (regex que não compila, ou glob que não casa
   * arquivo nenhum) devolve `erro`: o gate recusa a não-aplicabilidade, porque
   * "não disparou" é justamente o estado que autoriza o item a não ter doc.
   */
  const sonda = (declaracao: DeclaracaoCondicional): ResultadoDaSonda => {
    if (declaracao.padrao === '') return 'erro';
    let re: RegExp;
    try {
      re = new RegExp(declaracao.padrao);
    } catch {
      return 'erro';
    }
    if (declaracao.sondas.length === 0) return 'erro';
    for (const sondaGlob of declaracao.sondas) {
      const arquivosDaSonda = casaCom(sondaGlob);
      // UM glob morto é uma sonda cega: o broker real fica invisível e o
      // item continua sem doc, com o gate verde (MEDIDO em 2026-11-18,
      // falsificação do PR do kit: `apps/*/package.jsom` escondeu o broker
      // de `apps/api/package.json`).
      if (arquivosDaSonda.length === 0) return 'erro';
      for (const arquivo of arquivosDaSonda) {
        if (re.test(ler(arquivo))) return 'disparou';
      }
    }
    return 'nao-disparou';
  };

  const skillExiste = (nome: string): boolean =>
    todos.some((a) => a === path.join('.agents', 'skills', nome, 'SKILL.md'));

  const errors = [
    ...matriz.erros,
    ...lacunasDoKit({
      itens: matriz.itens,
      itensEsperados: itensDeclarados(md),
      condicionais: matriz.condicionais,
      pilares: matriz.pilares,
      existe,
      ler,
      arquivos: casaCom,
      agentExiste,
      skillExiste,
      sonda,
    }),
  ];

  const advisories: string[] = [];
  advisories.push(
    `medido: ${matriz.itens.length} item(ns) do kit em ${matriz.pilaresVistos.length} pilar(es) ` +
      `(${matriz.pilares.length} auditor(es) na §5.1).`,
  );
  if (!versionado) {
    advisories.push(
      'escopo: o `git ls-files` falhou — o gate mediu a ÁRVORE DE TRABALHO, não o ' +
        'conjunto versionado. Um arquivo fora do índice passa aqui e reprova no CI.',
    );
  }

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
