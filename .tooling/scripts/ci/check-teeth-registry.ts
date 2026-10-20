#!/usr/bin/env tsx
/**
 * Reconcilia o **registro de dentes** (`.agents/specs/conventions/
 * ci-defense-in-depth-dentes.md` §"Registro de dentes") com o que de fato roda.
 *
 * Quatro reconciliações, cada uma caçando uma classe de guard diferente:
 *
 *   1. **registro ↔ preflight** — todo gate que roda tem entrada no registro,
 *      e toda entrada do registro corresponde a um gate que roda. Sem isto, o
 *      registro envelhece em silêncio: ninguém o avisa de que um gate novo
 *      entrou, e a lista segue correta sobre um preflight que já não
 *      corresponde.
 *
 *   2. **registro → artefato** — a entrada aponta para um arquivo que EXISTE.
 *      Um path digitado errado é a forma mais barata de um gate deixar de
 *      existir: o registro continua "verde" descrevendo algo que não está lá.
 *
 *   3. **registro ↔ roteamento** — o arquivo do gate mora num diretório que
 *      alguma `path_glob` alcança. Este é o RED que a task 3.2 do plano
 *      `guard-classes` encontrou: `review-routing.md` declarava
 *      `tooling/scripts/ci/**`, que casa 0 arquivos versionados, enquanto os
 *      gates vivem em `.tooling/scripts/ci/**`. Um prefixo de `.` que some —
 *      a rota existe, o lint passa (a regra não é `blocking`), e nenhum
 *      arquivo de CI tem revisão despachada. Classe 1: condição inalcançável.
 *
 *   4. **preflight ↔ catálogo humano** — todo gate que roda é citado na
 *      §Tabela de Checks de `ci-defense-in-depth.md`, e nenhum gate citado ali
 *      deixou de rodar. As três de cima vigiam o REGISTRO DE DENTES, que é a
 *      fonte exigida; esta vigia o **catálogo**, que é a fonte que um humano
 *      abre para saber o que o preflight roda. MEDIDO 2026-10-20: das 32
 *      entradas, **11 não eram citadas** — as mais novas, exatamente as que
 *      nenhuma das três reconciliacoes acima enxerga, porque o registro de
 *      dentes estava em dia enquanto o catálogo envelhecia em silêncio.
 *
 * ## Duas decisões que este check toma para não cair em classe 2
 *
 * **a) A identidade do gate é o ARQUIVO, não o nome de exibição.**
 * `preflight.ts` declara `check-eslint-drift` duas vezes (uma por app) e
 * exibe nomes como `'Cross-refs em .md versionados'`, que não resemble
 * `check-doc-refs`. Casar registro↔preflight por nome seria acerto-e-erro em
 * metade dos casos e exigiria um mapa de sinônimos que envelhece pior que o
 * registro que ele deveria proteger. O campo `file` que o preflight carrega é
 * a chave — e é por isso que ele existe.
 *
 * **b) O parse do registro acha o path pelo FORMATO, não pela COLUNA.**
 * Um parse posicional (`split('|')[3]`) funciona até alguém reordenar a
 * tabela — a classe 2 com outro nome: o guard cobre exatamente a forma que
 * existe hoje. A regra adotada é "o token backtickado que é um path
 * versionado de código, inteiro, e não é spec". Ela sobrevive a mover
 * coluna, renomear cabeçalho e reescrever a descrição.
 *
 * ## Por que o matcher de glob NÃO é reimplementado aqui
 *
 * `loadMatrix` e `matchPathGlobs` vêm do router real
 * (`tooling/scripts/review-router.ts`). Um terceiro glob-to-regex neste
 * arquivo criaria duas semânticas de "casado" no mesmo repo — e a
 * divergência entre elas seria invisível justamente nos casos que importam
 * (o `*` que casa `tooling/` mas não `.tooling/`). `lint-review-routing.ts`
 * já carrega uma réplica (`globToRegexLocal`) por não poder importar de
 * `.tooling/`; aqui o import cross-pacote é possível, e por isso foi feito.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { matchPathGlobs, loadMatrix } from '../../../tooling/scripts/review-router.js';
import type { CheckResult } from './check-types';
import { linhasDoRelato } from './check-types';
import { PREFLIGHT_CHECKS, preflightGates } from './preflight-gates';
import type { CheckSpec, GateRef } from './preflight-gates';

export interface ReconcileInput {
  /** Gates que o preflight registra. */
  registeredGates: GateRef[];
  /** Markdown do `ci-defense-in-depth-dentes.md` (ou só a seção do registro). */
  registryMarkdown: string;
  /** Markdown da matriz `review-routing.md`. */
  matrixMarkdown: string;
  /** Arquivos versionados no repo, repo-relative. */
  trackedFiles: string[];
}

