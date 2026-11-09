/**
 * SEM shebang, de propósito — ver `check-harness-owner.ts`: um arquivo de
 * `.tooling/scripts/ci/` que não comece com `check-`, não termine em
 * `.spec.ts` e TENHA shebang é classificado como harness órfão.
 *
 * Confere o **frontmatter do agent canônico** — o arquivo que o Claude Code
 * lê de verdade.
 *
 * ## Por que este gate existe
 *
 * Até 2026-11-09 o repo tinha DUAS árvores: `.agents/` (canônica) e `.claude/`
 * (binding do Claude Code, feito de wrappers). O wrapper era uma **cópia** do
 * frontmatter canônico, e a cópia podia divergir: o PR #147 trocou
 * `healthchecks via curl` por `healthchecks via node` no canônico da skill
 * `docker` e não tocou no wrapper — a divergência ficou em `main` sem nenhum
 * gate reclamar, porque nenhum gate comparava **conteúdo**. O
 * `check-binding-canonico` (PR #155) comparava os dois lados byte a byte.
 *
 * A pasta `.claude/` saiu do repo (ver [ADR-0009](../../../docs/adr/0009-pasta-unica-de-tooling-de-ia.md)):
 * o binding passa a ser um **symlink na máquina** (`~/.claude/agents/<n>.md` →
 * `.agents/agents/<n>.md`), e o arquivo que o harness abre É o arquivo
 * canônico. A cópia — e com ela a classe de defeito que o gate media — não
 * existe mais.
 *
 * O que RESTA é o que importa agora: o frontmatter do canônico tem que
 * declarar `name`, `description` e `tools`.
 *
 * - **`name`** — é o que casa o arquivo com o subagent. Um `name` diferente do
 *   nome do arquivo é um agent que ninguém descobre pelo nome.
 * - **`description`** — é o **gatilho**: o texto que decide quando o Claude
 *   Code escolhe o subagent.
 * - **`tools`** — sem ele, o subagent herda a **pool inteira** da conversa
 *   principal. É o desvio silencioso que o ADR-0008 já registrava.
 *
 * ## O que este gate NÃO mede
 *
 * - **O frontmatter das SKILLS** — é do `check-skill-coverage` (que exige
 *   `name` e `description` preenchidos e `name` igual ao diretório). Um fato
 *   tem UM dono — e o **parser** do frontmatter também tem: o
 *   [`frontmatter.ts`](./frontmatter.ts), que os dois gates usam.
 * - **O roteamento dos agents** — é do `check-agent-routing-coverage` (órfão
 *   e fantasma).
 * - **A existência da pasta `.claude/`** — é do `check-pasta-unica`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { camposDe, lerFrontmatter, type CampoFrontmatter } from './frontmatter';
import { linhasDoRelato, type CheckResult } from './check-types';

/** Onde vivem os agents canônicos. */
export const DIR_AGENTS = path.join('.agents', 'agents');

/**
 * Os campos que todo agent canônico declara.
 *
 * `tools` entra na lista porque o campo é o que limita a pool de ferramentas
 * do subagent — sem ele, o subagent herda tudo (ver o cabeçalho).
 */
export const CAMPOS_EXIGIDOS = ['name', 'description', 'tools'] as const;

/** Uma lacuna encontrada no agent. */
export interface LacunaAgent {
  /** O path do arquivo, repo-relative. */
  arquivo: string;
  /** O campo em falta (ou `(frontmatter)`, quando o bloco não existe). */
  campo: string;
  /** A linha a apontar: a do campo, ou a do fim do frontmatter. */
  linha: number;
  /** O que está errado, em uma frase. */
  motivo: string;
}

/**
 * Os campos do frontmatter, na ordem em que aparecem.
 *
 * Atalho sobre o [`frontmatter.ts`](./frontmatter.ts) — o dono do parser.
 */
export function lerCamposDoFrontmatter(texto: string): CampoFrontmatter[] {
  return lerFrontmatter(texto).campos;
}

/**
 * As lacunas de UM agent.
 *
 * Separado do gate para que a spec exercite a regra sem passar pelo disco.
 *
 * @param arquivo o path repo-relative do agent (o nome do arquivo é a
 *   identidade do agent: o `name` tem que ser ele).
 * @param texto o conteúdo do arquivo.
 */
