#!/usr/bin/env tsx
/**
 * Gate do PR revisado — a regra de [`pr-review.md`](../../.agents/specs/conventions/pr-review.md).
 *
 * ## O defeito que este gate fecha
 *
 * O ruleset `master` (id 23853096) exige **um** status check (`quality`) e
 * **zero** aprovações: `required_approving_review_count = 0`,
 * `required_reviewers = []`. MEDIDO no PR #171: 63 arquivos, 5.298 linhas
 * adicionadas, **nenhum** comentário de revisão. Nada no caminho do merge
 * perguntava se o PR tinha sido revisado — e o roteamento que existe
 * (`review-router.ts`, 9 reviewers para aquele diff) terminava em
 * `console.log`.
 *
 * ## O que é um "comentário de revisão"
 *
 * Um comentário em **qualquer** dos 3 canais da API do GitHub cujo corpo
 * carrega o marcador `<!-- pr-review -->`:
 *
 *   - review do PR        → `GET /repos/{o}/{r}/pulls/{n}/reviews`
 *   - comentário inline   → `GET /repos/{o}/{r}/pulls/{n}/comments`
 *   - comentário de conversa → `GET /repos/{o}/{r}/issues/{n}/comments`
 *
 * O **corpo do PR** não conta: é do autor, e a regra é sobre a revisão.
 *
 * ## Por que o marcador, e não "qualquer comentário"
 *
 * Um gate que aceita qualquer comentário mede que **alguém digitou**. Um gate
 * que aceita um marcador mede que **a revisão do processo** aconteceu — e o
 * marcador é o mesmo truque do `pr-refresh` (`<!--pr-refresh:live-->`), que o
 * repo já usa para não deixar o token de "aqui a contagem é viva" virar
 * decoração.
 *
 * A contrapartida é honesta e está escrita na convenção: **o gate mede a
 * existência da revisão, não a qualidade dela**, e um comentário com o marcador
 * e nada mais passa. Fechar isso exigiria medir semântica de comentário — e o
 * repo já mediu que um classificador por palavra-chave é a classe 2 do
 * `guard-classes.md`.
 *
 * ## Três estados, e nenhum deles é "verde por ausência"
 *
 *   verde            → ≥ 1 comentário com o marcador        → exit 0
 *   vermelho         → 0 comentários com o marcador         → exit 1
 *   não verificável  → não deu para ler a API               → exit 1
 *
 * O terceiro estado é o ponto. `pr-refresh-gate` mediu que **pular com `0` é
 * verde**, e é o pior desfecho possível num gate de PR: o PR nasce inativo e
 * ninguém é avisado. Aqui o gate NUNCA sai 0 sem ter lido a API.
 *
 * ## A leitura é por `gh api`, e o `gh` é o caminho local
 *
 * No CI o `GITHUB_TOKEN` já está no ambiente e o `gh` lê `GITHUB_TOKEN`/
 * `GH_TOKEN` sozinho — nenhum passo novo de autenticação. O comando vai em
 * **argv** (array), nunca em string interpolada: o número do PR e o nome do
 * repo vêm do ambiente, e um shell que os concatene é superfície de injeção
 * (é a mesma razão do `execFileSync` no `pr-refresh-gate`).
 */
import { execFileSync } from 'node:child_process';
import type { CheckResult } from '../../.tooling/scripts/ci/check-types.js';

/**
 * O marcador que separa "a revisão do processo" de "alguém digitou uma frase".
 *
 * Fica aqui — e não só na convenção — porque é o **dono do fato**: o texto
 * que diz o que conta como revisão tem UM lugar, e quem usa esse lugar (a
 * spec, o gate, a doc) só **referencia**.
 */
export const MARCADOR = '<!-- pr-review -->';

/** Os 3 canais onde um comentário de revisão pode aparecer. */
export type Canal = 'review' | 'inline' | 'conversa';

/** Um comentário lido de um dos canais. */
export interface ItemComentario {
  canal: Canal;
  id: number;
  autor: string;
  corpo: string;
}

/**
 * O corpo carrega o marcador?
 *
 * A comparação é por **substring**, não por igualdade: o comentário real
 * carrega o marcador **e** o relatório, e o comentário inline do GitHub
 * insere marcações ao redor do texto. O que não pode é o **corpo do PR** —
 * ele nunca entra aqui, porque não é canal de revisão.
 */
