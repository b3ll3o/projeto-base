#!/usr/bin/env tsx
/**
 * Mede o **drift entre agent e memória** — issue #47.
 *
 * ## O defeito
 *
 * `evolucao-agents.md` declara a obrigação: *"Agents DEVEM evoluir — após uso
 * significativo, atualizar o agent **E sua memória**"*, com gatilho explícito
 * *"Após execução significativa (mudança de comportamento)"*.
 *
 * Essa obrigação é a **classe 1** da própria tabela de guard deste repo:
 * declarada em prosa, sem nenhum gate que a meça. O caso medido foi o
 * `doc-sync`, que perdeu o Passo 4 "Reportar e Bloquear" → "Reportar" e ganhou
 * um contrato report-only — a memória dele é intocada desde 2026-09-22 e
 * `grep -ciE 'report-only|auto-apply-minor' .agents/memory/doc-sync.md` → 0.
 *
 * ## Por que este gate é mais difícil do que parece
 *
 * No **mesmo commit**, outros dois agents mudaram — `nestjs-specialist` e
 * `stack-code-reviewer` — mas só corrigiram o número de `../` num path
 * relativo. Delta comportamental **zero**. Um gate que acusasse "agent
 * alterado, memória intocada" sem distinguir os dois casos marcaria os três,
 * e o autor aprenderia a atualizar memória por ruído — que é a Calibration:
 * um gate que grita em toda mudança treina o povo a ignorá-lo.
 *
 * Daí a separação em duas funções puras:
 *
 * - {@link hasBehaviorDelta} — o diff traz PROSA, ou só path?
 * - {@link findDriftedAgents} — dado o par (delta, memória tocada), quem está
 *   em drift?
 *
 * A casca de git em volta delas é fina e é o que o preflight chama; testar a
 * lógica aqui em vez de testar `execSync` é o que mantém o spec honesto.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { CheckResult } from './check-types.js';

const AGENTS_PREFIX = '.agents/agents/';
const MEMORY_PREFIX = '.agents/memory/';

/**
 * Uma linha alterada que é **só path** — corrigir `../../../docs/adr/` para
 * `../../docs/adr/` não muda o que o agent faz, e o número de `../` não é
 * comportamento. Regexes:
 *
 * - `(?:^|\s)(?:\.\.\/)*[\w.-]+(?:\/[\w.-]+)*\/` — caminho relativo com barra
 * - `` `[^`]*\/[^`]*` `` — path dentro de crase (o formato usado nos agents)
 * - `\b[\w-]+\.(?:md|ts|tsx|json|ya?ml|sh)\b` — arquivo por extensão
 *
 * Anything que sobra depois de removê-los é prosa, e prosa é comportamento.
 */
