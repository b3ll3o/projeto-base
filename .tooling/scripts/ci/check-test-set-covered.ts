/**
 * SEM shebang, de propósito — ver `preflight-gates.ts` para a justificativa.
 *
 * Dá dentes à regra "todos os testes devem estar passando"
 * (`.agents/specs/conventions/tdd.md`).
 *
 * ## A regra e o buraco que ela tinha
 *
 * A regra já era cumprida na parte mecânica: `ci:local` encadeia com `&&`, o
 * turbo quebra o build quando uma task falha, e o job `quality` do CI fecha o
 * mesmo caminho. O que **não** existia era o conjunto. "Todos os testes
 * passando" sem saber **quais** testes precisam passar é um critério inerte
 * sobre conjunto vazio: passa com zero testes, e um pacote que declara uma
 * suíte que ninguém executa continua "verde" para todo mundo.
 *
 * ## O que este gate mede — e o que NÃO mede
 *
 * **Mede:** que todo script `test*` declarado num pacote do workspace ou é
 * executado por alguma invocação `turbo run` do `ci:local` (task pedida **e**
 * pacote alcançado por `--filter`), ou está declarado na tabela de exceções de
 * `tdd.md`. E o inverso: que nenhuma exceção declarada deixou de valer.
 *
 * **NÃO mede** que a suíte esteja verde (isso é o turbo quebrando o build) nem
 * que ela seja estável — uma suíte que passa 9 de 10 vezes está "verde" para
 * quem olha uma execução. MEDIDO 2026-10-16: `@projeto/api#test:e2e` falhou em
 * 1 de 3 execuções de `ci:local` e passou nas outras duas.
 *
 * ## Por que a exceção é DECLARADA e não inferida
 *
 * Duas portas de entrada possíveis, e a errada é obviamente proibida: inferir que
 * `echo … && exit 0` é "pacote sem testes" transforma **qualquer** `echo` novo
 * em exceção permanente, e a regra deixa de ter dono — que é o que
 * `check-types.ts` chama de teatro. A exceção é então uma linha na tabela de
 * `tdd.md`, que este gate lê nas DUAS direções: pacote novo sem linha é
 * vermelho, e linha que deixou de ser necessária também (a promessa não
 * cumprida é a mentira que custa mais, porque silencia).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CheckResult } from './check-types';
import { invocacoesTurboRun } from './check-ci-local-e2e';
import { readWorkspacePackages, type WorkspacePackage } from './check-package-json-drift';

/** Só o que este gate lê. `WorkspacePackage` também traz `dir`, que aqui é ruído:
 *  exigir o campo inteiro só para satisfy o tipo faria todo fixture mentir. */
export type Pacote = Pick<WorkspacePackage, 'name' | 'scripts'>;

const CONVENCAO = join(process.cwd(), '.agents/specs/conventions/tdd.md');

/** `test`, `test:unit`, `test:e2e`… — e nada mais. `lint-staged` fica de fora. */
const SCRIPT_DE_TESTE = /^test(?::.+)?$/;

/** Colunas da tabela de exceções, por NOME (nunca por índice). */
const COLS_EXCECAO = ['Pacote', 'Script'];

export interface Entrada {
  /** `scripts['ci:local']` da raiz, `undefined` se ausente. */
  ciLocal: string | undefined;
  pacotes: Pacote[];
  /** `pacote#script` declarados na tabela de exceções. */
  declarados: Set<string>;
}

/**
 * Lê a tabela de exceções de `tdd.md`.
 *
 * Coluna por NOME: `split('|')[1]` funciona até alguém reordenar, e aí falha
 * cobrindo exatamente a forma que existe hoje — a classe 2 com outro nome. A
 * mesma doutrina de `check-e2e-flow-coverage.ts`.
 */
export function declaredNoOps(markdown: string): Set<string> {
  const out = new Set<string>();
  let colPacote = -1;
  let colScript = -1;
  for (const linha of markdown.split('\n')) {
    if (!linha.trimStart().startsWith('|')) {
      // Saiu da tabela. Só zera o cabeçalho quando a tabela acabou, senão
      // qualquer tabela futura no arquivo passa a ser lida.
      colPacote = -1;
      colScript = -1;
      continue;
    }
    const cells = linha.split('|').map((c) => c.trim());
    if (cells[0] === '---' || cells[1] === '---') continue;
    if (colPacote === -1) {
      colPacote = cells.indexOf(COLS_EXCECAO[0]!);
      colScript = cells.indexOf(COLS_EXCECAO[1]!);
      if (colPacote === -1 || colScript === -1) {
        colPacote = -1;
        colScript = -1;
      }
      continue;
    }
    const pacote = /`([^`]+)`/.exec(cells[colPacote] ?? '')?.[1];
    const script = /`([^`]+)`/.exec(cells[colScript] ?? '')?.[1];
    if (pacote !== undefined && script !== undefined) out.add(`${pacote}#${script}`);
  }
  return out;
}

/** Scripts do pacote que uma invocação do `ci:local` de fato executa. */
function rodandoNoPacote(pacote: Pacote, rodando: Set<string>): string[] {
  return Object.keys(pacote.scripts).filter((s) => rodando.has(`${pacote.name}#${s}`));
}

