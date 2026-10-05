#!/usr/bin/env tsx
/**
 * Detecta a **classe 3** — o guard que dispara em si mesmo — entre os guards
 * que carregam uma isenção de auto-referência.
 *
 * Task 3.3 do plano docs/superpowers/plans/2026-10-03-guard-classes.md.
 *
 * ## O problema, com o caso concreto
 *
 * O `check-memory-dir-concordance` procura o símbolo `memory-dir`. O PRÓPRIO
 * NOME dele — `check-memory-dir-concordance` — contém esse símbolo. Então
 * qualquer `.md` que o cite pelo nome seria acusado de "re-declarar o destino
 * em notação divergente", que é mentira: aquele `.md` não está declarando
 * nada, está documentando o guard.
 *
 * A inconsistência tem dois jeitos de sair, e os dois são ruins:
 *
 * - **Não isentar** → o guard acusa a si mesmo em todo documento que o cita.
 *   Aí ninguém cita o guard, a convenção perde a única forma de dizer de
 *   onde ele veio, e o próximo autor redisobre a convenção que o documento
 *   deletado levava. O guard empurra quem escreve a contornar o nome — e um
 *   guard contornado é um guard desligado com outra forma.
 * - **Isentar por arquivo/diretório** → o mesmo efeito, mais largo e menos
 *   auditável: agora é um allowlist, e ninguém sabe dizer, olhando o diff,
 *   o que aquele allowlist está engolindo.
 *
 * A saída que o repo tomou é a **mecânica**: `stripSelfName` remove a
 * ocorrência exata do nome antes de casar os padrões. Separação mecânica
 * (ou a ocorrência É o nome, ou não é) e não julgamento.
 *
 * ## Por que isto é um DIFERENCIAL, e não uma asserção
 *
 * O guard hoje está verde. Um check que afirmasse "o guard está verde" não
 * distinguiria "isente corretamente" de "isente à toa" — e o segundo estado
 * é o que degrada em silêncio, quando alguém tighten um padrão.
 *
 * O que separa os dois é o **diferencial**: as mesmas linhas, aplicadas com
 * e sem a isenção.
 *
 * - `0 → 0`: a isenção não protege nada. É código morto, e a próxima mudança
 *   de padrão a torna num `catch` que engole o que vier. (classe 1)
 * - `N → 0` com N > 0: a isenção está pagando pelo trabalho que diz pagar.
 * - `N → M` com M > 0: a isenção cobre alguns padrões e não outros — o guard
 *   se acusa mesmo tendo o strip. (classe 3 de verdade)
 *
 * ## Os três arms
 *
 * 1. **Inerte** — `wouldFire` vazio. A isenção não protege nada.
 * 2. **Ainda dispara** — `stillFires` não vazio. O strip não cobre tudo.
 * 3. **Isentado sem o nome** — a linha não mudou com o strip, então quem a
 *    isentou foi outra coisa: um allowlist de arquivo, um skip de diretório.
 *    A razão "é o meu próprio comentário" nunca é uma razão; é o sintoma.
 *
 * ## A lista declarada, e por que ela é verificada
 *
 * Um guard com auto-isenção que não está na lista abaixo é erro. Sem essa
 * checagem, o próximo autor escreve a própria isenção e o check passa calado
 * sobre ela — que é a forma deste arquivo mais fácil de acontecer: um
 * check que só enxerga os guards que alguém catalogou.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  DECLARATION_PATTERNS,
  SELF_EXEMPTION,
  sweptCorpus,
} from './check-memory-dir-concordance.js';
import type { CheckResult } from './check-types';

export interface CorpusLine {
  file: string;
  line: number;
  text: string;
}

export interface SelfExemptingGuard {
  /** Identidade do guard — precisa casar com o final do `sourceFile`. */
  id: string;
  /** A string exata que a isenção remove. */
  selfName: string;
  /**
   * A função de isenção DO PRÓPRIO GUARD, não uma reimplementação dela.
   *
   * A primeira versão do check aplicava `line.replaceAll(selfName, '')` aqui
   * dentro. O efeito: o check media a isenção que ele imaginava, e não a que
   * existe. Neutralizar a `stripSelfName` do guard — o próprio defeito que o
   * check existe para caçar — deixava tudo verde, porque o check nem chamava
   * a função que alguém tinha removido. É a classe 2 com o nome mais caro:
   * um check que só descreve a forma que ele conhece.
   */
  strip: (line: string) => string;
  /** Onde o guard mora, repo-relative. */
  sourceFile: string;
  /** Os padrões que o guard casa sobre o corpus. */
  patterns: Array<{ pattern: RegExp; reason: string }>;
  /** As linhas que o guard varre. */
  corpus: CorpusLine[];
}

export interface Hit extends CorpusLine {
  reason: string;
}

