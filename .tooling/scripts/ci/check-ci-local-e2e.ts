import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CheckResult } from './check-types';
import { linhasDoRelato } from './check-types';
import {
  extractTurboRunTasks,
  readWorkspacePackages,
  type WorkspacePackage,
} from './check-package-json-drift';

export type { WorkspacePackage };

/**
 * Gate que impede a regressão mais cara desta convenção: um `package.json`
 * que continua dizendo a coisa certa enquanto faz outra.
 *
 * ## O que este gate mede — e o que NÃO mede
 *
 * **Mede:** que o script `ci:local` da raiz invoca, via `turbo run`, as tasks
 * `test:integration` e `test:e2e`; que todo pacote do workspace que
 * implementa `test:e2e` é alcançado por ao menos um `--filter=` desse
 * comando; e que todo pacote cujo `test:e2e` menciona Playwright declara um
 * `pretest:e2e` que instale o browser.
 *
 * **NÃO mede:** que as suítes passem, e que `ci:local` rode o mesmo que o
 * `ci.yml`. A segunda exigiria parsear YAML, e a pendência "Nenhum tooling lê
 * `.github/workflows/ci.yml`" já declara isso fora de escopo por decisão
 * registrada. Por isso o verde sai com `advisories` nomeando as duas.
 *
 * ## Por que este gate existe, e não um parágrafo a mais na convenção
 *
 * MEDIDO 2026-10-08: `check-package-json-drift` exige que `ci:local`
 * **exista** (`REQUIRED_SCRIPTS`) e nunca lê o conteúdo. Foi por isso que a
 * pendência "não roda nenhuma das duas suítes e2e" sobreviveu a três
 * releases: nada no repo distinguia "o script roda a suíte" de "o script
 * existe". Uma afirmação em prosa que ninguém verifica é exatamente a forma
 * que `git-workflow.md:274` tinha — "as mesmas validações que o CI roda" —
 * enquanto o script não rodava nenhuma das duas.
 *
 * ## Por que o parser de `turbo run` é IMPORTADO, não reescrito
 *
 * `extractTurboRunTasks` já tem o diferencial contra o turbo 2.11.2 real
 * (`turbo-redirect-differential.sh`) e 23 testes que codificam as armadilhas
 * de shell que ele atravessou. Um segundo parser aqui criaria duas semânticas
 * de "casado" no mesmo repo, e a divergência entre elas seria invisível
 * justamente nos casos que importam.
 *
 * ## Por que o alcance por `--filter` é uma asserção, e não um detalhe
 *
 * `--filter=@projeto/api --filter=@projeto/web` seleciona pacotes por nome
 * exato. Um pacote novo com `test:e2e` que ninguém adicionou aos filtros fica
 * de fora — e todo o resto continua verde: o turbo roda, o `ci:local` sai 0,
 * a suíte nova só aparece no CI. Um gate que olhasse apenas a lista de tasks
 * passaria por cima desse caso, que é a forma **comum** do defeito.
 */

const TASKS_E2E = ['test:integration', 'test:e2e'] as const;

/** `test:e2e` que fala em Playwright precisa de browser instalado antes. */
const E2E_COM_BROWSER = /playwright/i;

/** Valor de `--filter` que casa por padrão, não por nome exato. */
const FILTRO_GLOB = /[*?[\]|!]|\.\.\./;

const QUOTED_OPEN = '\u0001';
const QUOTED_SPACE = '\u0002';
const BOTH_STREAMS = '\u0000';

export interface EntradaCiLocalE2e {
  /** Valor de `scripts['ci:local']` na raiz — `undefined` se ausente. */
  ciLocal: string | undefined;
  /** Pacotes do workspace, com nome e scripts. */
  pacotes: WorkspacePackage[];
}

export interface ResultadoCiLocalE2e {
  ok: boolean;
  errors: string[];
  advisories: string[];
  /** `null` quando a reconciliação não chegou a medir nada. */
  medidos: { tasks: number; pacotesE2e: number } | null;
}