export function lacunasDeAgent(arquivo: string, texto: string): LacunaAgent[] {
  const lacunas: LacunaAgent[] = [];
  const base = path.basename(arquivo, '.md');
  const lido = lerFrontmatter(texto);

  if (!lido.abre) {
    lacunas.push({
      arquivo,
      campo: '(frontmatter)',
      linha: 1,
      motivo:
        'o arquivo não abre com "---" — o Claude Code não lê frontmatter nenhum, ' +
        'e o agent fica sem nome, sem gatilho e sem pool de ferramentas.',
    });
    return lacunas;
  }

  if (lido.fecha === null) {
    // O bloco abre e nunca fecha: o harness não lê frontmatter nenhum. Um
    // parser que lê até o fim do arquivo leria o CORPO como se fosse
    // frontmatter — e o agent passaria com o corpo inteiro como frontmatter.
    lacunas.push({
      arquivo,
      campo: '(frontmatter)',
      linha: texto.split(/\r?\n/).length,
      motivo:
        'o frontmatter abre com "---" e nunca fecha — o bloco não existe, e o ' +
        'Claude Code não lê frontmatter nenhum.',
    });
    return lacunas;
  }

  const fim = lido.fecha;

  for (const exigido of CAMPOS_EXIGIDOS) {
    const ocorrencias = camposDe(lido.campos, exigido);

    if (ocorrencias.length === 0) {
      lacunas.push({
        arquivo,
        campo: exigido,
        linha: fim,
        motivo: `o frontmatter não declara \`${exigido}\``,
      });
      continue;
    }

    if (ocorrencias.length > 1) {
      // YAML de chave repetida é inválido (o `js-yaml` lança) — e o harness
      // não registra o arquivo como ele diz.
      lacunas.push({
        arquivo,
        campo: exigido,
        linha: ocorrencias[1]!.linha,
        motivo:
          `o frontmatter declara \`${exigido}\` mais de uma vez ` +
          `(${ocorrencias.map((o) => o.linha).join(', ')}) — chave repetida é ` +
          'YAML inválido, e o harness não registra o agent como o arquivo diz.',
      });
      continue;
    }

    const campo = ocorrencias[0]!;
    if (campo.vazio) {
      lacunas.push({
        arquivo,
        campo: exigido,
        linha: campo.linha,
        motivo: `o campo \`${exigido}\` está vazio`,
      });
      continue;
    }

    if (exigido === 'name' && campo.texto !== base) {
      lacunas.push({
        arquivo,
        campo: exigido,
        linha: campo.linha,
        motivo:
          `declara \`${campo.texto}\` e o arquivo é \`${base}.md\` — o \`name\` ` +
          'tem que ser o nome do arquivo',
      });
    }
  }

  return lacunas;
}

/**
 * Os agents canônicos, e as lacunas de cada um.
 *
 * Só os `.md` da **raiz** de `.agents/agents/` são agents: um subdirectório
 * (`.agents/agents/telemetry-specialist/`) guarda material de referência, e
 * tratá-lo como agent seria acusar o que não é defeito.
 *
 * @param arquivos conteúdo injetado — só a spec usa. Sem ele, o gate lê do
 *   disco.
 */
export function auditarAgents(
  repoRoot: string,
  arquivos?: Map<string, string>,
): { lacunas: LacunaAgent[]; medidos: number } {
  const lacunas: LacunaAgent[] = [];
  let medidos = 0;

  if (arquivos !== undefined) {
    for (const [arquivo, texto] of arquivos) {
      medidos++;
      lacunas.push(...lacunasDeAgent(arquivo, texto));
    }
    return { lacunas, medidos };
  }

  const dir = path.join(repoRoot, DIR_AGENTS);
  if (!existsSync(dir)) return { lacunas, medidos };

  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    if (!entrada.isFile() || !entrada.name.endsWith('.md')) continue;
    const arquivo = path.join(DIR_AGENTS, entrada.name);
    medidos++;
    lacunas.push(...lacunasDeAgent(arquivo, readFileSync(path.join(dir, entrada.name), 'utf-8')));
  }

  return { lacunas, medidos };
}

/**
 * O gate.
 *
 * Mede a **completude do frontmatter** do agent canônico — o arquivo que o
 * harness abre.
 */
export function checkAgentFrontmatter(opts: {
  repoRoot: string;
  /** Conteúdo injetado — só a spec usa. Sem ele, o gate lê do disco. */
  arquivos?: Map<string, string>;
}): CheckResult {
  const repoRoot = path.resolve(opts.repoRoot);

  if (opts.arquivos === undefined && !existsSync(path.join(repoRoot, DIR_AGENTS))) {
    return { ok: true, errors: [], skipped: true, reason: `${DIR_AGENTS}/ não existe` };
  }

  const { lacunas, medidos } = auditarAgents(repoRoot, opts.arquivos);

  const errors = lacunas.map((l) => `${l.arquivo}:${l.linha} — ${l.motivo}`);

  const advisories: string[] = [];
  // A medição é SEMPRE anunciada — inclusive quando ela é 0. Um gate que
  // mede 0 e não diz que mediu 0 é o verde mudo: o leitor não distingue
  // "não havia agent" de "não olhei".
  advisories.push(
    `medido: ${medidos} agent(s) canônico(s) conferido(s), ${lacunas.length} lacuna(s).`,
  );
  advisories.push(
    'escopo: o frontmatter do agent CANÔNICO — o arquivo que o Claude Code lê ' +
      '(a pasta `.claude/` saiu do repo; ver ADR-0009). O frontmatter das SKILLS é ' +
      'do `check-skill-coverage`, e o roteamento dos agents é do ' +
      '`check-agent-routing-coverage`.',
  );

  return { ok: errors.length === 0, errors, advisories };
}

// Executado como CLI.
if (process.argv[1]?.endsWith('check-agent-frontmatter.ts')) {
  const r = checkAgentFrontmatter({ repoRoot: '.' });
  for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
  process.exit(r.ok ? 0 : 1);
}