export interface Differential {
  /** Disparam SEM a isenção. Se vazio, a isenção é inerte. */
  wouldFire: Hit[];
  /** Disparam COM a isenção mas são isentos — o strip funcionou nelas. */
  exempted: Hit[];
  /** Disparam COM a isenção. > 0 = o strip não cobre tudo. */
  stillFires: Hit[];
  /** Isentas, mas o strip não alterou a linha: isentas por outro motivo. */
  exemptedWithoutSelfName: Hit[];
  /** `wouldFire` vazio — a isenção não protege nada (classe 1). */
  inertExemption: boolean;
}

function firstMatch(
  patterns: Array<{ pattern: RegExp; reason: string }>,
  text: string,
): Hit['reason'] | null {
  for (const { pattern, reason } of patterns) {
    // `lastIndex` só importa em regex `g`; nenhum padrão aqui é, mas o reset
    // protege contra alguém declarar um `/g` no futuro e o resultado passar a
    // depender da ordem de chamada.
    pattern.lastIndex = 0;
    if (pattern.test(text)) return reason;
  }
  return null;
}

/**
 * Aplica os dois braços do diferencial sobre o mesmo corpus.
 *
 * As funções são PURAS: recebem linhas, devolvem hits. O disco fica no
 * `checkSelfFiringGuards`, e assim o diferencial é testável sem repo — o que
 * importa, porque um check que só roda contra o repo real só tem um estado
 * observável: verde ou vermelho.
 */
export function selfExemptionDifferential(guard: SelfExemptingGuard): Differential {
  const wouldFire: Hit[] = [];
  const exempted: Hit[] = [];
  const stillFires: Hit[] = [];
  const exemptedWithoutSelfName: Hit[] = [];

  for (const line of guard.corpus) {
    const stripped = guard.strip(line.text);

    const reasonBruto = firstMatch(guard.patterns, line.text);
    const reasonLimpo = firstMatch(guard.patterns, stripped);

    if (reasonBruto !== null) {
      wouldFire.push({ ...line, reason: reasonBruto });
      if (reasonLimpo === null) {
        exempted.push({ ...line, reason: reasonBruto });
        // A isenção só vale se foi o NOME que isentou. Se a linha não mudou
        // com o strip, quem a deixou passar é outra regra — e é essa regra
        // invisível que este arm existe para expor.
        if (stripped === line.text) {
          exemptedWithoutSelfName.push({ ...line, reason: reasonBruto });
        }
      }
    }

    if (reasonLimpo !== null) {
      stillFires.push({ ...line, reason: reasonLimpo });
    }
  }

  return {
    wouldFire,
    exempted,
    stillFires,
    exemptedWithoutSelfName,
    inertExemption: wouldFire.length === 0,
  };
}

/**
 * Guards com auto-isenção que ninguém catalogou.
 *
 * Esta é a defence contra o check ficar cego por construção: a lista de
 * guards auditados é uma lista escrita à mão, e uma lista escrita à mão
 * envelhece exatamente no cenário em que é necessária — alguém cria o
 * segundo guard da classe e não o acrescenta aqui.
 *
 * ## O marcador é uma DECLARAÇÃO em CÓDIGO, não uma menção
 *
 * Casa `const SELF_NAME = …` — um binding. Este arquivo menciona
 * `stripSelfName` e `SELF_EXEMPTION` o tempo todo porque os IMPORTA para
 * medir, e na primeira versão o detector se acusou por isso: um check que
 * dispara em si mesmo na primeira execução, e por um motivo que — confundida
 * uma vez — é indistinguível do defeito que ele caça.
 *
 * A segunda versão continuava se accusando, agora por causa do PRÓPRIO
 * docstring desta seção, que contém o marcador num code span. Ou seja: escrevi
 * um check contra a classe 3 e committei a classe 3, duas vezes, por caminhos
 * que o texto sobre a classe 3 descrevia e nenhum detector pegava. É a razão
 * de o filtro ser o que é: **o comentário que documenta o guard não pode ser
 * o que faz o guard disparar** — nem aqui, nem no guard que este detector
 * audita.
 *
 * Daí `stripComments` antes do casamento: a distinção entre "declara uma
 * auto-isenção" e "fala sobre uma" é mecânica (o token está fora de
 * comentário), não depende de julgamento. É a mesma disciplina que o
 * `stripSelfName` aplica no guard auditado — e pelo mesmo motivo: uma isenção
 * que exige que todo mundo leia o diff para justificar é uma isenção por opinião.
 *
 * A distinção final é estrutural, e não uma isenção deste arquivo na lista: o
 * detector não tem nome próprio a isentar. Ele não varre corpus nenhum em
 * que o próprio nome apareça; ele é o auditor, não um guard. Listá-lo aqui
 * seria fabricar um membro da classe 3 para o check ter o que auditar.
 */
const SELF_EXEMPTION_DECLARATION = /(?:const|let|var)\s+SELF_NAME\s*[:=]/;

