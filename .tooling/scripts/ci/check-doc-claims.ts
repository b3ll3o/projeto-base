/**
 * SEM shebang, de propósito — ver `check-harness-owner.ts`: um arquivo de
 * `.tooling/scripts/ci/` que não comece com `check-`, não termine em
 * `.spec.ts` e TENHA shebang é classificado como harness órfão.
 *
 * O gate que **falta** na regra "doc que mente é P0" (`documentacao.md` §1.2).
 *
 * O PR #129 instrumentou a regra de **cobertura** (o doc existe?) e deixou a
 * de **verdade** (o doc ainda diz a verdade?) só em prosa. A diferença é
 * visível no corpus: MEDIDO 2026-10-29, **5 claims numéricas do repo
 * mentiam** — e nenhuma delas era de "o doc não existe", eram todas de "o doc
 * afirma um número que o código não produz mais". (As 5 foram corrigidas na
 * mesma onda; o gate é o que impede a próxima.)
 *
 * ## O que este gate mede
 *
 * Para cada entrada do registry (`.tooling/scripts/ci/doc-claims.json`):
 *
 * 1. o doc **cita** o comando declarado (string exata) e **afirma** um valor ao
 *    lado dele (o par `→ \`N\``);
 * 2. a **derivação** — TypeScript, sobre o repo real — produz o mesmo número.
 *
 * Divergência → **vermelho**, nomeando o doc, o comando, e os dois números.
 *
 * ## ⚠️ O gate NÃO executa shell — e isso é deliberado
 *
 * A primeira versão do plano dizia "o gate usa `execFileSync` com argv". Isso
 * **não roda** os comandos que os docs citam: eles são **pipelines**
 * (`grep … | wc -l`) e usam **glob** (`*.controller.ts`), e argv não
 * interpreta `|` nem expande glob. Pior: o caminho de fuga (`execSync(cmd)`)
 * **passa** o `check-shell-injection`, porque a regra dele só acusa template
 * literal com interpolação e concatenação com literal — um identificador não
 * é nenhum dos dois. O resultado seria **falso senso de segurança**.
 *
 * A saída é: o registry declara uma **DERIVAÇÃO** (`contar-decoradores-http`,
 * `contar-paths-openapi`, `contar-operacoes-openapi`), e o gate a executa em
 * TypeScript. O **comando** continua no registry — mas como o **texto que o doc
 * tem que citar**, que é a âncora que amarra o doc ao valor. Ele **não** é
 * executado.
 *
 * ⚠️ **O registry é a superfície de verdade — do COMO medir, não do número.**
 * Ele é versionado, então um PR pode editá-lo — e editar o registry muda **o
 * que o gate mede** (o caminho, o glob, a derivação). O **número** não está
 * lá: ele tem duas cópias, a que o código produz (o dono) e a que o doc
 * afirma, e o gate confere as duas. Um terceiro `valor` no registry seria um
 * número que nada lê — MEDIDO 2026-11-02: trocá-lo de 7 para 99 deixava o
 * gate verde. A defesa do resto é a **revisão do PR** (a mudança é visível),
 * não o gate. Dizer isso aqui é melhor que fingir que o registry é inerte.
 *
 * ## O que este gate NÃO mede
 *
 * - **Claims fora do registry.** O registry cobre os **6 docs de API** (18
 *   ocorrências, 8 comandos). O resto do corpus tem claims **no mesmo
 *   formato** — `docs/STACK.md` (a versão do Fastify, a contagem de specs
 *   e2e), `docs/MONOREPO.md` (a contagem de scripts) e
 *   `.agents/skills/ui-craft/SKILL.md` (as contagens de cor) — mas com
 *   **derivações de outra espécie** (versão, contagem de arquivos, contagem
 *   de scripts, regex sobre vários arquivos). O restante do corpus usa
 *   comando sem `→`, derivação por `arquivo:linha`, ou comando com
 *   placeholder (`<sha>`, `…`) — que exigiria um parser de linguagem natural.
 * - **A qualidade da prosa** e **o quadrante Diátaxis** — julgamento editorial.
 * - **O valor em si.** O gate confere que o número **bate**; ele não julga se
 *   o número é o número *certo* de se medir.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { linhasDoRelato, type CheckResult } from './check-types';

/** O registry: doc ↔ comando citado ↔ derivação nativa. */
export const REGISTRY = '.tooling/scripts/ci/doc-claims.json';

