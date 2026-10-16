// tooling/scripts/flow-ir-to-mermaid.ts
//
// pt-BR: Converte a IR de fluxo do archify (`docs/flows/**/*.json`) em
// diagrama Mermaid embutido num `.md`.
//
// POR QUE EXISTE: o archify emitia dois artefatos por flow — a IR (JSON,
// ~6 KB, schema estavel) e o HTML (813 KB, JS embutido). A IR e
// independente de ferramenta; o HTML nao. E o HTML e o motivo pelo qual
// nenhum dos 78 flows foi atualizado desde 2026-09-25: blob de 813 KB nao
// aparece em diff de PR, entao nenhum reviewer, nenhum `doc-sync` e nenhum
// `check-doc-refs` consegue ver mudanca de fluxo. Mermaid resolve no texto
// versionado.
//
// A IR e DE LAYOUT, nao semantica: `messages`, `segments` e `activations`
// carregam coordenada `y` em pixel. Este conversor ignora `y` como posicao e
// re-deriva ordem e agrupamento a partir dele.
//
// O QUE SE PERDE, e e proposital: (a) `meta.views[]` — mermaid tem um
// diagrama por bloco e nao um toggle de view, entao os views viram tabela
// depois do diagrama, com o conteudo preservado; (b) `animation`,
// `visual_preset`, `quality_profile` — presentacao, nao informacao.
//
// CLI:
//   tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence [--write]

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export interface SequenceParticipant {
  id: string;
  label: string;
  sublabel?: string | null;
  type?: string;
}
export interface SequenceMessage {
  from: string;
  to: string;
  label: string;
  variant?: string;
  y: number;
}
export interface SequenceSegment {
  from: number;
  to: number;
  label?: string;
}
export interface SequenceActivation {
  participant: string;
  from: number;
  to: number;
  type?: string;
}
export interface SequenceCard {
  title?: string;
  items?: string[];
  dot?: string;
}
export interface SequenceView {
  id: string;
  label?: string;
  focus?: string[];
  note?: string;
}
export interface SequenceIr {
  schema_version: number;
  diagram_type: string;
  meta: {
    title?: string;
    subtitle?: string;
    views?: SequenceView[] | null;
    [k: string]: unknown;
  };
  participants: SequenceParticipant[];
  segments?: SequenceSegment[] | null;
  messages: SequenceMessage[];
  activations?: SequenceActivation[] | null;
  cards?: SequenceCard[] | null;
}

