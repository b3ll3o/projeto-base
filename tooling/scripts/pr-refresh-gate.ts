#!/usr/bin/env tsx
/**
 * Gate do marcador `pr-refresh` (issue #45, item 4).
 *
 * ## O defeito que este gate fecha
 *
 * `pr-refresh` reescreve as contagens de git que envelhecem a cada commit. O
 * que decide se ele pode reescrever é o marcador `<!--pr-refresh:live-->` no
 * parágrafo da claim. Sem marcador, o hook roda, mede, **não escreve nada** e
 * sai com `sem-marcador` — que o `.husky/pre-push` engole (`exit 0`, por
 * decisão de owner: "nunca bloqueia"). Resultado: **todo PR nasce inativo e
 * ninguém é avisado.** No PR #44 o corpo mentia por 2 commits, 5 arquivos e
 * 1613 linhas, e a lista de pendências do corpo registrava um item que não
 * existia.
 *
 * O hook não pode virar o lugar que bloqueia — a decisão de owner foi
 * explícita e é a mesma que mantém rede, `auth` e `gh` fora do caminho do
 * push. Então o gate vive no CI, onde bloquear é o que a job faz.
 *
 * ## O gate olha o parágrafo, não o corpo
 *
 * O escopo do marcador é o **parágrafo** (`linhasVivas`, em `pr-refresh-apply`).
 * "O corpo tem ao menos um marcador" seria um teste mais fraco e passaria em
 * exatamente o caso que importa: um marcador colado num parágrafo qualquer
 * enquanto as claims de verdade continuam sem nenhum — o hook segue sem
 * escrever nada. Aqui o critério é: **toda claim divergente está num parágrafo
 * marcado.**
 *
 * ## Contra-regra deliberada
 *
 * Claim **não** divergente sem marcador NÃO é erro. Marcar o corpo inteiro
 * faria o token deixar de significar "aqui a contagem é viva" e viraria
 * decoração — que é o estado que faz o instrumento perder o sentido.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { MARCADOR, linhasVivas } from './pr-refresh-apply.js';
import { buscarBase } from './pr-refresh-hook.js';
import { varrerTexto } from './pr-refresh-scan.js';
import type { Relatorio } from './pr-refresh-scan.js';

export interface ResultadoGate {
  ok: boolean;
  errors: string[];
}

/**
 * O gate propriamente dito: pura, sem rede e sem git.
 *
 * Recebe o corpo e o relatório que o scanner já produziu — quem chama não
 * precisa saber de onde saíram, e o spec exercita a decisão sem `gh`.
 */
export function verificarMarcador(body: string, relatorio: Relatorio): ResultadoGate {
  const vivas = linhasVivas(body, MARCADOR);
  const naoMarcadas = relatorio.claims.filter((c) => c.divergente && !vivas.has(c.linha));
  if (naoMarcadas.length === 0) return { ok: true, errors: [] };

  return {
    ok: false,
    errors: naoMarcadas.map(
      (c) =>
        `L${c.linha} (${c.classe}): declara "${c.declarado}", o medido na base ` +
        `${relatorio.base} é ${c.medido ?? '—'}, e o parágrafo NÃO carrega ` +
        `${MARCADOR}. Sem o marcador o pr-refresh roda, mede e não escreve — ` +
        `a claim envelhece em silêncio e o hook sai com "sem-marcador", que o ` +
        `pre-push engole. Marque o parágrafo e rode \`pnpm pr:refresh\`.`,
    ),
  };
}

/**
 * Corpo do PR. `null` quando não deu para ler de NENHUMA das fontes.
 *
 * `PR_BODY_FILE` vem primeiro de propósito: no CI o corpo está no payload do
 * evento `pull_request`, e usá-lo dispensa `gh` e — mais importante — dispensa
 * conceder `pull-requests: read` ao token só para ler o PR que acabou de
 * disparar a run. `gh` fica como caminho local, onde já é preciso.
 */
export function lerCorpo(repo: string, pr: string | undefined): string | null {
  const arquivo = process.env.PR_BODY_FILE;
  if (arquivo !== undefined && arquivo !== '') {
    try {
      return readFileSync(arquivo, 'utf-8');
    } catch {
      return null;
    }
  }
  if (!repo) return null;
  try {
    return execSync(`gh pr view ${pr ?? ''} --repo ${repo} --json body -q .body`, {
      encoding: 'utf-8',
    });
  } catch {
    return null;
  }
}

function main(): number {
  const repo = process.env.GITHUB_REPOSITORY ?? '';
  const pr = process.env.PR_NUMBER;
  const repoDir = process.env.GITHUB_WORKSPACE ?? process.cwd();

  const corpo = lerCorpo(repo, pr);
  if (corpo === null) {
    // Não verificado NÃO é verde. Sem `gh` (ou sem permissão) o gate sai
    // pulado, nunca aprovado: um gate que aprova o que não mediu é a classe 1
    // com aparência de sucesso.
    process.stderr.write(
      `pr-refresh-gate: não consegui ler o corpo do PR ${pr ?? '(?)'} em ${repo} — ` +
        `VERIFICAÇÃO NÃO FEITA, pulando (não é aprovação)\n`,
    );
    return 0;
  }

  const base = process.env.PR_BASE ?? 'origin/main';
  const achada = buscarBase(repoDir, base);
  if (!achada.ok) {
    process.stderr.write(`pr-refresh-gate: ${achada.erro}\nVERIFICAÇÃO NÃO FEITA, pulando\n`);
    return 0;
  }

  // `achada.erro` é a mensagem de falha do git, não a base — quando ok, é ''.
  const relatorio = varrerTexto(corpo, repoDir, base);
  const r = verificarMarcador(corpo, relatorio);
  if (r.ok) {
    process.stderr.write(
      `pr-refresh-gate: ${relatorio.claims.filter((c) => c.divergente).length} claim(s) ` +
        `divergente(s), todas em parágrafo marcado — OK\n`,
    );
    return 0;
  }
  for (const e of r.errors) process.stderr.write(`${e}\n`);
  process.stderr.write(
    `\npr-refresh-gate: ${r.errors.length} claim(s) divergente(s) fora de parágrafo marcado.\n`,
  );
  return 1;
}

const invocadoDireto = process.argv[1]?.includes('pr-refresh-gate');
if (invocadoDireto) process.exit(main());
