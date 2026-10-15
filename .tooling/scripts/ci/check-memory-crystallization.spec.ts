// .tooling/scripts/ci/check-memory-crystallization.spec.ts
//
// pt-BR: Testes do gate de cristalização — o laço entre a memória que o agente
// captura DURANTE e o que o repo sabe DEPOIS.
//
// O risco que estes testes cobrem não é "a tabela está certa hoje" (isso um
// assert de igualdade prova, e é a classe que a `guard-classes` §3 chama de
// *só afirma verde*). É: **quando alguém quebra o gate, algum teste fica
// vermelho?** A prova principal é a mutação no fim do arquivo — desligar o
// veredito e ver a suíte cair.

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CheckResult } from './check-types';
import {
  checkMemoryCrystallization,
  corpusOf,
  findMissingTargets,
  findPhantomRows,
  findStaleAnchors,
  findUncovered,
  parseTriage,
  EXEMPTIONS,
  TRIAGE_FILE,
} from './check-memory-crystallization';

const CONV = '.agents/specs/conventions/retrospective-capture.md';

/** Corpo de memória com o frontmatter mínimo. */
const memoria = (type: string, extra = ''): string =>
  [
    '---',
    'name: x',
    'description: y',
    'metadata:',
    `  type: ${type}`,
    `  modified: z`,
    '---',
    '',
    extra,
  ].join('\n');

/** Repo fixture: a fonte única real da derivação + o diretório que ela mede. */
function fixture(): { repoRoot: string; memDir: string; home: string } {
  const home = mkdtempSync(join(tmpdir(), 'cristal-'));
  const repoRoot = join(home, 'repo');
  const memDir = join(home, '.claude', 'projects', '-', 'memory');
  mkdirSync(join(repoRoot, CONV.replace('/retrospective-capture.md', '')), { recursive: true });
  mkdirSync(join(repoRoot, '.tooling'), { recursive: true });
  mkdirSync(memDir, { recursive: true });
  // A linha canônica REAL, verbatim. `${HOME}` expande para o HOME do teste,
  // que é o que permite apontar a derivação para um diretório de fixture sem
  // duplicar a derivação — a fonte única é o arquivo, nunca o spec.
  writeFileSync(
    join(repoRoot, CONV),
    [
      '# Convenção',
      '',
      '## Destino canônico do result file',
      '',
      '```bash',
      'MEMORY_DIR="${HOME}/.claude/projects/-$(env -u GIT_DIR git rev-parse --show-toplevel | sed \'s|^/||;s|/|-|g\')/memory"',
      '```',
    ].join('\n'),
  );
  return { repoRoot, memDir, home };
}

const LEDGER = (linhas: string[]): string =>
  ['# Ledger', '', '| memória | disposição | alvo | âncora |', '|---|---|---|---|', ...linhas].join(
    '\n',
  );

