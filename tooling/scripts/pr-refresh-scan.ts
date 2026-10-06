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
  /**
   * Linha do CORPO (1-based) onde a claim aparece.
   *
   * Sem isto, ler todas as ocorrências produz um relatório que não se pode
   * usar: no PR #44, `31 commits` (linha 7, cabeçalho — claim de verdade) e
   * `20 commits` (linha 33, dentro de "ela foi aberta com 20 commits" — uma
   * frase que CITA o passado) são ambos divergentes do medido, e nada no
   * relatório diz qual corrigir. A linha é o que entrega essa decisão ao
   * humano, que é quem pode dizer se a frase é citação ou contagem viva.
   */
  linha: number;
  /**
   * Offsets, no corpo, do NÚMERO — do grupo capturado, não do match inteiro.
   *
   * `declarado` é `m[0]`, e `m[0]` **não identifica a claim**: `insercoes` e
   * `remocoes` saem do mesmo regex, nos grupos 1 e 2, e por isso compartilham
   * a mesma string `declarado` (MEDIDO no PR #44: as duas são
   * `"+5905/−124"`). Quem reescreve por substring faz as duas disputarem o
   * mesmo alvo e produz `**45, 50, 6000**` — sem "commits", sem "arquivos",
   * sem o `−`. O scanner deixa de reportar a linha, então a corrupção não
   * produz sinal nenhum.
   *
   * `ini`/`fim` delimitam só os dígitos, e é por eles que a escrita desce da
   * direita para a esquerda.
   */
  ini: number;
  fim: number;
  /**
   * A palavra da classe — `commits`, `arquivo`, `testes` — com seus offsets.
   *
   * Existe por um defeito que só aparece quando o escritor é automático:
   * `**30 commits**` reescrito para `1` vira `**1 commits**`. O número é
   * medido e correto, a frase é nova, e ninguém escreveu "1 commits". Um hook
   * que roda em todo push para sempre produz essa gramática quebrada uma vez
   * por PR que chegue a um arquivo.
   *
   * `insercoes` e `remocoes` NÃO têm palavra: elas moram dentro de `+N/−M`, e
   * o que está ao redor é o sinal, não um substantivo. Por isso o campo é
   * opcional em vez de vazio — ausente significa "não há o que ajustar", e
   * inventar uma palavra para elas seria escrever onde não há texto.
   */
  palavra?: { ini: number; fim: number; texto: string };
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
/**
 * Um número como o corpo escreve número grande: `2000`, `2.000`, `2 000`.
 *
 * O ponto e o espaço fino/não-separável são separadores de milhar em pt-BR — e
 * em pt-BR a vírgula é o decimal, então `2.000` não tem leitura ambígua. Sem
 * isto, a regex casava `000` de `2.000 commits` e o relatório imprimia
 * `declarado=0` (MEDIDO): um número que o corpo não contém, fabricado pela
 * regex e apresentado como se o autor o tivesse escrito.
 *
 * O guard `(?![.\d])` fecha o lado do fim: sem ele, `2.5 commits` casaria `2` e
 * viraria claim — invenção menor, do mesmo tipo. E o `(?<![\d.])` fecha o lado
 * do início, que o primeiro não pega: com só o `(?![.\d])`, o engine recua e
 * casa `5 commits` a partir do MEIO de `2.5` (MEDIDO — o teste ficou vermelho
 * com a frente do guard já posta). Com os dois, `2.5`, `1.23` e `2.11.2` não
 * casam, e nenhum número é lido a partir do meio.
 */
const SEPARADORES_MILHAR = '.\\u202F\\u00A0\\u2009';
const MILHAR = String.raw`\d{1,3}(?:[${SEPARADORES_MILHAR}]\d{3})+`;
const NUMERO = String.raw`(?<![\d.])(?:${MILHAR}|\d+)(?![.\d])`;