export function temMarcador(corpo: string | null | undefined): boolean {
  if (typeof corpo !== 'string') return false;
  return corpo.includes(MARCADOR);
}

/**
 * Extrai os comentários de uma resposta da API.
 *
 * Pura: recebe o JSON **como texto** e devolve os itens com o corpo
 * preenchido. O parse é tolerante a campos ausentes — a API do GitHub muda,
 * e um campo novo não pode fazer o gate reprovar por motivo errado.
 */
export function extrairComentario(canal: Canal, bruto: unknown): ItemComentario | null {
  if (typeof bruto !== 'object' || bruto === null) return null;
  const o = bruto as Record<string, unknown>;
  const id = typeof o['id'] === 'number' ? o['id'] : null;
  const corpo = typeof o['body'] === 'string' ? o['body'] : '';
  const user = o['user'];
  const autor =
    typeof user === 'object' &&
    user !== null &&
    typeof (user as Record<string, unknown>)['login'] === 'string'
      ? ((user as Record<string, unknown>)['login'] as string)
      : '(desconhecido)';
  if (id === null) return null;
  return { canal, id, autor, corpo };
}

/**
 * Converte as 3 respostas da API na lista de comentários.
 *
 * `bruto` são **textos JSON** (o `gh api` devolve texto, e `JSON.parse` de um
 * array é o único caminho que não depende do formato do `gh`).
 */
export function coletarComentario(bruto: {
  reviews?: string;
  inline?: string;
  conversa?: string;
}): ItemComentario[] {
  const saida: ItemComentario[] = [];
  const pares: Array<[Canal, string | undefined]> = [
    ['review', bruto.reviews],
    ['inline', bruto.inline],
    ['conversa', bruto.conversa],
  ];
  for (const [canal, texto] of pares) {
    if (texto === undefined) continue;
    let lista: unknown;
    try {
      lista = JSON.parse(texto);
    } catch {
      continue;
    }
    if (!Array.isArray(lista)) continue;
    for (const item of lista) {
      const comentario = extrairComentario(canal, item);
      if (comentario !== null) saida.push(comentario);
    }
  }
  return saida;
}

/**
 * O veredito: **≥ 1** comentário com o marcador passa.
 *
 * Devolve o `CheckResult` do tooling (o mesmo formato dos gates do
 * `preflight`), para que quem consome não precise conhecer o formato deste
 * arquivo.
 */
export function verificarRevisao(comentarios: ItemComentario[]): CheckResult {
  const comMarcador = comentarios.filter((c) => temMarcador(c.corpo));
  if (comMarcador.length > 0) {
    return {
      ok: true,
      errors: [],
      advisories: [
        `pr-review-gate: ${comMarcador.length} comentário(s) de revisão com o marcador ` +
          `${MARCADOR} (canal: ${[...new Set(comMarcador.map((c) => c.canal))].join(', ')}).`,
      ],
    };
  }

  const canais = [...new Set(comentarios.map((c) => c.canal))];
  return {
    ok: false,
    errors: [
      `pr-review-gate: o PR não tem nenhum comentário de revisão com o marcador ` +
        `${MARCADOR}.\n` +
        `  Comentários lidos: ${comentarios.length}` +
        (canais.length > 0 ? ` (canais: ${canais.join(', ')})` : '') +
        `\n` +
        `  O gate mede que a REVISÃO aconteceu — não que ela aprovou. O processo\n` +
        `  que a publica é o workflow \`pr-review-mode\` (.agents/workflows/pr-review-mode.md):\n` +
        `  classificar o diff → despachar um specialist por parte → consolidar →\n` +
        `  comentar o PR com o marcador.\n` +
        `  Como rodar localmente: pnpm pr:review-check --pr=<n>`,
    ],
  };
}

/**
 * A API do GitHub, via `gh`.
 *
 * `gh api` já sabe paginar, e `--paginate` com `--slurp` devolveria um array
 * de arrays; sem o `--slurp`, o `gh` emite **um** JSON por página e a
 * concatenação quebra o parse. Por isso o gate usa `--paginate` **e**
 * `--slurp`, e o parse tolera **tanto** o array único quanto a lista de arrays.
 */
