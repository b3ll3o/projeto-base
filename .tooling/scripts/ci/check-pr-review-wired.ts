/**
 * SEM shebang, de propósito — ver `check-harness-owner.ts`.
 *
 * ## O que este check protege
 *
 * A regra de revisão de PR ([`pr-review.md`](../../.agents/specs/conventions/pr-review.md))
 * tem **dois** instrumentos, e este é o segundo: o gate que mede a regra
 * (`tooling/scripts/pr-review-gate.ts`, no CI) e o gate que mede se o
 * **processo** ainda está ligado.
 *
 * Um gate que roda e ninguém exige é a classe 1 do
 * [`guard-classes.md`](../../.agents/specs/conventions/guard-classes.md) —
 * "condição inalcançável": o `review-comment` publica um status, o merge
 * segue livre, e a regra vira prosa. O repo já mediu esse modo de falha duas
 * vezes: o `review-router` emitia 9 reviewers para um `console.log`, e o
 * `pr-refresh` rodava sem marcador e escrevia nada.
 *
 * ## O que ele mede, item por item
 *
 * 1. o workflow `.github/workflows/pr-review.yml` **existe**;
 * 2. ele escuta `pull_request_review` — sem esse evento, publicar a revisão
 *    **não redesperta** o gate, e ele fica vermelho para sempre (um gate que
 *    nunca fica verde é um gate desligado com outro nome);
 * 3. ele **invoca** o gate (`pr:review-check` ou `pr-review-gate`);
 * 4. o script `pr:review-check` existe no `package.json` e aponta para o
 *    arquivo do gate — o path digitado errado é a forma mais barata de um
 *    gate deixar de existir;
 * 5. a convenção existe e está indexada nos **DOIS** índices
 *    (`.agents/specs/conventions/README.md` **e** `AGENTS.md` §6) — convenção
 *    ausente de índice é convenção que ninguém lê;
 * 6. o doc do workflow existe e está listado em `.agents/WORKFLOWS.md`.
 *
 * ## O que ele NÃO mede
 *
 * O `required_status_check` do ruleset — isso vive **fora** do repo (API do
 * GitHub) e nenhum `git ls-files` alcança. O gate mede o que o repo
 * declara; se alguém tirar o check do ruleset, o instrumento **dente** que
 * denuncia é o `gh api` do ruleset, não este arquivo.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jobsDoWorkflow } from './check-ci-prisma-client-ready.js';
import type { CheckResult } from './check-types';
import { linhasDoRelato } from './check-types';

/** Os caminhos que este check lê, relativos à raiz do repo. */
export const ARQUIVOS = {
  workflow: '.github/workflows/pr-review.yml',
  packageJson: 'package.json',
  convencao: '.agents/specs/conventions/pr-review.md',
  indiceConvencoes: '.agents/specs/conventions/README.md',
  agentsMd: 'AGENTS.md',
  workflowDoc: '.agents/workflows/pr-review-mode.md',
  indiceWorkflows: '.agents/WORKFLOWS.md',
} as const;

/** O script do `package.json` que roda o gate. */
export const SCRIPT_DO_GATE = 'pr:review-check';

/** O arquivo que o script roda. */
export const ARQUIVO_DO_GATE = 'tooling/scripts/pr-review-gate.ts';

/**
 * As entradas do veredito — **conteúdo**, não path.
 *
 * Pura de propósito: o spec exercita a decisão com markdown quebrado plantado
 * aqui, sem tocar o repo. Um check que lê do disco só se exercita contra o
 * disco, e o disco tem UM estado — o teste passa e a mutação não aparece.
 */
export interface Entradas {
  workflow?: string | undefined;
  packageJson?: string | undefined;
  convencao?: string | undefined;
  indiceConvencoes?: string | undefined;
  agentsMd?: string | undefined;
  workflowDoc?: string | undefined;
  indiceWorkflows?: string | undefined;
}

