// .tooling/scripts/ci/check-teeth-registry.spec.ts
//
// pt-BR: Testes do check de RECONCILIAÇÃO do registro de dentes
// (task 3.2 do plano docs/superpowers/plans/2026-10-03-guard-classes.md).
//
// O que este check caça, em três reconciliações:
//
//   1. registro ↔ preflight — todo gate que roda tem entrada no registro, e
//      toda entrada do registro corresponde a um gate que roda.
//   2. registro → artefato — a entrada aponta para um arquivo que EXISTE.
//   3. registro ↔ roteamento — o arquivo do gate mora num diretório que
//      alguma regra de roteamento alcança.
//
// A 3 é a que morde agora. `review-routing.md` declarava
// `tooling/scripts/ci/**`, que casa 0 arquivos versionados, enquanto os
// gates moram em `.tooling/scripts/ci/**`. Um prefixo de `.` que some: a
// rota existe, o lint passa, e nenhum arquivo de CI tem revisão
// despachada. Classe 1 — a condição inalcançável.
//
// Todas as funções são PURAS: recebem markdown como string e devolvem
// veredito. Nada de disco, nada de git dentro do spec — os testes do
// comportamento real ficam no `describe('estado real do repo')`, no fim.

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkTeethRegistry,
  readRepoFiles,
  reconcileTeethRegistry,
  registryGateFiles,
  unroutedGateFiles,
  type GateRef,
} from './check-teeth-registry.js';

// ── fixtures ────────────────────────────────────────────────────────────────

const REGISTRY_WITH = (rows: string): string => `
## Registro de dentes

| Gate | Onde o dente está | Nível | Arquivo |
|---|---|---|---|
${rows}
`;

/** Matriz mínima com as duas rotas que a task 3.2 corrigiu. */
const MATRIX_OK = `
\`\`\`yaml
path_globs:
  - pattern: ".tooling/scripts/ci/**"
    reviewers: [monorepo-specialist]
  - pattern: "tooling/scripts/**"
    reviewers: [monorepo-specialist]
\`\`\`
`;

/** A matriz COMO ESTAVA: o prefixo de `.` some e a rota casa 0 arquivos. */
const MATRIX_COM_BUG = `
\`\`\`yaml
path_globs:
  - pattern: "tooling/scripts/ci/**"
    reviewers: [monorepo-specialist]
\`\`\`
`;

const GATES: GateRef[] = [
  { name: 'Cross-refs', file: '.tooling/scripts/ci/check-doc-refs.ts' },
  { name: 'archive', file: '.tooling/scripts/ci/check-archive-integrity.ts' },
  { name: 'matrix lint', file: 'tooling/scripts/lint-review-routing.ts' },
];

const TRACKED = GATES.map((g) => g.file);

// ── 1. registro ↔ preflight ─────────────────────────────────────────────────