describe('parseTriage', () => {
  it('lê as quatro células e a linha de onde veio', () => {
    const { rows, malformed } = parseTriage(
      LEDGER(['| `guard-that-fires` | `citada` | `a.md` | `gatilho` |']),
    );
    expect(malformed).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      slug: 'guard-that-fires',
      disposition: 'citada',
      target: 'a.md',
      anchor: 'gatilho',
    });
  });

  // Classe 3: um gate que varre o próprio texto que o documenta. O cabeçalho,
  // o separador e a prosa do ledger NÃO são linhas de tabela — se fossem, o
  // gate acusaria o próprio ledger no dia em que alguém o escrever.
  it('NÃO transforma o cabeçalho, o separador nem a prosa do ledger em linha', () => {
    const { rows, malformed } = parseTriage(LEDGER([]));
    expect(rows).toEqual([]);
    expect(malformed).toEqual([]);
  });

  it('recusa destinação fora do conjunto — e diz qual linha', () => {
    const { rows, malformed } = parseTriage(LEDGER(['| `x` | `inventada` | `-` | `-` |']));
    expect(rows).toEqual([]);
    expect(malformed[0]).toContain('linha 5');
    expect(malformed[0]).toContain('inventada');
  });

  // MEDIDO 2026-10-14 pelo revisor adversarial: `split('|')` cortava a âncora no
  // primeiro `|`, e a 5ª célula — quando a âncora transbordava — era jogada fora
  // em silêncio. Em markdown quem protege o `|` é o backslash; a crase não protege.
  it('o `\\|` de uma âncora NÃO divide a linha, e volta a ser `|` no valor', () => {
    const { rows, malformed } = parseTriage(
      LEDGER(['| `x` | `citada` | `a.md` | `coluna \\| valor` |']),
    );
    expect(malformed).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.anchor).toBe('coluna | valor');
  });

  // MEDIDO 2026-10-14: `if (cells.length < 4) continue` descartava a linha em
  // silêncio. Uma linha-fantasma de 3 células escapava de `findPhantomRows`
  // inteiro, e a contagem do painel ficava curta sem nenhum erro de forma.
  it('linha com menos de 4 células é erro de FORMA — não é pulada em silêncio', () => {
    const { rows, malformed } = parseTriage(
      LEDGER(['| `x` | `citada` | `a.md` |', '| `y` | `pendente` | `-` | `-` |']),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.slug).toBe('y');
    expect(malformed).toHaveLength(1);
    expect(malformed[0]).toContain('linha 5');
    expect(malformed[0]).toContain('3 célula');
  });

  // O outro lado da mesma classe: a âncora que transborda para uma 5ª célula era
  // conferida só pela metade, e a cauda — que não existe em lugar nenhum — sumia
  // sem aviso. Foi o verde falso medido: `✓` com metade da âncora inventada.
  // Regressão do falso positivo que a guarda acima produziu: a tabela-legend
  // das cinco disposições tem 2 colunas, e tratá-la como linha quebrada acusava o
  // próprio ledger. O que separa as duas é a 2ª célula — a de triagem declara uma
  // disposição válida, a legend declara uma frase.
  it('NÃO acusa a tabela-legend de 2 colunas como linha quebrada', () => {
    const { rows, malformed } = parseTriage(
      LEDGER([]).replace(
        '|---|---|---|---|',
        [
          '|---|---|---|---|',
          '| `citada` | a regra **já está escrita** num arquivo versionado. |',
          '| `pendente` | regra reutilizável que **ninguém escreveu ainda**. |',
        ].join('\n'),
      ),
    );
    expect(rows).toEqual([]);
    expect(malformed).toEqual([]);
  });

  it('linha com MAIS de 4 células é erro de forma — a cauda não some em silêncio', () => {
    const { rows, malformed } = parseTriage(
      LEDGER(['| `x` | `citada` | `a.md` | `Ferramenta (6)` | `TRECHO-QUE-NUNCA-EXISTIU` |']),
    );
    expect(rows).toEqual([]);
    expect(malformed).toHaveLength(1);
    expect(malformed[0]).toContain('5 célula');
  });
});

describe('corpusOf — as exclusões, e o verbo delas', () => {
  it('exclui o índice, os result e as reference; mantém o resto', () => {
    const { memDir } = fixture();
    writeFileSync(join(memDir, 'MEMORY.md'), memoria('project'));
    writeFileSync(join(memDir, 'b41-result.md'), memoria('project'));
    writeFileSync(join(memDir, 'externa.md'), memoria('reference'));
    writeFileSync(join(memDir, 'regra-real.md'), memoria('feedback'));
    writeFileSync(join(memDir, 'projeto-real.md'), memoria('project'));
    expect(corpusOf(memDir)).toEqual([
      'projeto-real.md'.replace('.md', ''),
      'regra-real.md'.replace('.md', ''),
    ]);
  });

  // A regressão que motiva o teste: a versão anterior do plano usava
  // `state: true`, que casa 0 dos 114 arquivos do corpus real
  // (`grep -l "^state:" <memdir>/*.md | wc -l` → 0). Um guard que nunca
  // dispara não exclui ninguém — ele só documenta uma intenção.
  it('NÃO isenta por `state: true` — o campo não existe no corpus real', () => {
    const { memDir } = fixture();
    writeFileSync(join(memDir, 'x.md'), memoria('feedback', 'state: true'));
    expect(EXEMPTIONS.some((e) => e.test('x.md', memoria('feedback', 'state: true')))).toBe(false);
    expect(corpusOf(memDir)).toEqual(['x']);
  });
});

describe('findUncovered — a evaporação', () => {
  const rows = parseTriage(LEDGER(['| `a` | `citada` | `a.md` | `x` |'])).rows;

  it('acusa a memória que ninguém decidiu', () => {
    expect(findUncovered(['a', 'b'], rows)).toEqual(['b']);
  });

  it('não acusa quando todo mundo tem linha', () => {
    expect(findUncovered(['a'], rows)).toEqual([]);
  });
});

