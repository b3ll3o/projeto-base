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
 *
 * ## "Não verificado" é vermelho
 *
 * Sem corpo legível, ou sem base que convirja com HEAD, o gate diz
 * `NÃO VERIFICADO` e sai **1**. Deliberado: este gate não tem painel de
 * `skipped`, só exit code, e **pular com `0` É verde** — seria o mesmo
 * estado silencioso que a issue denuncia, agora pelo outro lado. Acompanhe
 * `naoVerificado()` abaixo, onde o motivo fica escrito.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { MARCADOR, linhasVivas } from './pr-refresh-apply.js';
import { buscarBase } from './pr-refresh-hook.js';
import { varrerTexto } from './pr-refresh-scan.js';
import { TOTAL_PADROES } from './pr-refresh-scan.js';
import type { Relatorio } from './pr-refresh-scan.js';

export interface ResultadoGate {
  ok: boolean;
  errors: string[];
}

/** Largura da citação da linha: legível num log de CI, sem despejar o corpo. */
const LARGURA_CITACAO = 160;

/**
 * Remove do texto tudo que controla o terminal de quem vai ler.
 *
 * O corpo do PR é **escrito pelo autor do PR**, e o gate ecoa pedaços dele no
 * log do CI. Ecoado cru, o corpo controla o log: uma sequência ANSI reescreve
 * a linha seguinte do console, e um autor que não tem acesso ao runner ainda
 * assim mede o tamanho do terminal de quem lê. Por isso duas passadas — a
 * sequência ANSI inteira (que inclui os `[31m` que sobram órfãos se a gente só
 * apagar o `ESC`), e depois qualquer caractere de controle remanescente.
 *
 * pt-BR: isto NÃO é um detalhe da citação. O `declarado` — o trecho do corpo
 * que o scanner casou — entra na MESMA mensagem, e ele chega aqui já com o
 * `\r` dentro: o `\s` do regex do scanner casa CR, LF, VT e U+2028/9. MEDIDO
 * 2026-10-06 com o binário real e um corpo `31\rcommits`:
 *
 *     L1 (commits): declara "31\rcommits", o medido na base origin/main é 7…
 *         linha um 31 commits e 15 arquivos aqui        ← higienizada
 *
 * A citação limpa e o `declarado` cru, duas linhas acima, na mesma string. Por
 * isso a higienização mora aqui e é usada nos DOIS pontos — consertar só a
 * citação deixa o serviço pela metade, que é pior do que não consertar porque
 * o comentário do conserto passa a prometer uma proteção que não existe.
 */
