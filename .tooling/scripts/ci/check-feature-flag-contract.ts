/**
 * O contrato HTTP das feature flags não pode divergir do CATÁLOGO.
 *
 * ## O furo que este gate fecha
 *
 * MEDIDO 2026-10-19: a `descricao` de cada chave vive em DUAS cópias — a
 * string em `feature-flag-catalog.ts` e o exemplo JSON repetido no contrato
 * `docs/superpowers/specs/2026-10-18-feature-flags-contrato-http.md` (§4, duas
 * vezes: a listagem e o PUT). `grep` medido: 4 cópias do texto no repositório,
 * nenhuma por derivação. Mudei a descrição e a troca por script achou as 4 —
 * mas o que não as achasse (um `.md` gerado, um exemplo colado à mão)
 * continuaria mentindo em silêncio, e o contrato abre com a regra oposta:
 *
 * > "Quando este documento e uma spec divergirem, **a spec ganha** — e este
 * > documento está errado."
 *
 * O documento se declara descartável, o que é correto para STATUS CODE e errado
 * para TEXTO: o status de um 404 é uma escolha do guard; a frase que diz o que
 * desligar faz é conteúdo de catálogo, e o admin a lê na tela ANTES de desligar.
 *
 * ## As duas direções
 *
 * Um diff tem dois lados, e um gate que só lê um deles deixa o outro passar.
 * E os dois lados comparam por VALOR, nunca por `includes` no documento
 * inteiro — varrer o texto não pergunta "é a descrição DESTE exemplo":
 *
 *  1. catálogo → contrato: a `descricao` do catálogo é IGUAL à que o contrato
 *     exemplifica para aquela chave. Igual, não contida: `includes` dava verde
 *     para `descricao: ''` (porque `''.includes('')` é sempre verdadeiro) e
 *     para uma descrição que aparecia no contrato como valor de outra chave.
 *  2. contrato → catálogo: toda `"chave"` dos exemplos do contrato existe no
 *     catálogo. É a direção que pega o exemplo que sobreviveu à chave que
 *     saiu, que é o modo de falha mais silencioso dos dois — o documento
 *     continua bem formado e continua descrevendo um recurso que não existe.
 *
 * ## Por que o catálogo é lido como TEXTO
 *
 * Mesmo padrão de `check-tenant-scope-source.ts`: o gate vive no tooling root e
 * o import entre projetos (`apps/api/…` a partir de `.tooling/…`) acopla duas
 * unidades de build que hoje não têm coupling.
 *
 * O preço é declarado — e a 1ª redação deste cabeçalho o declarava **errado**.
 * Ele afirmava que um catálogo reescrito com aspas duplas ou template string
 * "sai do radar deste gate". MEDIDO 2026-10-19: é o oposto — os dois casos
 * falham FECHADO, com `ZERO chaves lidas em …` nomeando o arquivo. A
 * limitação que era silenciosa era outra, e ela está fechada agora: o
 * pareamento por POSIÇÃO truncava no `Math.min(chaves, descricoes)` (ver
 * `descreverCatalogo`).
 *
 * ## Anti-vacuuidade
 *
 * Zero chaves lidas = ERRO, nunca verde. Um gate que não mediu nada não pode
 * reportar sucesso — é a classe 5 de `guard-classes.md` ("classe ausente do
 * dado") aplicada a si próprio.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface ResultadoFeatureFlagContract {
  ok: boolean;
  errors: string[];
  advisories: string[];
}

const CATALOGO = 'apps/api/src/shared/auth/feature-flag-catalog.ts';
const CONTRATO = 'docs/superpowers/specs/2026-10-18-feature-flags-contrato-http.md';

/** Aspas simples — a forma em que o array do catálogo é escrito. */
const RE_CHAVE_CATALOGO = /\bchave:\s*'([^']+)'/g;
const RE_DESCRICAO_CATALOGO = /\bdescricao:\s*\n?\s*'((?:[^'\\]|\\.)*)'/g;
/** Só os exemplos JSON: `"chave": "…"` com dois-pontos e aspas duplas. */
const RE_CHAVE_CONTRATO = /"chave"\s*:\s*"([^"]+)"/g;
const RE_DESCRICAO_CONTRATO = /"descricao"\s*:\s*"([^"]*)"/g;

