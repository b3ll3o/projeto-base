/**
 * SEM shebang, de propósito.
 *
 * Gate que fecha a classe do C3 da auditoria de segurança de 2026-11-03:
 * **nenhum instrumento** media advisories de dependência. O repo tinha 89
 * advisories (4 críticas, 23 altas) e nada reclamava — a mesma doença do
 * F11 (as procedures das skills de auditoria que ninguém executava).
 *
 * MEDIDO em 2026-11-03, com `pnpm audit --json`:
 *   - `next@15.5.25` — RCE não autenticada na otimização de imagem com SVG
 *     (advisory 1242817, crítica) e DoS no App Router via Server Actions
 *     (1242819). O range `^15.0.0` permitia 15.5.28; o lockfile é que estava
 *     velho. Um bump de lockfile fecha as duas.
 *   - `fastify@5.11.3` — 4 advisories (bypass de body, de auth, de validação
 *     e de header). O `@nestjs/platform-fastify@11.2.8` **pina** 5.11.3
 *     exato: nenhuma versão 11.x do nestjs traz o fastify corrigido. Só o
 *     nestjs 12 (major) traz, e ele exige migrar a API.
 *   - `postcss@8.4.31` — o `next@15.5.28` **continua** pinando 8.4.31 exato.
 *   - `tinypool@1.1.1` — 2 críticas (prototype pollution → RCE). O
 *     `vitest@3.2.7` **continua** pedindo `tinypool@^1.1.1`: nenhuma versão do
 *     vitest traz a correção. Só o `override` traz.
 *
 * Por isso os 7 `overrides` do `pnpm` (a lista está no `package.json`): são as
 * transitivas que **nenhum release upstream** conserta.
 *
 * O que este gate mede:
 *   1. roda `pnpm audit --json` e reprova quando há advisory CRÍTICA ou ALTA
 *      que não esteja na lista de exceções;
 *   2. cada exceção da lista carrega o **motivo medido** e a **verificação
 *      que prova que o motivo continua valendo** — a verificação roda, e se
 *      parar de valer, a exceção é reprovada. Uma exceção que ninguém mede é
 *      dívida silenciosa.
 *   3. uma exceção que não casa com nenhuma advisory é **aviso**: a lista
 *      não pode encolher nem sobrar em silêncio.
 *
 * Quando a rede não responde, o gate **declara o skip** no painel — verde
 * sem medir é o pior estado possível, e silêncio seria ainda pior.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { linhasDoRelato } from './check-types';

export interface CheckResult {
  ok: boolean;
  errors: string[];
  advisories: string[];
}

/** Onde a lista de exceções mora. Versionada, porque é decisão humana. */
export const ARQUIVO_DE_EXCECOES = '.tooling/scripts/ci/excecoes-de-dependencias.json';

/** Tempo limite da auditoria, em ms. A rede lenta não pode travar o preflight. */
export const TIMEOUT_DA_AUDITORIA_MS = 120_000;

/** O formato da exceção: só tipos que o gate implementa (nada de shell livre). */
export interface Excecao {
  /** O id da advisory (o número que o `pnpm audit` imprime). */
  id: string;
  /** O pacote. */
  modulo: string;
  /** A severidade que a exceção cobre. */
  severidade: string;
  /** Por que a exceção existe — o motivo medido, com a data. */
  motivo: string;
  /** A prova de que o motivo continua valendo. */
  verificacao: {
    tipo: 'ausencia';
    /** Regex que NÃO pode aparecer nos caminhos. */
    padrao: string;
    /** Arquivos ou diretórios (o diretório é varrido recursivamente). */
    caminhos: string[];
    /** Regex de arquivo a ignorar (ex.: as specs). */
    excluir?: string[];
  };
}

export interface ArquivoDeExcecoes {
  excecoes: Excecao[];
  /**
   * A claim do arquivo: quantas advisories o `pnpm audit` media quando o
   * número foi escrito. É DADO — a regra (o que fazer quando o declarado e o
   * medido divergem) mora no gate.
   */
  advisoriesEsperadas?: AdvisoriesEsperadas;
}

/**
 * A contagem de advisories que o arquivo declara.
 *
 * MEDIDO 2026-11-10: a prosa do arquivo afirmava 41 advisories e o
 * `pnpm audit` media 31 — o número é uma MEDIÇÃO, e a medição envelhece com
 * o lockfile. Com a contagem em número, o gate passa a medir a claim: o que
 * o arquivo declara a mais do que existe é ERRO (a claim mente), e o que o
 * registro publicou a mais do que o arquivo declara é AVISO (isso é evento do
 * registro, não mudança do repo — reprovar por isso seria vermelho sem
 * motivo).
 */
