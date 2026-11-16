// tooling/scripts/weekly-docs-sync.ts
//
// pt-BR: o gerador do RELATÓRIO SEMANAL de documentação. O que ele produz é
// o artefato de `.agents/runs/weekly-docs-sync-<ts>.md` — o registro que o
// cron semanal abre como PR.
//
// MEDIDO 2026-11-16 (PR #167): o gerador vivia FORA do repo (o script do
// cron, no sandbox), então os defeitos dele não tinham dono, não tinham
// teste e não podiam ser corrigidos sem esperar o próximo ciclo. Os quatro
// que apareceram no artefato:
//   1. a linha em branco do `git log` entrava como se fosse um arquivo
//      (a "6" sem nome na lista de arquivos mais tocados);
//   2. o diretório era os 2 primeiros segmentos do path, então um arquivo na
//      raiz virava diretório (`README.md/`) e um arquivo com 2 segmentos
//      virava diretório (`docs/STACK.md`);
//   3. a janela era `--since=2026-11-09` — data NUA, que o git resolve com
//      a HORA do momento da execução: o mesmo comando dava 6 arquivos
//      tocados às 05:45 e 4 às 14:55 do mesmo dia;
//   4. o parecer do `doc-sync` entrava linha a linha, com as cópias que o
//      próprio doc-sync emitia.
//
// Este arquivo é o dono da geração: janela determinística, path vazio
// filtrado na origem, diretório derivado do path, e o parecer com a
// ORIGEM de cada ação.
//
// Uso:
//   pnpm weekly:docs-sync --since=2026-11-09T00:00:00 --until=2026-11-16T23:59:59

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncDocs } from './doc-sync.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

/** Separador de registro do `git log --format` — não aparece em path nem em mensagem. */
const SEPARADOR = '\x1e';
/** Separador de campo do `git log --format`. */
const CAMPO = '\x1f';

export interface CommitDaSemana {
  sha: string;
  data: string;
  autor: string;
  mensagem: string;
}

export interface Semana {
  commits: CommitDaSemana[];
  /** Os arquivos da semana, únicos e ordenados. */
  arquivos: string[];
  /** Quantos commits tocaram cada arquivo. */
  toquesPorArquivo: Map<string, number>;
  /** Quantos commits tocaram cada diretório. */
  toquesPorDiretorio: Map<string, number>;
}

/**
 * O diretório de um path — até DOIS segmentos, como a lista do relatório.
 *
 * MEDIDO 2026-11-16: a versão anterior pegava os 2 primeiros segmentos do
 * PATH, sem tirar o nome do arquivo — então `README.md` virava o
 * diretório `README.md/` e `docs/STACK.md` virava o diretório
 * `docs/STACK.md`. Aqui o nome do arquivo sai antes do corte.
 */
export function diretorioDe(caminho: string): string {
  const diretorios = caminho.split('/').slice(0, -1);
  if (diretorios.length === 0) return '(raiz)';
  return diretorios.slice(0, 2).join('/');
}

/**
 * Interpreta a saída do `git log --name-only`.
 *
 * O separador de registro (`\x1e`) é o que torna o parser confiável: a
 * linha em branco que o git imprime entre os commits deixa de ser
 * ambígua — ela é apenas uma linha vazia dentro de um registro, e uma
 * linha vazia não é um path.
 */
export function parseSaidaDoGitLog(saida: string): Semana {
  const commits: CommitDaSemana[] = [];
  const arquivos = new Set<string>();
  const toquesPorArquivo = new Map<string, number>();
  const toquesPorDiretorio = new Map<string, number>();

  for (const registro of saida.split(SEPARADOR)) {
    const linhas = registro.split('\n').filter((l) => l.trim().length > 0);
    const cabecalho = linhas.shift();
    if (!cabecalho) continue;
    const campos = cabecalho.split(CAMPO);
    const sha = campos[0] ?? '';
    if (!sha) continue;
    commits.push({
      sha,
      data: campos[1] ?? '',
      autor: campos[2] ?? '',
      mensagem: campos[3] ?? '',
    });
    for (const arquivo of linhas) {
      arquivos.add(arquivo);
      toquesPorArquivo.set(arquivo, (toquesPorArquivo.get(arquivo) ?? 0) + 1);
      const diretorio = diretorioDe(arquivo);
      toquesPorDiretorio.set(diretorio, (toquesPorDiretorio.get(diretorio) ?? 0) + 1);
    }
  }

  return {
    commits,
    arquivos: [...arquivos].sort(),
    toquesPorArquivo,
    toquesPorDiretorio,
  };
}

/** Os N pares [contagem, chave] mais frequentes, desempatando pelo nome. */
function maisFrequentes(mapa: Map<string, number>, limite: number): [number, string][] {
  return [...mapa.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limite)
    .map(([chave, contagem]) => [contagem, chave] as [number, string]);
}

export interface DadosDoArtefato {
  repo: string;
  /** A janela, já normalizada (com hora). */
  since: string;
  until: string;
  /** O offset local — o git resolve a janela no fuso da máquina. */
  offset: string;
  base: string;
  semana: Semana;
  parecer: ReturnType<typeof syncDocs>;
}