const RESSALVA_LIMITE =
  'medição DECLARATIVA de fiação: este gate lê `package.json` e não roda ' +
  'nenhuma suíte, e NÃO reconcilia com `.github/workflows/ci.yml` — essa ' +
  'classe segue registrada como pendência em ci-defense-in-depth-pendencias.md.';

/**
 * Uma invocação `turbo run` do comando, com o que ELA sozinha declara.
 *
 * tasks e filtros ficam juntos de propósito: um `--filter` só vale para a
 * invocação que o carrega. MEDIDO 2026-10-08, achado de revisão: coletando os
 * filtros do comando inteiro, `turbo run lint --filter=@projeto/api && turbo
 * run test:e2e --filter=@projeto/web` passava verde — e a suíte de
 * `@projeto/api` não rodava no push. Dividir o `ci:local` em estágios é a
 * próxima edição óbvia, e o gate que existe para fechá-la era o que abria a
 * brecha.
 */
export interface InvocacaoTurboRun {
  /** Tasks que o turbo resolveria NESTA invocação. */
  tasks: string[];
  /** Valores de `--filter=` NESTA invocação. */
  filtros: string[];
}

/**
 * Separa um comando nas suas invocações `turbo run`, cada uma com seus tasks e
 * seus filtros.
 *
 * Tokenização de filtros própria, e não a de `extractTurboRunTasks`, porque o
 * problema é outro: ali importa *quais* palavras são tasks (um redirect virando
 * task é falso positivo que trava o push); aqui importa *qual pacote* o filtro
 * nomeia, e um valor lido errado acusaria um app que existe.
 *
 * As três armadilhas que esta replica:
 * 1. `--filter >out.log` — o operador nu consome a próxima palavra, que é o
 *    alvo do redirect, não o valor do filtro. Sem isto, `out.log` viraria
 *    pacote e o gate acusaria um app inexistente. Vale também quando a próxima
 *    palavra é outro `--filter=`: `... --filter @a > --filter=@b` deixa `@a`
 *    como único filtro, porque `@b` é o nome do arquivo do redirect.
 * 2. aspas — `--filter='@projeto/api'` protege o valor, e um espaço dentro das
 *    aspas não separa token.
 * 3. `&>` / `2>&1` — viram sentinela antes da segmentação, senão o nome do
 *    arquivo gruda no valor do filtro.
 *
 * @example invocacoesTurboRun('turbo run lint --filter=@projeto/api') → [{tasks:['lint'], filtros:['@projeto/api']}]
 */
export function invocacoesTurboRun(comando: string): InvocacaoTurboRun[] {
  const protegido = comando
    .replace(
      /'([^']*)'|"([^"]*)"/g,
      (_m, single, double) =>
        `${QUOTED_OPEN}${(single ?? double).replace(/\s+/g, QUOTED_SPACE)}${QUOTED_OPEN}`,
    )
    .replace(/&>/g, BOTH_STREAMS)
    .replace(/>&/g, `>${BOTH_STREAMS}`);

  const invocacoes: InvocacaoTurboRun[] = [];
  for (const match of protegido.matchAll(/(?:^|[|&;])[^|&;]*?\bturbo\s+run\s+([^|&;]*)/g)) {
    const corpo = match[1] ?? '';
    // O parser de tasks segmenta o COMANDO INTEIRO procurando `turbo run`
    // dentro dele. Prefixando o corpo com um `turbo run` sintético, é ele
    // mesmo que responde — e não uma segunda semântica de "o que é task".
    invocacoes.push({
      tasks: extractTurboRunTasks(`turbo run ${corpo}`),
      filtros: filtrosDaInvocacao(corpo),
    });
  }
  return invocacoes;
}