export interface AdvisoriesEsperadas {
  /** Quando a claim foi medida (YYYY-MM-DD). */
  medidoEm: string;
  /** O total declarado. */
  total: number;
  critical: number;
  high: number;
  moderate: number;
  low: number;
  info: number;
}

/** As severidades que a claim conta — as mesmas do `metadata.vulnerabilities`. */
export const SEVERIDADES_DA_CLAIM: readonly (keyof Omit<
  AdvisoriesEsperadas,
  'medidoEm' | 'total'
>)[] = ['critical', 'high', 'moderate', 'low', 'info'];

/**
 * Os números que a claim TEM que declarar: o total e as 5 severidades.
 *
 * A forma é conferida pelo gate (e não pelo arquivo): um campo ausente
 * desligava a comparação daquele campo em silêncio.
 */
export const NUMEROS_DA_CLAIM: readonly (keyof Omit<AdvisoriesEsperadas, 'medidoEm'>)[] = [
  'total',
  ...SEVERIDADES_DA_CLAIM,
];

/**
 * As severidades que REPROVAM — no CÓDIGO, não no arquivo de dados.
 *
 * MEDIDO em 2026-11-03 (revisão do PR #143): na primeira versão a lista
 * vinhava do JSON (`severidadesQueReprovam`), e quem editasse o arquivo
 * Couldia enfraquecer o gate — trocando `["critical", "high"]` por `[]` e
 * zerando a reprovação. A regra do gate vive no gate (o mesmo princípio do
 * `doc-claims.json`: o arquivo é DADO, o gate é REGRA).
 */
export const SEVERIDADES_QUE_REPROVAM: readonly string[] = ['critical', 'high'];

export interface Advisory {
  id: string;
  modulo: string;
  severidade: string;
  titulo: string;
  versaoCorrigida: string;
  versoesAfetadas: string[];
}

/**
 * Extrai as advisories do JSON do `pnpm audit --json`.
 *
 * O formato do pnpm é `{ advisories: { <id>: {...} }, metadata: {...} }` — o id
 * é a chave, não um campo. (MEDIDO em 2026-11-03.)
 */
export function extrairAdvisories(auditoria: string): Advisory[] {
  let dados: unknown;
  try {
    dados = JSON.parse(auditoria);
  } catch {
    return [];
  }
  const advisories = (dados as { advisories?: Record<string, unknown> }).advisories ?? {};
  const saida: Advisory[] = [];
  for (const [id, bruto] of Object.entries(advisories)) {
    const a = bruto as {
      module_name?: string;
      severity?: string;
      title?: string;
      patched_versions?: string;
      findings?: { versions?: string[] }[];
    };
    const versoes = new Set<string>();
    for (const f of a.findings ?? []) for (const v of f.versions ?? []) versoes.add(v);
    saida.push({
      id,
      modulo: a.module_name ?? '(desconhecido)',
      severidade: a.severity ?? '(desconhecida)',
      titulo: a.title ?? '',
      versaoCorrigida: a.patched_versions ?? '',
      versoesAfetadas: [...versoes].sort(),
    });
  }
  return saida;
}

/**
 * A contagem por severidade do `metadata.vulnerabilities` do `pnpm audit`.
 *
 * Devolve `null` quando o JSON não traz a contagem (o `pnpm audit` antigo não
 * tinha, e a spec usa JSON sintético) — sem dado medido, o gate não julga a
 * claim: quem não mede não acusa.
 */
export function extrairContagem(auditoria: string): Record<string, number> | null {
  let dados: unknown;
  try {
    dados = JSON.parse(auditoria);
  } catch {
    return null;
  }
  const contagem = (dados as { metadata?: { vulnerabilities?: unknown } }).metadata
    ?.vulnerabilities;
  if (!contagem || typeof contagem !== 'object') return null;
  const saida: Record<string, number> = {};
  for (const [severidade, valor] of Object.entries(contagem as Record<string, unknown>)) {
    if (typeof valor === 'number') saida[severidade] = valor;
  }
  // Objeto VAZIO é "sem dado medido", não "zero medido": MEDIDO 2026-11-10,
  // `metadata.vulnerabilities: {}` (o que a spec sintética produz) fazia o
  // gate acusar 5 erros falsos ("declara 31 advisory(ies) e o audit mede 0").
  // Um audit que roda e não acha nada traz as chaves com 0
  // (`{info:0, low:0, …}`) — o vazio é a assinatura de "sem contagem".
  return Object.keys(saida).length === 0 ? null : saida;
}

