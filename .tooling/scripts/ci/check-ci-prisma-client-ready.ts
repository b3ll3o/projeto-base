/**
 * SEM shebang, de propósito.
 *
 * Fecha uma lacuna que MEDI em 2026-11-09, no PR #156: o job `preflight` do
 * CI rodava `pnpm tooling:test` **sem** gerar o client do Prisma, e o spec
 * `ambiente-local.spec.ts > temClientReal > o client do repo REAL` mede o
 * client de verdade.
 *
 * Por que o job não quebrava: o `cache: pnpm` do `actions/setup-node` é
 * CHAVEADO pelo `pnpm-lock.yaml`. Enquanto o lockfile não mudasse, o store
 * restaurado já trazia o client gerado, e o `pnpm install` nem chegava a rodar
 * o postinstall do `@prisma/client`.
 *
 * MEDIDO 2026-11-09, com store limpo (o que acontece exatamente na PR que
 * muda o lockfile):
 *
 * - `origin/main`  → client **não gerado** — o postinstall roda e imprime
 *   "could not find your Prisma schema" (o schema está em
 *   `apps/api/prisma/schema.prisma`, e o postinstall procura
 *   `./prisma/schema.prisma` a partir da raiz do repo);
 * - a branch do PR → **exatamente o mesmo resultado**.
 *
 * Ou seja: o verde do `main` vinha do cache, não do job. Um job que só passa
 * por causa do cache falha na PR que mexe na dependência — a PR que mais
 * precisa dele.
 *
 * A regra deste gate: **todo job que roda a suíte de testes do tooling tem
 * que gerar o client do Prisma antes.** Não é uma preferência de ordem — é a
 * ordem que faz o job medir o que ele diz medir.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { type CheckResult, linhasDoRelato } from './check-types';

const PASTA_DE_WORKFLOWS = path.join('.github', 'workflows');

/** Um job de workflow, com os passos que ele roda. */
export interface JobMedido {
  arquivo: string;
  job: string;
  /** Os comandos `run:` do job, na ordem. */
  comandos: string[];
  /** O número da linha do primeiro comando do job. */
  linha: number;
}

/**
 * Os jobs de um workflow, com os comandos `run:` na ordem.
 *
 * O parser é textual de propósito: o repo não tem parser de YAML disponível
 * na camada do preflight (`yaml` está no `tooling/scripts`, que roda em
 * outro contexto), e um gate que precisa de uma dependência que o próprio
 * gate pode não ter é um gate que falha por motivo errado.
 */
export function jobsDoWorkflow(conteudo: string, arquivo: string): JobMedido[] {
  const linhas = conteudo.split('\n');
  const jobs: JobMedido[] = [];

  // Um job começa em indentação 2 (`  nome:`) e seus passos em 6 (`      - run:`).
  let jobAtual: JobMedido | null = null;
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]!;

    const cabecaJob = linha.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (cabecaJob) {
      jobAtual = { arquivo, job: cabecaJob[1]!, comandos: [], linha: i + 1 };
      jobs.push(jobAtual);
      continue;
    }

    // Uma chave de NÍVEL DE JOB fecha o job — mas só as que têm indentação
    // MENOR que 4 (o `runs-on:`, o `timeout-minutes:`, o `needs:`).
    //
    // MEDIDO 2026-11-09: a indentação tem que ser exata. Duas versões
    // erradas deste parser:
    //
    // 1. `/^ {4}\S/` — casava as LINHAS DE COMENTÁRIO de indentação 4
    //    (começam com `#`, que é `\S`) e fechava o job no primeiro
    //    comentário: 0 comandos em todos os jobs.
    // 2. `indentacao < 6` — fechava o job no `runs-on:` (indentação 4), que
    //    vem ANTES do `steps:`. De novo 0 comandos.
    //
    // A regra real: o job fecha quando a indentação é **menor que 4** (a
    // chave do próximo job, de indentação 2). `runs-on:`, `steps:`, os
    // passos (6) e o corpo deles (8, 10) mantêm o job.
    const semComentario = !/^\s*#/.test(linha);
    const indentacao = linha.match(/^ */)![0].length;
    if (semComentario && indentacao < 4 && jobAtual) {
      jobAtual = null;
      continue;
    }

    // `run: |` / `run: >` (bloco literal) — as linhas seguintes são o
    // comando. MEDIDO 2026-11-09: o teste do `run: (.+)` vinhas ANTES e
    // capturava o `|` como se fosse o comando — o bloco literal nunca era
    // lido. O bloco tem que ser tratado PRIMEIRO.
    const runBloco = linha.match(/^ {6}-?\s*run:\s*[|>]/);
    if (runBloco && jobAtual) {
      for (let j = i + 1; j < linhas.length; j++) {
        const prox = linhas[j]!;
        if (!/^ {8}\S/.test(prox)) break;
        jobAtual.comandos.push(prox.trim());
      }
      continue;
    }

    const run = linha.match(/^ {6}-?\s*run:\s*(.+)$/);
    if (run && jobAtual) {
      jobAtual.comandos.push(run[1]!.trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }
  }

  return jobs;
}