describe('reconcileTeethRegistry — registro ↔ preflight', () => {
  it('o repo real está reconciliado', () => {
    const r = reconcileTeethRegistry({
      registeredGates: GATES,
      registryMarkdown: REGISTRY_WITH(
        '| `check-doc-refs` | spec | controle negativo | `.tooling/scripts/ci/check-doc-refs.ts` |\n' +
          '| `check-archive-integrity` | spec | **mutação** | `.tooling/scripts/ci/check-archive-integrity.ts` |\n' +
          '| `review-routing` | spec | controle negativo | `tooling/scripts/lint-review-routing.ts` |',
      ),
      matrixMarkdown: MATRIX_OK,
      trackedFiles: TRACKED,
    });
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('UM gate que roda sem entrada no registro é vermelho, e é NOMEADO', () => {
    const r = reconcileTeethRegistry({
      registeredGates: GATES,
      registryMarkdown: REGISTRY_WITH(
        '| `check-doc-refs` | spec | c.n. | `.tooling/scripts/ci/check-doc-refs.ts` |\n' +
          '| `check-archive-integrity` | spec | **mutação** | `.tooling/scripts/ci/check-archive-integrity.ts` |',
      ),
      matrixMarkdown: MATRIX_OK,
      trackedFiles: TRACKED,
    });
    expect(r.ok).toBe(false);
    // O erro tem de dizer QUAL gate — um "registro divergente" genérico
    // obriga quem lê a ir caçar, e é assim que divergência vira órfã.
    expect(r.errors.join('\n')).toContain('lint-review-routing.ts');
  });

  it('uma entrada no registro que NÃO corresponde a nenhum gate é vermelha', () => {
    const r = reconcileTeethRegistry({
      registeredGates: GATES,
      registryMarkdown: REGISTRY_WITH(
        '| `check-doc-refs` | spec | c.n. | `.tooling/scripts/ci/check-doc-refs.ts` |\n' +
          '| `check-archive-integrity` | spec | **mutação** | `.tooling/scripts/ci/check-archive-integrity.ts` |\n' +
          '| `review-routing` | spec | c.n. | `tooling/scripts/lint-review-routing.ts` |\n' +
          '| `check-fantasma` | spec | c.n. | `.tooling/scripts/ci/check-fantasma.ts` |',
      ),
      matrixMarkdown: MATRIX_OK,
      trackedFiles: TRACKED,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('check-fantasma.ts');
  });

  it('o MESMO gate em 2 entradas do preflight (eslint apps/packages) conta 1 vez', () => {
    // `check-eslint-drift` roda duas vezes no array (uma por app). Isso NÃO é
    // divergência: o registro documenta o GATE, não a invocação. Um check
    // que contasse entradas em vez de arquivos acusaria umPhantom.
    const gates: GateRef[] = [
      ...GATES,
      { name: 'eslint apps', file: '.tooling/scripts/ci/check-eslint-drift.ts' },
    ];
    const r = reconcileTeethRegistry({
      registeredGates: gates,
      registryMarkdown: REGISTRY_WITH(
        '| `check-doc-refs` | s | c.n. | `.tooling/scripts/ci/check-doc-refs.ts` |\n' +
          '| `check-archive-integrity` | s | **mutação** | `.tooling/scripts/ci/check-archive-integrity.ts` |\n' +
          '| `review-routing` | s | c.n. | `tooling/scripts/lint-review-routing.ts` |\n' +
          '| `check-eslint-drift` | s | c.n. | `.tooling/scripts/ci/check-eslint-drift.ts` |',
      ),
      matrixMarkdown: MATRIX_OK,
      trackedFiles: [...TRACKED, '.tooling/scripts/ci/check-eslint-drift.ts'],
    });
    expect(r.errors).toEqual([]);
  });
});

// ── 2. registro → artefato ──────────────────────────────────────────────────

describe('reconcileTeethRegistry — registro → artefato', () => {
  it('entrada apontando pra arquivo INEXISTENTE é vermelha', () => {
    const r = reconcileTeethRegistry({
      registeredGates: GATES,
      registryMarkdown: REGISTRY_WITH(
        '| `check-doc-refs` | s | c.n. | `.tooling/scripts/ci/check-doc-refs.ts` |\n' +
          '| `check-archive-integrity` | s | **mutação** | `.tooling/scripts/ci/check-archive-integrity.ts` |\n' +
          '| `review-routing` | s | c.n. | `tooling/scripts/lint-review-routing.ts` |\n' +
          '| `check-typo` | s | c.n. | `.tooling/scripts/ci/check-arhive-integrity.ts` |',
      ),
      matrixMarkdown: MATRIX_OK,
      trackedFiles: TRACKED,
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('check-arhive-integrity.ts');
  });
});

// ── 3. registro ↔ roteamento ────────────────────────────────────────────────

describe('unroutedGateFiles — registro ↔ roteamento', () => {
  it('a matriz COM O BUG deixa os gates de .tooling/ sem rota', () => {
    // O estado real antes da task 3.2. `tooling/scripts/ci/**` casa 0
    // arquivos versionados, e `.tooling/scripts/ci/**` — onde os gates
    // vivem — não existe como rota.
    const unrouted = unroutedGateFiles({
      gateFiles: [
        '.tooling/scripts/ci/check-doc-refs.ts',
        'tooling/scripts/lint-review-routing.ts',
      ],
      matrixMarkdown: MATRIX_COM_BUG,
    });
    expect(unrouted).toContain('.tooling/scripts/ci/check-doc-refs.ts');
  });

  it('a matriz CORRIGIDA não deixa nenhum gate sem rota', () => {
    const unrouted = unroutedGateFiles({
      gateFiles: [
        '.tooling/scripts/ci/check-doc-refs.ts',
        'tooling/scripts/lint-review-routing.ts',
      ],
      matrixMarkdown: MATRIX_OK,
    });
    expect(unrouted).toEqual([]);
  });

  it('o matcher é o do ROUTER, não uma cópia: o ponto inicial muda o resultado', () => {
    // Se este check reimplementasse glob→regex, um `*` que aqui casa tudo
    // poderia lá não casar — e o check ficaria verde sobre um roteamento
    // quebrado. A prova de que a semântica é a mesma é que os dois discordam
    // de `tooling/` vs `.tooling/` do mesmo jeito.
    const semPonto = unroutedGateFiles({
      gateFiles: ['.tooling/scripts/ci/check-doc-refs.ts'],
      matrixMarkdown: MATRIX_COM_BUG,
    });
    const comPonto = unroutedGateFiles({
      gateFiles: ['.tooling/scripts/ci/check-doc-refs.ts'],
      matrixMarkdown: MATRIX_OK,
    });
    expect(semPonto).toHaveLength(1);
    expect(comPonto).toHaveLength(0);
  });
});

// ── 4. o parse do registro ──────────────────────────────────────────────────

describe('registryGateFiles — como o registro é lido', () => {
  it('acha o path do gate mesmo que a coluna mude de lugar', () => {
    // Por que não parsear por índice de coluna: um parse posicional só
    // funciona enquanto ninguém reordenar a tabela — a classe 2 com outro
    // nome. A regra adotada é "o path do gate é o token `.ts` versionado da
    // linha", que sobrevive a mover coluna, renomear cabeçalho e reescrever
    // a descrição.
    const md = REGISTRY_WITH(
      '| `.tooling/scripts/ci/check-doc-refs.ts` | `check-doc-refs` | controle negativo | spec |\n',
    );
    expect(registryGateFiles(md)).toEqual(['.tooling/scripts/ci/check-doc-refs.ts']);
  });

  it('ignora linhas que não são da tabela de dentes', () => {
    const md = `
## Registro de dentes

| Gate | Nível | Arquivo |
|---|---|---|
| \`check-x\` | mutação | \`.tooling/scripts/ci/check-x.ts\` |

Fora da tabela, um path citado em prosa: \`.tooling/scripts/ci/check-fantasma.ts\`
`;
    expect(registryGateFiles(md)).toEqual(['.tooling/scripts/ci/check-x.ts']);
  });

  it('a seção de DÍVIDIDA não vaza para o registro, mesmo com tabela', () => {
    // `ci-defense-in-depth.md` ganhou a seção "Dívida de controles", que
    // documenta um harness que NÃO roda. Se ela usar tabela `|`, um parse que
    // não pare na primeira linha não-`|` a leria como entrada do registro — e
    // o `check-teeth-registry` passaria a acusar "entrada que não corresponde
    // a nenhum gate" por causa de uma frase honestamente escrita.
    //
    // Este teste existe porque o parse HOJE para na prosa. Se alguém um dia
    // trocar a prosa por tabela, este teste é o que avisa — e é a diferença
    // entre um documento que documenta e um documento que trava o pipeline.
    const md = `
## Registro de dentes

| Gate | Nível | Arquivo |
|---|---|---|
| \`check-x\` | mutação | \`.tooling/scripts/ci/check-x.ts\` |

## Dívida de controles

| Controle | Dono |
|---|---|
| \`.tooling/scripts/ci/turbo-redirect-differential.sh\` | nenhum |
`;
    expect(registryGateFiles(md)).toEqual(['.tooling/scripts/ci/check-x.ts']);
  });
});

// ── 5. o estado real do repo ────────────────────────────────────────────────
//
// Até aqui tudo roda com fixture sintética, o que prova a LÓGICA mas não
// prova que o check enxerga o repo. A diferença importa: um check que só
// valida fixture é verde enquanto a convenção que ele reconcilia envelhece.

describe('checkTeethRegistry — contra o repo de verdade', () => {
  it('o registro real DECLARA 9 paths — e o check reconcilia em cima deles', () => {
    // A contagem vem ANTES do veredito, e por um motivo: `unroutedGateFiles`
    // com lista vazia devolve `[]` — que é o MESMO retorno de "todos
    // roteados". Um check que só afirmasse `ok: true` passaria igual num
    // repo onde o registro sumiu por completo. Aqui o verde vem depois de um
    // 9 que não pode ser zero.
    const registryMd = readFileSync(
      join(process.cwd(), '.agents/specs/conventions/ci-defense-in-depth.md'),
      'utf8',
    );
    const found = registryGateFiles(registryMd);
    expect(found).toHaveLength(11);
    // E nenhum deles pode ser um spec — a coluna Arquivo documenta o GATE.
    expect(found.filter((f) => f.endsWith('.spec.ts'))).toEqual([]);

    const r = checkTeethRegistry();
    expect(r.ok, `check vermelho:\n${r.errors.join('\n')}`).toBe(true);
  });

  it('o gate novo NÃO é cego a arquivo untracked', () => {
    // Regressão medida: com `git ls-files` puro, um gate recém-criado morava
    // em untracked até o primeiro commit, e este check acusava o PRÓPRIO
    // arquivo de "não existe" no minuto em que era registrado no preflight.
    // Um gate que berra no primeiro uso é desligado no segundo.
    const probe = join(process.cwd(), '.tooling/scripts/ci/.teeth-probe-untracked.txt');
    writeFileSync(probe, 'sonda\n');
    try {
      expect(readRepoFiles()).toContain('.tooling/scripts/ci/.teeth-probe-untracked.txt');
    } finally {
      rmSync(probe, { force: true });
    }
  });
});