/** Os valores de `--filter=` de UM corpo de invocação já segmentado. */
function filtrosDaInvocacao(corpo: string): string[] {
  const valores: string[] = [];
  let proximoEValor = false;
  let proximoEAlvoDeRedirect = false;
  for (const bruto of corpo.trim().split(/\s+/)) {
    if (bruto === '') continue;

    const operador = indiceDoOperador(bruto);
    if (operador !== -1) {
      // O operador entrou na lista: o valor é o prefixo, e o resto é alvo.
      const prefixo = bruto.slice(0, operador);
      // Um redirect come a palavra seguinte, seja ela o valor do filtro ou
      // não. `>` nu consome a próxima; `>alvo` colado consome a si mesmo.
      proximoEValor = false;
      proximoEAlvoDeRedirect = bruto.slice(operador + 1).replace(/^>/, '') === '';
      if (prefixo.startsWith('--filter=')) {
        const valor = desembrulhar(prefixo.slice('--filter='.length));
        if (valor !== '') valores.push(valor);
      } else if (prefixo === '--filter') {
        proximoEValor = true;
      }
      continue;
    }

    if (proximoEAlvoDeRedirect) {
      proximoEAlvoDeRedirect = false;
      continue;
    }
    if (proximoEValor) {
      proximoEValor = false;
      const valor = desembrulhar(bruto);
      if (valor !== '') valores.push(valor);
      continue;
    }
    if (bruto.startsWith('--filter=')) {
      const valor = desembrulhar(bruto.slice('--filter='.length));
      if (valor !== '') valores.push(valor);
      continue;
    }
    if (bruto === '--filter') {
      proximoEValor = true;
      continue;
    }
  }
  return valores;
}

/**
 * Índice do primeiro caractere que é operador de shell, ou -1.
 *
 * `BOTH_STREAMS` entra na lista porque `&>` e `>&` já viraram sentinela acima:
 * sem ele, `--filter=@projeto/api&>out.log` seria lido como um filtro
 * chamado `@projeto/api&>out.log` — um pacote que não existe.
 */
function indiceDoOperador(token: string): number {
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === '<' || c === '>' || c === '&' || c === BOTH_STREAMS) return i;
  }
  return -1;
}

/** Tira os sentinelas de aspas de um valor entre aspas simples ou duplas. */
function desembrulhar(token: string): string {
  if (!token.startsWith(QUOTED_OPEN)) return token;
  // Os DOIS sentinelas: o de fechamento fica colado no fim, e uma strip só da
  // abertura devolveria `@projeto/api` — que não casa com nenhum pacote e
  // sairia como "pacote de e2e fora dos filtros", um erro apontando para um app
  // que não existe.
  const interno = token.slice(QUOTED_OPEN.length);
  const semFechamento = interno.endsWith(QUOTED_OPEN)
    ? interno.slice(0, -QUOTED_OPEN.length)
    : interno;
  return semFechamento.split(QUOTED_SPACE).join(' ');
}

/**
 * Um pacote **implementa** a task, ou apenas a repassa?
 *
 * MEDIDO 2026-10-08: o `package.json` raiz tem
 * `"test:e2e": "turbo run test:e2e"` — é um despachante que agrega o
 * workspace, não uma suíte. Sem esta distinção, o gate exigia que o raiz
 * estivesse num `--filter` de `ci:local`, e acusava um pacote que é justamente
 * quem faz a agregação. É a classe "o guard acusa o mecanismo que o protege":
 * aqui o erro seria bloquear todo push por causa de um script que funciona.
 *
 * A delegação é detectada com o MESMO parser de tasks do gate, e não com um
 * `includes` solto — `turbo run test:e2e` reescrito como
 * `pnpm turbo run test:e2e` tem de continuar sendo delegação.
 *
 * ⚠️ Isenção de browser é SEPARADA e não passa por aqui: a checagem de
 * `pretest:e2e` olha todo pacote cujo `test:e2e` menciona Playwright, delegado
 * ou não. Ler só o `turbo run` classificava `playwright test && turbo run
 * test:e2e` como despachante e pulava as duas conferências dele — que é
 * exatamente o defeito que este gate existe para pegar.
 */