export interface ReconcileResult {
  ok: boolean;
  errors: string[];
}

/** Heading que delimita a tabela de dentes. */
const REGISTRY_HEADING = /^##\s+Registro de dentes\s*$/m;

/**
 * Token backtickado que é um path versionado de código.
 *
 * Exclui `.spec.ts`/`.test.ts` de propósito: o registro documenta o GATE — a
 * coisa que roda — e o spec é outro artefato, já nomeado na coluna ao lado. A
 * linha do lint da matriz cita `tooling/scripts/lint-review-routing.spec.ts`
 * (tem `/`, então casaria) enquanto o gate é `.../lint-review-routing.ts`.
 *
 * Sem espaços: os comandos de prova (`npx vitest run --root …`) vivem em
 * spans de código com espaços e por isso nunca casam.
 */
const CODE_PATH_RE = /^\.?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\.(?:ts|mts|cts|mjs|js|sh)$/;
const IS_SPEC_RE = /\.(?:spec|test)\.[cm]?ts$/;

function isGatePath(token: string): boolean {
  return CODE_PATH_RE.test(token) && !IS_SPEC_RE.test(token);
}

/**
 * Extrai os paths de gate da tabela do registro.
 *
 * Lê a seção a partir do heading, e dentro dela só as linhas que começam com
 * `|` — o que descarta automaticamente prosa abaixo da tabela (onde paths são
 * citados legitimamente, ex. no comando de mutação) e a linha separadora.
 *
 * Uma célula declara um path quando ela é INTEIRAMENTE o token entre crases —
 * não quando o token aparece dentro dela. MEDIDO 2026-10-16: varrer todo token
 * da linha punia a prosa, e citar o path na própria linha do registro ("plantar
 * `X` → vermelho") entrava como gate declarado, quebrando o gate com "entrada
 * que não corresponde a nenhum gate". Ou seja, o registro ficava
 * **não-escrevível** para a mesma coisa que ele documenta.
 *
 * Continua cego à COLUNA de propósito (ver decisão b no topo do arquivo): o
 * caminho é reconhecido pela forma da célula, não pela posição, então mover
 * coluna ou renomear cabeçalho não quebra o parse.
 */