/** O `package.json` da raiz, já parseado. */
export function scriptsDoPackage(conteudo: string | undefined): Record<string, string> {
  if (conteudo === undefined) return {};
  try {
    const pkg = JSON.parse(conteudo) as { scripts?: Record<string, string> };
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

/**
 * Os **eventos** que o workflow escuta.
 *
 * Parser textual de propósito: o repo não tem parser de YAML na camada do
 * preflight (`yaml` está no `tooling/scripts`, que roda em outro contexto),
 * e um gate que precisa de uma dependência que o próprio gate pode não ter é
 * um gate que falha por motivo errado — o mesmo argumento de
 * `check-ci-prisma-client-ready.ts`.
 *
 * ## O bug que este parser conserta
 *
 * A primeira versão deste gate procurava `pull_request_review` com um
 * **regex no arquivo inteiro** — e o próprio cabeçalho do workflow menciona
 * o evento numa linha de comentário. MEDIDO 2026-11-17: com o
 * `pull_request_review` **removido** do `on:`, o gate continuava **verde**
 * (exit 0). Era a classe 3 do `guard-classes.md` — "guard que dispara em si
 * mesmo" — e a mutação foi o que a revelou.
 *
 * A regra: o bloco `on:` começa na linha `on:` e vai até a primeira linha de
 * indentação **0**; dentro dele, as chaves de **indentação 2** são os
 * eventos. **Linha de comentário nunca conta** — em qualquer indentação.
 */
export function eventosDoWorkflow(conteudo: string): string[] {
  const eventos: string[] = [];
  let dentroDoOn = false;

  for (const linha of conteudo.split('\n')) {
    // O comentário é do YAML, não do gate: ele nunca declara um evento.
    if (/^\s*#/.test(linha)) continue;

    if (!dentroDoOn) {
      if (/^on:\s*(#.*)?$/.test(linha)) dentroDoOn = true;
      continue;
    }

    const chave = linha.match(/^ {2}([A-Za-z0-9_-]+):/);
    if (chave) {
      eventos.push(chave[1]!);
      continue;
    }

    // Fim do bloco `on:` — a próxima chave de nível superior.
    const indentacao = linha.match(/^ */)?.[0].length ?? 0;
    if (linha.trim() !== '' && indentacao < 2) break;
  }

  return eventos;
}

/**
 * Os **comandos** que o workflow roda.
 *
 * Delega ao parser que já existe (`jobsDoWorkflow`, de
 * `check-ci-prisma-client-ready.ts`): é o mesmo conhecimento — "quais
 * comandos este workflow executa" — e ele **tem** um dono. Um segundo parser
 * aqui criaria duas semânticas de "rodado" no mesmo repo.
 */
export function comandosDoWorkflow(conteudo: string): string[] {
  return jobsDoWorkflow(conteudo, ARQUIVOS.workflow).flatMap((j) => j.comandos);
}

/**
 * O veredito.
 *
 * Cada item ausente é um erro **nomeado** — "qualquer um" não é uma
 * mensagem que mande alguém ao conserto.
 */
export function verificarLigacao(e: Entradas): CheckResult {
  const errors: string[] = [];

  // (1) e (2) e (3) — o workflow.
  if (e.workflow === undefined) {
    errors.push(
      `${ARQUIVOS.workflow} não existe — o gate da regra de revisão de PR não ` +
        `roda em lugar nenhum, e a regra vira prosa.`,
    );
  } else {
    if (!eventosDoWorkflow(e.workflow).includes('pull_request_review')) {
      errors.push(
        `${ARQUIVOS.workflow} não escuta \`pull_request_review\`: publicar a ` +
          `revisão não redesperta o gate, e ele fica vermelho para sempre.`,
      );
    }
    const comandos = comandosDoWorkflow(e.workflow);
    const invoca = comandos.some((c) => c.includes(SCRIPT_DO_GATE) || c.includes('pr-review-gate'));
    if (!invoca) {
      errors.push(
        `${ARQUIVOS.workflow} não invoca o gate — nenhum passo do job roda ` +
          `\`${SCRIPT_DO_GATE}\` nem \`pr-review-gate\`.`,
      );
    }
  }

  // (4) — o script.
  const scripts = scriptsDoPackage(e.packageJson);
  const comando = scripts[SCRIPT_DO_GATE];
  if (comando === undefined) {
    errors.push(
      `package.json não declara o script \`${SCRIPT_DO_GATE}\` — o gate não tem ` +
        `caminho de invocação.`,
    );
  } else if (!comando.includes(ARQUIVO_DO_GATE)) {
    errors.push(
      `package.json#scripts.${SCRIPT_DO_GATE} não aponta para ${ARQUIVO_DO_GATE} — ` +
        `o path digitado é a forma mais barata de um gate deixar de existir.`,
    );
  }

  // (5) — a convenção e os DOIS índices.
  if (e.convencao === undefined) {
    errors.push(`${ARQUIVOS.convencao} não existe — a regra não tem dono.`);
  }
  if (e.indiceConvencoes === undefined || !e.indiceConvencoes.includes('pr-review.md')) {
    errors.push(
      `${ARQUIVOS.indiceConvencoes} não cita \`pr-review.md\` — convenção ausente ` +
        `de índice é convenção que ninguém lê.`,
    );
  }
  if (e.agentsMd === undefined || !e.agentsMd.includes('pr-review.md')) {
    errors.push(
      `${ARQUIVOS.agentsMd} não cita \`pr-review.md\` — o §6 do AGENTS.md e o ` +
        `README das convenções são O MESMO índice, e os dois precisam da linha.`,
    );
  }

  // (6) — o doc do workflow.
  if (e.workflowDoc === undefined) {
    errors.push(`${ARQUIVOS.workflowDoc} não existe — o processo não tem passo a passo.`);
  }
  if (e.indiceWorkflows === undefined || !e.indiceWorkflows.includes('pr-review-mode')) {
    errors.push(
      `${ARQUIVOS.indiceWorkflows} não cita \`pr-review-mode\` — workflow ausente ` +
        `de índice é workflow que ninguém dispara.`,
    );
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Lê as entradas do repo.
 *
 * Um arquivo ilegível vira `undefined` — que o veredito acusa pelo nome do
 * path. Um arquivo vazio (presente, sem conteúdo) é lido como string vazia:
 * "o arquivo existe e não diz nada" é um estado diferente de "o arquivo não
 * existe", e o veredito trata os dois.
 */
export function lerEntradas(repoRoot: string): Entradas {
  const ler = (relativo: string): string | undefined => {
    try {
      return readFileSync(join(repoRoot, relativo), 'utf8');
    } catch {
      return undefined;
    }
  };
  return {
    workflow: ler(ARQUIVOS.workflow),
    packageJson: ler(ARQUIVOS.packageJson),
    convencao: ler(ARQUIVOS.convencao),
    indiceConvencoes: ler(ARQUIVOS.indiceConvencoes),
    agentsMd: ler(ARQUIVOS.agentsMd),
    workflowDoc: ler(ARQUIVOS.workflowDoc),
    indiceWorkflows: ler(ARQUIVOS.indiceWorkflows),
  };
}

export function checkPrReviewWired(opts: { repoRoot?: string } = {}): CheckResult {
  const repoRoot = opts.repoRoot ?? process.cwd();
  return verificarLigacao(lerEntradas(repoRoot));
}

if (process.argv[1]?.endsWith('check-pr-review-wired.ts')) {
  const r = checkPrReviewWired();
  for (const linha of linhasDoRelato(r)) process.stderr.write(`${linha}\n`);
  process.exit(r.ok ? 0 : 1);
}