const PATH_TOKEN =
  /`[^`]*\/[^`]*`|(?:\.\.\/)+[\w.\/-]+|(?:^|[\s(])(?:\.\/)*[\w-]+\/[\w.\/-]*|[\w-]+\.(?:md|ts|tsx|json|ya?ml|sh)\b/g;

/**
 * Uma linha de frontmatter YAML (`name:`, `description:`, `title:`).
 *
 * Metadados de cabeçalho não descrevem o que o agent faz; renomear `name:` ou
 * reescrever `description:` é manutenção de índice, e o agent pode mudar de
 * nome sem mudar de comportamento (foi o que aconteceu entre `doc-sync` e
 * `doc-sync-agent`).
 */
const FRONTMATTER_KEY = /^\s*[A-Za-z_][\w-]*\s*:\s*[^:]*$/;

/**
 * O diff traz mudança de **comportamento**, ou só de path/metadado?
 *
 * Um diff é comportamento quando alguma linha adicionada/removida tem prosa
 * depois de tirados os tokens de path. O filtro é deliberadamente
 * conservador no sentido de **fazer o author pensar**: preferimos acusar um
 * path acompanhado de frase nova a perder um comportamento — mas o par de
 * testes segura os dois lados, incluindo a frase idêntica com path corrigido
 * (que NÃO é delta: a prosa não mudou, o alvo do path mudou).
 */
export function hasBehaviorDelta(diff: string): boolean {
  // O resíduo semântico: a linha sem os tokens de path e sem pontuação.
  // É o que sobra quando se pergunta "o que esta linha DIZ", ignorando aonde
  // ela aponta.
  const residueOf = (raw: string): string => {
    const line = raw.slice(1);
    // `line` já vem sem o marcador +/-; o padrão de frontmatter é testado
    // sobre ele (sem âncora de sinal), não sobre `raw`.
    if (FRONTMATTER_KEY.test(line)) return '';
    return line.replace(PATH_TOKEN, ' ').replace(/[\s`*_~|.,;:()[\]{}]/g, '');
  };

  // Diff por hunk: as linhas removidas e as adicionadas de uma mesma mudança.
  // O delta é **do par**, não da linha isolada: "Ver `../../../docs/adr/` para
  // decisões." → "Ver `../../docs/adr/` para decisões." tem resíduo IDÊNTICO
  // dos dois lados (a prosa não mudou; só o alvo do path mudou), e comparar
  // linha a linha acusaria comportamento onde só houve correção de path —
  // exatamente o falso positivo que a #47 mediu.
  const removed: string[] = [];
  const added: string[] = [];

  for (const raw of diff.split('\n')) {
    // Ignora o cabeçalho do hunk (`@@ -1,4 +1,4 @@`) e os marcadores de arquivo.
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      const r = residueOf(raw);
      if (r) added.push(r);
    } else if (raw.startsWith('-') && !raw.startsWith('---')) {
      const r = residueOf(raw);
      if (r) removed.push(r);
    }
  }

  // Adição pura (prosa que não existia) é comportamento.
  if (added.length > removed.length) return true;
  // Remoção pura (prosa que deixou de existir) é comportamento.
  if (removed.length > added.length) return true;

  // Mesma contagem: o delta é o conjunto de resíduos que mudou de valor.
  // Um par `X → X` (só o path mudou) não é delta; `X → Y` é.
  const unchanged = removed.filter((r) => added.includes(r)).length;
  return unchanged < removed.length;
}

/**
 * Quais agents estão em drift, dado o delta comportamental de cada um e quais
 * memórias foram tocadas no mesmo range.
 *
 * Um agent está em drift quando tem delta comportamental E sua memória não
 * aparece em `touchedMemories` — seja porque a memória não foi tocada, seja
 * porque não existe. O default é exigir a memória: sem arquivo não há como
 * provar que o comportamento é o mesmo, e o gate silencioso é o defeito que
 * este check combate.
 *
 * A ordem de saída é alfabética e o resultado é deduplicado, para que a
 * mensagem do gate seja estável entre execuções (uma mensagem que reordena
 * entre runs é uma mensagem que ninguém diffa).
 */
export function findDriftedAgents(
  behaviorDeltaByAgent: Record<string, boolean>,
  touchedMemories: Set<string>,
): string[] {
  return Object.entries(behaviorDeltaByAgent)
    .filter(([agent, hasDelta]) => hasDelta && !touchedMemories.has(agent))
    .map(([agent]) => agent)
    .filter((agent, i, all) => all.indexOf(agent) === i)
    .sort();
}

/**
 * O diff que o gate deve olhar: commitado **e** por commitar.
 *
 * `git diff <base>...HEAD` sozinho é cego para o que está staged ou unstaged
 * — e o gate roda no pre-commit, onde a mudança ainda NÃO é commit. Medido:
 * com a mutação real da #47 plantada e `git add`, `...HEAD` devolvia lista
 * vazia e o gate dizia "nenhum agent alterado", que é verde sobre um arquivo
 * alterado. As duas fontes são concatenadas; sobrepor linhas é inofensivo,
 * porque a única coisa que se perde é a granularidade do hunk.
 */
function diffRange(repoRoot: string, base: string): string {
  const run = (args: string[]): string => {
    try {
      return execFileSync('git', args, {
        cwd: resolve(repoRoot),
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      return '';
    }
  };
  return [
    run(['diff', '--unified=0', `${base}...HEAD`]),
    run(['diff', '--unified=0', '--cached']),
    run(['diff', '--unified=0']),
  ].join('\n');
}

/**
 * Os arquivos `.agents/agents/*.md` tocados no range, com o diff de cada um.
 *
 * Devolve `null` para o arquivo **sem** delta comportamental, e o nome para
 * os demais — assim o chamador não precisa repetir a regra.
 */
function readAgentDeltas(repoRoot: string, base: string): Record<string, boolean> {
  const deltas: Record<string, boolean> = {};
  const full = diffRange(repoRoot, base);

  // Blocos do unified diff: `diff --git a/... b/...` separa um arquivo do outro.
  for (const block of full.split(/^diff --git /m).slice(1)) {
    const pathMatch = block.match(/^a\/(\.agents\/agents\/[\w.-]+\.md)/m);
    if (!pathMatch) continue;
    const agent = pathMatch[1]!.replace(AGENTS_PREFIX, '').replace(/\.md$/, '');
    const body = block.slice(block.indexOf('\n'));
    deltas[agent] = hasBehaviorDelta(body);
  }
  return deltas;
}

/**
 * Os agents cuja memória foi tocada — commitado ou por commitar.
 *
 * Mesmo triple do {@link diffRange}: tocar a memória no índice conta tanto
 * quanto tocar num commit. Sem o `--cached` aqui, quem atualiza a memória e
 * deixa staged receberia o mesmo erro que quem não atualizou — o gate
 * medindo o commit e ignorando o trabalho na mão.
 */
function readTouchedMemories(repoRoot: string, base: string): Set<string> {
  const touched = new Set<string>();
  const run = (args: string[]): string => {
    try {
      return execFileSync('git', args, {
        cwd: resolve(repoRoot),
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch {
      return '';
    }
  };
  const outputs = [
    run(['diff', '--name-only', `${base}...HEAD`]),
    run(['diff', '--name-only', '--cached']),
    run(['diff', '--name-only']),
  ];
  for (const out of outputs) {
    for (const line of out.split('\n')) {
      if (!line.startsWith(MEMORY_PREFIX) || !line.endsWith('.md')) continue;
      touched.add(line.slice(MEMORY_PREFIX.length, -'.md'.length));
    }
  }
  return touched;
}

export async function checkAgentMemoryDrift(
  repoRoot: string,
  base = 'origin/main',
): Promise<CheckResult> {
  const deltas = readAgentDeltas(repoRoot, base);
  const agents = Object.keys(deltas);

  // Nenhum agent tocado no range → nada que medir. `skipped`, não `ok: true`
  // calado: é a mesma lição do archive (#49) e do `check-types.ts`.
  if (agents.length === 0) {
    return {
      ok: true,
      errors: [],
      skipped: true,
      reason: `nenhum agent alterado em ${base}...HEAD`,
    };
  }

  const drifted = findDriftedAgents(deltas, readTouchedMemories(repoRoot, base));

  if (drifted.length === 0) {
    return { ok: true, errors: [] };
  }

  return {
    ok: false,
    errors: drifted.map((agent) => {
      const memory = join('.agents/memory', `${agent}.md`);
      const hasMemory = existsSync(join(resolve(repoRoot), memory));
      return (
        `agent "${agent}" mudou de comportamento mas sua memória não foi atualizada — ` +
        `${hasMemory ? `atualize ${memory} (§Decisões Tomadas)` : `crie ${memory} (o arquivo não existe)`}. ` +
        `Obrigação em evolucao-agents.md: "atualizar o agent E sua memória".`
      );
    }),
  };
}
