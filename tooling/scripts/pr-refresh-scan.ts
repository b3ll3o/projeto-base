#!/usr/bin/env tsx
/**
 * `pr-refresh-scan` — o lado determinístico do workflow `pr-refresh`.
 *
 * Extrai as claims numéricas declaradas no título/descrição de um PR, mede os
 * mesmos números contra a branch, e reporta as divergências. Ele NÃO reescreve
 * nada: a decisão é de quem roda o workflow.
 *
 * ## Por que existe
 *
 * A descrição de um PR envelhece a cada push, e nenhuma regra do repo cuida
 * disso: `git ls-files` (como `check-doc-refs` enumera) não enxerga uma
 * descrição que mora no GitHub, e nenhum workflow escuta `pull_request: edited`.
 * Medido no PR #44 — o cabeçalho disse "20 commits, 34 arquivos, +4402/−102",
 * a branch ganhou 5 pushes, e ele esteve falso em todos os 5.
 *
 * ## A fronteira de segurança, e ela é o desenho, não uma ressalva
 *
 * O corpo do PR é entrada NÃO CONFIÁVEL e MUTÁVEL: quem abre o PR controla o
 * texto inteiro, e o texto não passa por revisão antes de o gate rodar. Por isso
 * nada aqui executa o que o corpo diz.
 *
 * Uma variante deste check que rodasse o "comando de re-medição" escrito no
 * corpo — `git log`, `pnpm test`, o que fosse — seria uma superfície de RCE em
 * CI: o corpo pode conter `$(...)`, um redirect que vaza o `GITHUB_TOKEN`, ou
 * um `curl … | sh`. Um check de conteúdo não confiável que executa o próprio
 * conteúdo não é um check; é um shell com o CI de permissões.
 *
 * Aqui o corpo é TEXTO analisado por regex e nada mais. O único subprocesso é o
 * `git`, com argumentos construídos neste arquivo. Nenhum `exec`, nenhum
 * `spawn`, nenhum `shell: true`, nenhum valor do corpo chega a uma posição de
 * comando.
 *
 * ## Offline por padrão
 *
 * O corpo chega por `--body-file`. A rede fica fora do caminho padrão — o
 * `preflight` e o `.husky/pre-push` rodam sem rede e não podem passar a
 * depender dela. Quem quiser o corpo direto do GitHub passa `gh pr view ... >
 * body.md` antes; o fetch é do chamador, não deste script.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Classe = 'commits' | 'arquivos' | 'insercoes' | 'remocoes' | 'testes';

export interface Claim {
  classe: Classe;
  valor: number;
  declarado: string;
}

export interface Medicao {
  commits: number;
  arquivos: number;
  insercoes: number;
  remocoes: number;
}

export interface ClaimVerificada extends Claim {
  medido: number | null;
  divergente: boolean;
}

export interface Relatorio {
  base: string;
  claims: ClaimVerificada[];
  resumo: string;
}

/**
 * As três families de claim que o git consegue medir.
 *
 * O que NÃO está aqui, e por quê:
 *
 * - **`8/8 verde`, `14/14`** — status de execução. Quem mede é o CI, e o CI é
 *   re-rodado a cada push; um número de check no corpo envelhece mais rápido
 *   que o branch e não é comparável offline. Deixá-lo fora evita o gate de
 *   comparar um dado que ele próprio não consegue reproduzir.
 * - **PR #44, turbo 2.11.2, 2026-10-05** — identificadores, não contagens.
 *   Uma regex que casasse qualquer inteiro transformaria data em claim de
 *   commits e acusaria divergência onde não há.
 * - **Pendências ("Task 1.4 pós-merge")** — exigem julgamento sobre se a task
 *   foi feita. Não é medição, é decisão; fica com o agente.
 */
const PADROES: Array<{
  classe: Classe;
  re: RegExp;
  grupo: number;
  medir: (m: Medicao) => number | null;
}> = [
  { classe: 'commits', re: /(\d+)\s+commits?\b/gi, grupo: 1, medir: (m) => m.commits },
  { classe: 'arquivos', re: /(\d+)\s+arquivos?\b/gi, grupo: 1, medir: (m) => m.arquivos },
  { classe: 'testes', re: /(\d+)\s+testes?\b/gi, grupo: 1, medir: () => null },
  // `+N/−M` carrega DOIS grupos. Ler sempre o grupo 1 faria `remocoes` reportar
  // as inserções — e as duas claims divergentes só apareceriam em paralelo,
  // quando o `+` e o `−` por acaso fossem iguais.
  { classe: 'insercoes', re: /\+(\d+)\s*\/\s*(?:−|-)(\d+)/g, grupo: 1, medir: (m) => m.insercoes },
  { classe: 'remocoes', re: /\+(\d+)\s*\/\s*(?:−|-)(\d+)/g, grupo: 2, medir: (m) => m.remocoes },
];

/** Extrai as claims declaradas. Retorna a primeira ocorrência de cada classe. */
export function extrairClaims(texto: string): Claim[] {
  const encontradas: Claim[] = [];
  for (const { classe, re, grupo } of PADROES) {
    // Cópia do RegExp: `exec` num `/g` é stateful (`lastIndex`), e uma regex
    // compartilhada entre chamadas alternaria entre a 1ª e a 2ª ocorrência.
    const m = new RegExp(re.source, re.flags).exec(texto);
    const bruto = m?.[grupo];
    if (bruto === undefined) continue;
    const n = Number(bruto);
    // `Number('999999999999999999999999')` é 1e24: inteiro, mas fora do
    // inteiro seguro. Um corpo malicioso não ganha nada com isso, mas o
    // relatório também não deve apresentar um número que não representa.
    if (!Number.isSafeInteger(n)) continue;
    encontradas.push({ classe, valor: n, declarado: m?.[0] ?? bruto });
  }
  return encontradas;
}