function higienizar(bruto: string): string {
  return bruto
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * O texto da linha citada, higienizado e truncado.
 *
 * Devolve string vazia quando a linha não existe no corpo: `L<n>` fora do
 * corpo é dado corrompido upstream, e inventar texto para preencher seria pior
 * que citar menos. O gate degrada para o `L<n>` e continua dizendo a mesma
 * coisa — a ausência da citação nunca muda o veredito.
 */
function citarLinha(body: string, linha: number): string {
  const bruto = body.split('\n')[linha - 1];
  if (bruto === undefined) return '';
  const limpo = higienizar(bruto);
  if (limpo === '') return '';
  return limpo.length > LARGURA_CITACAO ? `${limpo.slice(0, LARGURA_CITACAO - 1)}…` : limpo;
}

/**
 * O gate propriamente dito: pura, sem rede e sem git.
 *
 * Recebe o corpo e o relatório que o scanner já produziu — quem chama não
 * precisa saber de onde saíram, e o spec exercita a decisão sem `gh`.
 *
 * ## Por que a mensagem oferece DOIS consertos
 *
 * A primeira versão mandava "Marque o parágrafo e rode `pnpm pr:refresh`", sem
 * alternativa. MEDIDO no PR #58: a prosa acusada falava dos **scripts de
 * preflight** ("15 arquivos"), e o hook obedeceria — trocaria a frase pela
 * contagem de arquivos **do PR**. O número sairia verdadeiro, a frase deixaria
 * de falar do que ela falava, e o gate ficaria **verde**.
 *
 * Esse é o pior desfecho possível para este instrumento: um número certo sobre
 * outro assunto não produz sinal nenhum, nem no gate nem na leitura. Um falso
 * positivo honesto só custa uma frase reescrita.
 *
 * O gate **não pode decidir** qual dos dois é o caso: "esta frase é uma claim
 * deste PR?" é semântica, e um classificador por palavra-chave seria uma
 * superfície nova de falso positivo — a classe 2 de `guard-classes`, um guard
 * que cobre só a forma que você conhece. A saída honesta é o bifurc + a frase,
 * para o humano julgar em segundos em vez de caçar a linha e decidir sozinho.
 */
export function verificarMarcador(body: string, relatorio: Relatorio): ResultadoGate {
  const vivas = linhasVivas(body, MARCADOR);
  const naoMarcadas = relatorio.claims.filter((c) => c.divergente && !vivas.has(c.linha));
  if (naoMarcadas.length === 0) return { ok: true, errors: [] };

  return {
    ok: false,
    errors: naoMarcadas.map((c) => {
      const citacao = citarLinha(body, c.linha);
      // pt-BR: `declarado` é `m[0]` do scanner — texto do CORPO DO PR, não
      // dado do git. Passa por `higienizar` pelo mesmo motivo da citação, e
      // o teste "um \r no declarado não sobrevive à mensagem" é o que segura.
      const declarado = higienizar(c.declarado);
      return (
        `L${c.linha} (${c.classe}): declara "${declarado}", o medido na base ` +
        `${relatorio.base} é ${c.medido ?? '—'}, e o parágrafo NÃO carrega ` +
        `${MARCADOR}.\n` +
        (citacao === '' ? '' : `    ${citacao}\n`) +
        `\n` +
        `  Antes de escolher: marcar a frase errada não produz erro, produz uma\n` +
        `  MENTIRA VERDADEIRA. O hook troca o número pela contagem de commits/\n` +
        `  arquivos DO PR, e a frase sai verdadeira sobre outro assunto — sem\n` +
        `  nenhum sinal depois disso, e com o gate VERDE.\n` +
        `\n` +
        `  Escolha o conserto pelo ASSUNTO da frase, não pela forma dela:\n` +
        `  • a frase é sobre ESTE PR → marque o parágrafo e rode \`pnpm pr:refresh\`;\n` +
        `  • a frase só tem a FORMA de uma claim (ex.: "15 arquivos" falando de\n` +
        `    scripts, não do diff) → NÃO marque: reescreva a frase.`
      );
    }),
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

/**
 * Sai com uma mensagem que deixa claro que nada foi medido.
 *
 * ## Por que isto é FALHA e não skip
 *
 * A primeira versão deste gate pulava (exit 0) quando não conseguia medir, com
 * o argumento "não verificado não é verde". O argumento está certo e a
 * conclusão estava errada: **pular com exit 0 É verde.** O preflight tem um
 * `skipped` explícito justamente para que "não havia o que verificar" não se
 * pareça com "verifiquei e passou" — e este gate não tem painel, só exit code.
 *
 * Pular aqui tornaria o gate decorativo pelo caminho exato que a issue #45
 * denuncia: um PR que nasce inativo e ninguém é avisado. Um gate que só
 * funciona na máquina de quem o escreveu não é um gate.
 *
 * ## Por que não engole a exceção
 *
 * `varrerTexto` LANÇA quando a base não tem ancestral comum com HEAD (que é o
 * que acontece com o checkout raso do `pull_request`). A primeira versão não
 * tinha `try` aqui: a exceção subia e matava o processo com stack trace —
 * vermelho, mas pelo motivo errado, e sem a pista de como corrigir.
 * MEDIDO no PR #53: preflight vermelho com
 * `Error: base sem ancestral comum: "origin/main" e HEAD não convergem`.
 * O ramo "não verificado" existia no código e era inalcançável pelo único canal
 * que de fato dispara.
 */
function naoVerificado(motivo: string, comoCorrigir: string): number {
  process.stderr.write(
    `pr-refresh-gate: NÃO VERIFICADO — ${motivo}\n` +
      `Nada foi medido, e isto não conta como aprovação: o gate só pode dizer\n` +
      `"verde" tendo lido as claims. Como corrigir: ${comoCorrigir}\n`,
  );
  return 1;
}

function main(): number {
  const repo = process.env.GITHUB_REPOSITORY ?? '';
  const pr = process.env.PR_NUMBER;
  const repoDir = process.env.GITHUB_WORKSPACE ?? process.cwd();

  const corpo = lerCorpo(repo, pr);
  if (corpo === null) {
    return naoVerificado(
      `não consegui ler o corpo do PR ${pr ?? '(?)'} em ${repo || '(repo não informado)'}`,
      'no CI o corpo vem do payload do evento — veja o passo "Gate do marcador pr-refresh" em .github/workflows/ci.yml. Localmente, rode com PR_BODY_FILE=<arquivo> ou dentro de um repo com `gh` autenticado.',
    );
  }

  const base = process.env.PR_BASE ?? 'origin/main';
  const achada = buscarBase(repoDir, base);
  if (!achada.ok) {
    return naoVerificado(
      achada.erro,
      `o fetch de ${base} falhou — verifique acesso de rede e a ref.`,
    );
  }

  let relatorio: Relatorio;
  try {
    relatorio = varrerTexto(corpo, repoDir, base);
  } catch (e) {
    // O `throw` é o canal real deste gate: base sem ancestral comum é o que
    // acontece com `fetch-depth` default num checkout de `pull_request`.
    return naoVerificado(
      e instanceof Error ? e.message : String(e),
      `a base ${base} não converge com HEAD — o checkout precisa de histórico completo (\`fetch-depth: 0\` no actions/checkout).`,
    );
  }

  const r = verificarMarcador(corpo, relatorio);
  const divergentes = relatorio.claims.filter((c) => c.divergente).length;

  if (relatorio.claims.length === 0) {
    // Sai 0, mas sem afirmar que mediu o que não existia.
    //
    // Isto NÃO é "pular": o corpo foi lido e varrido, e a varredura terminou
    // com zero claims. É uma medição completa cujo resultado é zero — diferente
    // de `naoVerificado`, onde nada foi lido. A saída antiga dizia "0 claim(s)
    // divergente(s), todas em parágrafo marcado — OK", o que afirma uma
    // marcação que não existia: com corpo vazio não há claim E não há
    // marcador. MEDIDO: corpo vazio e corpo sem claim ambos davam essa frase.
    //
    // A ressalva que a mensagem carrega é a parte que importa: o scanner
    // reconhece N formatos, e um número fora deles é invisível para ele. O
    // gate não pode afirmar que "tudo que tem contagem está marcado" quando o
    // que ele viu foi zero.
    process.stderr.write(
      `pr-refresh-gate: 0 claim(s) reconhecida(s) no corpo — o gate leu e varreu, ` +
        `e não achou contagem viva para conferir. NÃO é o mesmo que "verificado e ` +
        `verde": um número fora dos ${TOTAL_PADROES} formatos que o scanner ` +
        `reconhece é invisível para ele (ex.: "37 erros", "300 linhas").\n`,
    );
    return 0;
  }

  if (r.ok) {
    // "todas em parágrafo marcado" só é verdade quando existe ALGUMA claim
    // divergente para estar num parágrafo. Com zero divergentes a frase afirma
    // uma marcação que não existe — é o mesmo defeito que o
    // `claims.length === 0` acima já corrige, uma branch acima, e ele
    // sobreviveu porque aquela spec só cobria o corpo sem claim.
    //
    // MEDIDO 2026-10-08 no PR #66: corpo com 12 claim(s) reconhecidas, ZERO
    // marcadores e ZERO divergentes, e a saída foi "0 claim(s) divergente(s) de
    // 12 reconhecida(s), todas em parágrafo marcado — OK". Um "todas" sobre um
    // conjunto de zero não é uma aprovação: é uma afirmação de que o corpo
    // autorizou uma reescrita que ele não autorizou.
    process.stderr.write(
      divergentes === 0
        ? `pr-refresh-gate: 0 claim(s) divergente(s) de ${relatorio.claims.length} ` +
            `reconhecida(s) — nenhuma contagem desatualizada, e portanto nada ` +
            `a conferir com marcador.\n`
        : `pr-refresh-gate: ${divergentes} claim(s) divergente(s) de ${relatorio.claims.length} ` +
            `reconhecida(s), todas em parágrafo marcado — OK\n`,
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
