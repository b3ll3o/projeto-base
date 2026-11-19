#!/usr/bin/env tsx
/**
 * Gate do PR revisado — a regra de [`pr-review.md`](../../.agents/specs/conventions/pr-review.md).
 *
 * ## O defeito que este gate fecha
 *
 * O ruleset `master` (id 23853096) exige **dois** status checks (`quality` e
 * `review-comment` — MEDIDO 2026-11-18 na revisão do diff: `gh api
 * repos/b3ll3o/projeto-base/rulesets/23853096`) e **zero** aprovações:
 * `required_approving_review_count = 0`, `required_reviewers = []`. MEDIDO no PR #171: 63 arquivos, 5.298 linhas
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
 * ⚠️ E O TERCEIRO ESTADO TEM DOIS MOTIVOS, e a mensagem diz QUAL: o número
 * que não é PR (404) e a API que não respondeu. MEDIDO 2026-11-18 na 5ª
 * revisão do PR #171: o número de uma ISSUE respondia "não consegui ler a
 * API", e o conserto indicado era autenticar o `gh` — que já funcionava.
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
        `  Como rodar localmente: pnpm pr:review-check --pr=<n> --repo=owner/nome`,
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
 * O recurso EXISTE? — a pergunta que separa "não existe" de "a API caiu".
 *
 * ⚠️ Sem `--paginate`/`--slurp`: a resposta é um OBJETO (o repo, o PR), e o
 * `--slurp` embrulha a saída de um recurso único num array — o que não é o
 * que a pergunta precisa. O corpo não é lido: o que importa é a RESPOSTA.
 */
