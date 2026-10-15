// .tooling/scripts/ci/check-memory-crystallization.ts
//
// pt-BR: Check de CRISTALIZAÇÃO — fecha o laço entre o que o agente aprende
// DURANTE a tarefa e o que o repo passa a saber DEPOIS.
//
// Task 1.1 do plano docs/superpowers/plans/2026-10-14-cristalizacao.md.
//
// O problema: o harness já escreve memória estruturada durante a tarefa
// (`grep -l '^ *originSessionId:' <memdir>/*.md | wc -l` sobre
// `ls -1 <memdir>/*.md | wc -l` — o número ENVELHECE a cada memória nova, e a
// memória que registra o achado é uma delas; cite o comando, não o número).
// ⚠️ `grep -l '^originSessionId:'` devolve 0 SEM AVISO (exit 1): a chave é
// aninhada em `metadata:` e indentada com 2 espaços. O padrão certo é
// `'^ *originSessionId:'` — sem o `^`, casa em qualquer posição e dá o
// número certo por motivo certo.
// O que falta é a etapa DEPOIS: boa parte do corpus não tem
// destino — a dívida declarada (`pendente`) é o bulk, e `recusada` e `removida`
// são menores (MEDIDO pelo parser do gate; para os valores de hoje, o painel
// do `ci:preflight` é a fonte). São números DIFERENTES: `pendente` é só a
// dívida declarada, e usá-lo como se fosse "não citada" apaga as outras da
// conta. A regra foi absorvida pela
// convenção sem que a procedência sobrevivesse, e sem procedência ninguém sabe
// se aquilo já foi decidido.
//
// A classe 1 deste check: um gate de cristalização cuja cobertura é
// declarativa não liga nada. Por isso a tabela de triagem é lida NAS DUAS
// direções, e a coluna `âncora` é conferida contra o arquivo citado — é ela
// que envelhece quando alguém reescreve a convenção, que é a forma que a
// regra some sem ninguém perceber.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { CheckResult } from './check-types.js';
import { canonicalMemoryDir } from './check-memory-dir-concordance.js';

/**
 * Onde a triagem mora. `runs/` é o diretório de registro — o ledger é a
 * evidência de que cada memória foi lida, não uma segunda declaração de nada.
 */
export const TRIAGE_FILE = '.agents/runs/memory-triage.md';

/** As cinco destinações possíveis. `pendente` é dívida declarada, não destino. */
export const DISPOSITIONS = ['citada', 'gate', 'recusada', 'removida', 'pendente'] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export interface TriageRow {
  /** Slug da memória, sem `.md`. */
  slug: string;
  disposition: Disposition;
  /** Caminho repo-relativo (só em `citada`/`gate`), ou o motivo (em `recusada`/`removida`). */
  target: string;
  /** Trecho verbatim que tem de continuar existindo no `target` (só em `citada`). */
  anchor: string;
  line: number;
}

/**
 * As exclusões, e cada uma com o motivo — exclusão sem motivo é o que a
 * `guard-classes` §3 proíbe.
 *
 * As três são vocabulary REAL do corpus, medido 2026-10-14 com
 * `grep -h "^  type:" <memdir>/*.md | sort | uniq -c`: `feedback` 55,
 * `project` 53, `reference` 3. A versão anterior deste plano usava `state: true`,
 * que casa **0** arquivos — um gate que nunca dispara, escrito por um plano
 * cujo tema é justamente não escrever gates que nunca disparam.
 */
export const EXEMPTIONS: ReadonlyArray<{
  name: string;
  why: string;
  test: (file: string, content: string) => boolean;
}> = [
  {
    name: 'MEMORY.md',
    why: 'o índice do diretório, não uma memória',
    test: (file) => file === 'MEMORY.md',
  },
  {
    name: '*-result.md',
    why:
      'resultado de campanha: narrativa com vida finita, não regra. Nenhum gate os mede — ' +
      'o `check-archive-integrity` valida `.agents/runs/archive/`, que é outro conjunto, ' +
      'hoje com 0 arquivos. MEDIDO 2026-10-14: 39 isentos, e pelo menos 2 deles ' +
      '(`b40`, `b41`) guardam regra reutilizável que não chegou a nenhum `.md` ' +
      'versionado — dívida declarada no ledger, não ausência de dívida',
    test: (file) => file.endsWith('-result.md'),
  },
  {
    name: 'type: reference',
    why: 'ponteiro para recurso externo; a regra aplicável já é do recurso, não da memória',
    test: (_file, content) => /^ {2}type: reference$/m.test(content),
  },
];