/** O artefato que o cron versiona. */
export function renderizaArtefato(dados: DadosDoArtefato): string {
  const { repo, since, until, offset, base, semana, parecer } = dados;
  const linhas: string[] = [];

  linhas.push(`# Análise Semanal — ${repo}`, '');
  linhas.push(`**Período:** ${since} .. ${until} (offset ${offset})`);
  linhas.push(`**Base:** \`main\` em \`${base.slice(0, 7)}\``);
  linhas.push(`**Gerado por:** \`pnpm weekly:docs-sync --since=${since} --until=${until}\``);
  linhas.push(
    `**Janela no git:** \`git log --since=${since} --until=${until} --name-only ${base}\``,
    '',
  );

  linhas.push(`## Commits (${semana.commits.length})`, '');
  for (const c of semana.commits) {
    linhas.push(`- \`${c.sha.slice(0, 7)}\` ${c.data.slice(0, 10)} ${c.mensagem}`);
    linhas.push(`  _autor:_ ${c.autor}`, '');
  }

  linhas.push(`## Arquivos mais tocados (${semana.arquivos.length} arquivos)`, '');
  linhas.push('| Toques | Arquivo |', '| ---: | --- |');
  for (const [contagem, arquivo] of maisFrequentes(semana.toquesPorArquivo, 20)) {
    linhas.push(`| ${contagem} | \`${arquivo}\` |`);
  }
  linhas.push('');

  linhas.push('## Mudanças por diretório', '');
  linhas.push('| Toques | Diretório |', '| ---: | --- |');
  for (const [contagem, diretorio] of maisFrequentes(semana.toquesPorDiretorio, 15)) {
    linhas.push(`| ${contagem} | \`${diretorio}\` |`);
  }
  linhas.push('');

  linhas.push('## Parecer do `doc-sync`', '');
  linhas.push(
    `> \`syncDocs(${semana.arquivos.length} arquivo(s) da semana)\` — o mesmo motor do ` +
      '`pnpm docs:sync`, chamado em processo.',
    '',
  );
  linhas.push(
    `**Ações:** ${parecer.actions.length} · **Alertas:** ${parecer.alerts} · ` +
      `**Health:** ${parecer.docs_health_score}/100`,
    '',
  );
  linhas.push('| Tipo | Doc | Origem | Motivo |', '| --- | --- | --- | --- |');
  for (const a of parecer.actions) {
    linhas.push(`| ${a.type} | \`${a.doc_file}\` | \`${a.source_file ?? ''}\` | ${a.reason} |`);
  }
  linhas.push('');

  return linhas.join('\n');
}

/**
 * A janela, normalizada.
 *
 * MEDIDO 2026-11-16: `--since=2026-11-09` (data NUA) herda a HORA do
 * momento — o mesmo comando mediu 6 e 4 toques no MESMO dia, conforme a
 * hora da execução. Uma data nua vira `T00:00:00` aqui, e a hora
 * normalizada entra no artefato.
 */
export function normalizaJanela(valor: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return `${valor}T00:00:00`;
  return valor;
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1 << 26 });
}

/** O offset local, no formato do git (`-03:00`). */
function offsetLocal(): string {
  const minutos = -new Date().getTimezoneOffset();
  const sinal = minutos >= 0 ? '+' : '-';
  const abs = Math.abs(minutos);
  const horas = String(Math.floor(abs / 60)).padStart(2, '0');
  const resto = String(abs % 60).padStart(2, '0');
  return `${sinal}${horas}:${resto}`;
}

/**
 * O carimbo do nome do artefato — hora LOCAL, sem dois-pontos (o nome é um
 * path). O do artefato do PR #167 era `2026-11-16_054502`.
 */
export function carimboLocal(data: Date): string {
  const p2 = (n: number): string => String(n).padStart(2, '0');
  const dia = `${data.getFullYear()}-${p2(data.getMonth() + 1)}-${p2(data.getDate())}`;
  const hora = `${p2(data.getHours())}${p2(data.getMinutes())}${p2(data.getSeconds())}`;
  return `${dia}_${hora}`;
}

function main(): void {
  const args = process.argv.slice(2);
  const opts: Record<string, string | boolean> = {};
  for (const a of args) {
    const [k = '', v] = a.replace(/^--/, '').split('=');
    opts[k] = v ?? true;
  }

  const since = normalizaJanela(String(opts['since'] ?? ''));
  const until = normalizaJanela(String(opts['until'] ?? ''));
  if (!since || !until) {
    console.error(
      'uso: pnpm weekly:docs-sync --since=<YYYY-MM-DD[THH:MM:SS]> --until=<YYYY-MM-DD[THH:MM:SS]>',
    );
    process.exit(1);
  }

  const base = String(opts['base'] ?? '').trim() || git(['rev-parse', 'HEAD']).trim();
  const saida = git([
    'log',
    `--since=${since}`,
    `--until=${until}`,
    `--format=%x1e%H%x1f%cI%x1f%an%x1f%s`,
    '--name-only',
    base,
  ]);
  const semana = parseSaidaDoGitLog(saida);

  const pacote = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    name?: string;
  };
  const parecer = syncDocs(semana.arquivos);

  const carimbo = carimboLocal(new Date());
  const saidaArquivo =
    String(opts['out'] ?? '').trim() ||
    join(REPO_ROOT, '.agents', 'runs', `weekly-docs-sync-${carimbo}.md`);

  mkdirSync(dirname(saidaArquivo), { recursive: true });
  writeFileSync(
    saidaArquivo,
    renderizaArtefato({
      repo: pacote.name ?? 'projeto-base',
      since,
      until,
      offset: offsetLocal(),
      base,
      semana,
      parecer,
    }),
  );
  console.log(
    `[weekly-docs-sync] ${semana.commits.length} commit(s) · ` +
      `${semana.arquivos.length} arquivo(s) · ${parecer.actions.length} ação(ões) → ${saidaArquivo}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