export function reconciliarTestSet(entrada: Entrada): CheckResult {
  const errors: string[] = [];
  const { ciLocal, pacotes, declarados } = entrada;

  if (ciLocal === undefined) {
    return {
      ok: false,
      errors: [
        "scripts['ci:local'] não encontrado no package.json raiz — não tenho contra o que " +
          'reconciliar o conjunto de testes, então não posso afirmar que eles passam',
      ],
    };
  }

  // Um pacote só está no alcance se a invocação pede a task E o filtro nomeia
  // o pacote: pedir a task sem alcançar o pacote faz o turbo rodar zero tasks e
  // sair 0, que é a forma silenciosa dessa regra deixar de valer.
  const rodando = new Set<string>();
  for (const inv of invocacoesTurboRun(ciLocal)) {
    for (const pacote of pacotes) {
      if (!inv.filtros.includes(pacote.name)) continue;
      for (const task of inv.tasks) rodando.add(`${pacote.name}#${task}`);
    }
  }

  const declaradosQueValem = new Set<string>();
  const aliases: string[] = [];
  let medidos = 0;
  for (const pacote of pacotes) {
    for (const script of Object.keys(pacote.scripts)) {
      if (!SCRIPT_DE_TESTE.test(script)) continue;
      medidos++;
      const chave = `${pacote.name}#${script}`;
      if (rodando.has(chave)) continue;
      // ALIAS: mesmo pacote, comando idêntico ao de um script que roda. É a
      // suíte rodando com outro nome — accusesá-la seria pedir uma declaração de
      // exceção para algo que já executa. Fica em advisory porque nome
      // duplicado é dívida visível, e um verde que não mostra o que viu é um
      // verde que não informa nada.
      const comando = pacote.scripts[script] ?? '';
      if (rodandoNoPacote(pacote, rodando).some((r) => pacote.scripts[r] === comando)) {
        aliases.push(chave);
        continue;
      }
      if (declarados.has(chave)) {
        declaradosQueValem.add(chave);
        continue;
      }
      errors.push(
        `suite declarada e nunca executada: '${chave}' existe em ` +
          `'${pacote.name}/package.json' mas nenhuma invocação \`turbo run\` do 'ci:local' ` +
          'a executa (task pedida **e** pacote alcançado por --filter). Ou acrescente a task ' +
          'ao ci:local, ou declare a exceção em tdd.md §"Exceções: scripts `test*` que nenhum ' +
          'gate executa" — ela não é inferida, é declarada.',
      );
    }
  }

  for (const chave of declarados) {
    if (declaradosQueValem.has(chave)) continue;
    errors.push(
      `exceção declarada que não se aplica: '${chave}' em tdd.md §"Exceções" — ou o script ` +
        'deixou de existir, ou passou a rodar no ci:local. Remova a linha: exceção que não ' +
        'exceciona é documentation lie.',
    );
  }

  if (medidos === 0) {
    errors.push(
      `0 script test* no workspace (${pacotes.length} pacote(s) lido(s)) — "todos os testes ` +
        'passam" passa por vacuidade num workspace que perdeu todos os testes',
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    advisories: [
      ...aliases.map(
        (a) =>
          `'${a}' não entra no ci:local pelo nome, e sim pelo comando idêntico ao de um ` +
          'script do mesmo pacote que entra — suíte executada, nome duplicado',
      ),
      `conjunto medido: ${medidos} script(s) test* em ${pacotes.length} pacote(s), ` +
        `${declaradosQueValem.size} exceção(ões) em vigor. Este gate mede o CONJUNTO, não a ` +
        `execução: uma suíte instável está "verde" para quem olha uma execução só.`,
    ],
  };
}

/** Casca de I/O. */
export async function checkTestSetCovered(opts: { repoRoot: string }): Promise<CheckResult> {
  const pacotes = await readWorkspacePackages(opts.repoRoot);
  if (pacotes === null) {
    return {
      ok: false,
      errors: [
        'não consegui enumerar os pacotes do workspace (pnpm-workspace.yaml ausente ou com ' +
          'forma não suportada) — sem o conjunto não posso medir a regra',
      ],
    };
  }

  let convencao: string;
  try {
    convencao = readFileSync(join(opts.repoRoot, '.agents/specs/conventions/tdd.md'), 'utf-8');
  } catch (err) {
    return {
      ok: false,
      errors: [
        `não foi possível ler tdd.md (${(err as Error).message}) — a tabela de exceções é a ` +
          'única fonte das exceções, então sem ela este check é teatro',
      ],
    };
  }

  let ciLocal: string | undefined;
  try {
    ciLocal = (
      JSON.parse(readFileSync(join(opts.repoRoot, 'package.json'), 'utf-8')) as {
        scripts?: Record<string, string>;
      }
    ).scripts?.['ci:local'];
  } catch (err) {
    return {
      ok: false,
      errors: [`não foi possível ler o package.json raiz (${(err as Error).message})`],
    };
  }

  return reconciliarTestSet({ ciLocal, pacotes, declarados: declaredNoOps(convencao) });
}