interface Pareamento {
  pares: Map<string, string>;
  /** `chave` sem `descricao` correspondente — nomeada, nunca truncada. */
  semPareamento: string[];
  /** `descricao` sem `chave` correspondente. */
  descricaoSolta: number;
}

/** Par `chave` → `descricao` casando por POSIÇÃO — a ordem em que é declarado. */
function parear(chaves: string[], descricoes: string[]): Pareamento {
  const pares = new Map<string, string>();
  // Em ambos os lados cada `chave` é seguida da sua `descricao`, na ordem. Não é
  // um parser de TS nem de JSON — é um leitor da forma que os dois arquivos
  // usam, e o cabeçalho diz isso em vez de fingir que é exato.
  //
  // ⚠️ Sem `Math.min` aqui, DELIBERADAMENTE. Truncar no menor dos dois arrays
  // faz a chave excedente sumir sem erro, sem contagem e sem advisory — e o
  // advisory é justamente a saída que nomeia a contagem, então ele passava a
  // afirmar "1 chave conferida" num catálogo com 2. É a classe que a §4 de
  // `guard-classes.md` proíbe, dentro do gate que a §4 motivou.
  //
  // ⚠️ A contagem sai de `n`, não de `pares.size`. O contrato real repete o
  // MESMO par duas vezes (a listagem e o PUT), e o `Map` colapsa duplicata:
  // `pares.size` = 1 com 2 iterações, então `slice(1)` acusava uma chave sem
  // `descricao` que estava lá. MEDIDO 2026-10-19 contra o arquivo real.
  let n = 0;
  for (let i = 0; i < chaves.length; i++) {
    const descricao = descricoes[i];
    if (descricao === undefined) break;
    pares.set(chaves[i] as string, descricao);
    n++;
  }
  return {
    pares,
    semPareamento: chaves.slice(n),
    descricaoSolta: Math.max(0, descricoes.length - n),
  };
}

function descreverCatalogo(texto: string): Pareamento {
  return parear(
    [...texto.matchAll(RE_CHAVE_CATALOGO)].map((m) => m[1] ?? ''),
    [...texto.matchAll(RE_DESCRICAO_CATALOGO)].map((m) => m[1] ?? ''),
  );
}

function descreverContrato(texto: string): Pareamento {
  return parear(
    [...texto.matchAll(RE_CHAVE_CONTRATO)].map((m) => m[1] ?? ''),
    [...texto.matchAll(RE_DESCRICAO_CONTRATO)].map((m) => m[1] ?? ''),
  );
}

/**
 * O pareamento por posição desfaleceu: sobrou chave sem descrição, ou
 * descrição sem chave. Nos dois casos o arquivo saiu da forma que este gate
 * lê, e dizer "conferi N chaves" sem nomear a que faltou seria a mesma mentira
 * com outro uniforme.
 */
function acusarDesalinhamento(p: Pareamento, arquivo: string): string[] {
  const erros: string[] = [];
  for (const chave of p.semPareamento) {
    erros.push(
      `${chave}: a \`chave\` de ${arquivo} não tem \`descricao\` logo em seguida, ` +
        `então este gate não sabe o que comparar dela — e não vai contar uma ` +
        `chave que não mediu. O pareamento é por POSIÇÃO, então a descrição ` +
        `desta chave está ausente ou fora de ordem.`,
    );
  }
  if (p.descricaoSolta > 0) {
    erros.push(
      `${p.descricaoSolta} \`descricao\` sem \`chave\` correspondente em ${arquivo}: ` +
        `o pareamento está desalinhado, e sobre um array desalinhado ele atribui ` +
        `a descrição à chave errada — o que acusaria divergência que não existe ` +
        `em vez de acusar o defeito.`,
    );
  }
  return erros;
}