const PADROES: Array<{
  classe: Classe;
  re: RegExp;
  grupo: number;
  /** Índice do grupo que captura a PALAVRA, quando a frase a tem. */
  palavra?: number;
  medir: (m: Medicao) => number | null;
}> = [
  // A flag `d` é o que dá `m.indices` — o offset do GRUPO capturado. Sem ela
  // não há como reescrever: `m[0]` é o match inteiro, e `insercoes`/`remocoes`
  // têm o mesmo `m[0]`. Custa nada em velocidade e é a diferença entre
  // corrigir o cabeçalho e apagá-lo.
  //
  // O grupo 2 (`palavra`) existe pelo plural: `**30 commits**` → `1` deixa
  // `1 commits`, e um escritor que roda em todo push não pode fabricar gramática
  // quebrada em nome de um número certo.
  {
    classe: 'commits',
    re: new RegExp(String.raw`(${NUMERO})\s+(commits?)\b`, 'gdi'),
    grupo: 1,
    palavra: 2,
    medir: (m) => m.commits,
  },
  {
    classe: 'arquivos',
    re: new RegExp(String.raw`(${NUMERO})\s+(arquivos?)\b`, 'gdi'),
    grupo: 1,
    palavra: 2,
    medir: (m) => m.arquivos,
  },
  {
    classe: 'testes',
    re: new RegExp(String.raw`(${NUMERO})\s+(testes?)\b`, 'gdi'),
    grupo: 1,
    palavra: 2,
    medir: () => null,
  },
  // `+N/−M` carrega DOIS grupos. Ler sempre o grupo 1 faria `remocoes` reportar
  // as inserções — e as duas claims divergentes só apareceriam em paralelo,
  // quando o `+` e o `−` por acaso fossem iguais. E como as duas classes
  // compartilham o MESMO match, os offsets por grupo são a única coisa que
  // distingue "corrigir as inserções" de "corrigir as remoções".
  {
    classe: 'insercoes',
    re: new RegExp(String.raw`\+(${NUMERO})\s*\/\s*(?:−|-)(\d+)`, 'gdi'),
    grupo: 1,
    medir: (m) => m.insercoes,
  },
  {
    classe: 'remocoes',
    // `NUMERO` e não `(\d+)`: com `(\d+)`, `−1.024` casava só o `1` do milhar
    // e o resto da palavra virava lixo que o regex deixava passar. MEDIDO
    // 2026-10-06: o corpo do PR #44 com `−1.024` produzia `declarado=1` — um
    // número que o autor não escreveu, apresentado no relatório como se fosse
    // dele. As DUAS metades usam a mesma expressão; se divergirem de novo, as
    // duas classes medem coisas diferentes sem ninguém perceber.
    re: new RegExp(String.raw`\+(${NUMERO})\s*\/\s*(?:−|-)(${NUMERO})`, 'gdi'),
    grupo: 2,
    medir: (m) => m.remocoes,
  },
];

/**
 * Extrai as claims declaradas — **todas** as ocorrências, não só a primeira de
 * cada classe.
 *
 * "Primeira ocorrência" era um limite silencioso, e um limite silencioso neste
 * ponto anula o produto: MEDIDO no corpo real do PR #44, ele declara `20 commits`
 * no cabeçalho e `31 commits` no meio. Lendo só a primeira, o resumo dizia
 * "0 divergente(s)" com a claim obsoleta **dentro do corpo** — metade do
 * problema declarada resolvida.
 */