/** Roda um `git` com argumentos fixos deste arquivo. Nunca com entrada do corpo. */
function git(repo: string, args: string[]): string {
  // stderr descartado de propósito: o `git` explica o erro na língua dele
  // ("Needed a single revision"), e quem precisa saber o que fazer é o
  // chamador. Uma mensagem que não diz o remendo é ruído com formato de erro.
  return execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

export function medirBranch(repo: string, base: string): Medicao {
  const range = `${base}..HEAD`;
  let commits: number;
  let arquivos: number;
  let insercoes = 0;
  let remocoes = 0;

  try {
    git(repo, ['rev-parse', '--verify', base]);
  } catch {
    // Sem isto o `rev-list` falharia com uma mensagem de git que não diz o
    // que fazer; o nome do problema é o que o chamador precisa.
    throw new Error(`base inválida: "${base}" não resolve neste repo (${repo})`);
  }

  commits = Number(git(repo, ['rev-list', '--count', range]).trim());
  arquivos = git(repo, ['diff', '--name-only', range])
    .split('\n')
    .filter((l) => l.length > 0).length;

  const shortstat = git(repo, ['diff', '--shortstat', range]).trim();
  const ins = /(\d+) insertions?\(\+\)/.exec(shortstat);
  const del = /(\d+) deletions?\(-\)/.exec(shortstat);
  if (ins?.[1] !== undefined) insercoes = Number(ins[1]);
  if (del?.[1] !== undefined) remocoes = Number(del[1]);

  return { commits, arquivos, insercoes, remocoes };
}

export interface Opcoes {
  bodyFile: string;
  repo: string;
  base: string;
}

export function varrer({ bodyFile, repo, base }: Opcoes): Relatorio {
  const texto = readFileSync(bodyFile, 'utf8');
  const medicao = medirBranch(repo, base);
  const claims = extrairClaims(texto).map((c): ClaimVerificada => {
    const medido = PADROES.find((p) => p.classe === c.classe)?.medir(medicao) ?? null;
    return { ...c, medido, divergente: medido !== null && medido !== c.valor };
  });

  const divergentes = claims.filter((c) => c.divergente);
  const naoMensuraveis = claims.filter((c) => c.medido === null);

  // Três estados, três frases. Uma claims que o scanner não sabe medir sai
  // nomeada como tal: um gate que não mede e não diz que não mediu é verde por
  // omissão, que é a classe 1 com roupa de sucesso.
  const resumo =
    claims.length === 0
      ? `nenhuma claim mensurável no corpo (base ${base}; medido ${medicao.commits} commits, ${medicao.arquivos} arquivos)`
      : [
          `${divergentes.length} divergente(s) em ${claims.length} claim(s) (base ${base})`,
          naoMensuraveis.length > 0
            ? `${naoMensuraveis.length} não mensurável(is) offline — ${naoMensuraveis.map((c) => c.classe).join(', ')}: verificar rodando a suíte, não pelo git`
            : null,
        ]
          .filter((s): s is string => s !== null)
          .join('; ');

  return { base, claims, resumo };
}

function main(argv: string[]): number {
  const args = new Map<string, string>();
  for (const a of argv) {
    const m = /^--([^=]+)=(.*)$/.exec(a);
    if (m?.[1] !== undefined) args.set(m[1], m[2] ?? '');
  }
  const bodyFile = args.get('body-file');
  if (bodyFile === undefined || bodyFile.length === 0) {
    process.stderr.write('uso: pr-refresh-scan --body-file=<path> [--base=<ref>]\n');
    process.stderr.write(
      '  --body-file  corpo/titulo do PR, como ARQUIVO. Este script nao fala com o GitHub.\n',
    );
    return 2;
  }
  const base = args.get('base') ?? 'origin/main';

  // `varrer` lança quando a base não resolve — a biblioteca propaga o erro, e
  // quem decide o código de saída é o CLI. Sem este try, um throw vira exit 1,
  // que é o código de "há divergência": o caller não distingue "a base está
  // errada" de "o corpo envelheceu", e um `if ! scanner` reescreve o corpo por
  // causa de uma referência inexistente. Exit 3 é o "não deu para medir".
  let relatorio: Relatorio;
  try {
    relatorio = varrer({ bodyFile, repo: resolve(process.cwd()), base });
  } catch (e) {
    process.stderr.write(`erro: ${e instanceof Error ? e.message : String(e)}\n`);
    process.stderr.write('  não deu para medir — nada foi comparado.\n');
    return 3;
  }

  for (const c of relatorio.claims) {
    const medido = c.medido === null ? 'NÃO MENSURÁVEL' : String(c.medido);
    const marca = c.medido === null ? 'NÃO MEDE' : c.divergente ? 'DIVERGE' : 'ok      ';
    process.stdout.write(
      `${marca} ${c.classe.padEnd(11)} declarado=${String(c.valor).padEnd(8)} medido=${medido}\n`,
    );
  }
  process.stdout.write(`\n  ${relatorio.resumo}\n`);
  return relatorio.claims.some((c) => c.divergente) ? 1 : 0;
}

const invocadoDireto =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invocadoDireto) process.exit(main(process.argv.slice(2)));
