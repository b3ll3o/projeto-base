/**
 * SEM shebang, de propósito — ver `preflight-gates.ts` para a justificativa.
 *
 * Gate de sincronia **IR → flow.md**: todo diagrama Mermaid de `docs/flows/` é
 * exatamente o que `tooling/scripts/flow-ir-to-mermaid.ts` produz a partir da IR
 * do mesmo diretório.
 *
 * ## Por que este gate existe
 *
 * O `flow.md` é derivado — o cabeçalho do arquivo diz isso e cita o comando de
 * regeneração. Só que **derivado sem dono envelhece**: nada abre o diagrama, o
 * markdown é válido, e o preflight não tinha nada a dizer. MEDIDO 2026-10-16: o
 * modo dry-run do conversor (`sem --write`) visitava as 15 IRs e imprimia só
 * `sequence: 15 flows (dry-run, use --write)` — contagem, não divergência.
 * Editar a IR e esquecer de regenerar saía **verde**.
 *
 * ## O gate NÃO mede (e por que isso não é defeito dele)
 *
 * A IR é autoral (`mechanism: hand` no catálogo) e **não tem âncora de código**:
 * nenhum campo aponta para o arquivo-fonte que o diagrama descreve (medido nas 15
 * IRs). Então o caminho `código → IR` é humano e este gate não o alcança: ele
 * fecha `IR → flow.md`, e a regra de "quando mexer no código, atualize a IR"
 * vive no processo, não aqui. Um gate que afirmasse cobrir os dois elos sem âncora
 * seria a classe 1 de `guard-classes.md`. Ele também não valida o Mermaid
 * renderizado (um `#` no rótulo de um participante produz um arquivo que casa
 * com a IR e o GitHub não desenha) — é furo do conversor, não deste gate.
 *
 * ## Por que reusar o conversor em vez de reimplementar o render
 *
 * Um segundo renderizador aqui seria duas semânticas de "diagrama esperado" no
 * mesmo repo, e a divergência entre elas seria invisível justamente quando
 * alguém ajusta o conversor (aí o gate passa a acusar drift em todo o catálogo,
 * ou pior, deixa de acusar). Fonte única: `renderFlowDoc`.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { renderFlowDoc, type SequenceIr } from '../../../tooling/scripts/flow-ir-to-mermaid.js';
import type { CheckResult } from './check-types';

const IR_SUFFIX = '.sequence.json';
const DOC_NAME = 'flow.md';
const REGEN = 'pnpm tsx tooling/scripts/flow-ir-to-mermaid.ts --diagram=sequence --write';

/** Layout que o conversor percorre: `docs/flows/<dominio>/<flow>/`. */
const NIVEL_ESPERADO = 'docs/flows/<dominio>/<flow>/';

/** `withFileTypes` evita o `statSync` por entrada — e o `ENOENT` de symlink quebrado. */
function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile()) yield p;
  }
}

function listFiles(root: string): string[] {
  return existsSync(root) ? [...walk(root)] : [];
}

/**
 * Caminho de cada IR `sequence` sob `docs/flows/`, em **qualquer** nível.
 *
 * A profundidade não filtra aqui — quem filtra é `noLayoutEsperado`, que
 * reporta. Quando o único filtro era a posição fixa, uma IR em
 * `docs/flows/<dominio>/x.sequence.json` nunca entrava na lista e o gate ficava
 * verde com uma IR que não geraria diagrama nenhum. Retornar o ARQUIVO e não o
 * diretório também mata a duplicata de duas IRs no mesmo diretório, que antes
 * produzia o mesmo erro duas vezes e um vermelho sem caminho de conserto
 * (o `--write` regrava a partir da outra IR).
 */
export function listSequenceIrs(flowsRoot: string): string[] {
  return listFiles(flowsRoot).filter((f) => f.endsWith(IR_SUFFIX));
}

function noLayoutEsperado(irPath: string, flowsRoot: string): boolean {
  // `dominio/flow/nome.sequence.json` → 2 diretórios. Fora disso, 1 ou 3+.
  return relative(flowsRoot, irPath).split(sep).length - 1 !== 2;
}

export async function checkFlowMermaidSync(opts: { repoRoot: string }): Promise<CheckResult> {
  const errors: string[] = [];
  const flowsRoot = join(opts.repoRoot, 'docs', 'flows');
  const irs = listSequenceIrs(flowsRoot);

  if (irs.length === 0) {
    return {
      ok: false,
      errors: [
        `0 IR sequence encontrada em '${relative(opts.repoRoot, flowsRoot)}' — ` +
          `não posso afirmar que os diagramas estão em dia sem diagrama nenhum`,
      ],
    };
  }

  // Doc sem IR é o espelho do IR sem doc: itera as IRs nunca acha o `flow.md`
  // órfão, e ele continua desenhando um fluxo que ninguém reescreve quando o
  // fluxo mudar (a IR foi deletada ou renomeada).
  const dirsComDoc = new Set<string>();
  for (const doc of listFiles(flowsRoot)) {
    if (doc.endsWith(`${sep}${DOC_NAME}`)) dirsComDoc.add(dirname(doc));
  }

  for (const irPath of irs) {
    const relIr = relative(opts.repoRoot, irPath);
    const dir = dirname(irPath);
    const docPath = join(dir, DOC_NAME);
    dirsComDoc.delete(dir);

    if (noLayoutEsperado(irPath, flowsRoot)) {
      errors.push(
        `IR fora do layout esperado: '${relIr}' — o conversor só varre ` +
          `\`${NIVEL_ESPERADO}\`, então essa IR não gera diagrama e ninguém vai ` +
          'notar. Mova o arquivo para o layout ou remova a IR.',
      );
      continue;
    }

    if (!existsSync(docPath)) {
      errors.push(
        `diagrama ausente: '${relative(opts.repoRoot, docPath)}' não existe para a IR ` +
          `'${relIr}' — regenere com \`${REGEN}\``,
      );
      continue;
    }

    let ir: SequenceIr;
    try {
      ir = JSON.parse(readFileSync(irPath, 'utf-8')) as SequenceIr;
    } catch (err) {
      // JSON inválido não é "diagrama fora de sincronia": deixar o parse
      // estourar derrubaria o painel inteiro (o `main()` do preflight não tem
      // `try`, e o `.catch` final sai 2 sem imprimir o resumo dos outros gates).
      errors.push(
        `IR ilegível: '${relIr}' não parseou (${(err as Error).message}) — conserte o ` +
          'JSON; enquanto ele não parseia não há diagrama esperado para comparar',
      );
      continue;
    }

    const esperado = renderFlowDoc(ir, relIr);
    if (readFileSync(docPath, 'utf-8') !== esperado) {
      errors.push(
        `diagrama fora de sincronia: '${relative(opts.repoRoot, docPath)}' não é o que ` +
          `a IR '${relIr}' gera — a IR mudou (ou o doc foi editado à mão). ` +
          `Regenere com \`${REGEN}\``,
      );
    }
  }

  for (const dir of dirsComDoc) {
    errors.push(
      `diagrama órfão: '${relative(opts.repoRoot, dir)}/${DOC_NAME}' existe sem IR ` +
        `\`*${IR_SUFFIX}\` no diretório — doc sem fonte é diagrama que ninguém ` +
        'reescreve quando o fluxo muda. Remova o doc ou restaure a IR.',
    );
  }

  return { ok: errors.length === 0, errors };
}