describe('findPhantomRows — a direção inversa', () => {
  it('acusa a linha que aponta para memória que não existe', () => {
    const { rows } = parseTriage(LEDGER(['| `fantasma` | `citada` | `a.md` | `x` |']));
    expect(findPhantomRows(rows, ['outra'])).toHaveLength(1);
  });

  it('`removida` é a tombstone: a linha sobrevive à memória, e isso é permitido', () => {
    const { rows } = parseTriage(
      LEDGER(['| `ida` | `removida` | `absorvida pela convenção` | `-` |']),
    );
    expect(findPhantomRows(rows, [])).toEqual([]);
  });
});

describe('findStaleAnchors — o dente', () => {
  it('acusa a âncora que deixou de estar no arquivo citado', () => {
    const { repoRoot } = fixture();
    mkdirSync(join(repoRoot, '.agents', 'specs'), { recursive: true });
    writeFileSync(
      join(repoRoot, '.agents', 'specs', 'a.md'),
      'a regra foi reescrita por outro motivo.',
    );
    const { rows } = parseTriage(
      LEDGER(['| `x` | `citada` | `.agents/specs/a.md` | `a regra original` |']),
    );
    const achados = findStaleAnchors(repoRoot, rows);
    expect(achados).toHaveLength(1);
    expect(achados[0]).toContain('não está mais');
  });

  it('NÃO acusa quando a âncora continua lá', () => {
    const { repoRoot } = fixture();
    mkdirSync(join(repoRoot, '.agents', 'specs'), { recursive: true });
    writeFileSync(
      join(repoRoot, '.agents', 'specs', 'a.md'),
      'texto\n\n> a regra original, verbatim\n',
    );
    const { rows } = parseTriage(
      LEDGER(['| `x` | `citada` | `.agents/specs/a.md` | `a regra original` |']),
    );
    expect(findStaleAnchors(repoRoot, rows)).toEqual([]);
  });

  it('acusa `citada` sem âncora — a coluna que dá dentes não pode ser facultativa', () => {
    const { repoRoot } = fixture();
    const { rows } = parseTriage(LEDGER(['| `x` | `citada` | `qualquer.md` | `-` |']));
    expect(findStaleAnchors(repoRoot, rows)[0]).toContain('não declara âncora');
  });
});

describe('findMissingTargets', () => {
  it('acusa alvo inexistente em `citada` e em `gate`', () => {
    const { repoRoot } = fixture();
    const { rows } = parseTriage(
      LEDGER(['| `x` | `gate` | `.tooling/scripts/ci/nao-existe.ts` | `-` |']),
    );
    expect(findMissingTargets(repoRoot, rows)[0]).toContain('não existe');
  });
});