export function extrairClaims(texto: string): Claim[] {
  const encontradas: Claim[] = [];
  for (const { classe, re, grupo, palavra } of PADROES) {
    // `matchAll` exige `g` e não muta a regex compartilhada (`lastIndex`), ao
    // contrário de `exec`. Por isso o `new RegExp` de cada `PADROES` é seguro.
    for (const m of texto.matchAll(re)) {
      const bruto = m[grupo];
      if (bruto === undefined) continue;
      // O texto capturado é o que o corpo escreveu, com separador. `Number` não
      // entende `2.000` (dá NaN) e o `isSafeInteger` a seguir descartaria a
      // claim em silêncio. Remover o separador é o que o número realmente é.
      const n = Number(bruto.replace(/[.\u202F\u00A0\u2009]/g, ''));
      // `Number('999999999999999999999999')` é 1e24: inteiro, mas fora do
      // inteiro seguro. Um corpo malicioso não ganha nada com isso, mas o
      // relatório também não deve apresentar um número que não representa.
      if (!Number.isSafeInteger(n)) continue;
      // `m.index` é o offset no texto; a linha é quantos `\n` até lá. Cortar em
      // `m.index` (e não em `+1`) evita um `slice` do corpo inteiro por claim —
      // o corpo é entrada não confiável e o custo é meu, não do autor.
      const linha = texto.slice(0, m.index).split('\n').length;
      // Os offsets do GRUPO, não do match. `m.indices` só existe por causa da
      // flag `d`; sem ele a claim é descartada em vez de ganhar offsets que
      // não existem — escrever no lugar errado é pior que não escrever.
      const digitos = m.indices?.[grupo];
      if (digitos === undefined) continue;
      const daPalavra = palavra === undefined ? undefined : m.indices?.[palavra];
      const textoPalavra = palavra === undefined ? undefined : m[palavra];
      encontradas.push({
        classe,
        valor: n,
        declarado: m[0],
        linha,
        ini: digitos[0],
        fim: digitos[1],
        ...(daPalavra !== undefined && textoPalavra !== undefined
          ? { palavra: { ini: daPalavra[0], fim: daPalavra[1], texto: textoPalavra } }
          : {}),
      });
    }
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
  // A base de um PR é o MERGE-BASE, não a ponta da `main`. Resolver isso
  // explicitamente é o que faz os quatro números casarem com a aba "Files
  // changed" do GitHub — e o motivo é medido, não presumido.
  //
  // As duas formas "óbvias" erram em direções diferentes, e nenhuma delas é
  // óbvia depois de measure. No fixture `repoDesvioFixture` (`main` ganhou
  // c.txt e d.txt depois do desvio):
  //
  //     base..HEAD     2 pontos, ponta da base  -> 3 arquivos, 0 inserções,
  //                     3 remoções. A main "desfaz" c.txt e d.txt, e eles
  //                     contam como REMOVIDOS.
  //     base...HEAD    3 pontos                 -> diff certo (2 arquivos,
  //                     +2 −1), mas `rev-list --count` de três pontos é a
  //                     DIFERENÇA SIMÉTRICA: devolve 2, contando o commit da
  //                     main que a branch não tem.
  //     merge-base..   o que este arquivo faz   -> 1 commit, 2 arquivos, +2 −1.
  //
  // Consequência prática do errado: os números do corpo mudam sozinhos quando
  // alguém faz merge na `main`, sem nenhum push desta branch. A aba ao lado
  // não muda.
  try {
    git(repo, ['rev-parse', '--verify', base]);
  } catch {
    // Sem isto o `rev-list` falharia com uma mensagem de git que não diz o
    // que fazer; o nome do problema é o que o chamador precisa.
    throw new Error(`base inválida: "${base}" não resolve neste repo (${repo})`);
  }

  let baseEfetiva: string;
  try {
    baseEfetiva = git(repo, ['merge-base', base, 'HEAD']).trim();
  } catch {
    // Histórico sem ancestral comum (rebase sem `fetch`, ou `base` em outro
    // universo de objetos). Diff entre eles não é "o que a branch fez" — é
    // ruído. Sem ancestral não há PR para medir, e dizer isso é melhor que
    // devolver quatro números que descrevem nada.
    throw new Error(
      `base sem ancestral comum: "${base}" e HEAD não convergem (${repo}); rebase ou fetch antes de medir`,
    );
  }

  const range = `${baseEfetiva}..HEAD`;
  const commits = Number(git(repo, ['rev-list', '--count', range]).trim());
  const arquivos = git(repo, ['diff', '--name-only', range])
    .split('\n')
    .filter((l) => l.length > 0).length;

  const shortstat = git(repo, ['diff', '--shortstat', range]).trim();
  // Zero inserções não produz `insertions` no shortstat — o git escreve
  // "3 files changed, 3 deletions(-)" e a classe `insercoes` fica no 0 inicial,
  // que é o número certo. Um `|| 0` aqui esconderia a diferença entre "zero" e
  // "o shortstat não parseou"; os dois já produzem 0, então a diferença não
  // existe para o chamador, e poluir o regex para exprimir 0 seria só risco.
  const ins = /(\d+) insertions?\(\+\)/.exec(shortstat);
  const del = /(\d+) deletions?\(-\)/.exec(shortstat);
  const insercoes = ins?.[1] === undefined ? 0 : Number(ins[1]);
  const remocoes = del?.[1] === undefined ? 0 : Number(del[1]);

  return { commits, arquivos, insercoes, remocoes };
}

export interface Opcoes {
  bodyFile: string;
  repo: string;
  base: string;
}

/**
 * O scanner, com o corpo já em memória.
 *
 * `varrer` é a porta de arquivo porque o `preflight` e o scanner rodam offline
 * por padrão. O hook recebe o corpo pela rede, e mandar a rede para um arquivo
 * temporário para a rede ler de volta seria um dance sem ganho — pior, criaria
 * um arquivo cujo conteúdo é entrada não confiável em `/tmp`.
 *
 * A implementação é a MESMA: `varrer` delega para cá. A duplicação seria o
 * modo pelo qual os dois divergem em silêncio daqui a seis meses.
 */
/**
 * Quantos formatos de contagem o scanner reconhece.
 *
 * Exportado para que nenhuma prosa precise repetir o número: hardcodar "5"
 * aqui dentro envelheceria no dia que uma classe entrar, e quem lê não tem
 * como conferir. MEDIDO 2026-10-06: `PADROES` tinha 5 entradas.
 */
export const TOTAL_PADROES = PADROES.length;

export function varrerTexto(texto: string, repo: string, base: string): Relatorio {
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
            ? // `Set` porque 3 claims de `testes` não são 3 vezes a mesma
              // informação: MEDIDO, o relatório dizia "testes, testes, testes",
              // que parece defeito em vez de contagem. A contagem continua
              // sendo o número de CLAIMS (`naoMensuraveis.length`); só a lista
              // de classes é única.
              `${naoMensuraveis.length} não mensurável(is) offline — ${[...new Set(naoMensuraveis.map((c) => c.classe))].join(', ')}: verificar rodando a suíte, não pelo git`
            : null,
        ]
          .filter((s): s is string => s !== null)
          .join('; ');

  return { base, claims, resumo };
}