// MEDIDO 2026-10-15 nas 15 IRs `sequence` e conferido contra a GRAMATICA
// (mermaid `sequenceDiagram.jison`, branch develop), nao contra a doc:
//
//   texto de mensagem / titulo de rect : `":"[^#\n;]*`  -> `#` e `;` MATAM a
//     linha; o corpus tem 0 dos dois, mas sao caracteres de markdown, entao um
//     titulo de segmento novo pode trazer um. `main()` aborta nesse caso em vez
//     de emitir 78 arquivos que o GitHub renderiza em branco.
//   alias de participant : `[^#\n;]*` -> `<br/>` e permitido (e e assim que a
//     quebra de linha do sublabel funciona).
//   id de participant    : `[^<>:\n,;@\s]+` -> medido `[A-Za-z0-9_]` no corpus.
//   endpoint de mensagem : idem, e sem `-`, entao id com hífen quebraria.
//
// O resto e escape de marcacao: `<` QUANDO iniciaria tag (o `<=` de SQL e
// comparacao numerica, e literal), aspas dupla, e `\n` -> `<br/>`.
//
// A ordem importa: escapa a marcacao que o texto JA tinha e so DEPOIS converte
// `\n` em `<br/>`. Ao contrario, a quebra que a propria funcao produz seria
// escapada na etapa seguinte.
export function escapeMermaidText(texto: string): string {
  return texto
    .replace(/<(?=\/?[A-Za-z])[^<>]*>?/g, (m) => m.replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .replace(/"/g, '&quot;')
    .replace(/\r?\n/g, '<br/>');
}

interface Franja {
  de: number;
  ate: number;
}

/** Converte uma faixa de coordenada `y` em faixa de indice na lista ordenada. */
function paraIndices(faixa: { from: number; to: number }, ordenados: SequenceMessage[]): Franja {
  const dentro = ordenados.filter((m) => m.y >= faixa.from && m.y <= faixa.to);
  const primeiro = dentro[0];
  const ultimo = dentro[dentro.length - 1];
  if (!primeiro || !ultimo) return { de: -1, ate: -1 };
  return { de: ordenados.indexOf(primeiro), ate: ordenados.indexOf(ultimo) };
}

/** `filter(Boolean)` nao estreita o tipo; este sim. */
const naoVazio = (s: string | null | undefined): s is string => typeof s === 'string' && s !== '';

export function sequenceToMermaid(ir: SequenceIr): string {
  const msgs = [...ir.messages].sort((a, b) => a.y - b.y);
  const participantes = ir.participants ?? [];
  const nomes = participantes.map((p) => p.id);

  const segmentos = [...(ir.segments ?? [])]
    .sort((a, b) => a.from - b.from)
    .map((s) => ({ ...s, faixa: paraIndices(s, msgs) }))
    .filter((s) => s.faixa.de >= 0);

  // `usada` e separada de `aberta` de proposito: uma activation fecha quando a
  // mensagem passa do `to`, mas as mensagens seguintes continuam satisfazendo
  // `y >= from` — sem o flag, a mesma activation reabre a cada mensagem
  // (MEDIDO: 9 activations viravam 50 `activate` no health-check).
  const activations = (ir.activations ?? []).map((a) => ({ ...a, aberta: false, usada: false }));

  const linhas: string[] = ['sequenceDiagram'];

  for (const p of participantes) {
    const nome = [p.label, p.sublabel].filter(naoVazio).map(escapeMermaidText).join('<br/>');
    linhas.push(`    participant ${p.id} as ${nome}`);
  }

  msgs.forEach((m, i) => {
    for (const s of segmentos) {
      if (s.faixa.de === i) linhas.push(`    rect ${escapeMermaidText(s.label ?? '')}`.trimEnd());
    }
    for (const a of activations) {
      if (!a.usada && m.y >= a.from && nomes.includes(a.participant)) {
        linhas.push(`    activate ${a.participant}`);
        a.aberta = true;
        a.usada = true;
      }
    }

    // `return` volta do servidor: pontilhada. O resto, solida.
    const seta = m.variant === 'return' ? '-->>' : '->>';
    linhas.push(`    ${m.from}${seta}${m.to}: ${escapeMermaidText(m.label)}`);

    for (const a of activations) {
      if (a.aberta && m.y >= a.to) {
        linhas.push(`    deactivate ${a.participant}`);
        a.aberta = false;
      }
    }
    for (const s of segmentos) {
      if (s.faixa.ate === i) linhas.push('    end');
    }
  });

  // Ativacao que nunca fechou porque a faixa va ate depois da ultima mensagem.
  for (const a of activations) {
    if (a.aberta && nomes.includes(a.participant)) linhas.push(`    deactivate ${a.participant}`);
  }

  const cards = (ir.cards ?? []).filter((c) => c.title || c.items?.length);
  if (cards.length > 0 && nomes.length > 0) {
    const alvo = `${nomes[0]},${nomes[nomes.length - 1]}`;
    for (const c of cards) {
      const corpo = [c.title, ...(c.items ?? [])]
        .filter(naoVazio)
        .map(escapeMermaidText)
        .join('<br/>');
      linhas.push(`    Note over ${alvo}: ${corpo}`);
    }
  }

  return linhas.join('\n');
}

/** `<details>` de provenance + diagrama + views preservados. */
export function renderFlowDoc(ir: SequenceIr, irPath: string): string {
  const diagrama = sequenceToMermaid(ir);
  const views = (ir.meta?.views ?? []).filter(Boolean);

  const partes: string[] = [];
  partes.push(`# ${ir.meta?.title ?? basename(irPath)}`);
  partes.push('');
  if (ir.meta?.subtitle) partes.push(`> ${ir.meta.subtitle}`, '');
  partes.push(
    '> Diagrama derivado da IR `' + irPath + '` pelo conversor',
    '> `tooling/scripts/flow-ir-to-mermaid.ts` — regenerar com',
    '> `pnpm tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write`.',
    '> O `.html` ao lado (~813 KB) foi produzido pelo `archify flow`, removido;',
    '> segue versionado como histórico e não é regenerável.',
    '',
  );
  partes.push('```mermaid', diagrama, '```', '');

  if (views.length > 0) {
    partes.push(
      '## Views',
      '',
      '> A IR declara N views; Mermaid não tem troca de view, então o diagrama',
      '> acima é a união e o conteúdo específico de cada uma fica aqui.',
      '',
      '| View | Rótulo | Foco | Nota |',
      '|------|--------|------|------|',
    );
    for (const v of views) {
      partes.push(
        `| \`${v.id}\` | ${v.label ?? ''} | ${(v.focus ?? []).map((f) => `\`${f}\``).join(', ')} | ${v.note ?? ''} |`,
      );
    }
    partes.push('');
  }

  return partes.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const FLOWS_DIR = join(process.cwd(), 'docs', 'flows');

function cadaIr(raiz: string): string[] {
  const out: string[] = [];
  for (const dominio of readdirSync(raiz)) {
    const dir = join(raiz, dominio);
    if (!statSync(dir).isDirectory()) continue;
    for (const flow of readdirSync(dir)) {
      const sub = join(dir, flow);
      if (!statSync(sub).isDirectory()) continue;
      for (const f of readdirSync(sub)) {
        if (f.endsWith('.json')) out.push(join(sub, f));
      }
    }
  }
  return out;
}

function main(argv: string[]): number {
  const diagrama = (argv.find((a) => a.startsWith('--diagram=')) ?? '--diagram=sequence').split(
    '=',
  )[1];
  const escrever = argv.includes('--write');
  const raiz = argv.find((a) => a.startsWith('--flows='))?.split('=')[1] ?? FLOWS_DIR;

  if (diagrama !== 'sequence') {
    console.error(
      `--diagram=${diagrama} ainda nao implementado. Sequence e o unico com ` +
        `mapeamento testado; workflow/dataflow/architecture precisam de ` +
        `flowchart e ainda nao tem spec.`,
    );
    return 1;
  }

  const caminhos = cadaIr(raiz).filter((p) => p.includes('.sequence.json'));

  // Valida o lote INTEIRO antes de escrever o primeiro arquivo: `#` e `;` nao
  // tem escape na gramatica do mermaid (`[^#\n;]*`), e falhar no meio do loop
  // deixa 14 fluxos novos e 1 velho sem nenhum sinal de qual dos dois e o certo.
  const pares = caminhos.map((p) => ({
    p,
    ir: JSON.parse(readFileSync(p, 'utf-8')) as SequenceIr,
  }));
  for (const { p, ir } of pares) {
    const texto = JSON.stringify(ir.messages) + JSON.stringify(ir.segments ?? []);
    const ix = texto.search(/[#;]/);
    if (ix >= 0) {
      console.error(
        `${p}: caractere '${texto.charAt(ix)}' quebra a linha no mermaid (# e ; nao tem escape). ` +
          `Troque por uma palavra na IR antes de regenerar. Nada foi escrito.`,
      );
      return 1;
    }
  }

  let escritos = 0;
  for (const { p, ir } of pares) {
    const doc = renderFlowDoc(ir, p.replace(`${process.cwd()}/`, ''));
    if (escrever) {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(join(dirname(p), 'flow.md'), doc, 'utf-8');
    }
    escritos++;
  }
  console.log(
    `${diagrama}: ${escritos} flows${escrever ? ' escritos' : ' (dry-run, use --write)'}`,
  );
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('flow-ir-to-mermaid.ts')) {
  process.exit(main(process.argv.slice(2)));
}