describe('checkMemoryCrystallization — integração contra a derivação real', () => {
  it('sem diretório de memória, é `skipped` COM MOTIVO — nunca um verde mudo', () => {
    const { repoRoot, home } = fixture();
    mkdirSync(join(repoRoot, TRIAGE_FILE.replace(/\/[^/]+$/, '')), { recursive: true });
    writeFileSync(join(repoRoot, TRIAGE_FILE), LEDGER([]));
    const antes = process.env.HOME;
    process.env.HOME = join(home, 'sem-memoria');
    try {
      const r = checkMemoryCrystallization({ repoRoot });
      // `ok` sozinho não distingue "verifiquei e passei" de "não havia nada
      // para verificar" — por isso o `skipped` é asseverado explicitamente.
      expect(r.skipped).toBe(true);
      expect(r.reason).toContain('ausente');
      expect(r.errors).toEqual([]);
    } finally {
      process.env.HOME = antes;
    }
  });

  it('NÃO aceita corpus isento por completo como sucesso', () => {
    const { repoRoot, memDir, home } = fixture();
    mkdirSync(join(repoRoot, '.agents', 'runs'), { recursive: true });
    writeFileSync(join(repoRoot, TRIAGE_FILE), LEDGER([]));
    // Só o índice e um result: o corpus medido fica vazio.
    writeFileSync(join(memDir, 'MEMORY.md'), memoria('project'));
    writeFileSync(join(memDir, 'b1-result.md'), memoria('project'));
    const antes = process.env.HOME;
    process.env.HOME = home;
    try {
      const r = checkMemoryCrystallization({ repoRoot });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain('isento por completo');
    } finally {
      process.env.HOME = antes;
    }
  });

  it('NÃO aceita ledger ausente, e NOMEIA o arquivo', () => {
    const { repoRoot, memDir, home } = fixture();
    writeFileSync(join(memDir, 'regra.md'), memoria('feedback'));
    const antes = process.env.HOME;
    process.env.HOME = home;
    try {
      const r = checkMemoryCrystallization({ repoRoot });
      expect(r.ok).toBe(false);
      expect(r.errors.join('\n')).toContain(TRIAGE_FILE);
    } finally {
      process.env.HOME = antes;
    }
  });

  it('mede e declara o que olhou no advisories — o verde que não diz o denominador', () => {
    const { repoRoot, memDir, home } = fixture();
    mkdirSync(join(repoRoot, '.agents', 'runs'), { recursive: true });
    writeFileSync(join(memDir, 'regra.md'), memoria('feedback'));
    writeFileSync(
      join(repoRoot, TRIAGE_FILE),
      LEDGER(['| `regra` | `recusada` | `é registro de campanha` | `-` |']),
    );
    const antes = process.env.HOME;
    process.env.HOME = home;
    try {
      const r = checkMemoryCrystallization({ repoRoot });
      expect(r.ok).toBe(true);
      expect((r.advisories ?? []).join('\n')).toContain('medido: 1 memória');
    } finally {
      process.env.HOME = antes;
    }
  });

  // Os três testes abaixo atravessam o CORPO principal do gate — os que
  // agregam `uncovered` + `phantom` + `stale` no veredito. Eles existem
  // porque os testes de cima só cobrem *early returns*: MEDIDO 2026-10-14, com
  // o veredito trocado por `ok: true` a suíte ficava 17/17 verde, porque nada
  // levava um defeito real até a linha do veredito. É a mutação que não cai
  // parecendo sucesso.
  const comDefeito = (seed: (memDir: string, target: string) => string[]): CheckResult => {
    const { repoRoot, memDir, home } = fixture();
    mkdirSync(join(repoRoot, '.agents', 'runs'), { recursive: true });
    mkdirSync(join(repoRoot, '.agents', 'specs'), { recursive: true });
    writeFileSync(join(repoRoot, '.agents', 'specs', 'alvo.md'), 'a regra original, verbatim\n');
    const linhas = seed(memDir, '.agents/specs/alvo.md');
    writeFileSync(join(repoRoot, TRIAGE_FILE), LEDGER(linhas));
    const antes = process.env.HOME;
    process.env.HOME = home;
    try {
      return checkMemoryCrystallization({ repoRoot });
    } finally {
      process.env.HOME = antes;
    }
  };

  it('VERMELHO: memória capturada que ninguém decidiu o destino', () => {
    const r = comDefeito((memDir) => {
      writeFileSync(join(memDir, 'esquecida.md'), memoria('feedback'));
      writeFileSync(join(memDir, 'decidida.md'), memoria('feedback'));
      return ['| `decidida` | `recusada` | `é registro` | `-` |'];
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('esquecida');
  });

  it('VERMELHO: linha do ledger apontando para memória que não existe', () => {
    const r = comDefeito((memDir) => {
      writeFileSync(join(memDir, 'real.md'), memoria('feedback'));
      return [
        '| `real` | `citada` | `.agents/specs/alvo.md` | `a regra original` |',
        '| `sumiu` | `citada` | `.agents/specs/alvo.md` | `a regra original` |',
      ];
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('sumiu');
  });

  it('VERMELHO: a âncora que deixou de estar no arquivo citado', () => {
    const r = comDefeito((memDir) => {
      writeFileSync(join(memDir, 'real.md'), memoria('feedback'));
      return ['| `real` | `citada` | `.agents/specs/alvo.md` | `frase que já foi reescrita` |'];
    });
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toContain('não está mais');
  });
});

/**
 * MUTAÇÃO — a prova de que este gate tem dentes.
 *
 * Troque `errors.length === 0` por `true` no veredito de
 * `checkMemoryCrystallization` e rode a suíte: ela tem de cair. Se ficar
 * verde, o gate não está medindo nada (a classe "só afirma verde" da
 * `guard-classes`). Os testes acima são a parte de prova barata; esta nota é
 * a que vale.
 *
 *   sed -i 's/ok: errors.length === 0, errors, advisories/ok: true, errors, advisories/' \
 *     .tooling/scripts/ci/check-memory-crystallization.ts
 *   npx vitest run --root .tooling/scripts/ci check-memory-crystallization
 *   # esperado: os 3 testes de integração ficam vermelhos
 *   git checkout .tooling/scripts/ci/check-memory-crystallization.ts
 */