/**
 * Remove comentários de linha e de bloco.
 *
 * Limitação conhecida e aceita: não entende strings, então um `//` dentro de
 * uma string trunca a linha. Para este fim o efeito é sempre na direção
 * segura — a linha é encurtada, e um marcador que sumisse faria este check
 * CALAR, não gritar. Um detector que cala é o pior defeito possível aqui, e
 * por isso a limitação está escrita em vez de escondida atrás de um parser.
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

export function undeclaredSelfExemptingGuards(params: {
  sourceFiles: string[];
  sourceTexts: Record<string, string>;
  /** Paths repo-relative dos guards já catalogados (não ids). */
  declaredFiles: string[];
}): string[] {
  const declared = new Set(params.declaredFiles);
  return params.sourceFiles.filter(
    (f) =>
      !declared.has(f) &&
      SELF_EXEMPTION_DECLARATION.test(stripComments(params.sourceTexts[f] ?? '')),
  );
}

// ── Camada 1: o repo de verdade ────────────────────────────────────────────

const GUARDS_DIR = join(process.cwd(), '.tooling/scripts/ci');

/**
 * Os guards que usam auto-isenção, com o motivo de cada um estar aqui.
 *
 * A entrada é necessária — e vai crescer. Um guard novo desta classe sem
 * linha nesta tabela é o que `undeclaredSelfExemptingGuards` acusa.
 */
const DECLARED: Array<{ id: string; why: string }> = [
  {
    id: 'check-memory-dir-concordance',
    why:
      'o nome contém `memory-dir`, o símbolo que o guard procura; citar o ' +
      'guard em qualquer `.md` varrido o faria se acusar (medido: 6 linhas)',
  },
];

export const DECLARED_IDS: string[] = DECLARED.map((d) => d.id);

function buildGuard(id: string): SelfExemptingGuard {
  return {
    id,
    selfName: SELF_EXEMPTION.name,
    // A função real, importada. Ver o campo `strip` da interface: o check
    // que reimplementa a isenção mede a isenção que ele inventou.
    strip: SELF_EXEMPTION.strip,
    sourceFile: `.tooling/scripts/ci/${id}.ts`,
    patterns: DECLARATION_PATTERNS,
    corpus: sweptCorpus(process.cwd()),
  };
}

function readGuardSources(): { sourceFiles: string[]; sourceTexts: Record<string, string> } {
  const sourceFiles: string[] = [];
  const sourceTexts: Record<string, string> = {};
  for (const entry of readdirSync(GUARDS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    if (entry.name.endsWith('.spec.ts')) continue;
    const rel = `.tooling/scripts/ci/${entry.name}`;
    sourceFiles.push(rel);
    sourceTexts[rel] = readFileSync(join(GUARDS_DIR, entry.name), 'utf8');
  }
  return { sourceFiles, sourceTexts };
}

export function checkSelfFiringGuards(): CheckResult {
  const errors: string[] = [];

  for (const { id, why } of DECLARED) {
    const d = selfExemptionDifferential(buildGuard(id));

    if (d.inertExemption) {
      errors.push(
        `isenção INERTE em ${id}: nenhuma linha do corpus casaria sem ela. ` +
          `O mecanismo está de enfeite — na próxima mudança de padrão vira um ` +
          `catch que engole o que vier. Motivo declarado: ${why}`,
      );
    }

    for (const h of d.stillFires) {
      errors.push(
        `${id} dispara em si mesmo em ${h.file}:${h.line} — a remoção do ` +
          `próprio nome não cobriu este padrão: ${h.reason}`,
      );
    }

    for (const h of d.exemptedWithoutSelfName) {
      errors.push(
        `${id} isenta ${h.file}:${h.line} sem que o nome do guard esteja na ` +
          `linha — algo além da auto-isenção está engolindo isto, e ` +
          `"é o meu próprio comentário" não é uma razão`,
      );
    }
  }

  const { sourceFiles, sourceTexts } = readGuardSources();
  const declaredFiles = new Set(
    DECLARED.map((d) => d.sourceFile ?? `.tooling/scripts/ci/${d.id}.ts`),
  );
  for (const f of undeclaredSelfExemptingGuards({ sourceFiles, sourceTexts, declaredFiles })) {
    errors.push(
      `guard com auto-isenção não declarado: ${f} — declare-o na ` +
        `DECLARED de check-self-firing-guard.ts, com o motivo. Sem isso este ` +
        `check passa calado sobre um guard que ele não sabe auditar`,
    );
  }

  return { ok: errors.length === 0, errors };
}

if (process.argv[1]?.endsWith('check-self-firing-guard.ts')) {
  const r = checkSelfFiringGuards();
  for (const e of r.errors) process.stderr.write(`${e}\n`);
  process.exit(r.ok ? 0 : 1);
}
