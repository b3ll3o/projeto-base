/**
 * SEM shebang, de propósito.
 *
 * Gate que fecha a classe do F11: as skills de auditoria são **procedimentos
 * shell determinísticos** e NADA no CI os executava.
 *
 * O que foi medido em 2026-10-29, rodando as procedures na árvore:
 *   - `release-versioning-audit` passo 4.1: a regex `Vers..o` não casa com
 *     "Versão" (pede 2 caracteres, a palavra tem 1) → saída VAZIA. O passo
 *     não mediava o que o workflow lê.
 *   - `release-versioning-audit` passo 6: `tail -1` pegava a versão da tabela
 *     de histórico, não o footer → lia 1.12.0 num footer que dizia 1.14.0.
 *   - `openapi-audit` passo 2: diff entre formatos diferentes → 100 linhas de
 *     ruído, e a premissa "DTO é subset do Prisma" é falsa (13 campos são
 *     alias ou só-da-API) → 13 falsos positivos por auditoria.
 *
 * Os três estavam quebrados há semanas e NINGUÉM reclamou — porque a skill só
 * quebra quando alguém a executa, e ninguém a executa. É a doutrina do repo
 * ("regra sem instrumento é defeito") alcançando as skills.
 *
 * O que este gate mede:
 *   1. cada bloco `bash` de cada skill de auditoria precisa estar DECLARADO
 *      (`run` ou `skip`, com motivo). Bloco sem declaração é erro — a lista
 *      não pode encolher em silêncio (a mesma lição da lista de footers do
 *      #126, que media 4 de 6 arquivos).
 *   2. um bloco `run` é EXECUTADO. Falha se sair com código != 0, se imprimir
 *      uma linha de falha (o marcador `✗` que os gates do repo já usam) ou se
 *      estourar o tempo limite.
 *   3. um bloco `run` não pode conter primitiva de escrita, de rede ou de
 *      infra — a declaração não pode mentir que o passo é read-only.
 *
 * A fronteira de confiança: o corpo do script vem de um arquivo DO REPO
 * (`.agents/skills/<skill>/SKILL.md`), revisado no PR, e não de entrada de
 * usuário. É o mesmo nível de confiança de rodar a skill na mão. O comando
 * vai como argv em array (`spawnSync('bash', ['-c', corpo])`) — o gate
 * `check-shell-injection` cobra isso.
 */
import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { CheckResult } from './check-types';

/**
 * As skills cujos passos este gate executa.
 *
 * EXPORTADA e presa pela spec (o mesmo motivo de `FOOTERS_DE_VERSAO` no
 * #126): uma lista de segurança que ninguém prende é uma lista que alguém
 * encolhe sem querer.
 */
export const SKILLS_DE_AUDITORIA: readonly string[] = [
  'prisma-audit',
  'openapi-audit',
  'otelcol-audit',
  'docker-prod-audit',
  'release-versioning-audit',
  'findings-orchestration',
  // MEDIDO em 2026-10-29: esta skill entrou no repo pelo merge do #129 — DEPOIS
  // do inventário da revisão, que por isso a deixou de fora (23 de 25 skills).
  // Os 5 blocos dela estavam sem declaração, e um deles (5.1) invoca o
  // preflight inteiro: executá-lo de dentro do gate seria recursão.
  'documentation-audit',
];

/**
 * Tempo limite de UM passo, em ms.
 *
 * MEDIDO em 2026-10-29: o job de `preflight` na CI tem `timeout-minutes: 5`
 * (`.github/workflows/ci.yml`), e ele roda com ~40 outros gates. Com 120s por
 * passo e 24 passos, o pior caso do gate era 48 min — 10× o orçamento do job
 * inteiro, e a falha apareceria como "o job estourou o tempo", não como "o
 * passo travou". Por isso o passo é menor que o orçamento total.
 */
export const TIMEOUT_POR_PASSO_MS = 60_000;