export function checkFeatureFlagContract(
  opts: {
    catalogo?: string;
    contrato?: string;
    /** Atalho de teste: injeta o texto em vez de ler o arquivo. */
    catalogoTexto?: string;
    contratoTexto?: string;
  } = {},
): ResultadoFeatureFlagContract {
  const raiz = resolve(__dirname, '..', '..', '..');
  const caminhoCatalogo = resolve(raiz, opts.catalogo ?? CATALOGO);
  const caminhoContrato = resolve(raiz, opts.contrato ?? CONTRATO);

  const erros: string[] = [];
  const advisories: string[] = [];

  const textoCatalogo = opts.catalogoTexto ?? readFileSync(caminhoCatalogo, 'utf8');
  const textoContrato = opts.contratoTexto ?? readFileSync(caminhoContrato, 'utf8');

  const catalogo = descreverCatalogo(textoCatalogo);
  const contrato = descreverContrato(textoContrato);
  erros.push(...acusarDesalinhamento(catalogo, opts.catalogo ?? CATALOGO));
  erros.push(...acusarDesalinhamento(contrato, opts.contrato ?? CONTRATO));

  if (catalogo.pares.size === 0) {
    return {
      ok: false,
      errors: [
        `ZERO chaves lidas em ${opts.catalogo ?? CATALOGO}. Ou o array ` +
          `FEATURE_FLAGS esvaziou, ou o catálogo passou a usar aspas duplas / ` +
          `template string — este gate lê o catálogo como TEXTO e só reconhece ` +
          `aspas simples (ver cabeçalho).`,
      ],
      advisories: [],
    };
  }

  // Direção 1 — catálogo → contrato, por VALOR.
  //
  // ⚠️ Compara com o valor do exemplo, não com `textoContrato.includes(...)`.
  // MEDIDO 2026-10-19: `includes` dava verde para `descricao: ''` (porque
  // `''.includes('')` é sempre verdadeiro) E para `descricao: 'tenancy.invites'`
  // (que existe no contrato como valor da `chave`, não da `descricao`) — nos
  // dois casos o advisory ainda afirmava "chave conferida nos dois sentidos".
  // Varrer o documento inteiro não pergunta "é a descrição DESTE exemplo".
  for (const [chave, descricao] of catalogo.pares) {
    if (descricao.trim() === '') {
      erros.push(
        `${chave}: a \`descricao\` do catálogo está VAZIA. O próprio catálogo diz ` +
          `que sem descrição a linha não se explica — e uma descrição vazia casa ` +
          `com qualquer contrato, então compará-la não mede nada.`,
      );
      continue;
    }
    const noContrato = contrato.pares.get(chave);
    if (noContrato !== descricao) {
      erros.push(
        `${chave}: a \`descricao\` do catálogo não é a que ${opts.contrato ?? CONTRATO} ` +
          `exemplifica para esta chave. O contrato abre dizendo que a spec ganha em ` +
          `caso de divergência — e isso vale para STATUS, não para o TEXTO que o ` +
          `admin lê na tela antes de desligar. Catálogo: "${descricao}"` +
          (noContrato === undefined
            ? ' — e o contrato nem exemplifica a chave'
            : `; contrato: "${noContrato}"`),
      );
    }
  }

  // Direção 2 — contrato → catálogo.
  const chavesDoContrato = new Set(contrato.pares.keys());
  if (chavesDoContrato.size === 0) {
    erros.push(
      `ZERO \`"chave"\` lidas nos exemplos de ${opts.contrato ?? CONTRATO}. O ` +
        `contrato deixou de mostrar o recurso, e o gate que existe para comparar ` +
        `as duas cópias ficou sem uma delas.`,
    );
  }
  for (const chave of chavesDoContrato) {
    if (!catalogo.pares.has(chave)) {
      erros.push(
        `${chave}: o contrato HTTP exemplifica esta chave, e ela NÃO existe no ` +
          `catálogo. Ou a chave saiu e o exemplo sobreviveu, ou ela nunca foi ` +
          `catalogada — e um exemplo de recurso inexistente é o modo de falha mais ` +
          `silencioso: o documento continua bem formado.`,
      );
    }
  }

  if (erros.length === 0) {
    advisories.push(
      `${catalogo.pares.size} chave(s) conferidas nos dois sentidos contra ` +
        `${chavesDoContrato.size} chave(s) exemplificada(s) no contrato`,
    );
  }

  return { ok: erros.length === 0, errors: erros, advisories };
}

// Gate IIFE: sem isto, importar num spec executa a comparação inteira.
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = checkFeatureFlagContract();
  for (const e of r.errors) console.error(e);
  for (const a of r.advisories) console.error(a);
  process.exit(r.ok ? 0 : 1);
}