function existeRecurso(caminho: string): void {
  execFileSync('gh', ['api', caminho], {
    encoding: 'utf-8',
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** O PR existe — a pergunta que separa "não é PR" de "a API caiu". */
function existePr(repo: string, pr: string): void {
  existeRecurso(`repos/${repo}/pulls/${pr}`);
}

/** O stderr do `gh` — a mensagem que a API devolveu. */
function textoDoErro(erro: unknown): string {
  const stderr = (erro as { stderr?: Buffer | string }).stderr;
  const texto = (typeof stderr === 'string' ? stderr : (stderr?.toString() ?? '')).trim();
  return texto === '' ? 'sem detalhe' : texto;
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

/**
 * O repositório: `--repo=o/n` > `GITHUB_REPOSITORY` > o `origin` do git.
 *
 * ⚠️ O `origin` do git é o que faz o COMANDO DOCUMENTADO funcionar:
 * MEDIDO 2026-11-18 na 5ª revisão do PR #171, `pnpm pr:review-check --pr=171`
 * (sem `--repo`) saía 1 com "não sei qual repositório ler" — e o §Passo 7 do
 * workflow manda rodar EXATAMENTE esse comando. O gate que reprova por
 * motivo certo mas que o doc manda escrever errado é o mesmo de um gate
 * quebrado: quem segue o doc lê vermelho depois de publicar.
 */
export function repositorio(argumentos: string[]): string | undefined {
  const explicito = argumentos.find((a) => a.startsWith('--repo='))?.slice('--repo='.length);
  if (explicito !== undefined && explicito !== '') return explicito;
  const doEnv = process.env['GITHUB_REPOSITORY'];
  if (doEnv !== undefined && doEnv !== '') return doEnv;
  return repositorioDoGit();
}

/**
 * O `owner/nome` do `origin` do git — e `undefined` fora de um repo.
 *
 * ⚠️ O `git` é chamado com `cwd` explícito (`process.cwd()`): o gate roda de
 * qualquer diretório, e um `origin` procurado no diretório errado é o
 * repositório errado.
 */
export function repositorioDoGit(): string | undefined {
  try {
    const remoto = execFileSync('git', ['remote', 'get-url', 'origin'], {
      encoding: 'utf-8',
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return ownerENome(remoto.trim());
  } catch {
    return undefined;
  }
}

/**
 * O `owner/nome` de uma URL de remoto — e as DUAS formas que o git usa.
 *
 * ⚠️ O `ssh://` é a mesma forma do `https://` para o que importa aqui (o
 * caminho depois do host), e a forma SCP (`git@github.com:o/n.git`) é a
 * terceira.
 *
 * ⚠️ A BARRA FINAL sai ANTES do `.git`: um remoto terminado em `.git/`
 * devolvia `owner/nome.git` — e o gate lia `repos/owner/nome.git/pulls/N`,
 * que é 404, com o diagnóstico errado (MEDIDO 2026-11-18, revisão do diff).
 */
export function ownerENome(remoto: string): string | undefined {
  const limpo = remoto
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/, '');
  if (limpo === '') return undefined;
  // SCP: `git@github.com:owner/nome` — e o caminho pode ter mais de DOIS
  // segmentos (`git@gitlab.com:grupo/sub/projeto.git`), que é o nome do
  // repositório no GitLab.
  const scp = /:([^:]+)$/.exec(limpo);
  if (scp !== null && !/^[a-z][a-z0-9+.-]*:\/\//i.test(limpo)) return scp[1];
  // URL: `https://github.com/owner/nome` (e `ssh://git@github.com/owner/nome`)
  const url = /^[a-z][a-z0-9+.-]*:\/\/[^/]+\/(.+)$/i.exec(limpo);
  if (url !== null) return url[1];
  return undefined;
}

/**
 * A API respondeu **404** — e não "a API caiu".
 *
 * ⚠️ O `gh` sai com 1 e escreve `gh: Not Found (HTTP 404)` no stderr. Sem
 * distinguir isso de uma rede caída, o gate mandava "autentique o `gh`" para
 * um caso em que o token funcionava: MEDIDO 2026-11-18, `pr:review-check
 * --pr=149` (uma ISSUE, não um PR) respondia "não consegui ler a API" — e o
 * conserto indicado não consertava nada.
 */
export function ehNaoEncontrado(erro: unknown): boolean {
  const stderr = (erro as { stderr?: Buffer | string }).stderr;
  const texto = typeof stderr === 'string' ? stderr : (stderr?.toString() ?? '');
  return /HTTP 404\b/.test(texto);
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
      'passe `--repo=owner/nome`, exporte GITHUB_REPOSITORY, ou rode o gate ' +
        'de dentro de um clone do repositório (o `origin` do git serve).',
    );
  }

  // ⚠️ O REPOSITÓRIO PRIMEIRO — e é ele que separa "o repositório não existe
  // (ou o token não tem acesso)" de "o número não é PR". O GitHub responde
  // **404** para as DUAS coisas: MEDIDO 2026-11-18 na revisão do diff,
  // `--repo=owner-que-nao-existe/repo` caía no ramo do "não é um PR", e o
  // conserto indicado (conferir o número) não consertava nada.
  try {
    existeRecurso(`repos/${repo}`);
  } catch (err) {
    if (ehNaoEncontrado(err)) {
      return naoVerificado(
        `o repositório ${repo} não existe, ou o token não tem acesso a ele ` +
          '(a API respondeu 404)',
        'confira o `--repo=owner/nome` — e o acesso do token (`gh auth status`). ' +
          'Um repositório privado sem permissão responde 404, e não 403.',
      );
    }
    return naoVerificado(
      `não consegui ler a API do GitHub do repositório ${repo}: ${textoDoErro(err)}`,
      'o `gh` precisa estar autenticado (`gh auth status`) e com permissão de ' +
        'leitura de pull requests. No CI, o job declara `pull-requests: read`.',
    );
  }

  // ⚠️ O PR ANTES dos comentários — e é ele que separa DUAS falhas que o
  // `catch` único tratava como uma: o número que NÃO É PR (404) e a API que
  // não respondeu. MEDIDO 2026-11-18 na 5ª revisão do PR #171: o número de
  // uma ISSUE respondia "não consegui ler a API do GitHub", e o conserto
  // indicado era autenticar o `gh` — que já estava autenticado.
  try {
    existePr(repo, pr);
  } catch (err) {
    if (ehNaoEncontrado(err)) {
      return naoVerificado(
        `o número ${pr} não é um PR em ${repo} (a API respondeu 404)`,
        'confira o número do PR — o gate mede PULL REQUEST, e o número de uma ' + 'ISSUE não é PR.',
      );
    }
    return naoVerificado(
      `não consegui ler a API do GitHub do PR ${pr} em ${repo}: ${textoDoErro(err)}`,
      'o `gh` precisa estar autenticado (`gh auth status`) e com permissão de ' +
        'leitura de pull requests. No CI, o job declara `pull-requests: read`.',
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
    return naoVerificado(
      `não consegui ler a API do GitHub do PR ${pr} em ${repo}: ${textoDoErro(err)}`,
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
