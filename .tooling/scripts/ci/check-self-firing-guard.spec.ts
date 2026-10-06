// .tooling/scripts/ci/check-self-firing-guard.spec.ts
//
// pt-BR: Testes do check da CLASSE 3 — "dispara em si mesmo"
// (task 3.3 do plano docs/superpowers/plans/2026-10-03-guard-classes.md).
//
// A pergunta que este check responde NÃO é "o guard está verde?". É:
//
//   > A isenção que impede o guard de disparar na própria documentação
//   > está pagando trabalho, ou é enfeite?
//
// Um guard com isenção que não protege nada tem dois destinos possíveis, e
// os dois são ruins: ou alguém tighten o padrão e o guard começa a acusar a
// si mesmo, ou ninguém percebe e a isenção vira um `catch` que engole
// qualquer coisa. Verde não distingue os dois.

import { describe, expect, it } from 'vitest';
import {
  DECLARED_IDS,
  checkSelfFiringGuards,
  selfExemptionDifferential,
  undeclaredSelfExemptingGuards,
  type SelfExemptingGuard,
} from './check-self-firing-guard.js';
import {
  DECLARATION_PATTERNS,
  SELF_EXEMPTION,
  sweptCorpus,
} from './check-memory-dir-concordance.js';

// ── fixture ─────────────────────────────────────────────────────────────────
//
// Um guard mínimo, com o corpo real da classe 3: o nome do guard CONTÉM o
// token que ele procura (`memory-dir` dentro de `check-memory-dir-concordance`),
// então citá-lo num `.md` faria o guard se acusar.

const NOME = 'check-memory-dir-concordance';
const PADRAO = /memory-dir/;

const GUARD: SelfExemptingGuard = {
  id: NOME,
  selfName: NOME,
  strip: (l) => l.replaceAll(NOME, ''),
  sourceFile: `.tooling/scripts/ci/${NOME}.ts`,
  patterns: [{ pattern: PADRAO, reason: 'usa o símbolo `memory-dir`' }],
  corpus: [
    {
      file: '.agents/specs/conventions/guard-classes.md',
      line: 73,
      text: `o \`${NOME}\` exclui runs`,
    },
    { file: '.agents/specs/conventions/outra.md', line: 4, text: 'nada aqui' },
  ],
};

const comLinha = (
  extra: Array<{ file: string; line: number; text: string }>,
): SelfExemptingGuard => ({ ...GUARD, corpus: [...GUARD.corpus, ...extra] });

// ── o diferencial ───────────────────────────────────────────────────────────

describe('selfExemptionDifferential', () => {
  it('a isenção é CARGA: sem ela o guard dispara, com ela não', () => {
    const d = selfExemptionDifferential(GUARD);
    // Esta é a propriedade com dentes. Um `0 → 0` significaria que a
    // isenção não protege nada e o mecanismo é inerte.
    expect(d.wouldFire.length).toBe(1);
    expect(d.wouldFire[0]).toMatchObject({
      file: '.agents/specs/conventions/guard-classes.md',
      line: 73,
    });
    expect(d.exempted.length).toBe(1);
    expect(d.stillFires).toEqual([]);
  });

  it('toda linha isenta é isenta PELO NOME — a razão não pode ser outra', () => {
    // Se uma linha é isenta e o strip do nome não alterou nada nela, então
    // algo a mais está isentando: um allowlist de arquivo, um skip de
    // diretório, um `continue` solto. Isso é a classe 3 disfarçada de
    // configuração — e a razão "é meu próprio comentário" nunca é uma razão.
    const d = selfExemptionDifferential(
      comLinha([
        { file: '.agents/specs/conventions/x.md', line: 9, text: 'isento por outro motivo' },
      ]),
    );
    expect(d.exemptedWithoutSelfName.length).toBe(0); // o nome não está na linha: NÃO é isenta
  });

  it('uma linha que casa o padrão mas NÃO cita o guard continua disparam', () => {
    const g = comLinha([
      {
        file: '.agents/specs/conventions/real.md',
        line: 2,
        text: 'o símbolo `memory-dir` em prosa',
      },
    ]);
    const d = selfExemptionDifferential(g);
    expect(d.stillFires.map((h) => h.line)).toEqual([2]);
    expect(d.stillFires[0]?.reason).toContain('memory-dir');
  });
});

// ── o veredito ──────────────────────────────────────────────────────────────