function listar(caminho: string): string {
  return execFileSync('gh', ['api', caminho, '--paginate', '--slurp'], {
    encoding: 'utf-8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

/**
 * Junta as páginas do `gh`.
 *
 * O `gh api --paginate --slurp` devolve `[[...], [...]]` — uma lista de
 * páginas. A API pode devolver um array **único** quando há uma página só, e
 * o gate trata os dois: concatena quando cada elemento é array, e usa direto
 * quando o topo já é o array de itens.
 */
export function achatarPaginas(texto: string): string {
  let bruto: unknown;
  try {
    bruto = JSON.parse(texto);
  } catch {
    return '[]';
  }
  if (!Array.isArray(bruto)) return '[]';
  if (bruto.length === 0) return '[]';
  const todasSaoArrays = bruto.every((p) => Array.isArray(p));
  if (!todasSaoArrays) return texto;
  return JSON.stringify(bruto.flat());
}

/**
 * Sai com uma mensagem que deixa claro que **nada foi medido**.
 *
 * Deliberado: sair 0 aqui seria o mesmo estado silencioso que a regra
 * denuncia — o gate verde sem ter lido nada. `pr-refresh-gate` mediu o mesmo
 * no PR #53: sem corpo legível, o gate dizia "NÃO VERIFICADO" e saía 1.
 */
function naoVerificado(motivo: string, comoCorrigir: string): number {
  process.stderr.write(
    `pr-review-gate: NÃO VERIFICADO — ${motivo}\n` +
      `Nada foi medido, e isto não conta como aprovação: o gate só pode dizer\n` +
      `"verde" tendo lido a revisão do PR. Como corrigir: ${comoCorrigir}\n`,
  );
  return 1;
}

/** O número do PR: `--pr=N` tem precedência sobre `PR_NUMBER`. */
export function numeroDoPr(argumentos: string[]): string | undefined {
  const explicito = argumentos.find((a) => a.startsWith('--pr='))?.slice('--pr='.length);
  if (explicito !== undefined && explicito !== '') return explicito;
  const doEnv = process.env['PR_NUMBER'];
  if (doEnv !== undefined && doEnv !== '') return doEnv;
  return undefined;
}

/** O repositório: `--repo=o/n` tem precedência sobre `GITHUB_REPOSITORY`. */
export function repositorio(argumentos: string[]): string | undefined {
  const explicito = argumentos.find((a) => a.startsWith('--repo='))?.slice('--repo='.length);
  if (explicito !== undefined && explicito !== '') return explicito;
  const doEnv = process.env['GITHUB_REPOSITORY'];
  if (doEnv !== undefined && doEnv !== '') return doEnv;
  return undefined;
}

function main(): number {
  const argumentos = process.argv.slice(2);
  const pr = numeroDoPr(argumentos);
  const repo = repositorio(argumentos);

  if (pr === undefined) {
    return naoVerificado(
      'não sei qual PR verificar',
      'passe `--pr=<n>` ou exporte PR_NUMBER. No CI, o workflow `pr-review.yml` ' +
        'exporta PR_NUMBER a partir do evento.',
    );
  }
  if (repo === undefined) {
    return naoVerificado(
      `não sei qual repositório ler (PR ${pr})`,
      'passe `--repo=owner/nome` ou exporte GITHUB_REPOSITORY.',
    );
  }

  let reviews: string;
  let inline: string;
  let conversa: string;
  try {
    reviews = achatarPaginas(listar(`repos/${repo}/pulls/${pr}/reviews`));
    inline = achatarPaginas(listar(`repos/${repo}/pulls/${pr}/comments`));
    conversa = achatarPaginas(listar(`repos/${repo}/issues/${pr}/comments`));
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString().trim();
    return naoVerificado(
      `não consegui ler a API do GitHub do PR ${pr} em ${repo}` +
        (stderr !== undefined && stderr !== '' ? `: ${stderr}` : ''),
      'o `gh` precisa estar autenticado (`gh auth status`) e com permissão de ' +
        'leitura de pull requests. No CI, o job declara `pull-requests: read`.',
    );
  }

  const comentarios = coletarComentario({ reviews, inline, conversa });
  const resultado = verificarRevisao(comentarios);
  for (const linha of resultado.errors) process.stderr.write(`${linha}\n`);
  for (const linha of resultado.advisories ?? []) process.stderr.write(`${linha}\n`);
  return resultado.ok ? 0 : 1;
}

const invocadoDireto = process.argv[1]?.includes('pr-review-gate');
if (invocadoDireto) process.exit(main());