/**
 * O orçamento TOTAL do gate, em ms.
 *
 * O gate para de rodar passos quando o orçamento acaba e **reporta**: um gate
 * que sai em silêncio depois de rodar metade do que devia é pior do que um
 * gate que falha dizendo onde parou. O preflight roda na frente de ~40 outros
 * gates e tem 5 min no total.
 */
export const ORCAMENTO_TOTAL_MS = 120_000;

/** O marcador de falha que os gates do repo imprimem. */
export const MARCADOR_DE_FALHA = '✗';

/**
 * Os códigos de saída que um passo de auditoria pode ter sem ser defeito.
 *
 * `grep`, `diff`, `comm` e `wc` devolvem **1** quando não acham nada — e num
 * passo de auditoria "não achei nada" é o estado DESEJADO (é o que o
 * `grep -v` final do passo de drift mede). Só os códigos que indicam CRASH
 * são falha: 2 (erro de uso, regex inválida, arquivo ausente), 126 (não
 * executável), 127 (comando não encontrado — o `yq` ausente) e ≥128 (sinal).
 */
export const CODIGOS_DE_SUCESSO: readonly number[] = [0, 1];

export type Declaracao = 'run' | 'skip';

export interface Bloco {
  /** A skill dona do bloco. */
  skill: string;
  /** A linha (1-based) do início do bloco no SKILL.md. */
  linha: number;
  /** `run` (o gate executa) ou `skip` (o gate não executa, com motivo). */
  declaracao: Declaracao | null;
  /** O motivo declarado — obrigatório nos dois casos. */
  motivo: string;
  /** O corpo do script. */
  corpo: string;
}

/**
 * As primitivas que um passo `run` não pode ter.
 *
 * A lista é sobre o **verbo**, não sobre a ferramenta: `grep`, `git log`,
 * `cat`, `ls`, `comm`, `diff`, `sort`, `head`, `awk` (leitura) são permitidos;
 * escrever, buscar na rede, ou precisar de daemon não são.
 */