/**
 * Memórias do diretório de memória que o gate mede: as que NÃO são isentas.
 *
 * Devolve slugs (sem `.md`), não paths absolutos: o `target` da tabela é
 * relativo ao repo, e um path de máquina aqui viraria a segunda declaração
 * do destino que o `check-memory-dir-concordance` existe para impedir.
 */
export function corpusOf(memoryDir: string): string[] {
  if (!existsSync(memoryDir)) return [];
  return readdirSync(memoryDir, { withFileTypes: true })
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.md'))
    .filter((dirent) => {
      const content = readFileSync(join(memoryDir, dirent.name), 'utf8');
      // O parâmetro se chama `exempt`, não `e`: com `e` ele sombreia o
      // `Dirent` e `e.test(e.name, …)` passa a chamar a PRÓPRIA exclusão com
      // o nome dela — `MEMORY.md === 'MEMORY.md'` é verdadeiro para todo
      // arquivo, e o corpus inteiro é isento. MEDIDO 2026-10-14: foi assim que
      // o gate nasceu medindo 0 sem nunca reportar isso.
      return !EXEMPTIONS.some((exempt) => exempt.test(dirent.name, content));
    })
    .map((dirent) => dirent.name.replace(/\.md$/, ''))
    .sort();
}

/**
 * Divide uma linha de tabela em células. Um `|` protegido por backslash (`\|`),
 * que é como o markdown escreve um pipe literal dentro de uma célula, não divide.
 *
 * MEDIDO 2026-10-14: o `split('|')` anterior cortava a coluna `âncora` no
 * primeiro `|` e, quando a âncora transbordava para uma 5ª célula, o transbordo
 * era **descartado em silêncio** — a metade que o autor não escreveu nunca era
 * conferida, e o gate ficava `✓` com uma âncora que não existe em lugar
 * nenhum. O `\|` é o que permite citar uma célula de tabela do markdown como
 * âncora; o `split` cru é que não cumpria.
 */
function splitCells(row: string): string[] {
  const body = row.slice(1, -1);
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch === '\\' && body[i + 1] === '|') {
      cur += '|';
      i++;
      continue;
    }
    if (ch === '|') {
      cells.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/**
 * Lê a tabela de triagem. Linhas que não são linhas da tabela (cabeçalho,
 * separador, nota) são ignoradas; uma linha de tabela que não declara uma
 * destinação VÁLIDA é erro de forma e sobe para o caller decidir.
 *
 * O `|` de uma âncora se escreve `\|`, e a linha tem **exatamente** 4 células:
 * é o que impede que uma âncora transbordando para uma 5ª seja conferida pela
 * metade e o resto sumir sem aviso.
 */
export function parseTriage(content: string): { rows: TriageRow[]; malformed: string[] } {
  const rows: TriageRow[] = [];
  const malformed: string[] = [];
  const lines = content.split('\n');
  const unquote = (c: string): string => c.replace(/^`(.*)`$/s, '$1').trim();
  let emTabelaTriagem = false;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.trim();
    const line = i + 1;
    if (!raw.startsWith('|')) {
      // Linha em branco NÃO fecha a tabela: um `\n` plantado logo abaixo do
      // cabeçalho desligaria a acusação de forma sem tocar em nenhuma linha de
      // triagem — o mesmo verde falso por outra porta. O que fecha a tabela é
      // prosa, não silêncio.
      if (raw !== '') emTabelaTriagem = false;
      continue;
    }
    // Começar com `|` é tentativa de linha de tabela mesmo sem o pipe final.
    // MEDIDO 2026-10-15: no arranjo anterior esta linha caía no mesmo ramo da
    // prosa, e o `emTabelaTriagem = false` que vinha junto desligava a acusação
    // de forma de TODAS as linhas seguintes — uma única linha dessas no meio da
    // tabela silenciava o gate inteiro, e ela própria não virava `row` nem
    // `malformed`. Agora ela é acusada em voz alta e a mesa continua armada.
    if (!raw.endsWith('|')) {
      if (emTabelaTriagem) {
        malformed.push(`linha ${line}: falta o \`|\` final — linha quebrada`);
      }
      continue;
    }
    const cells = splitCells(raw);

    // <> 4 células é linha QUEBRADA, não "não é linha de tabela": pular em
    // silêncio tirava do `findPhantomRows` a única acusação que ele tinha,
    // e da `âncora` a metade que ninguém escreveu.
    //
    // O que decide é o CABEÇALHO, e não o conteúdo da linha. MEDIDO 2026-10-14:
    // a guarda anterior perguntava se a 2ª célula era uma disposição VÁLIDA, e a
    // janela era a própria pergunta — quando a disposição é a célula que sumiu
    // ou que tem typo, justamente o caso que mais precisa de acusação, a guarda
    // deixava de reconhecer a linha e a descartava calada. Das 6 formas de linha
    // quebrada medidas, 3 fugiam; o transbordo de âncora para a 5ª célula — o
    // defeito original — voltava a ser silencioso desde que o autor também
    // errasse a disposição. O cabeçalho nomeia as colunas e ninguém o escreve
    // por engano.
    const ehCabecalho = unquote(cells[1] ?? '') === 'disposição';
    if (ehCabecalho) emTabelaTriagem = true;

    if (cells.length !== 4) {
      if (emTabelaTriagem) {
        malformed.push(
          `linha ${line}: ${cells.length} célula(s), esperado 4 — linha quebrada ` +
            `(um \`|\` de âncora se escapa como \`\\|\`)`,
        );
      }
      continue;
    }

    if (ehCabecalho) continue;
    if (cells[1]!.replaceAll('`', '').startsWith('-')) continue;

    const slug = unquote(cells[0]!);
    const disposition = unquote(cells[1]!) as Disposition;

    if (!slug) {
      malformed.push(`linha ${line}: memória sem slug`);
      continue;
    }
    if (!(DISPOSITIONS as readonly string[]).includes(disposition)) {
      malformed.push(
        `linha ${line}: destinação "${disposition}" fora de {${DISPOSITIONS.join(', ')}}`,
      );
      continue;
    }
    rows.push({
      slug,
      disposition,
      target: unquote(cells[2]!),
      anchor: unquote(cells[3]!),
      line,
    });
  }
  return { rows, malformed };
}