describe('selfExemptionDifferential — os três Arms', () => {
  it('ARM 1: isenção que não protege nada é vermelha (a condição inalcançável)', () => {
    // Corpus que não cita o guard: sem a isenção também não dispararia.
    // A isenção é código morto, e código morto de guarda é a classe 1.
    const g: SelfExemptingGuard = { ...GUARD, corpus: [{ file: 'a.md', line: 1, text: 'nada' }] };
    const d = selfExemptionDifferential(g);
    expect(d.wouldFire).toEqual([]);
    expect(d.inertExemption).toBe(true);
  });

  it('ARM 2: exemption presente mas o guard ainda dispara = a isenção falhou', () => {
    // Uma linha que cita o guard E viola um padrão por conta própria. O strip
    // remove o nome — mas não remove a violação, que estava em outra parte da
    // linha. A isenção não pode ser "a linha cita o guard", tem de ser "o
    // que casou era o nome"; senão ela engole a divergência de verdade que
    // estava na mesma linha.
    //
    // (A primeira versão deste teste usou um padrão `/concordance/`, que
    // também não sobrevive ao strip porque `concordance` faz parte do nome —
    // o fixture provava o oposto do que dizia provar.)
    const g = comLinha([
      {
        file: '.agents/specs/conventions/misto.md',
        line: 12,
        text: `o \`${NOME}\` e o símbolo \`memory-dir\``,
      },
    ]);
    const d = selfExemptionDifferential(g);
    expect(d.stillFires.map((h) => h.line)).toEqual([12]);
    // E ela NÃO entra em `exempted` — a linha é simultaneously isenta
    // (pelo nome) e→「dispara」、 e é por isso que os dois conjuntos existem
    // separados em vez de um só.
    expect(d.exempted.some((h) => h.line === 12)).toBe(false);
  });
});

// ── a lista declarada ───────────────────────────────────────────────────────

describe('undeclaredSelfExemptingGuards', () => {
  it('um guard com auto-isenção que NÃO está declarado é vermelho e nomeado', () => {
    const fontes = [`.tooling/scripts/ci/${NOME}.ts`, '.tooling/scripts/ci/check-novo.ts'];
    const achados = undeclaredSelfExemptingGuards({
      sourceFiles: fontes,
      sourceTexts: {
        [fontes[0]!]: 'const SELF_NAME = "check-memory-dir-concordance";',
        [fontes[1]!]: 'const SELF_NAME = "check-novo";\nfunction stripSelfName(l){return l}',
      },
      declaredFiles: [`.tooling/scripts/ci/${NOME}.ts`],
    });
    expect(achados).toEqual(['.tooling/scripts/ci/check-novo.ts']);
  });

  it('um guard declarado não aparece — a lista não acusaria a si mesma', () => {
    const f = `.tooling/scripts/ci/${NOME}.ts`;
    expect(
      undeclaredSelfExemptingGuards({
        sourceFiles: [f],
        sourceTexts: { [f]: 'const SELF_NAME = "check-memory-dir-concordance";' },
        declaredFiles: [`.tooling/scripts/ci/${NOME}.ts`],
      }),
    ).toEqual([]);
  });

  it('um guard que NÃO se isenta não entra na lista', () => {
    const f = '.tooling/scripts/ci/check-normal.ts';
    expect(
      undeclaredSelfExemptingGuards({
        sourceFiles: [f],
        sourceTexts: { [f]: 'export function checkNormal() { return { ok: true }; }' },
        declaredFiles: [],
      }),
    ).toEqual([]);
  });
});

// ── o estado real do repo ───────────────────────────────────────────────────

describe('checkSelfFiringGuards — contra o repo de verdade', () => {
  it('o diferencial real é NÃO NULO: N → 0 com N > 0', () => {
    // Sem esta asserção, `EXIT=0` do check é indistinguível de um
    // `0 → 0` — a isenção inerte, que é exatamente o defeito que este
    // arquivo existe para achar. Um check que passa por não haver nada
    // para passar é o pior tipo: ele informa que a classe 3 está
    // resolvida, e não há nada resolvido.
    expect(DECLARED_IDS.length).toBeGreaterThan(0);
    const corpus = sweptCorpus(process.cwd());
    expect(corpus.length, 'corpus vazio = nada medido').toBeGreaterThan(100);

    for (const id of DECLARED_IDS) {
      const d = selfExemptionDifferential({
        id,
        selfName: SELF_EXEMPTION.name,
        strip: SELF_EXEMPTION.strip,
        sourceFile: `.tooling/scripts/ci/${id}.ts`,
        patterns: DECLARATION_PATTERNS,
        corpus,
      });
      expect(d.inertExemption, `${id}: a isenção não protege nada`).toBe(false);
      expect(
        d.wouldFire.length,
        `${id}: sem a isenção, ${d.wouldFire.length} linhas disparariam`,
      ).toBeGreaterThan(0);
      expect(d.stillFires, `${id} ainda dispara em si mesmo`).toEqual([]);
      expect(d.exemptedWithoutSelfName, `${id} isenta por motivo não-mecânico`).toEqual([]);
    }
  });

  it('o check do repo real está verde', () => {
    const r = checkSelfFiringGuards();
    expect(r.ok, `check vermelho:\n${r.errors.join('\n')}`).toBe(true);
  });
});
