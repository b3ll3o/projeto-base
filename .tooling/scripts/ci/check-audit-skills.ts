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
];

/** Tempo limite de um passo, em ms. */
export const TIMEOUT_POR_PASSO_MS = 120_000;

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

/** O cabeçalho de declaração de um bloco: `> **Gate:** \`run\` — motivo`. */
const MARCADOR_DECLARACAO = /^>\s*\*\*Gate:\*\*\s*`(run|skip)`\s*—\s*(.+)$/;

/**
 * Extrai os blocos `bash` de um SKILL.md e a declaração de cada um.
 *
 * A declaração é a linha `> **Gate:** ...` imediatamente anterior ao bloco.
 * Bloco sem declaração vem com `declaracao: null` — e o gate trata isso como
 * erro, não como "pode".
 */
export function extrairBlocos(md: string, skill: string): Bloco[] {
  const linhas = md.split('\n');
  const blocos: Bloco[] = [];

  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i]!.trim() !== '```bash') continue;

    // A declaração: a linha anterior que casa com o marcador.
    let declaracao: Declaracao | null = null;
    let motivo = '';
    for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
      const m = MARCADOR_DECLARACAO.exec(linhas[j]!.trim());
      if (m !== null) {
        declaracao = m[1] as Declaracao;
        motivo = (m[2] ?? '').trim();
        break;
      }
    }

    // O corpo: até o ``` de fecha.
    const corpo: string[] = [];
    let k = i + 1;
    for (; k < linhas.length && linhas[k]!.trim() !== '```'; k++) corpo.push(linhas[k]!);

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

/** Os alvos de redirect (`> alvo`) de um corpo de script. */
export function alvosDeRedirect(corpo: string): string[] {
  const alvos: string[] = [];
  const re = /(?<!\d)>\s*([^\s|&]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(corpo)) !== null) alvos.push(m[1]!);
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

/** Gate: os passos declarados das skills de auditoria rodam e passam. */
export function checkAuditSkills(opts: { repoRoot: string }): CheckResult {
  const errors: string[] = [];
  const advisories: string[] = [];
  const root = path.resolve(opts.repoRoot);
  let passosRodados = 0;

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
          `${onde}: bloco bash SEM DECLARAÇÃO. Declare antes do bloco: ` +
            `"> **Gate:** \`run\` — <motivo>" (o gate executa) ou ` +
            `"> **Gate:** \`skip\` — <motivo>" (não executa). ` +
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

      if (bloco.declaracao === 'skip') continue;

      const violacoes = violacoesDoBloco(bloco.corpo);
      if (violacoes.length > 0) {
        errors.push(
          `${onde}: declarado \`run\`, mas o passo ${violacoes.join(' e ')}. ` +
            `Um passo que o gate executa tem de ser read-only — ou declarar \`skip\`, com o motivo.`,
        );
        continue;
      }

      const exec = executarPasso(bloco.corpo, root);
      passosRodados++;

      if (exec.estourouTempo) {
        errors.push(
          `${onde}: o passo estourou o tempo limite (${TIMEOUT_POR_PASSO_MS}ms) — travado?`,
        );
        continue;
      }
      if (exec.codigo !== null && !CODIGOS_DE_SUCESSO.includes(exec.codigo)) {
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

  return { ok: errors.length === 0, errors, advisories };
}

/** Recorta a saída para a mensagem de erro não virar um despejo. */
function recorte(saida: string): string {
  const linhas = saida.trim().split('\n');
  const ultimas = linhas.slice(-12);
  return ultimas.map((l) => `    ${l}`).join('\n');
}