/**
 * Memória no disco que o ledger não cobriu. É a direção que impede a
 * evaporação: nada é capturado sem que alguém tenha decidido o destino.
 */
export function findUncovered(corpus: string[], rows: TriageRow[]): string[] {
  const known = new Set(rows.map((r) => r.slug));
  return corpus.filter((slug) => !known.has(slug));
}

/**
 * Linha do ledger que aponta para uma memória que não existe mais.
 *
 * A direção inversa importa por um motivo que a primeira não cobre: um ledger só
 * de acréscimo transforma uma memória apagada em citação permanente de um
 * arquivo que ninguém mais tem. `removida:` é a saída — é o que permite ao
 * corpus ENCOLHER em vez de só crescer.
 */
export function findPhantomRows(rows: TriageRow[], corpus: string[]): TriageRow[] {
  const real = new Set(corpus);
  return rows.filter((r) => !real.has(r.slug) && r.disposition !== 'removida');
}

/** `alvo` que não existe no disco — vale para `citada:` e para `gate:`. */
export function findMissingTargets(repoRoot: string, rows: TriageRow[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    if (r.disposition !== 'citada' && r.disposition !== 'gate') continue;
    if (!r.target || r.target === '-') {
      out.push(`linha ${r.line}: ${r.slug} é "${r.disposition}" e não declara alvo`);
      continue;
    }
    if (!existsSync(join(repoRoot, r.target))) {
      out.push(`linha ${r.line}: ${r.slug} aponta para ${r.target}, que não existe`);
    }
  }
  return out;
}

/**
 * A âncora que deixou de existir no arquivo citado — ESTE é o dente.
 *
 * Sem esta conferência a coluna `citada:` é decoração: a regra foi absorvida
 * pela convenção, alguém reescreve a convenção por motivo legítimo, e a
 * memória continua "citada" por uma frase que não está mais lá. O sintoma
 * (regra apagada, procedência intacta) é indistinguível de sucesso.
 */
