import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { CheckResult } from './check-types';
import { linhasDoRelato } from './check-types';

/**
 * A branch contém a `main` atual? (regra de rebase — `git-workflow.md`)
 *
 * ## A regra que este gate torna executável
 *
 * Toda demanda nasce de `main` atualizada (`git-workflow.md §Ponto de
 * Partida`). O que a convenção **não** cobria é o intervalo: uma demanda
 * entregue em duas semanas acumula commits em `main` que ela não contém. Ela
 * continua sendo trabalho válido e abre PR que parece correto — só que o
 * merge vai reintroduzir, no histórico, tudo o que a `main` já resolveu.
 *
 * ## Por que isto não é `git merge-base` numa linha de shell
 *
 * Porque `merge-base --is-ancestor` responde `0`, `1` **e** `128`, e os três
 * significam coisas diferentes. Tratar "não 0" como "atrasada" reportaria
 * "atrasada" também quando a base nem existe — e o conscrito errado é o
 * conserto de menos valor.
 *
 * ## O que este gate mede, e contra o quê
 *
 * Contra a ref **`origin/main` local** — nunca contra `main`, que pode estar
 * alguns commits atrás da remota sem que ninguém perceba. Em CI (`fetch-depth:
 * 0`) a ref vem do servidor e é a verdade; localmente ela pode estar velha, e
 * então este gate **subdeclara**: uma demanda 5 atrás do remoto pode passar
 * se o `origin/main` local for velho. A mensagem nomeia a base e o SHA
 * medido, justamente para que essa afirmação seja falsificável — um gate
 * cujas claims não dizem contra o que foram tiradas é o instrumento que
 * fixa a régua sem ninguém ver.
 *
 * MEDIDO no PR #53: o `preflight` contava o ref de merge que o GitHub
 * fabrica, e todo corpo de PR escrito localmente divergia em 1. A regra aqui
 * é o oposto disso — a régua é nomeada junto com a leitura.
 */

/** Contrato mínimo de `execFileSync` que este gate usa (injetável nos testes). */
export type GitRun = (args: string[]) => { status: number | null; stdout: string; stderr: string };

const BASE_PADRAO = 'origin/main';

