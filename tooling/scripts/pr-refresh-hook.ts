#!/usr/bin/env tsx
/**
 * `pr-refresh-hook` — roda o `pr-refresh` a cada push.
 *
 * ## O contrato que este arquivo cumpre
 *
 * 1. **Nunca impede um push.** Rede caída, `gh` sem auth, base velha, bug novo:
 *    tudo vira um estado nomeado e uma linha no stdout. A única coisa que
 *    derruba o `git push` é o preflight, que vem antes.
 * 2. **Nunca confunde "não fez" com "está em dia".** São seis estados distintos,
 *    cada um com a sua frase, e `sem-marcador` existe porque um hook inativo que
 *    sai em verde é pior que um hook que não existe.
 * 3. **Nunca escreve o que não pode provar.** Nada de base velha, nada de corpo
 *    fechado entre medir e publicar, nada de push que o git vai recusar.
 *
 * ## A fronteira de segurança é a do scanner, e ela muda de lugar aqui
 *
 * O `pr-refresh-scan` é offline: o corpo chega por arquivo e ele nunca fala com
 * a rede. Aqui o corpo vem do GitHub, e é a PRIMEIRA vez que ele cruza uma
 * fronteira de verdade. A regra continua a mesma — **o corpo é texto, nunca
 * comando** — e ela se sustenta porque `gh` só recebe argumentos construídos
 * neste arquivo: o número do PR (inteiro vindo de `--json`), e o corpo novo por
 * stdin. Nenhuma linha do corpo entra numa posição de argumento, e o `aplicar`
 * não concatena string nenhuma.
 *
 * ## Por que a base é buscada antes de tudo
 *
 * `origin/main` local pode ser de horas atrás. Medir contra ele dá um número
 * velho; publicar esse número troca "corpo descrevendo um push passado" por
 * "corpo descrevendo um estado que nunca existiu". Um hook que não pode ter
 * certeza prefere não falar — e `base-indisponivel` é o nome desse silêncio.
 *
 * ## A janela residual do `pre-push`, dita com todas as letras
 *
 * O `pre-push` roda **antes** de o push chegar ao remoto. MEDIDO: `git push
 * --dry-run` dispara o pre-push e o remoto não se move. Existe então uma janela
 * em que o corpo descreve um push que ainda pode ser recusado.
 *
 * O que fecha quase toda ela, e por que cada guarda existe:
 *
 * | guarda | o que fecha |
 * |---|---|
 * | o refresh roda **depois** do preflight | push barrado por drift estrutural nunca escreve — sem isto, um push que o preflight vai recusar já teria publicado um corpo descrevendo um push que não aconteceu |
 * | `relacaoComRemoto()` antes de medir | quem já tem push na branch e alguém pushed depois: o push seria recusado, e o corpo ficaria descrevendo um push impossível |
 * | `atualizarBase()` antes de medir | base velha — MEDIDO 2026-10-05 no PR #44, `origin/main` local de 2 dias atrás produziu 4 divergências contra um corpo **perfeito**, com números plausíveis e nenhuma pista de que a causa era a base |
 * | o corpo é reescrito no push seguinte | o push recusado é raro e passageiro |
 *
 * O que **não** fecha: o remoto ser empurrado nos segundos entre o `fetch` e o
 * `push`. Fechar isso exige um gatilho pós-push de verdade — e MEDIDO no husky
 * 9.1.7 instalado, `post-push` **não existe** (o array de hooks `l`, em
 * `node_modules/husky/index.js`, não o tem). A alternativa real é um workflow
 * de GitHub em `pull_request: synchronize`, que roda depois que o push
 * aterrissou. O owner optou por hook local; isso fica registrado aqui como o
 * caminho que elimina a janela, não como pendência esquecida.
 *
 * ## Os seis estados, e por que cinco "não escrevi" não podem virar um só
 *
 * Um hook que sai quieto em cinco casos diferentes é um hook em que nenhum
 * deles é visível. Um `exit 0` para tudo que não escreveu seria a classe 1 com
 * roupa de silêncio: o corpo envelheceria e o push continuaria verde.
 *
 * | estado | exit | quer dizer |
 * |---|---|---|
 * | `em-dia` | 0 | nenhuma claim divergente no corpo |
 * | `sem-pr` | 0 | nenhum PR aberto para a branch |
 * | `reescrito` | 1 | o corpo foi corrigido e publicado |
 * | `sem-marcador` | 2 | **o hook está INATIVO neste PR** |
 * | `divergencia-fora-do-vivo` | 3 | há número velho, mas todo ele é citação |
 * | `base-indisponivel` / `push-recusado` / `fechado` / `falha` | 4 | não deu, e o motivo está na linha |
 *
 * `sem-marcador` é o estado que carrega o peso. Sem `<!--pr-refresh:live-->`
 * no corpo o hook não escreve — por desenho, porque a regex não sabe dizer
 * contagem viva de citação histórica (MEDIDO: no PR #44, o cabeçalho L7 e a
 * citação L34 têm o **conjunto de classes idêntico**, e nenhuma função do
 * conjunto decide entre os dois). Hook inativo que saísse em verde seria pior
 * que hook que não existe: pareceria que o corpo está sendo cuidado.
 *
 * ## T4: por que o PR é relido antes do PATCH
 *
 * Entre medir e publicar há uma chamada de rede. O PR pode ter fechado nesse
 * intervalo, e reescrever o corpo de um PR mergeado não é atualizar nada — é
 * editar histórico. Por isso `estadoDoPr` é lido de novo, e a reescrita
 * acontece só com o PR ainda `OPEN`.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Escrita } from './pr-refresh-apply.js';
import { reescrever } from './pr-refresh-apply.js';
import type { Relatorio } from './pr-refresh-scan.js';
import { varrerTexto } from './pr-refresh-scan.js';

export type Estado =
  /** Nenhum PR aberto para a branch. Nada a fazer, nada medido. */
  | 'sem-pr'
  /** O `fetch` da base falhou: sem base atual, sem número confiável. */
  | 'base-indisponivel'
  /** O push vai ser recusado (não é fast-forward). */
  | 'push-recusado'
  /** Nenhuma claim divergente no corpo inteiro. */
  | 'em-dia'
  /** Há divergência e o corpo não marca região viva: **o hook está inativo**. */
  | 'sem-marcador'
  /** Há divergência, toda ela fora da região marcada. Nada foi escrito. */
  | 'divergencia-fora-do-vivo'
  /** O corpo foi reescrito e publicado. */
  | 'reescrito'
  /** O PR fechou entre medir e publicar. */
  | 'fechado'
  /** Qualquer outra coisa deu errado. O nome vai no `detalhe`. */
  | 'falha';