/** O contrato HTTP versionado — fonte única das contagens de path e operação. */
export const OPENAPI = 'apps/api/openapi.json';

/** Um decorator de método HTTP. O `(` seguinte é o que casa com o `(` do decorator. */
const DECORADOR_HTTP = /@(Get|Post|Patch|Put|Delete)\(/g;

/** Os métodos que são **operações** no OpenAPI (o resto é `parameters`, `summary`…). */
const METODOS_OPERACAO = new Set(['get', 'post', 'put', 'patch', 'delete']);

/**
 * Como a derivação é calculada.
 *
 * `contar-decoradores-http` — ocorrências do decorator de método HTTP nos
 * **caminhos** dados. Um caminho é um arquivo, um diretório (todo `.ts` dele)
 * ou um **glob** (`dir/*.controller.ts`) — o glob é o que faz a derivação
 * medir **o mesmo conjunto** que o comando citado no doc.
 *
 * `contar-paths-openapi` — chaves de `paths` no contrato versionado.
 *
 * `contar-operacoes-openapi` — métodos de operação em todos os paths.
 */
export type Derivacao =
  | { tipo: 'contar-decoradores-http'; caminhos: string[] }
  | { tipo: 'contar-paths-openapi' }
  | { tipo: 'contar-operacoes-openapi' };

/** Uma entrada do registry. */
export interface Claim {
  /** O doc que afirma o claim. */
  doc: string;
  /** O **texto exato** que o doc tem que citar (a âncora doc ↔ derivação). */
  comando: string;
  /**
   * Como o valor real é calculado, em TypeScript.
   *
   * ⚠️ **O registry NÃO declara o número** — ele declara **como medir**. O
   * número tem **duas** cópias no repo: a que o **código** produz (o dono) e a
   * que o **doc** afirma. Uma terceira cópia no registry seria um número que
   * nada lê — MEDIDO 2026-11-02: trocar o `valor` de uma entrada de 7 para 99
   * deixava o gate **verde**. Campo morto que parece autoritativo é pior que
   * campo ausente (a regra de `dry.md`: o fato tem **um** dono).
   */
  derivacao: Derivacao;
  /** Por que este claim é conferido. */
  motivo: string;
}

/** O registry, lido do disco. */
export async function lerRegistry(repoRoot: string): Promise<Claim[]> {
  const bruto = await fs.readFile(path.join(repoRoot, REGISTRY), 'utf-8');
  const dados = JSON.parse(bruto) as { claims?: Claim[] };
  return dados.claims ?? [];
}

/**
 * O valor que o **doc** afirma ao lado do comando citado.
 *
 * O formato é o `→ \`N\`` que os 6 docs de API usam — e o `→` pode estar na
 * linha seguinte, precedido de `> `.
 *
 * ⚠️ **A adjacency é o que segura o gate.** A primeira versão olhava uma
 * **janela de 200 caracteres** depois do comando, e a janela sangrava para o
 * claim vizinho: MEDIDO 2026-11-02, um doc que afirmava `7` com o código
 * produzindo `1` passava **verde**, porque o gate lia o `→ \`1\`` de uma
 * frase de prosa no meio. Isso é o **inverso** do que o gate existe para.
 *
 * Por isso o valor tem que estar **adjacente** ao comando: entre os dois só
 * pode haver branco, `>` (a citação da linha) e o backtick que fecha o
 * código inline. Se houver prosa no meio, o gate diz que o doc **não**
 * afirma o valor — que é a verdade.
 *
 * Devolve `null` quando o doc cita o comando mas **não** afirma valor ao lado
 * — que é um erro do gate (o doc cita a âncora e não diz o número que a
 * derivação vai conferir), e não um "sem claim".
 */
export function valorCitado(doc: string, comando: string): number | null {
  // Todas as ocorrências do comando: a primeira que TEM valor é a do claim.
  // (Um doc que cita o comando duas vezes — a primeira sem valor — é lido
  // pela segunda, e não acusado de "sem claim".)
  let i = doc.indexOf(comando);
  while (i >= 0) {
    const resto = doc.slice(i + comando.length);
    const m = resto.match(/^[\s>`]*→\s*`(\d+)`/);
    if (m && m[1] !== undefined) return Number(m[1]);
    i = doc.indexOf(comando, i + comando.length);
  }
  return null;
}

/**
 * O caminho **normalizado** — sem barra final.
 *
 * MEDIDO 2026-11-02: sem isto, um caminho com barra final (`…/http/`) passava
 * pelo tying (porque o `path.join` do resolver normaliza a barra, e o tying
 * via a barra) e a derivação lia o **diretório inteiro** — que é o defeito
 * G-101 original, em silêncio. O mesmo valor normalizado vai para os dois
 * lados: o que o tying compara e o que o resolver lê.
 */
export function limparCaminho(caminho: string): string {
  return caminho.replace(/\/+$/, '');
}

/**
 * Resolve um caminho declarado no registry: arquivo, diretório ou glob.
 *
 * O glob é o que amarra a derivação ao comando citado. MEDIDO 2026-11-02: a
 * versão anterior lia TODO `.ts` do diretório — inclusive os `*.spec.ts` —
 * enquanto o comando que o doc cita usa o glob `*.controller.ts`. O gate
 * acusava um doc que continuava correto, e a mensagem mandava corrigir o
 * doc.
 */
async function resolverCaminho(repoRoot: string, caminho: string): Promise<string[]> {
  const limpo = limparCaminho(caminho);
  const abs = path.join(repoRoot, limpo);

  if (!limpo.includes('*')) {
    const st = await fs.stat(abs).catch(() => null);
    if (st?.isFile()) return [abs];
    if (st?.isDirectory()) {
      const out: string[] = [];
      for (const entrada of await fs.readdir(abs, { withFileTypes: true })) {
        if (!entrada.isFile() || !entrada.name.endsWith('.ts')) continue;
        out.push(path.join(abs, entrada.name));
      }
      return out;
    }
    return [];
  }

  // Glob: `dir/padrao` — só o **basename** casa, como o glob do shell. Um
  // glob sem `/` é casado contra a **raiz** do repo.
  const corte = limpo.lastIndexOf('/');
  const dir = corte < 0 ? '' : limpo.slice(0, corte);
  const padrao = corte < 0 ? limpo : limpo.slice(corte + 1);
  const absDir = path.join(repoRoot, dir);
  const entradas = await fs.readdir(absDir, { withFileTypes: true }).catch(() => []);
  return entradas
    .filter((e) => e.isFile() && path.matchesGlob(e.name, padrao))
    .map((e) => path.join(absDir, e.name));
}

/** Os caminhos que a derivação mede. */
export function caminhosDaDerivacao(d: Derivacao): string[] {
  return d.tipo === 'contar-decoradores-http' ? d.caminhos : [OPENAPI];
}

/**
 * O registry está **desamarrado** quando o comando que o doc cita não nomeia
 * **exatamente** o caminho que a derivação mede.
 *
 * "Exatamente" precisa de mais que `includes`: o caminho de um **diretório**
 * é prefixo do caminho de um arquivo dentro dele, e `includes` aceitaria os
 * dois. Por isso o tying exige que o caminho **não** seja seguido de `/` — ou
 * seja, que o comando nomeie aquele caminho, e não um caminho **dentro** dele.
 *
 * ⚠️ **A comparação é feita sobre o caminho NORMALIZADO** (sem barra final).
 * Sem isso, `…/http/` passava pelo tying e a derivação lia o diretório
 * inteiro — a classe G-101 de volta, em silêncio.
 *
 * É o tying que impede a **reincidência** do defeito: sem ele, um registry
 * pode declarar um caminho e citar outro, e o gate passa a medir — em
 * silêncio — um objeto diferente do que o doc afirma.
 */
export function tyingQuebrado(claim: Claim): string | null {
  const fora = caminhosDaDerivacao(claim.derivacao).find((c) => {
    const limpo = limparCaminho(c);
    const i = claim.comando.indexOf(limpo);
    if (i < 0) return true;
    const depois = claim.comando[i + limpo.length] ?? '';
    return depois === '/';
  });
  return fora ?? null;
}

/** Por que a claim divergiu. */
export type MotivoDaDivergencia = 'valor' | 'registry-desamarrado' | 'doc-ausente';

/** Calcula o valor real de uma derivação, sobre o repo real. */
export async function derivar(repoRoot: string, d: Derivacao): Promise<number> {
  if (d.tipo === 'contar-paths-openapi' || d.tipo === 'contar-operacoes-openapi') {
    const bruto = await fs.readFile(path.join(repoRoot, OPENAPI), 'utf-8');
    const spec = JSON.parse(bruto) as {
      paths: Record<string, Record<string, unknown>>;
    };
    const paths = Object.keys(spec.paths);
    if (d.tipo === 'contar-paths-openapi') return paths.length;
    let operacoes = 0;
    for (const p of paths) {
      for (const metodo of Object.keys(spec.paths[p] ?? {})) {
        if (METODOS_OPERACAO.has(metodo)) operacoes++;
      }
    }
    return operacoes;
  }

  let total = 0;
  for (const caminho of d.caminhos) {
    for (const abs of await resolverCaminho(repoRoot, caminho)) {
      const texto = await fs.readFile(abs, 'utf-8');
      const achados = texto.match(DECORADOR_HTTP);
      if (achados) total += achados.length;
    }
  }
  return total;
}

/**
 * Os claims que **não batem** — a lista que o gate transforma em erros.
 *
 * Separado de `checkDocClaims` para que o spec possa exercitar a reconciliação
 * sem passar pelo disco — e porque a função é a que o **dente** mede.
 */
export async function claimsDivergentes(
  repoRoot: string,
  claims: Claim[],
): Promise<
  { claim: Claim; valorReal: number; valorCitado: number | null; motivo: MotivoDaDivergencia }[]
> {
  const divergentes: {
    claim: Claim;
    valorReal: number;
    valorCitado: number | null;
    motivo: MotivoDaDivergencia;
  }[] = [];

  for (const claim of claims) {
    // O registry desamarrado é **outro** defeito: o problema está no
    // registry, não no doc. Julgá-lo como divergência de valor acusaria o
    // doc de uma mentira que ele não contou.
    const fora = tyingQuebrado(claim);
    if (fora !== null) {
      divergentes.push({ claim, valorReal: -1, valorCitado: null, motivo: 'registry-desamarrado' });
      continue;
    }

    let textoDoc: string;
    try {
      textoDoc = await fs.readFile(path.join(repoRoot, claim.doc), 'utf-8');
    } catch {
      divergentes.push({ claim, valorReal: -1, valorCitado: null, motivo: 'doc-ausente' });
      continue;
    }

    const citado = valorCitado(textoDoc, claim.comando);
    const real = await derivar(repoRoot, claim.derivacao);
    if (citado === null || citado !== real) {
      divergentes.push({ claim, valorReal: real, valorCitado: citado, motivo: 'valor' });
    }
  }

  return divergentes;
}

export async function checkDocClaims(opts: { repoRoot: string }): Promise<CheckResult> {
  const root = path.resolve(opts.repoRoot);

  let claims: Claim[];
  try {
    claims = await lerRegistry(root);
  } catch (err) {
    return {
      ok: false,
      errors: [
        `não foi possível ler o registry de claims (${REGISTRY}) (${(err as Error).message}) — ` +
          'sem ele este check é teatro: a lista de claims medidos é a única fonte',
      ],
    };
  }

  // Registry vazio = o gate não tem o que medir. `skipped` COM MOTIVO, nunca
  // verde por ausência (classe 5 de `guard-classes.md`).
  if (claims.length === 0) {
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `o registry ${REGISTRY} não declara nenhum claim — gate não tem o que comparar`,
    };
  }

  // A medição **não pode rejeitar**: o `preflight` chama `check.fn()` sem
  // try/catch por check, e uma rejeição derrubaria os gates seguintes e o
  // painel agregado. MEDIDO 2026-11-02: sem este `catch`, um
  // `apps/api/openapi.json` ausente fazia o gate lançar `ENOENT` e o
  // preflight saía com 39 de 40 checks. O veredito é **vermelho com motivo**,
  // nunca exceção.
  let divergentes: Awaited<ReturnType<typeof claimsDivergentes>>;
  try {
    divergentes = await claimsDivergentes(root, claims);
  } catch (err) {
    return {
      ok: false,
      errors: [
        `falha ao medir os claims (${(err as Error).message}) — o gate mede o ` +
          'contrato versionado e o código; sem eles não há o que comparar, e ' +
          'falhar em silêncio seria pior que reprovar',
      ],
    };
  }

  const errors = divergentes.map(({ claim, valorReal, valorCitado, motivo }) => {
    if (motivo === 'registry-desamarrado') {
      const fora = tyingQuebrado(claim);
      return (
        `registry desamarrado: o comando citado pelo doc '${claim.doc}' NÃO contém o caminho ` +
        `que a derivação mede ('${fora}') — o gate mediria um objeto diferente do que o doc ` +
        `afirma. Comando citado: \`${claim.comando}\`. Corrija o REGISTRY (${REGISTRY}): ` +
        `o caminho medido tem que estar no comando. Motivo declarado: ${claim.motivo}`
      );
    }
    if (motivo === 'doc-ausente') {
      return (
        `doc ausente: o registry declara o doc '${claim.doc}', que não existe no repo. ` +
        `Corrija o REGISTRY (${REGISTRY}) — um doc que não existe não é um doc que mente. ` +
        `Motivo declarado: ${claim.motivo}`
      );
    }
    const citado =
      valorCitado === null
        ? 'NENHUM (o doc cita o comando mas não afirma valor ao lado)'
        : String(valorCitado);
    const situacao =
      valorCitado === null
        ? `o doc '${claim.doc}' cita o comando mas não afirma o valor ao lado`
        : `o doc '${claim.doc}' afirma ${valorCitado} e o código produz ${valorReal}`;
    return (
      `claim divergente: ${situacao} — comando citado: \`${claim.comando}\`. ` +
      `Corrija o DOC (o código é a fonte) ou o REGISTRY (${REGISTRY}), se a derivação mudou de verdade. ` +
      `Motivo declarado: ${claim.motivo}`
    );
  });

  return { ok: errors.length === 0, errors };
}

// Executado como CLI.
//
// `checkDocClaims` é **assíncrono**, então o bloco usa `.then()` — o mesmo
// padrão de `check-ci-local-e2e.ts`. Um `const r = checkDocClaims(...)` sem
// `await` daria `r.ok === undefined` e sairia **1 sempre**.
if (process.argv[1]?.endsWith('check-doc-claims.ts')) {
  checkDocClaims({ repoRoot: '.' }).then((r) => {
    for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
    process.exit(r.ok ? 0 : 1);
  });
}