/** Os arquivos sob um caminho (o arquivo, ou o diretório varrido recursivamente). */
export function arquivosEm(caminho: string, excluir?: string[]): string[] {
  if (!existsSync(caminho)) return [];
  const st = statSync(caminho);
  if (st.isFile()) return [caminho];
  const saida: string[] = [];
  const andar = (dir: string) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      // Artefatos de build: o padrão da verificação pode casar neles (o
      // `dist/` da API, o `.next/` do web) e acusar uma exceção que está
      // válida — a verificação tem que olhar o CÓDIGO, não o que saiu dele.
      if (
        entrada.name === 'node_modules' ||
        entrada.name.startsWith('.next') ||
        entrada.name === 'dist' ||
        entrada.name === 'coverage' ||
        entrada.name === '.turbo'
      ) {
        continue;
      }
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) andar(completo);
      else if (!excluir?.some((re) => new RegExp(re).test(completo))) saida.push(completo);
    }
  };
  andar(caminho);
  return saida;
}

/**
 * Extrai o JSON da auditoria de uma execução que FALHOU.
 *
 * O `pnpm audit` sai com código 1 quando encontra vulnerabilidade (medido em
 * 2026-11-03) — e o `execFileSync` joga o stdout dentro da exceção. Sem esta
 * função, o gate lia "a auditoria NÃO RODOU" num repo cheio de advisory.
 *
 * Devolve `null` quando a falha não tem JSON (aí sim é "não rodou").
 */
export function auditoriaDeErro(erro: unknown): string | null {
  const saida = (erro as { stdout?: unknown }).stdout;
  if (typeof saida === 'string' && saida.trim().startsWith('{')) return saida;
  return null;
}

/**
 * Roda a verificação da exceção.
 *
 * Devolve `null` quando a exceção continua valendo, ou a mensagem do erro
 * quando ela **parou** de valer (o motivo medido deixou de ser verdade).
 */
export function verificarExcecao(repoRoot: string, excecao: Excecao): string | null {
  const { padrao, caminhos, excluir } = excecao.verificacao;
  const re = new RegExp(padrao);
  for (const relativo of caminhos) {
    for (const arquivo of arquivosEm(path.join(repoRoot, relativo), excluir)) {
      let conteudo: string;
      try {
        conteudo = readFileSync(arquivo, 'utf-8');
      } catch {
        continue;
      }
      if (re.test(conteudo)) {
        const relativoArquivo = path.relative(repoRoot, arquivo);
        return (
          `a exceção ${excecao.id} (${excecao.modulo}) parou de valer: ` +
          `o padrão ${padrao} apareceu em ${relativoArquivo}. ` +
          `O motivo da exceção era: ${excecao.motivo}`
        );
      }
    }
  }
  return null;
}

/** Carrega a lista de exceções versionada. */
export function carregarExcecoes(repoRoot: string): ArquivoDeExcecoes {
  const arquivo = path.join(repoRoot, ARQUIVO_DE_EXCECOES);
  if (!existsSync(arquivo)) {
    return { excecoes: [] };
  }
  try {
    return JSON.parse(readFileSync(arquivo, 'utf-8')) as ArquivoDeExcecoes;
  } catch (erro) {
    // JSON quebrado não pode virar "nenhuma excecao" (que reprovaria tudo
    // com uma mensagem confusa) nem derrubar o preflight com um stack trace.
    throw new Error(
      `${ARQUIVO_DE_EXCECOES} não é um JSON válido: ${String((erro as Error).message).slice(0, 160)}`,
    );
  }
}

/**
 * O gate.
 *
 * `auditoriaJson` existe para a spec: a spec passa um JSON sintético e não
 * fala com a rede. Sem ele, o gate roda `pnpm audit --json` de verdade.
 */