export const PRIMITIVAS_PROIBIDAS: readonly { padrao: RegExp; motivo: string }[] = [
  { padrao: /(^|[\s;&|(])rm\s/, motivo: 'apaga arquivo' },
  { padrao: /(^|[\s;&|(])mv\s/, motivo: 'move arquivo' },
  { padrao: /(^|[\s;&|(])cp\s/, motivo: 'copia arquivo' },
  { padrao: /(^|[\s;&|(])mkdir\b/, motivo: 'cria diretório' },
  { padrao: /(^|[\s;&|(])touch\b/, motivo: 'cria arquivo' },
  { padrao: /(^|[\s;&|(])tee\b/, motivo: 'escreve arquivo' },
  { padrao: /\bsed\s+-i\b/, motivo: 'edita arquivo no lugar' },
  { padrao: /(^|[\s;&|(])docker\s/, motivo: 'precisa do daemon do Docker' },
  { padrao: /(^|[\s;&|(])gh\s/, motivo: 'fala com a API do GitHub' },
  { padrao: /(^|[\s;&|(])curl\s/, motivo: 'fala com a rede' },
  { padrao: /(^|[\s;&|(])wget\s/, motivo: 'fala com a rede' },
  { padrao: /(^|[\s;&|(])(pnpm|npm|npx)\s/, motivo: 'executa o toolchain (pode escrever)' },
  { padrao: /(^|[\s;&|(])psql\b/, motivo: 'precisa do banco' },
  { padrao: /\bprisma\s+migrate\b/, motivo: 'precisa do banco' },
  { padrao: /\bgit\s+(fetch|push|commit|reset|checkout|clean|apply|am)\b/, motivo: 'mexe no git' },
];

/**
 * A declaração de um bloco: `[gate: run — motivo]`.
 *
 * MEDIDO em 2026-10-29: a declaração mora **dentro** do bloco (no comentário
 * da primeira linha), não numa linha antes dele. A linha antes custava 2
 * linhas por bloco (a declaração + a vazia) e estourou o teto de 300 linhas
 * de `findings-orchestration` (298 → 310). Dentro do bloco, o custo é zero:
 * a declaração fica onde o comando está, e o bloco continua sendo o que
 * o agente lê.
 */
const MARCADOR_DECLARACAO = /\[gate:\s*(run|skip)\s*—\s*([^\]]+)\]/;

/**
 * Extrai os blocos `bash` de um SKILL.md e a declaração de cada um.
 *
 * A declaração é o marcador `[gate: run|skip — motivo]`, no comentário da
 * primeira linha do bloco.
 * Bloco sem declaração vem com `declaracao: null` — e o gate trata isso como
 * erro, não como "pode".
 */
export function extrairBlocos(md: string, skill: string): Bloco[] {
  const linhas = md.split('\n');
  const blocos: Bloco[] = [];

  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i]!.trim() !== '```bash') continue;

    // O corpo: até o ``` de fecha.
    const corpo: string[] = [];
    let k = i + 1;
    for (; k < linhas.length && linhas[k]!.trim() !== '```'; k++) corpo.push(linhas[k]!);

    // A declaração mora dentro do bloco.
    const m = MARCADOR_DECLARACAO.exec(corpo.join('\n'));
    const declaracao: Declaracao | null = m === null ? null : (m[1] as Declaracao);
    const motivo = m === null ? '' : (m[2] ?? '').trim();

    blocos.push({
      skill,
      linha: i + 1,
      declaracao,
      motivo,
      corpo: corpo.join('\n'),
    });

    i = k;
  }

  return blocos;
}

/**
 * Os alvos de redirect que um passo `run` pode usar.
 *
 * `/tmp` é scratch de leitura: os passos de auditoria comparam arquivos
 * intermediários. `/dev/null` e `&` são descarte. O que é proibido é
 * escrever DENTRO do repo.
 *
 * A regra é por ALVO, não por forma: um `>` com lookahead de caminho falha
 * por retrocesso do `\s*` (o `> /tmp/x` casava como "escrita" porque o
 * lookahead voltava a caber no espaço). Por isso o alvo é CAPTURADO.
 */
export const ALVOS_DE_REDIRECT_PERMITIDOS: readonly RegExp[] = [
  /^\/dev\/null$/,
  /^\/tmp(\/|$)/,
  /^&/,
];

/**
 * O corpo do bloco SEM os comentários.
 *
 * MEDIDO em 2026-10-29: sem isso, o denylist acusava os próprios comentários
 * dos passos — `# 4.3 Comandos que dependem de binário (ex: curl em
 * distroless)` casava como "fala com a rede", `# (sem \`git fetch\`)` casava
 * como "mexe no git" e `# Esperado: 1 (footer único). Se >1, finding DRIFT.`
 * casava como redirect. É a mesma classe que o gate `check-shell-injection`
 * resolve no TypeScript com AST: o que está em comentário não é comando.
 *
 * Só linhas INTEIRAS de comentário (primeiro caractere não-branco é `#`) saem; um
 * `#` dentro de string (`grep -E "a#b"`) permanece.
 */
export function semComentarios(corpo: string): string {
  return corpo
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
}

/** As primitivas proibidas que aparecem no corpo do bloco. */
export function violacoesDoBloco(corpo: string): string[] {
  const achadas: string[] = [];
  const codigo = semComentarios(corpo);
  for (const { padrao, motivo } of PRIMITIVAS_PROIBIDAS) {
    if (padrao.test(codigo)) achadas.push(motivo);
  }
  for (const alvo of alvosDeRedirect(codigo)) {
    if (!ALVOS_DE_REDIRECT_PERMITIDOS.some((p) => p.test(alvo))) {
      achadas.push(`redireciona para \`${alvo}\` (escrita fora do scratch)`);
    }
  }
  return achadas;
}

/**
 * Os alvos de redirect (`> alvo`) de um corpo de script.
 *
 * MEDIDO em 2026-10-29: a primeira versão casava QUALQUER `>`, e o `>` de uma
 * comparação — o ternário `ini=$(( lineno > 10 ? lineno - 10 : 1 ))` — era lido
 * como redirect para o arquivo "10". O próprio gate acusou o conserto de outro
 * defeito.
 *
 * O que separa um redirect de uma comparação: o **alvo**. Um redirect aponta
 * para um caminho (`saida.txt`, `/tmp/x`, `graphify-out/graph.json`, `$VAR`);
 * uma comparação aponta para um valor (`10`, `b`). Por isso o alvo precisa ter
 * ponto, barra ou cifrão — e não pode ser só um número.
 */
export function alvosDeRedirect(corpo: string): string[] {
  const alvos: string[] = [];
  const re = /(?<!\d)>\s*([^\s|&]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corpo)) !== null) {
    const alvo = m[1]!;
    if (/^\d+$/.test(alvo)) continue; // comparação numérica
    if (!/[./$]/.test(alvo)) continue; // comparação com um valor qualquer
    alvos.push(alvo);
  }
  return alvos;
}

/** As linhas de falha (`✗`) que o passo imprimiu. */
export function linhasDeFalha(saida: string): string[] {
  return saida
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith(MARCADOR_DE_FALHA));
}

/** O resultado de executar um passo. */
export interface Execucao {
  codigo: number | null;
  saida: string;
  estourouTempo: boolean;
}

/**
 * Executa um passo `run` no repositório.
 *
 * O comando vai como argv em array; o corpo do script é o do bloco do
 * SKILL.md (arquivo do repo, não entrada de usuário).
 */
export function executarPasso(corpo: string, repoRoot: string): Execucao {
  const r = spawnSync('bash', ['-c', corpo], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: TIMEOUT_POR_PASSO_MS,
    maxBuffer: 8 * 1024 * 1024,
  });
  const estourouTempo =
    r.error !== undefined && (r.error as NodeJS.ErrnoException).code === 'ETIMEDOUT';
  return {
    codigo: r.status,
    saida: `${r.stdout ?? ''}${r.stderr ?? ''}`,
    estourouTempo,
  };
}

/**
 * O registro das exceções `skip` — a mesma forma de
 * `excecoes-de-dependencias.json`: o registro é DADO, a regra é CÓDIGO.
 *
 * MEDIDO 2026-11-09 (issue #149, F2): 15 blocos `[gate: skip]` em 7 skills, e
 * o motivo de cada um era PROSA sem instrumento: o gate lia o motivo (medindo
 * o COMPRIMENTO dele) e o descartava. Um `skip` cujo motivo parou de valer
 * passava em silêncio.
 */
export const ARQUIVO_DE_EXCECOES_DE_SKIP = '.tooling/scripts/ci/excecoes-de-skills-audit.json';

/** Uma exceção `skip` registrada: a skill, o motivo e a verificação. */
export interface ExcecaoDeSkip {
  /** A skill à qual o bloco pertence. */
  skill: string;
  /** O motivo, como SUBSTRING do motivo capturado no bloco. */
  motivo: string;
  /** A prova de que o motivo continua valendo. */
  verificacao: {
    /** O único tipo implementado — nada de shell livre. */
    tipo: 'no-bloco';
    /** Regex que tem que estar no CORPO do bloco. */
    padrao: string;
  };
}

/** O registro inteiro, com o bloco que explica o uso. */
export interface RegistroDeExcecoesDeSkip {
  _comoUsar: string[];
  excecoes: ExcecaoDeSkip[];
}

/**
 * Compila o padrão do registro. Um regex INVÁLIDO no arquivo de dados é erro
 * do gate, não um crash: `new RegExp('[')` lança, e um gate que morre com
 * stack trace no meio do preflight leva os ~40 gates que rodam depois dele
 * junto — o gate que deveria acusar o registro quebrado é o que derruba a
 * roda.
 */
function compilaPadrao(padrao: string): RegExp | null {
  try {
    return new RegExp(padrao);
  } catch {
    return null;
  }
}

/**
 * Reconcilia os blocos `skip` com o registro.
 *
 * Cinco accuseções, e nenhuma delas aceita "não achei":
 *
 *   1. **todo** bloco `skip` tem entrada no registro — um `skip` sem
 *      verificação é dívida silenciosa (e é o que acusa também o motivo que
 *      mudou no bloco: o registro deixa de casar);
 *   2. **toda** entrada casa com **exatamente um** bloco — entrada que não
 *      casa é a exceção que não exclui mais nada (a "documentation lie" do
 *      `check-doc-coverage`);
 *   3. **nenhuma** âncora ambígua — duas âncoras que casam com o mesmo bloco
 *      deixam a desambiguação sem dono;
 *   4. a âncora tem que estar no corpo do bloco — se sumiu, o motivo parou
 *      de valer;
 *   5. o `padrao` tem que ser um regex que compila — um registro com regex
 *      quebrado é um registro que não verifica nada.
 */
export function reconciliarExcecoesDeSkip(
  blocos: Bloco[],
  registro: RegistroDeExcecoesDeSkip,
): string[] {
  const errors: string[] = [];
  const usados = new Set<number>();

  for (const bloco of blocos) {
    const onde = `${bloco.skill}:${bloco.linha}`;
    const candidatos = registro.excecoes.filter(
      (e) => e.skill === bloco.skill && bloco.motivo.includes(e.motivo),
    );

    if (candidatos.length === 0) {
      errors.push(
        `${onde}: bloco \`skip\` SEM verificação no registro ${ARQUIVO_DE_EXCECOES_DE_SKIP}. ` +
          `O motivo é "${bloco.motivo}" — o registro tem que dizer por que ele ainda vale. ` +
          `Skip sem verificação é dívida silenciosa.`,
      );
      continue;
    }

    // Com mais de um candidato, a âncora é o que desambigua. `findings-
    // orchestration` tem DOIS blocos com o motivo "abre issues na API do
    // GitHub", e eles só se distinguem pelo comando que rodam.
    let escolhida: ExcecaoDeSkip | undefined;
    if (candidatos.length === 1) {
      escolhida = candidatos[0]!;
      const re = compilaPadrao(escolhida.verificacao.padrao);
      if (re === null) {
        errors.push(
          `${onde}: o padrão "${escolhida.verificacao.padrao}" da entrada do registro não é ` +
            `um regex que compila — o registro não verifica nada.`,
        );
        continue;
      }
      if (!re.test(bloco.corpo)) {
        errors.push(
          `${onde}: o motivo "${bloco.motivo}" PAROU de valer — a âncora ` +
            `"${escolhida.verificacao.padrao}" não está mais no corpo do bloco. ` +
            `Ou o motivo muda, ou a entrada do registro sai.`,
        );
        continue;
      }
    } else {
      const comAncora = candidatos.filter((e) => {
        const re = compilaPadrao(e.verificacao.padrao);
        return re !== null && re.test(bloco.corpo);
      });
      if (comAncora.length === 0) {
        errors.push(
          `${onde}: o motivo "${bloco.motivo}" PAROU de valer — nenhuma das ` +
            `${candidatos.length} âncoras candidatas está no corpo do bloco ` +
            `(${candidatos.map((e) => `"${e.verificacao.padrao}"`).join(', ')}).`,
        );
        continue;
      }
      if (comAncora.length > 1) {
        errors.push(
          `${onde}: o registro é AMBÍGUO para o motivo "${bloco.motivo}" — ` +
            `${comAncora.length} âncoras casam com este bloco. A âncora tem que ` +
            `desambiguar 1:1.`,
        );
        continue;
      }
      escolhida = comAncora[0]!;
    }

    usados.add(registro.excecoes.indexOf(escolhida));
  }

  registro.excecoes.forEach((e, i) => {
    if (usados.has(i)) return;
    errors.push(
      `a entrada "${e.skill}" / "${e.motivo}" de ${ARQUIVO_DE_EXCECOES_DE_SKIP} não casa com ` +
        `nenhum bloco \`skip\` — a exceção não exclui mais nada. Limpe o registro.`,
    );
  });

  return errors;
}

/** Gate: os passos declarados das skills de auditoria rodam e passam. */
export function checkAuditSkills(opts: { repoRoot: string }): CheckResult {
  const errors: string[] = [];
  const advisories: string[] = [];
  const root = path.resolve(opts.repoRoot);
  let passosRodados = 0;
  const inicio = Date.now();
  // Os blocos `skip` são coletados para a reconciliação com o registro: eles
  // não são executados, e o que os vigia é o registro, não a execução.
  const blocosSkip: Bloco[] = [];

  for (const skill of SKILLS_DE_AUDITORIA) {
    const arquivo = path.join(root, '.agents/skills', skill, 'SKILL.md');
    if (!existsSync(arquivo)) {
      errors.push(
        `${skill}: SKILL.md ausente — a lista de skills de auditoria nomeia uma skill que não existe`,
      );
      continue;
    }

    const md = readFileSync(arquivo, 'utf-8');
    const blocos = extrairBlocos(md, skill);
    if (blocos.length === 0) {
      advisories.push(`${skill}: nenhum bloco bash — nada a medir`);
      continue;
    }

    for (const bloco of blocos) {
      const onde = `${skill}:${bloco.linha}`;

      if (bloco.declaracao === null) {
        errors.push(
          `${onde}: bloco bash SEM DECLARAÇÃO. Declare DENTRO do bloco, no comentário da ` +
            `primeira linha: "[gate: run — <motivo>]" (o gate executa) ou ` +
            `"[gate: skip — <motivo>]" (não executa). ` +
            `Bloco sem declaração é o que deixa um passo quebrado passar em silêncio.`,
        );
        continue;
      }

      if (bloco.motivo.length < 8) {
        errors.push(
          `${onde}: declaração \`${bloco.declaracao}\` sem motivo (ou com motivo curto demais). ` +
            `A exceção é uma linha escrita, com o motivo — o mesmo padrão de \`tdd.md\`.`,
        );
        continue;
      }

      if (bloco.declaracao === 'skip') {
        // O `skip` não é executado — e é por isso que ele precisa de
        // instrumento: nada mais ia notar se o motivo dele parasse de valer.
        blocosSkip.push(bloco);
        continue;
      }

      const violacoes = violacoesDoBloco(bloco.corpo);
      if (violacoes.length > 0) {
        errors.push(
          `${onde}: declarado \`run\`, mas o passo ${violacoes.join(' e ')}. ` +
            `Um passo que o gate executa tem de ser read-only — ou declarar \`skip\`, com o motivo.`,
        );
        continue;
      }

      const decorrido = Date.now() - inicio;
      if (decorrido > ORCAMENTO_TOTAL_MS) {
        errors.push(
          `${onde}: o orcamento do gate estourou (${ORCAMENTO_TOTAL_MS}ms) antes de rodar este passo. ` +
            `O gate parou de propósito — o preflight tem 5 min no total na CI e roda com ~40 outros gates. ` +
            `Passos rodados: ${passosRodados}.`,
        );
        break;
      }

      const exec = executarPasso(bloco.corpo, root);
      passosRodados++;

      if (exec.estourouTempo) {
        errors.push(
          `${onde}: o passo estourou o tempo limite (${TIMEOUT_POR_PASSO_MS}ms) — travado?`,
        );
        continue;
      }
      if (exec.codigo === null) {
        // MEDIDO em 2026-10-29: um passo que estoura o buffer do spawn (8 MB)
        // morre com código NULO — e o código nulo não está na lista de
        // sucesso, mas também não é um código de crash. Sem esta guarda, o
        // gate tratava o passo como aprovado (a saída parcial é não vazia).
        errors.push(
          `${onde}: o passo morreu sem código de saída (buffer estourado ou processo morto). ` +
            `A saída parcial não é aprovação — corrija o passo ou reduza a saída.`,
        );
        continue;
      }
      if (!CODIGOS_DE_SUCESSO.includes(exec.codigo)) {
        errors.push(
          `${onde}: o passo saiu com código ${exec.codigo}. Saída:\n${recorte(exec.saida)}`,
        );
        continue;
      }
      if (exec.saida.trim() === '') {
        // MEDIDO em 2026-10-29: este é o modo de falha do F3 (a regex morta
        // saía VAZIA). Um passo que não mede nada e um passo que mediu "não
        // achei nada" precisam ser distinguíveis — senão o gate é cego para a
        // classe mais cara do F11.
        errors.push(
          `${onde}: o passo rodou e não produziu NENHUMA saída. ` +
            `Sinal de que ele mediu nada (o modo de falha do F3: a regex do ` +
            `workflow não casava e a saída saía vazia). Declare o que o passo ` +
            `espera encontrar, ou transforme o "não achei" em uma linha.`,
        );
        continue;
      }
      const falhas = linhasDeFalha(exec.saida);
      if (falhas.length > 0) {
        errors.push(
          `${onde}: o passo rodou e REPORTOU falha (${falhas.length} linha(s) com "${MARCADOR_DE_FALHA}"). ` +
            `Saída:\n${recorte(exec.saida)}`,
        );
      }
    }
  }

  // ── A reconciliação com o registro das exceções `skip` ─────────────────────
  //
  // MEDIDO 2026-11-09 (issue #149, F2): o motivo de cada `skip` era prosa sem
  // instrumento. O gate lia o motivo (medindo o comprimento) e o descartava —
  // `if (bloco.declaracao === 'skip') continue;`. Um `skip` cujo motivo tinha
  // parado de valer passava em silêncio, e era o ÚNICO caminho pelo qual a
  // skill de auditoria podia mentir sobre o que ela não mede.
  const caminhoDoRegistro = path.join(root, ARQUIVO_DE_EXCECOES_DE_SKIP);
  if (!existsSync(caminhoDoRegistro)) {
    // Só há o que reclamar se existe alguma exceção para verificar. Um repo
    // sem nenhum bloco `skip` não tem exceção nenhuma — e reclamar do
    // registro ausente nele seria o erro do espelho: acusar o vazio.
    if (blocosSkip.length > 0) {
      errors.push(
        `registro de exceções \`skip\` ausente (${ARQUIVO_DE_EXCECOES_DE_SKIP}) — ` +
          `${blocosSkip.length} bloco(s) \`skip\` precisam de uma verificação, e o registro ` +
          `é onde ela mora`,
      );
    }
  } else {
    let registro: RegistroDeExcecoesDeSkip;
    try {
      registro = JSON.parse(readFileSync(caminhoDoRegistro, 'utf-8')) as RegistroDeExcecoesDeSkip;
    } catch (erro) {
      errors.push(
        `registro de exceções \`skip\` ilegível (${ARQUIVO_DE_EXCECOES_DE_SKIP}): ` +
          `${(erro as Error).message.split('\n')[0]}`,
      );
      return { ok: false, errors, advisories };
    }
    if (!Array.isArray(registro.excecoes) || registro.excecoes.length === 0) {
      if (blocosSkip.length > 0) {
        errors.push(
          `registro de exceções \`skip\` sem entradas (${ARQUIVO_DE_EXCECOES_DE_SKIP}) — ` +
            `${blocosSkip.length} bloco(s) \`skip\` sem verificação é dívida silenciosa`,
        );
      }
    } else {
      errors.push(...reconciliarExcecoesDeSkip(blocosSkip, registro));
      advisories.push(
        `medido: ${blocosSkip.length} bloco(s) \`skip\` reconciliado(s) contra ` +
          `${registro.excecoes.length} entrada(s) do registro.`,
      );
    }
  }

  return { ok: errors.length === 0, errors, advisories };
}

if (process.argv[1]?.endsWith('check-audit-skills.ts')) {
  const r = checkAuditSkills({ repoRoot: '.' });
  for (const line of [...r.errors, ...(r.advisories ?? [])]) console.log(line);
  if (r.skipped) console.log(`(skipped: ${r.reason ?? 'sem motivo declarado'})`);
  process.exit(r.ok ? 0 : 1);
}

/** Recorta a saída para a mensagem de erro não virar um despejo. */
function recorte(saida: string): string {
  const linhas = saida.trim().split('\n');
  const ultimas = linhas.slice(-12);
  return ultimas.map((l) => `    ${l}`).join('\n');
}