function implementaTask(pacote: WorkspacePackage, task: string): boolean {
  const script = pacote.scripts[task];
  if (typeof script !== 'string' || script.trim() === '') return false;
  return !extractTurboRunTasks(script).includes(task);
}

/** Pacotes que rodam Playwright em `test:e2e`, uj ou não sejam delegadores. */
function pacotesComBrowser(pacotes: WorkspacePackage[]): WorkspacePackage[] {
  return pacotes.filter((p) => E2E_COM_BROWSER.test(p.scripts['test:e2e'] ?? ''));
}

/**
 * Reconcilia a fiação de `ci:local` contra o que o workspace realmente
 * implementa. Puro: recebe os `package.json` já lidos.
 */
export function reconciliarCiLocalE2e(entrada: EntradaCiLocalE2e): ResultadoCiLocalE2e {
  const errors: string[] = [];
  const advisories: string[] = [];
  const ciLocal = entrada.ciLocal?.trim();

  if (ciLocal === undefined || ciLocal === '') {
    // Ausência não é "não há o que medir": é o script que a convenção obriga a
    // rodar antes do push e que não existe. Nomeá-lo é o que permite corrigir.
    errors.push(
      "script 'ci:local' ausente do package.json raiz — a Camada 1 da convenção " +
        '`ci-defense-in-depth.md` obriga o roda antes do `git push`, e um script ' +
        'inexistente não roda nem o que já rodava.',
    );
    // `null` e não `{tasks: 0}`: o `0` aqui é uma medição que não aconteceu,
    // e um número inventado envelhece sem ninguém perceber.
    return { ok: false, errors, advisories, medidos: null };
  }

  const invocacoes = invocacoesTurboRun(ciLocal);
  const tasks = new Set(invocacoes.flatMap((i) => i.tasks));
  for (const task of TASKS_E2E) {
    if (tasks.has(task)) continue;
    const medidas = [...tasks].join(', ');
    errors.push(
      `drift detectado: 'ci:local' não roda a task '${task}' — as suítes e2e só ` +
        `entram no feedback antes do push se o turbo as invocar. Tasks medidas no ` +
        `comando: ${medidas === '' ? '(nenhuma)' : medidas}`,
    );
  }

  const pacotesE2e = entrada.pacotes.filter((p) => implementaTask(p, 'test:e2e'));

  // Alcance: só os filtros das invocações que CARREGAM as tasks e2e alcançam
  // quem roda e2e. Um `--filter` de `turbo run lint` não alcança nada aqui.
  const filtros = invocacoes
    .filter((i) => TASKS_E2E.some((t) => i.tasks.includes(t)))
    .flatMap((i) => i.filtros);
  const globs = filtros.filter((f) => FILTRO_GLOB.test(f));
  if (globs.length > 0) {
    advisories.push(
      `'ci:local' filtra por glob (${globs.join(', ')}) — a cobertura de pacotes por ` +
        'filtro é INDETERMINADA, e este gate não afirma que todo pacote de e2e é ' +
        'alcançado. Teste com nomes explícitos para que a asserção volte a valer.',
    );
  } else if (filtros.length === 0) {
    // Sem filtro o turbo roda a task em todo pacote, então a cobertura é
    // máxima — mas é o único formato em que este gate sairia verde sem medir
    // alcance e SEM deixar rastro. O rastro é o ponto.
    advisories.push(
      "a invocação de 'ci:local' que roda as tasks e2e não tem nenhum --filter — " +
        'o alcance fica a cargo do turbo para todos os pacotes, e este gate não mede ' +
        'que todo pacote de e2e roda. Nomeie os pacotes para que a asserção valha.',
    );
  } else {
    for (const pacote of pacotesE2e) {
      if (filtros.includes(pacote.name)) continue;
      errors.push(
        `drift detectado: o pacote '${pacote.name}' implementa 'test:e2e' mas não está ` +
          `alcançado pelos --filter das invocações de e2e de 'ci:local' (${filtros.join(', ')}) ` +
          `— o turbo sai 0 e a suíte desse pacote só roda no CI, depois do push.`,
      );
    }
  }

  // Browser: sem `pretest:e2e`, a suíte monta o ambiente inteiro e falha depois.
  // A lista é a de quem MENCIONA Playwright, não a de quem implementa a task: um
  // script que delega ao turbo E roda Playwright continua sendo dono do browser.
  for (const pacote of pacotesComBrowser(entrada.pacotes)) {
    const comando = pacote.scripts['test:e2e'] ?? '';
    if (!E2E_COM_BROWSER.test(comando)) continue;
    const pre = pacote.scripts['pretest:e2e'];
    if (pre === undefined) {
      errors.push(
        `drift detectado: '${pacote.name}' roda 'test:e2e' com Playwright mas não declara ` +
          "'pretest:e2e' — MEDIDO 2026-10-08: sem browser a suíte levanta Postgres, a API e " +
          "um `next build` (33,5s) e só então falha com `Executable doesn't exist`, 43,4s " +
          'deixados pelo motivo errado.',
      );
      continue;
    }
    if (!/playwright\s+install/i.test(pre)) {
      errors.push(
        `drift detectado: o 'pretest:e2e' de '${pacote.name}' é '${pre}' e não instala o ` +
          'browser — o pnpm roda `pre<script>` antes do script, então é aqui que o ' +
          '`playwright install chromium` pertence.',
      );
    }
  }

  advisories.push(
    `${RESSALVA_LIMITE} Medido agora: ${tasks.size} task(s) no comando e ` +
      `${pacotesE2e.length} pacote(s) do workspace rodando 'test:e2e'.`,
  );
  return {
    ok: errors.length === 0,
    errors,
    advisories,
    medidos: { tasks: tasks.size, pacotesE2e: pacotesE2e.length },
  };
}