export function findStaleAnchors(repoRoot: string, rows: TriageRow[]): string[] {
  const out: string[] = [];
  for (const r of rows) {
    if (r.disposition !== 'citada') continue;
    if (!r.anchor || r.anchor === '-') {
      out.push(`linha ${r.line}: ${r.slug} é "citada" e não declara âncora`);
      continue;
    }
    const path = join(repoRoot, r.target);
    if (!existsSync(path)) continue; // já reportado por `findMissingTargets`
    if (!readFileSync(path, 'utf8').includes(r.anchor)) {
      out.push(`linha ${r.line}: ${r.slug} — a âncora "${r.anchor}" não está mais em ${r.target}`);
    }
  }
  return out;
}

export function checkMemoryCrystallization(opts: { repoRoot: string }): CheckResult {
  const repoRoot = resolve(opts.repoRoot);

  // A derivação é a de `check-memory-dir-concordance`, importada. Uma segunda
  // cópia envelheceria junto com a linha canônica, sem nenhum gate apontando
  // para a diferença.
  const derived = canonicalMemoryDir(repoRoot);
  if (!derived.ok) {
    return { ok: true, errors: [], skipped: true, reason: derived.error };
  }
  if (!existsSync(derived.dir)) {
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `diretório de memória ausente (${relative(repoRoot, derived.dir)}) — o corpus vive em $HOME, então este gate é camada 1 local`,
    };
  }

  const triagePath = join(repoRoot, TRIAGE_FILE);
  if (!existsSync(triagePath)) {
    return { ok: false, errors: [`ledger de cristalização ausente (${TRIAGE_FILE})`] };
  }

  const corpus = corpusOf(derived.dir);
  const { rows, malformed } = parseTriage(readFileSync(triagePath, 'utf8'));
  const errors = [...malformed];
  const advisories: string[] = [];

  if (corpus.length === 0) {
    // Conjunto vazio com `ok: true` é a classe que este gate existe para
    // impedir: ninguém teria lido nada e o painel mostraria ✓.
    return {
      ok: false,
      errors: [
        'corpus de memórias isento por completo (0 arquivos medidos) — o gate não tem o que verificar',
      ],
    };
  }
  if (rows.length === 0) {
    return {
      ok: false,
      errors: [
        `ledger sem linhas de tabela (${TRIAGE_FILE}) — ${corpus.length} memória(s) sem destinação`,
      ],
    };
  }

  const uncovered = findUncovered(corpus, rows);
  if (uncovered.length > 0) {
    errors.push(
      `${uncovered.length} memória(s) sem destinação em ${TRIAGE_FILE}:\n` +
        uncovered.map((s) => `    ${s}`).join('\n'),
    );
  }

  const phantoms = findPhantomRows(rows, corpus);
  if (phantoms.length > 0) {
    errors.push(
      `${phantoms.length} linha(s) do ledger apontam para memórias que não existem mais ` +
        `(use \`removida:\` para uma tombstone):\n` +
        phantoms.map((r) => `    linha ${r.line}: ${r.slug}`).join('\n'),
    );
  }

  errors.push(...findMissingTargets(repoRoot, rows));
  errors.push(...findStaleAnchors(repoRoot, rows));

  const pendentes = rows.filter((r) => r.disposition === 'pendente');
  if (pendentes.length > 0) {
    advisories.push(
      `${pendentes.length} memória(s) com destinação \`pendente\` — dívida declarada, não resolvida: ` +
        pendentes.map((r) => r.slug).join(', '),
    );
  }

  if (uncovered.length > 0 || phantoms.length > 0) {
    errors.push(
      `ledger: ${TRIAGE_FILE}. Toda memória precisa de uma destinação, e toda linha precisa de uma memória.`,
    );
  }

  // Memória contada, não afirmada: o painel mostra o que foi medido, que é o
  // que distingue este gate de um que só declara cobertura.
  advisories.push(
    `medido: ${corpus.length} memória(s) no corpus, ${rows.length} linha(s) no ledger.`,
  );
  advisories.push(
    `escopo: camada 1 local. O corpus vive fora do repo, então o CI runner não tem o que medir e reporta \`skipped\`.`,
  );

  return { ok: errors.length === 0, errors, advisories };
}

if (process.argv[1]?.endsWith('check-memory-crystallization.ts')) {
  const r = checkMemoryCrystallization({ repoRoot: '.' });
  for (const line of [...r.errors, ...(r.advisories ?? [])]) console.log(line);
  if (r.skipped) console.log(`(skipped: ${r.reason})`);
  process.exit(r.ok ? 0 : 1);
}