export function varrer({ bodyFile, repo, base }: Opcoes): Relatorio {
  return varrerTexto(readFileSync(bodyFile, 'utf8'), repo, base);
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

  // A largura do `declarado=` é medida a partir dos DADOS, não fixada em 8.
  // MEDIDO: com `123456789 commits` no corpo, um `padEnd(8)` fixo transborda e a
  // coluna `medido=` deixa de alinhar — a tabela ainda imprime tudo, mas o olho
  // perde a coluna. O teste de alinhamento ficou vermelho por causa disso, e
  // era o único comportamento de renderização que nenhum teste pegava.
  const larguraDeclarado = Math.max(8, ...relatorio.claims.map((c) => String(c.valor).length));
  for (const c of relatorio.claims) {
    const medido = c.medido === null ? 'NÃO MENSURÁVEL' : String(c.medido);
    // As três marcas precisam do MESMO comprimento, senão a coluna da direita
    // anda. MEDIDO: `'ok      '` e `'NÃO MEDE'` têm 8, `'DIVERGE'` tem 7 — e
    // nenhuma das 24 linhas de spec olhava a tabela renderizada o bastante
    // para notar. Toda linha divergente saía um caractere à esquerda.
    const marca = (c.medido === null ? 'NÃO MEDE' : c.divergente ? 'DIVERGE' : 'ok').padEnd(8);
    process.stdout.write(
      `${marca} L${String(c.linha).padEnd(4)} ${c.classe.padEnd(11)} declarado=${String(c.valor).padEnd(larguraDeclarado)} medido=${medido}\n`,
    );
  }
  process.stdout.write(`\n  ${relatorio.resumo}\n`);
  return relatorio.claims.some((c) => c.divergente) ? 1 : 0;
}

const invocadoDireto =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invocadoDireto) process.exit(main(process.argv.slice(2)));