/** O job roda a suíte de testes do tooling? */
export function rodaToolingTest(comandos: string[]): boolean {
  return comandos.some((c) => /\btooling:test\b/.test(c));
}

/** O job gera o client do Prisma? */
export function geraClientDoPrisma(comandos: string[]): boolean {
  return comandos.some((c) => /\bdb:generate\b/.test(c) || /\bprisma\s+generate\b/.test(c));
}

/**
 * O job tem que gerar o client ANTES de rodar a suíte do tooling?
 *
 * A ordem é o que importa: `db:generate` depois do `tooling:test` não serve
 * para nada — o teste já rodou.
 */
export function ordemCorreta(comandos: string[]): {
  ok: boolean;
  indiceTeste: number;
  indiceGenerate: number;
} {
  let indiceTeste = -1;
  let indiceGenerate = -1;
  for (let i = 0; i < comandos.length; i++) {
    const c = comandos[i]!;
    if (indiceTeste === -1 && /\btooling:test\b/.test(c)) indiceTeste = i;
    if (indiceGenerate === -1 && (/\bdb:generate\b/.test(c) || /\bprisma\s+generate\b/.test(c))) {
      indiceGenerate = i;
    }
  }
  if (indiceTeste === -1) return { ok: true, indiceTeste, indiceGenerate };
  if (indiceGenerate === -1) return { ok: false, indiceTeste, indiceGenerate };
  return { ok: indiceGenerate < indiceTeste, indiceTeste, indiceGenerate };
}

export function checkCiPrismaClientReady(opts: { repoRoot: string }): CheckResult {
  const errors: string[] = [];
  const advisories: string[] = [];
  const root = path.resolve(opts.repoRoot);
  const pasta = path.join(root, PASTA_DE_WORKFLOWS);

  if (!existsSync(pasta)) {
    return {
      ok: true,
      errors,
      advisories: [`${PASTA_DE_WORKFLOWS} ausente — nada a medir`],
    };
  }

  let jobsMedidos = 0;
  for (const nome of readdirSync(pasta).sort()) {
    if (!nome.endsWith('.yml') && !nome.endsWith('.yaml')) continue;
    const conteudo = readFileSync(path.join(pasta, nome), 'utf-8');
    for (const job of jobsDoWorkflow(conteudo, nome)) {
      if (!rodaToolingTest(job.comandos)) continue;
      jobsMedidos++;

      const ordem = ordemCorreta(job.comandos);
      if (ordem.ok) continue;

      errors.push(
        `${PASTA_DE_WORKFLOWS}/${nome} — job '${job.job}' (linha ${job.linha}) roda ` +
          `\`pnpm tooling:test\` **sem gerar o client do Prisma antes**` +
          (ordem.indiceGenerate === -1
            ? ' (nenhum `db:generate` no job). '
            : ` (o \`db:generate\` está na linha ${ordem.indiceGenerate + 1}, DEPOIS do teste). `) +
          `O spec \`ambiente-local.spec.ts > temClientReal > o client do repo REAL\` mede o client ` +
          `de verdade, e ele não existe depois de um \`pnpm install\` — o postinstall do ` +
          `\`@prisma/client\` procura \`./prisma/schema.prisma\` na raiz do repo, e o schema está em ` +
          `\`apps/api/prisma/schema.prisma\`. MEDIDO 2026-11-09: com o store do pnpm limpo, o job ` +
          `falha — e o verde anterior vinha do cache (chaveado pelo lockfile), não do job. ` +
          `Adicione \`pnpm turbo run db:generate --filter=@projeto/api\` ANTES do \`tooling:test\`.`,
      );
    }
  }

  if (jobsMedidos === 0) {
    advisories.push(
      'nenhum job roda `pnpm tooling:test` — nada a medir (o gate confere a ORDEM, não a existência do script)',
    );
  } else {
    advisories.push(
      `job(s) que rodam a suíte do tooling verificados: ${jobsMedidos} (todos geram o client antes)`,
    );
  }

  return { ok: errors.length === 0, errors, advisories };
}

// A funcao e SINCRONA (le o filesystem com `readFileSync`, como o
// `check-ci-action-pinning`), entao o bloco NAO usa `.then()`: um
// `checkCiPrismaClientReady(...).then(...)` quebraria com
// "is not a function" — e sairia 1 sempre, que e verde-por-ignorar.
if (process.argv[1]?.endsWith('check-ci-prisma-client-ready.ts')) {
  const r = checkCiPrismaClientReady({ repoRoot: '.' });
  for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
  process.exit(r.ok ? 0 : 1);
}