/**
 * Casca de I/O. Lê o `package.json` raiz e a lista de pacotes do workspace e
 * embrulha o resultado no contrato de `preflight.ts`.
 */
export async function checkCiLocalE2e(opts: { repoRoot: string }): Promise<CheckResult> {
  const raiz = resolve(opts.repoRoot);
  const caminhoRaiz = join(raiz, 'package.json');

  let raizLida: { name?: string; scripts?: Record<string, string> };
  try {
    raizLida = JSON.parse(readFileSync(caminhoRaiz, 'utf8'));
  } catch (err) {
    return {
      ok: false,
      errors: [`package.json raiz ilegível em '${caminhoRaiz}': ${err}`],
    };
  }

  const pacotes = await readWorkspacePackages(raiz);
  if (pacotes === null) {
    // A lista vazia e a lista ilegível não são a mesma coisa, e o caller não
    // tem como distinguir. Sem esta distinção, um workspace ilegível seria
    // lido como "nenhum pacote tem e2e" e o gate sairia verde sem ter lido nada.
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason:
        'pacotes do workspace não enumeráveis: pnpm-workspace.yaml ausente ou com ' +
        'formato não suportado — a cobertura por pacote NÃO foi medida',
    };
  }

  // O próprio pacote raiz faz parte do workspace.
  const todos: WorkspacePackage[] = [
    { name: String(raizLida.name ?? ''), dir: '.', scripts: raizLida.scripts ?? {} },
    ...pacotes,
  ];
  const temE2e = todos.some((p) => implementaTask(p, 'test:e2e'));
  if (!temE2e) {
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `nenhum pacote do workspace implementa 'test:e2e' — nada declarado para exigir de 'ci:local'`,
    };
  }

  const resultado = reconciliarCiLocalE2e({
    ciLocal: raizLida.scripts?.['ci:local'],
    pacotes: todos,
  });

  return {
    ok: resultado.ok,
    errors: resultado.errors,
    advisories: resultado.advisories,
  };
}

// Executado como CLI.
if (process.argv[1]?.endsWith('check-ci-local-e2e.ts')) {
  checkCiLocalE2e({ repoRoot: '.' }).then((r) => {
    for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
    process.exit(r.ok ? 0 : 1);
  });
}