/**
 * Códigos de saída por estado.
 *
 * São distintos dos do `pr-refresh-scan` de propósito: os dois são consumidos
 * por scripts diferentes (`pnpm ci:preflight` e `.husky/pre-push`) e um exit
 * code reutilizado com outro significado é como um hook começa a mentir sem
 * mudar de roupa.
 */
export const CODIGOS: Record<Estado, number> = {
  'sem-pr': 0,
  'em-dia': 0,
  reescrito: 1,
  'sem-marcador': 2,
  'divergencia-fora-do-vivo': 3,
  'base-indisponivel': 4,
  'push-recusado': 4,
  fechado: 4,
  falha: 4,
};

export interface Deps {
  branch: string;
  repo: string;
  base: string;
  /**
   * Atualiza a base. `ok: false` DEVE vir com `erro` preenchido — rede caída,
   * token expirado e branch apagada são três consertos diferentes, e um estado
   * que não distingue os três obriga o operador a adivinhar.
   */
  atualizarBase(): { ok: boolean; erro: string };
  /**
   * Como a branch está em relação ao remoto.
   *
   * `nova` = a ref não existe lá (o push vai criá-la). `ff` = o remoto é
   * ancestral de HEAD (o push passa). `nao-ff` = alguém pushed depois (o push
   * vai ser recusado, a menos que com `--force`).
   */
  relacaoComRemoto(): 'nova' | 'ff' | 'nao-ff';
  /** Número do PR aberto para a branch, ou `null`. */
  prAberto(): number | null;
  corpo(pr: number): string;
  estadoDoPr(pr: number): 'OPEN' | 'CLOSED' | 'MERGED';
  aplicar(pr: number, corpo: string): void;
}

export interface Resultado {
  estado: Estado;
  detalhe: string;
  divergentes: number;
  marcadas: number;
  escritas: Escrita[];
  relatorio?: Relatorio;
}

const semRelatorio = (estado: Estado, detalhe: string): Resultado => ({
  estado,
  detalhe,
  divergentes: 0,
  marcadas: 0,
  escritas: [],
});

/**
 * A orquestração. Puras as decisões; rede e disco entram por `Deps`.
 *
 * Não lança. Este é o único motivo de existir o estado `falha`: o hook roda
 * DENTRO do `git push`, e um throw aqui sai como stack trace e impede o push.
 * Falha de rede, auth expirada e bug novo têm de sair como "não deu, e o nome
 * do motivo está na linha" — não como "não consegui commitar".
 */