/** `git` de verdade, sem depender do PATH. */
function defaultRun(repoRoot: string): GitRun {
  return (args) => {
    try {
      const stdout = execFileSync('git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { status: 0, stdout, stderr: '' };
    } catch (e) {
      const err = e as { status?: number | null; stdout?: string; stderr?: string };
      return { status: err.status ?? 1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
    }
  };
}

/** SHA da base medida, ou `null` se a ref não existe. */
function shaDaBase(run: GitRun, base: string): string | null {
  const r = run(['rev-parse', '--verify', '--quiet', base]);
  const sha = r.stdout.trim();
  return r.status === 0 && sha.length > 0 ? sha : null;
}

/** Quantos commits a base tem que HEAD não tem. `null` se não deu para contar. */
function quantosAtras(run: GitRun, base: string): number | null {
  const r = run(['rev-list', '--count', `HEAD..${base}`]);
  const n = Number.parseInt(r.stdout.trim(), 10);
  return r.status === 0 && Number.isFinite(n) ? n : null;
}

/**
 * Existe um rebase em andamento? (`.git/rebase-merge` ou `rebase-apply`)
 *
 * `git rev-parse --git-path` em vez de juntar `.git/`: respeita worktree,
 * `GIT_DIR` e `core.hooksPath`-style redirecionamentos. Um caminho montado à
 * mão é verde na máquina de quem escreveu e cego no CI.
 *
 * `rebase-apply` é o segundo diretório porque o git usa os dois formatos em
 * versões diferentes — e o gate que conhece só um deles falha em silêncio na
 * outra.
 */
function rebaseEmAndamento(run: GitRun, repoRoot: string): boolean {
  return ['rebase-merge', 'rebase-apply'].some((dir) => {
    const r = run(['rev-parse', '--git-path', dir]);
    const caminho = r.stdout.trim();
    if (r.status !== 0 || caminho.length === 0) return false;
    // `git rev-parse --git-path` devolve caminho **relativo ao cwd** (medido:
    // `.git/rebase-merge`), e `existsSync` resolve relativo ao cwd do
    // PROCESSO — não ao `repoRoot` que este gate recebeu. Sem esta junção o
    // gate procuraria o rebase em andamento no repo onde ele roda por
    // acaso, e passaria verde com um rebase parado na sua cara.
    // MEDIDO: com a junção fora, o cenário de conflito dava "1 commit
    // atrás" em vez de "rebase em andamento".
    return existsSync(isAbsolute(caminho) ? caminho : join(repoRoot, caminho));
  });
}

export function checkBranchUpToDate(opts?: {
  repoRoot?: string;
  base?: string;
  run?: GitRun;
}): CheckResult {
  const base = opts?.base ?? BASE_PADRAO;
  const repoRoot = opts?.repoRoot ?? process.cwd();
  const run = opts?.run ?? defaultRun(repoRoot);

  // Rebase NÃO é atômico: pode parar em conflito e deixar HEAD solto. Medir
  // a demanda nesse estado não produz uma leitura, produz ruído — e o ruído
  // seria reportado como "sem ancestral comum", cujo conserto (`git fetch`)
  // não resolve nada. O estado é vermelho por si, antes de qualquer contagem.
  if (rebaseEmAndamento(run, repoRoot)) {
    return {
      ok: false,
      errors: [
        'rebase em andamento — o repositório está no meio de um rebase ' +
          '(conflito não resolvido, ou rebase pausado por hook/edição). ' +
          'Nenhum histórico está pronto para medir, e continuar contando ' +
          'aqui produziria uma leitura sem sentido. Resolva os conflitos e ' +
          'rode `git rebase --continue`, ou volte ao ponto de partida com ' +
          '`git rebase --abort`. Depois, revise o resultado (§Rebase ' +
          'Obrigatório em .agents/specs/conventions/git-workflow.md): ' +
          'conflito resolvido não é código correto.',
      ],
    };
  }

  const sha = shaDaBase(run, base);
  if (sha === null) {
    // Não medido. `skipped` — não `ok: false`, porque a ref ausente não é
    // dívida da branch; e não `ok: true`, porque aí o gate affirmaria que a
    // demanda está atualizada sem ter perguntado a ninguém.
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `a ref \`${base}\` não existe localmente — \`git fetch ${base}\` para medir`,
    };
  }

  // 0 = base é ancestral de HEAD. 1 = HEAD está atrás. 128 = sem ancestral.
  const anc = run(['merge-base', '--is-ancestor', base, 'HEAD']);

  if (anc.status === 0) return { ok: true, errors: [] };

  if (anc.status === 1) {
    const quantos = quantosAtras(run, base);
    const corpo =
      `a branch está ${quantos ?? '?'} commit(s) atrás de \`${base}\` ` +
      `(base medida: ${sha.slice(0, 7)}). A regra de \`git-workflow.md\` é ` +
      `rebasear a demanda na main atualizada — implementada com main ` +
      `desatualizada, o merge reintroduz no histórico o que a main já resolveu. ` +
      `Conserto: \`git fetch ${base} && git rebase ${base}\`.`;
    // A base que o gate mediu é a **local**: em CI ela é o servidor, e
    // localmente pode estar velha. Dizer qual das duas evita que um verde
    // local sobre uma ref velha seja lido como prova.
    return {
      ok: false,
      errors: [corpo],
      advisories: [
        `Atenção: medido contra a ref \`${base}\` local. Se ela estiver velha, ` +
          `este verde (ou este número) subdeclara — \`git fetch ${base}\` antes ` +
          `de confiar na leitura.`,
      ],
    };
  }

  return {
    ok: false,
    errors: [
      `\`git merge-base --is-ancestor ${base} HEAD\` devolveu ${anc.status} — ` +
        `isto é "sem ancestral comum", e NÃO é "atrasada": a base e HEAD não ` +
        `convergem, então rebasedar em cima dela não resolve. Cause probable: ` +
        `clone raso ou histórico truncado (\`--depth\`). Conserto: ` +
        `\`git fetch --unshallow ${base}\` ou \`git fetch ${base}\`.`,
    ],
  };
}

// Executado como CLI.
if (process.argv[1]?.endsWith('check-branch-up-to-date.ts')) {
  const r = checkBranchUpToDate();
  // `linhasDoRelato`, e não `r.errors`: um `for` sobre `errors` aqui é o que
  // mantinha a ressalva invisível neste caminho. Ver `check-types.ts`.
  for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
  process.exit(r.ok ? 0 : 1);
}