export function registryGateFiles(markdown: string): string[] {
  const heading = REGISTRY_HEADING.exec(markdown);
  if (heading === null) return [];

  const after = markdown.slice(heading.index + heading[0].length);
  const files: string[] = [];
  for (const line of after.split('\n')) {
    // A tabela acabou: a próxima linha não é mais uma linha de tabela.
    if (files.length > 0 && !line.trimStart().startsWith('|')) break;
    if (!line.trimStart().startsWith('|')) continue;

    for (const cell of line.split('|')) {
      // Célula vazia (antes/depois dos `|`) ou prosa: não é declaração.
      const token = /^`([^`]+)`$/.exec(cell.trim())?.[1];
      if (token !== undefined && isGatePath(token)) files.push(token);
    }
  }
  return files;
}

/**
 * Gates que NENHUMA `path_glob` da matriz alcança.
 *
 * Um gate sem rota é a classe 1 completa: o arquivo de CI é alterado, nada
 * dispara revisão, e todos os gates continuam verdes — porque nenhum deles
 * pergunta se o roteamento o alcança.
 */
export function unroutedGateFiles(params: {
  gateFiles: string[];
  matrixMarkdown: string;
}): string[] {
  const rules = loadMatrix(params.matrixMarkdown).path_globs ?? [];
  const matches = matchPathGlobs(params.gateFiles, rules);
  const routed = new Set(matches.flatMap((m) => m.files_matched));
  return params.gateFiles.filter((f) => !routed.has(f));
}

// ── 4. preflight ↔ catálogo humano ──────────────────────────────────────────

/** Heading que delimita o catálogo de gates legível por gente. */
const HUMAN_TABLE_HEADING = /^##\s+Tabela de Checks\s*$/m;

/** Prefixo de ferramenta que o `id` carrega e a prosa costuma omitir. */
const ID_TOOL_PREFIX_RE = /^(?:check|lint)-/;

/**
 * Um token que **nomeia um gate** — e não só uma palavra entre crases.
 *
 * Só o sentido inverso (citado no catálogo, sem gate que rode) usa este
 * discriminador: as linhas da tabela citam `PREFLIGHT_CHECKS`, `wc -l`,
 * `import type` e `engines.node`, que são tokens legítimos de prosa e não
 * gates. O sentido direto não precisa dele — pergunta se um `id` está
 * citado, e um id nunca é `wc -l`.
 *
 * `turbo-` entra na lista porque `turbo-redirect-differential` é um id real e
 * não usa os outros dois prefixos; e `turbo.json` não casa, porque aqui a
 * regra exige um hífen logo depois do prefixo.
 */
const GATE_TOKEN_RE = /^(?:check|lint|turbo)-[a-z0-9-]+(?::[a-z0-9-]+)?$/;

/**
 * Reduz um `id` (ou um token de prosa) à MESMA forma, dos dois lados.
 *
 * Duas reduções, e ambas existem por um caso real e não por elegância:
 *
 *   - `:escopo` cai — `check-eslint-drift:apps` e `:packages` são o MESMO
 *     gate rodando duas vezes, e o catálogo documenta o gate.
 *   - o prefixo `check-`/`lint-` cai — o catálogo escreve
 *     `` `review-routing` matrix lint `` para o id `lint-review-routing`,
 *     e o registro de dentes escreve do mesmo jeito. Sem esta redução o gate
 *     acusaria um documento escrito na convenção dele.
 */
export function normalizaGateId(id: string): string {
  return id
    .replace(/:[^:]+$/, '')
    .replace(ID_TOOL_PREFIX_RE, '')
    .trim();
}

/**
 * Todo token entre crases nas LINHAS DE TABELA do catálogo.
 *
 * Para na primeira linha que não é `|`, como `registryGateFiles` — a prosa
 * abaixo da tabela cita `check-types.ts` e `turbo-redirect-differential.sh`
 * ao explicar decisões antigas, e nenhum dos dois é uma declaração de gate.
 *
 * Varrer a linha INTEIRA (e não só a primeira célula) é o que faz a coluna
 * mudar de lugar não quebrar: o catálogo já escreve o id na primeira célula
 * como `` `review-routing` matrix lint ``, ou seja, o token está no meio da
 * célula.
 */
export function citedGateTokens(markdown: string): string[] {
  const heading = HUMAN_TABLE_HEADING.exec(markdown);
  if (heading === null) return [];

  const after = markdown.slice(heading.index + heading[0].length);
  const tokens: string[] = [];
  for (const line of after.split('\n')) {
    if (tokens.length > 0 && !line.trimStart().startsWith('|')) break;
    if (!line.trimStart().startsWith('|')) continue;
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      if (m[1] !== undefined) tokens.push(m[1]);
    }
  }
  return tokens;
}

/**
 * Os dois lados da divergência entre o que roda e o que o catálogo diz.
 *
 * A classe 6 do `guard-classes.md` (`guard-classe-ausente-do-dado`) aplicada
 * ao próprio catálogo: enquanto um gate novo não entra na tabela, ele não
 * "falta" em lugar nenhum — ele simplesmente não é citado, e todo gate
 * continua verde.
 */
export function reconcileCatalogoHumano(params: {
  registeredGates: CheckSpec[];
  humanTableMarkdown: string;
}): ReconcileResult {
  const tokens = citedGateTokens(params.humanTableMarkdown);
  const citados = new Set(tokens.map(normalizaGateId));
  const rodando = new Set(
    params.registeredGates.map((g) => normalizaGateId(g.id)).filter((id) => id.length > 0),
  );

  const errors: string[] = [];

  const semCitacao = [
    ...new Set(
      params.registeredGates.map((g) => g.id).filter((id) => !citados.has(normalizaGateId(id))),
    ),
  ];
  for (const id of semCitacao) {
    errors.push(
      `gate roda no preflight sem entrada na §Tabela de Checks de ` +
        `ci-defense-in-depth.md: ${id} — acrescente a linha na tabela`,
    );
  }

  const semGate = [
    ...new Set(tokens.filter((t) => GATE_TOKEN_RE.test(t) && !rodando.has(normalizaGateId(t)))),
  ];
  for (const token of semGate) {
    errors.push(
      `§Tabela de Checks cita um gate que não roda: ${token} — ` +
        `ou o gate saiu do preflight, ou o id está errado`,
    );
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Reconcilia registro ↔ preflight, registro → artefato e registro ↔
 * roteamento. Cada erro NOMEIA o artefato culpado: um "registro divergente"
 * genérico obriga quem lê a ir caçar, e é assim que divergência vira órfã.
 */
export function reconcileTeethRegistry(input: ReconcileInput): ReconcileResult {
  const errors: string[] = [];
  const registryFiles = registryGateFiles(input.registryMarkdown);
  const gateFiles = [...new Set(input.registeredGates.map((g) => g.file))];
  const tracked = new Set(input.trackedFiles);

  // 1. registro ↔ preflight
  const declared = new Set(registryFiles);
  for (const file of gateFiles) {
    if (!declared.has(file)) {
      errors.push(
        `gate roda no preflight sem entrada no registro de dentes: ${file} — ` +
          `acrescente a linha na tabela de "Registro de dentes"`,
      );
    }
  }
  const running = new Set(gateFiles);
  for (const file of registryFiles) {
    if (!running.has(file)) {
      errors.push(
        `entrada do registro que não corresponde a nenhum gate: ${file} — ` +
          `ou o gate saiu do preflight, ou o path está errado`,
      );
    }
  }

  // 2. registro → artefato
  for (const file of registryFiles) {
    if (!tracked.has(file)) {
      errors.push(
        `entrada do registro aponta pra arquivo que não existe: ${file} — ` +
          `o path do gate foi digitado errado, ou o arquivo sumiu`,
      );
    }
  }

  // 3. registro ↔ roteamento
  for (const file of unroutedGateFiles({ gateFiles, matrixMarkdown: input.matrixMarkdown })) {
    errors.push(
      `gate não alcançado por nenhuma path_glob da review-routing: ${file} — ` +
        `mudança em CI sem revisão despachada é a classe 1 "condição inalcançável"`,
    );
  }

  return { ok: errors.length === 0, errors };
}

// ── Camada 1: o gate como o preflight o invoca ─────────────────────────────

const REGISTRY_DOC = join(process.cwd(), '.agents/specs/conventions/ci-defense-in-depth-dentes.md');
const MATRIX_DOC = join(process.cwd(), '.agents/specs/conventions/review-routing.md');
/**
 * O catálogo legível por gente — a fonte que alguém abre para saber o que o
 * preflight roda. Não é a fonte exigida (isso é `REGISTRY_DOC`), e é
 * justamente por isso que nenhuma das outras três reconciliações o alcança.
 */
const HUMAN_TABLE_DOC = join(process.cwd(), '.agents/specs/conventions/ci-defense-in-depth.md');

/**
 * Os gates do preflight, **derivados** da lista que o preflight de fato roda.
 *
 * Este bloco já foi um literal de 17 linhas transcrito à mão, e o comentário
 * dizia o oposto do que o código fazia — descrevia a invariante que ele não
 * tinha. O reconciliador comparava o registro contra AQUele literal, então era
 * cego nos dois sentidos: gate novo em `preflight.ts` rodava sem obrigação
 * nenhuma de entrar no registro, e gate removido de lá continuava "registrado".
 * MEDIDO em 2026-10-06: gate fantasma inserido em `preflight.ts` → preflight
 * imprimiu `✓`, `check-teeth-registry` devolveu `EXIT=0`, 13 testes verdes.
 *
 * Agora a lista mora em `preflight-gates.ts` e este arquivo a chama. O módulo
 * novo é só dados justamente para não criar ciclo: `preflight.ts` (que tem as
 * funções) e este arquivo (que reconcilia) leem a mesma lista, e ninguém
 * importa ninguém.
 *
 * `preflightGates()` é função, não constante, por um motivo medido: um
 * `PREFLIGHT_GATES` derivado no carregamento do módulo é um RETRATO da lista.
 * O `preflight-gates.spec.ts` empurra um gate fantasma e exige que a
 * reconciliação o enxergue — com constante, o teste fica vermelho com 17 em
 * vez de 18, que é a forma correta de um derivado tomar snapshot.
 */
export { preflightGates };
export type { CheckSpec, GateRef } from './preflight-gates';

export function checkTeethRegistry(): CheckResult {
  let registry: string;
  let matrix: string;
  let humanTable: string;
  try {
    registry = readFileSync(REGISTRY_DOC, 'utf8');
    matrix = readFileSync(MATRIX_DOC, 'utf8');
    humanTable = readFileSync(HUMAN_TABLE_DOC, 'utf8');
  } catch (err) {
    return {
      ok: false,
      errors: [
        `não foi possível ler as convenções que reconcilio: ${(err as Error).message} — ` +
          `sem elas este check é teatro (reporta sucesso sem ter verificado nada)`,
      ],
    };
  }

  // Arquivos versionados: o gate c1 é sobre ARTEFATO EXISTE, e um arquivo
  // untracked também "existe" no disco — que é o estado em que um gate novo
  // fica antes do primeiro commit dele.
  const trackedFiles = readRepoFiles();

  // Composto, e não somado como 4º item de `ReconcileInput`: as três
  // reconciliações de lá casam por ARQUIVO, esta casa por ID, e misturar as
  // duas chaves num único `ReconcileInput` obrigaria as 5 chamadas de spec já
  // existentes a passar um campo que não têm.
  const dentes = reconcileTeethRegistry({
    registeredGates: preflightGates(),
    registryMarkdown: registry,
    matrixMarkdown: matrix,
    trackedFiles,
  });

  // `PREFLIGHT_CHECKS`, e não `preflightGates()`: `GateRef` é `{name, file}` —
  // o id é descartado justamente porque as 3 de cima casam por arquivo. O
  // catálogo é a única das 4 que precisa dele, e a lista viva é a fonte.
  const catalogo = reconcileCatalogoHumano({
    registeredGates: PREFLIGHT_CHECKS,
    humanTableMarkdown: humanTable,
  });

  const errors = [...dentes.errors, ...catalogo.errors];
  return { ok: errors.length === 0, errors };
}

/**
 * Arquivos que o repo considera existentes: versionados **e** untracked-não-
 * ignorados.
 *
 * `--others --exclude-standard` não é um detalhe. Um gate novo mora em
 * untracked até o primeiro commit dele, e com `git ls-files` puro este check
 * acusaria o próprio arquivo que o está criando — "aponta pra arquivo que não
 * existe" — no mesmo minuto em que ele é registrado no preflight. Um gate que
 * berra no primeiro uso ensina a ignorar o gate, que é pior do que não tê-lo.
 * (Já aconteceu neste repo: `check-doc-refs` enumera com `git ls-files` e
 * checava `.md` untracked como inexistente.)
 *
 * Cai para lista vazia (→ tudo vermelho) se o git falhar.
 */
export function readRepoFiles(): string[] {
  try {
    const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
    return out.split('\n').filter((l) => l.length > 0);
  } catch {
    return [];
  }
}

// Executado como CLI.
if (process.argv[1]?.endsWith('check-teeth-registry.ts')) {
  const r = checkTeethRegistry();
  for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
  process.exit(r.ok ? 0 : 1);
}