export function executar(deps: Deps): Resultado {
  try {
    return rodar(deps);
  } catch (e) {
    return semRelatorio('falha', `erro inesperado: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function rodar(deps: Deps): Resultado {
  // Uma chamada só. Ler `.ok` e `.erro` em dois `deps.atualizarBase()` faria
  // DOIS fetches — o segundo sobre uma base já atualizada, e o `erro` viria de
  // uma tentativa diferente da que falhou.
  const baseAtual = deps.atualizarBase();
  if (!baseAtual.ok) {
    return semRelatorio(
      'base-indisponivel',
      `não consegui atualizar "${deps.base}": ${baseAtual.erro || 'motivo não informado'}; ` +
        `sem base atual não há número confiável, e nada foi escrito`,
    );
  }

  const relacao = deps.relacaoComRemoto();
  if (relacao === 'nao-ff') {
    return semRelatorio(
      'push-recusado',
      `"origin/${deps.branch}" não é ancestral de HEAD — o push vai ser recusado, e um corpo escrito aqui descreveria um push que não acontece`,
    );
  }

  const pr = deps.prAberto();
  if (pr === null) {
    return semRelatorio('sem-pr', `nenhum PR aberto para "${deps.branch}"`);
  }

  const corpo = deps.corpo(pr);
  const relatorio = varrerTexto(corpo, deps.repo, deps.base);
  const divergentes = relatorio.claims.filter((c) => c.divergente).length;

  const saida = reescrever(corpo, relatorio);
  const base: Resultado = {
    estado: 'em-dia',
    detalhe: '',
    divergentes,
    marcadas: saida.marcadas,
    escritas: saida.escritas,
    relatorio,
  };

  if (divergentes === 0) return { ...base, detalhe: 'corpo em dia: nenhuma claim divergente' };

  if (!saida.mudou) {
    // Duas causas muito diferentes caem aqui, e elas não podem virar o mesmo
    // estado: uma é "o corpo não diz qual parte é contagem viva", a outra é
    // "a parte que é contagem viva está certa e o resto é citação".
    if (saida.marcadas === 0) {
      return {
        ...base,
        estado: 'sem-marcador',
        detalhe:
          `${divergentes} claim(s) divergente(s) e marcadas=0 — o hook está INATIVO neste PR. ` +
          `Para ligar, ponha <!--pr-refresh:live--> no parágrafo do cabeçalho.`,
      };
    }
    return {
      ...base,
      estado: 'divergencia-fora-do-vivo',
      detalhe: `${divergentes} claim(s) divergente(s), todas fora da região marcada (marcadas=${saida.marcadas} linha(s)); nada escrito — se alguma delas é contagem viva, falta o marcador no parágrafo dela`,
    };
  }

  if (deps.estadoDoPr(pr) !== 'OPEN') {
    return {
      ...base,
      estado: 'fechado',
      detalhe: `PR #${pr} não está mais OPEN; o corpo foi medido mas não publicado`,
    };
  }

  deps.aplicar(pr, saida.texto);
  return {
    ...base,
    estado: 'reescrito',
    detalhe:
      `PR #${pr}: ${saida.escritas.length} claim(s) reescrita(s) — ` +
      saida.escritas.map((e) => `L${e.linha} ${e.classe} ${e.de}→${e.para}`).join(', '),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI. A rede entra aqui e em mais nenhum lugar do arquivo.

function git(repo: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function gh(repo: string, args: string[], entrada?: string): string {
  return execFileSync('gh', args, {
    cwd: repo,
    encoding: 'utf8',
    input: entrada ?? '',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** A primeira linha do stderr do subprocesso — a que diz o que deu errado. */
function stderrDe(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'stderr' in e) {
    const s = (e as { stderr?: Buffer | string }).stderr;
    if (s !== undefined) {
      const linhas = s
        .toString()
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (linhas.length > 0) return linhas[0] as string;
    }
  }
  return e instanceof Error ? e.message : String(e);
}

/**
 * Atualiza a base, e DIZ por que não conseguiu quando não consegue.
 *
 * ## O refspec que parece certo e não é
 *
 * `git fetch origin origin/main` falha com `couldn't find remote ref
 * origin/main`. O `origin/` de `origin/main` é o **nome local da ref de
 * tracking**; passado como refspec ele diz ao remoto "me traga a branch
 * `origin/main`", e essa branch não existe. MEDIDO 2026-10-06 no push que ligou
 * este hook:_exit 128, `base-indisponivel` em todo push, e nada medido nunca.
 *
 * A forma que funciona traduz o nome de tracking para o par branch-remoto /
 * ref-local:
 * `+refs/heads/<branch>:refs/remotes/<base>`.
 *
 * ## Por que o retorno carrega `erro`
 *
 * Auth expirada, branch remota apagada e rede caída dão o mesmo `false`. Um
 * estado que só diz "não consegui" obriga o operador a adivinhar entre três
 * causas — e adivinhação é como um hook verde nasce. O `erro` é a primeira
 * linha do stderr, que o git já escreve com o nome da coisa que não encontrou.
 */
export function buscarBase(repo: string, base: string): { ok: boolean; erro: string } {
  // Só o primeiro `/` separa remoto de branch: `origin/release/2` tem `/` no
  // nome da branch, e cortar no primeiro daria branch `release` + lixo `2`.
  const tracking = /^[^/]+\/(.+)$/.exec(base);
  const args =
    tracking === null
      ? ['fetch', '--quiet', '--', 'origin']
      : ['fetch', '--quiet', '--', 'origin', `+refs/heads/${tracking[1]}:refs/remotes/${base}`];
  try {
    // `--` antes do remoto: um nome que comece com `-` seria lido como opção.
    // A ref vem de `git rev-parse` ou de `--base=`, nunca do corpo do PR — mas
    // o `--` custa um caractere e fecha a porta.
    execFileSync('git', args, { cwd: repo, stdio: ['ignore', 'ignore', 'pipe'] });
    return { ok: true, erro: '' };
  } catch (e) {
    return { ok: false, erro: stderrDe(e) };
  }
}

/** O corpo do PR em vez de stdout de um comando — evita a parede de aspas. */
function prAbertoReal(repo: string, branch: string): number | null {
  const json = gh(repo, [
    'pr',
    'list',
    '--head',
    branch,
    '--state',
    'open',
    '--json',
    'number',
    '--limit',
    '1',
  ]);
  const lista = JSON.parse(json) as Array<{ number: number }>;
  return lista[0]?.number ?? null;
}

function relacaoReal(repo: string, branch: string): 'nova' | 'ff' | 'nao-ff' {
  const ref = `origin/${branch}`;
  try {
    git(repo, ['rev-parse', '--verify', `refs/remotes/${ref}`]);
  } catch {
    // A ref não existe no remoto: o push vai CRIA-LA, e criação não compete
    // com nada. Tratar como `nao-ff` aqui deixaria o hook inativo em toda
    // primeira branch — que é a branch em que o corpo mais precisa de ajuda.
    return 'nova';
  }
  try {
    git(repo, ['merge-base', '--is-ancestor', ref, 'HEAD']);
    return 'ff';
  } catch {
    return 'nao-ff';
  }
}

function main(argv: string[]): number {
  const args = new Map<string, string>();
  for (const a of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m?.[1] !== undefined) args.set(m[1], m[2] ?? '');
  }
  const repo = resolve(process.cwd());
  const branch = args.get('branch') ?? git(repo, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  const base = args.get('base') ?? 'origin/main';

  const r = executar({
    branch,
    repo,
    base,
    atualizarBase: () => buscarBase(repo, base),
    relacaoComRemoto: () => relacaoReal(repo, branch),
    prAberto: () => prAbertoReal(repo, branch),
    corpo: (pr) => gh(repo, ['pr', 'view', String(pr), '--json', 'body', '-q', '.body']),
    estadoDoPr: (pr) => {
      const s = gh(repo, ['pr', 'view', String(pr), '--json', 'state', '-q', '.state']);
      return s.trim() as 'OPEN' | 'CLOSED' | 'MERGED';
    },
    // `gh pr edit` e a escrita via GraphQL, que o GitHub descontinuou; o PATCH
    // REST aceita o corpo por stdin sem aspas intermediárias. O corpo vai por
    // `input`, nunca por argumento — um corpo com aspas e `$()` num
    // `-f body=` seria exatamente a superfície de RCE que este workflow recusa.
    aplicar: (pr, corpo) => {
      execFileSync('gh', ['api', '-X', 'PATCH', `repos/{owner}/{repo}/pulls/${pr}`], {
        cwd: repo,
        input: JSON.stringify({ body: corpo }),
        stdio: ['pipe', 'ignore', 'pipe'],
      });
    },
  });

  for (const c of r.relatorio?.claims ?? []) {
    if (!c.divergente) continue;
    process.stdout.write(
      `DIVERGE  L${String(c.linha).padEnd(4)} ${c.classe.padEnd(11)} declarado=${c.valor} medido=${c.medido}\n`,
    );
  }
  process.stdout.write(`pr-refresh [${r.estado}] ${r.detalhe}\n`);
  return CODIGOS[r.estado];
}

const invocadoDireto =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invocadoDireto) process.exit(main(process.argv.slice(2)));