export function checkDependencyAudit(opts: {
  repoRoot: string;
  auditoriaJson?: string;
}): CheckResult {
  const errors: string[] = [];
  const advisories: string[] = [];
  const root = path.resolve(opts.repoRoot);

  let auditoria = opts.auditoriaJson;
  if (auditoria === undefined) {
    try {
      auditoria = execFileSync('pnpm', ['--config.engine-strict=false', 'audit', '--json'], {
        cwd: root,
        encoding: 'utf-8',
        timeout: TIMEOUT_DA_AUDITORIA_MS,
        maxBuffer: 32 * 1024 * 1024,
      });
    } catch (erro) {
      // MEDIDO em 2026-11-03: o `pnpm audit` sai com código **1** quando
      // ENCONTRA vulnerabilidade. O `execFileSync` joga a exceção nesse caso —
      // e o JSON da auditoria, que é a medição, ia dentro da exceção. O
      // primeiro teste do gate viajou por isso: ele disse "a auditoria NÃO
      // RODOU" com o repo cheios de advisory encontrada.
      const saida = auditoriaDeErro(erro);
      if (saida !== null) {
        auditoria = saida;
      } else {
        const detalhe = String((erro as Error).message ?? erro).slice(0, 200);
        advisories.push(
          `a auditoria de dependência NÃO RODOU (${detalhe}) — sem rede? ` +
            `Este gate fica sem medir (e a claim de advisories NÃO foi conferida); ` +
            `a CI tem rede e mede.`,
        );
        return { ok: true, errors, advisories };
      }
    }
  }

  const lista = carregarExcecoes(root);
  const encontrados = extrairAdvisories(auditoria);
  const reprovam = new Set(SEVERIDADES_QUE_REPROVAM);

  const porId = new Map(lista.excecoes.map((e) => [e.id, e]));
  const usadas = new Set<string>();

  for (const advisory of encontrados) {
    if (!reprovam.has(advisory.severidade)) continue;
    const excecao = porId.get(advisory.id);
    if (!excecao) {
      errors.push(
        `advisory ${advisory.severidade} em ${advisory.modulo} (${advisory.id}): ${advisory.titulo}. ` +
          `Corrigida em ${advisory.versaoCorrigida || '(desconhecido)'} — ` +
          `versões afetadas: ${advisory.versoesAfetadas.join(', ') || '(não medidas)'}. ` +
          `Não há exceção declarada para ela em ${ARQUIVO_DE_EXCECOES}.`,
      );
      continue;
    }
    usadas.add(advisory.id);

    // Os campos declarados na exceção têm que BATER com a advisory. Sem
    // esta conferência eles são decorativos — e decoativos que parecem
    // valer: alguém que mudasse "severidade": "critical" para "low" no
    // arquivo acharia que rebaixou a exceção, e não rebaixou nada (o gate
    // usa a severidade da advisory).
    if (excecao.severidade !== advisory.severidade) {
      errors.push(
        `a exceção ${excecao.id} declara severidade "${excecao.severidade}" ` +
          `mas a advisory é "${advisory.severidade}" — a declaração tem que bater.`,
      );
    }
    if (excecao.modulo !== advisory.modulo) {
      errors.push(
        `a exceção ${excecao.id} declara o módulo "${excecao.modulo}" ` +
          `mas a advisory é de "${advisory.modulo}" — a declaração tem que bater.`,
      );
    }

    const problema = verificarExcecao(root, excecao);
    if (problema) errors.push(problema);
  }

  for (const excecao of lista.excecoes) {
    if (usadas.has(excecao.id)) continue;
    advisories.push(
      `a exceção ${excecao.id} (${excecao.modulo}) não casa com nenhuma advisory ` +
        `— a lista sobrou; limpe ${ARQUIVO_DE_EXCECOES}.`,
    );
  }

  const contagem = encontrados.filter((a) => reprovam.has(a.severidade)).length;
  const justificadas = [...usadas].length;
  advisories.push(
    `advisories na severidade que reprova: ${contagem} (${justificadas} com exceção declarada e verificada)`,
  );

  // A CLAIM: o número que o arquivo declara contra o número medido.
  //
  // A direção é o que separa as duas naturezas do drift:
  //
  // - declarado > medido → o arquivo afirma MAIS do que existe. A claim
  //   envelheceu (ou mentiu): ERRO. Foi o que o PR #163 mediu — a prosa
  //   afirmava 41 advisories e o `pnpm audit` media 31.
  // - medido > declarado → o REGISTRO publicou advisory nova. Isso não é
  //   mudança do repo, e reprovar por causa de dado externo é vermelho sem
  //   motivo: AVISO.
  const declaradas = lista.advisoriesEsperadas;
  const medidas = extrairContagem(auditoria);
  if (declaradas && !medidas) {
    advisories.push(
      `a auditoria não trouxe a contagem de advisories (sem 'metadata.vulnerabilities') — ` +
        `a claim de '${ARQUIVO_DE_EXCECOES}' NÃO foi conferida. Verde sem medir é pior que ` +
        `vermelho.`,
    );
  }

  // A forma da claim: os 6 números têm que estar lá. Um campo ausente
  // desliga a comparação DAQUELE campo em silêncio — MEDIDO 2026-11-10: uma
  // claim sem `moderate` (e sem `total`) passava com `ok=true`, 0 erros e 0
  // avisos. A regra mora no gate; o arquivo é só DADO, e um dado incompleto
  // tem que ser erro explícito, não um campo que ninguém lê.
  const numerosFaltando = declaradas
    ? NUMEROS_DA_CLAIM.filter((nome) => typeof declaradas[nome] !== 'number')
    : [];
  if (numerosFaltando.length > 0) {
    errors.push(
      `a claim de advisories está incompleta: '${ARQUIVO_DE_EXCECOES}' não declara ` +
        `${numerosFaltando.join(', ')}. A claim tem que declarar os ` +
        `${NUMEROS_DA_CLAIM.length} números (${NUMEROS_DA_CLAIM.join(', ')}) — um campo ` +
        `ausente desliga a comparação daquele campo em silêncio.`,
    );
  }

  if (declaradas && medidas && numerosFaltando.length === 0) {
    // A coerência INTERNA do campo: o total declarado tem que ser a soma do
    // próprio recorte. Sem esta conferência, um `total` fora da soma saía
    // como "o registro publicou advisory nova" — a mensagem culpava quem não
    // errou. MEDIDO 2026-11-10: com total 30 e as severidades somando 31, o
    // gate só dava aviso.
    const somaDeclarada = SEVERIDADES_DA_CLAIM.reduce(
      (soma, severidade) => soma + declaradas[severidade],
      0,
    );
    if (declaradas.total !== somaDeclarada) {
      errors.push(
        `a claim de advisories é incoerente: '${ARQUIVO_DE_EXCECOES}' declara total ` +
          `${declaradas.total} e o recorte do próprio campo soma ${somaDeclarada}. O total tem ` +
          `que ser a soma das severidades declaradas.`,
      );
    }

    // Cada severidade, nas duas direções do drift.
    for (const severidade of SEVERIDADES_DA_CLAIM) {
      const declarado = declaradas[severidade];
      const medido = medidas[severidade] ?? 0;
      if (declarado > medido) {
        errors.push(
          `a claim de advisories envelheceu: '${ARQUIVO_DE_EXCECOES}' declara ${declarado} ` +
            `${severidade} (medido em ${declaradas.medidoEm}) e o audit mede ${medido}. ` +
            `O arquivo afirma mais do que existe — meça de novo e atualize ` +
            `'advisoriesEsperadas' no mesmo PR.`,
        );
      } else if (medido > declarado) {
        advisories.push(
          `o audit mede ${medido} ${severidade} e a claim de '${ARQUIVO_DE_EXCECOES}' declara ` +
            `${declarado} (medido em ${declaradas.medidoEm}) — o registro publicou advisory nova. ` +
            `Atualize a claim quando puder; não é erro do repo.`,
        );
      }
    }
  }

  return { ok: errors.length === 0, errors, advisories };
}

// Executado como CLI.
//
// Sem este bloco, rodar o gate pela linha de comando não mede nada: ele
// importa o módulo, não chama a função, e sai **0** — o verde-por-ignorância
// que `guard-classes.md` chama de classe 5. MEDIDO 2026-11-10: `node
// --import tsx .tooling/scripts/ci/check-dependency-audit.ts` saía 0 sem
// medir, e o diferencial do registro de dentes ("inflar a claim → o gate
// reprova") não tinha comando que o reproduzisse.
//
// O comando é o do diferencial: `node --import tsx
// .tooling/scripts/ci/check-dependency-audit.ts` (ele roda o `pnpm audit`
// de verdade, e por isso precisa de rede).
if (process.argv[1]?.endsWith('check-dependency-audit.ts')) {
  // O gate é SÍNCRONO (o `pnpm audit` roda dentro dele, com `execFileSync`) —
  // MEDIDO 2026-11-10: a primeira versão usava `.then()`, e o CLI morria com
  // "checkDependencyAudit(...).then is not a function".
  const r = checkDependencyAudit({ repoRoot: '.' });
  for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
  process.exit(r.ok ? 0 : 1);
}
