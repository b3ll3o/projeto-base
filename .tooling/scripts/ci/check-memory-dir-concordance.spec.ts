// .tooling/scripts/ci/check-memory-dir-concordance.spec.ts
//
// pt-BR: Testes do check de CONCORDÂNCIA do destino da retrospectiva (task 1.3
// do plano docs/superpowers/plans/2026-10-03-guard-classes.md).
//
// O que este check caça: uma segunda declaração do destino do result file.
// A fonte única é a seção "Destino canônico do result file" em
// `.agents/specs/conventions/retrospective-capture.md`. Qualquer outro `.md`
// versionado que escreva o caminho — em qualquer uma das notações que o repo
// já usou — é uma divergência silenciosa: o reader segue a cópia quebrada.
//
// Cobre:
// - estado real do repo: 0 divergências, e a derivação canônica resolve
// - RED: plantar uma declaração divergente nomeia o arquivo
// - RED: as 6 notações históricas são todas detectadas
// - a definição fora da seção canônica também é divergência
// - check ausente → skipped, nunca ✓ (o bug que o formatoMark já documenta)

import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import {
  checkMemoryDirConcordance,
  findDivergentDeclarations,
} from './check-memory-dir-concordance.js';

const CANON_SECTION = '## Destino canônico do result file';

function mkAgentFile(dir: string, rel: string): string {
  const p = join(dir, '.agents', rel);
  mkdirSync(join(p, '..'), { recursive: true });
  return p;
}

/** Convenção com a seção canônica presente, contendo a derivação real. */
function writeConvention(dir: string, extra = ''): string {
  const p = mkAgentFile(dir, 'specs/conventions/retrospective-capture.md');
  writeFileSync(
    p,
    [
      '# Convenção',
      '',
      CANON_SECTION,
      '',
      '```bash',
      'MEMORY_DIR="${HOME}/.claude/projects/-$(git rev-parse --show-toplevel | sed \'s|^/||;s|/|-|g\')/memory"',
      '```',
      '',
      extra,
      '## Comandos',
      '',
    ].join('\n'),
  );
  return p;
}

function withRepo(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'memdir-'));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('findDivergentDeclarations', () => {
  it('não acusa um .md limpo que só referencia', () => {
    withRepo((dir) => {
      writeConvention(dir);
      writeFileSync(
        mkAgentFile(dir, 'workflows/retrospective-mode.md'),
        '- [ ] Result file escrito no [destino canônico](./retrospective-capture.md)\n',
      );
      expect(findDivergentDeclarations(dir)).toEqual([]);
    });
  });

  // As notações que o repo já usou, todas têm de ser pegas. Uma guarda que
  // cobre só a forma comum é meia guarda (classe 2).
  //
  // Cada caso aqui é UMA notação e espera 1 divergência. A notação `MEMORY_DIR`
  // fica de fora de propósito: uma linha que repete o path carrega o path E
  // o símbolo, e por isso é 2 — ver o teste dedicado abaixo, que diz por quê.
  const notations: Array<[string, string]> = [
    ['símbolo memory-dir', 'ver `<memory-dir>/b<N>-result.md`'],
    ['path .claude/projects', 'existe em `.claude/projects/.../memory/`'],
    ['path memory/b<N>', 'escreve em `memory/b<N>-result.md`'],
    ['slug de máquina', 'em /home/leo/Documentos/projetos/base/memory/'],
    ['path relativo .claude', 'test -f .claude/projects/-home-leo/memory/x.md'],
  ];

  for (const [nome, linha] of notations) {
    it(`acusa: ${nome}`, () => {
      withRepo((dir) => {
        writeConvention(dir);
        const alvo = mkAgentFile(dir, 'workflows/archive-demand.md');
        writeFileSync(alvo, `# Workflow\n\n- ${linha}\n`);
        const d = findDivergentDeclarations(dir);
        expect(d).toHaveLength(1);
        expect(d[0]?.file).toContain('archive-demand.md');
        expect(d[0]?.reason).toBeTruthy();
      });
    });
  }

  it('acusa: MEMORY_DIR repetido — e são 2 divergências, não 1', () => {
    // A linha `MEMORY_DIR="${HOME}/.claude/projects/x/memory"` carrega duas
    // notações: o PATH (`.claude/projects`) e o SÍMBOLO em prosa
    // (`MEMORY_DIR`). O check reporta uma por notação, então 2. A contagem é
    // o comportamento certo: são dois defeitos independentes numa linha só —
    // apagar o path mas deixar o símbolo ainda é re-declaração.
    withRepo((dir) => {
      writeConvention(dir);
      const alvo = mkAgentFile(dir, 'workflows/archive-demand.md');
      writeFileSync(alvo, '# Workflow\n\n- MEMORY_DIR="${HOME}/.claude/projects/x/memory"\n');
      const d = findDivergentDeclarations(dir);
      expect(d).toHaveLength(2);
      const reasons = d.map((x) => x.reason);
      expect(reasons.some((r) => r.includes('claude/projects'))).toBe(true);
      expect(reasons.some((r) => r.includes('MEMORY_DIR'))).toBe(true);
    });
  });

  // Revisão F1.1/F1.2: o símbolo `MEMORY_DIR` escapou com uma notação nova
  // (prosa em vez de path) e o guard, que só conhecia as 4 notações com
  // caminho escrito, não viu. A distinção que separa o uso legítimo do
  // escape é prosa-vs-fence: dentro de um bloco executável o símbolo é uma
  // variável de shell que deriva da fonte única; fora dele é uma
  // re-declaração que envelhece, porque ninguém sabe mais o valor.
  it('acusa MEMORY_DIR em PROSA (a notação que escapou)', () => {
    withRepo((dir) => {
      writeConvention(dir);
      writeFileSync(
        mkAgentFile(dir, 'workflows/retrospective-mode.md'),
        '# W\n\n    result_file: "<MEMORY_DIR>/<N>+1-result.md"\n',
      );
      const d = findDivergentDeclarations(dir);
      expect(d).toHaveLength(1);
      expect(d[0]?.file).toContain('retrospective-mode.md');
    });
  });

  it('NÃO acusa MEMORY_DIR dentro de fence — o consumidor legítimo', () => {
    withRepo((dir) => {
      writeConvention(dir);
      writeFileSync(
        mkAgentFile(dir, 'skills/demand-archiving/SKILL.md'),
        [
          '```bash',
          'MEMORY_DIR="$(sed -n \'/^MEMORY_DIR=/p\' <canonico>)"',
          'test -f "${MEMORY_DIR}/<retro>.md"',
          '```',
          '',
        ].join('\n'),
      );
      expect(findDivergentDeclarations(dir)).toEqual([]);
    });
  });

  it('acusa MEMORY_DIR em fence YAML (especificação, não executável)', () => {
    // A instância real: `retrospective-mode.md` declara o destino num handoff
    // yaml. Um fence sem linguagem de shell é ESPECIFICAÇÃO, e especificação
    // envelhece como prosa. A primeira versão do guard tratava qualquer fence
    // como executável e deixava esta passar.
    withRepo((dir) => {
      writeConvention(dir);
      writeFileSync(
        mkAgentFile(dir, 'workflows/retrospective-mode.md'),
        ['```yaml', 'result_file: "<MEMORY_DIR>/<N>+1-result.md"', '```', ''].join('\n'),
      );
      const d = findDivergentDeclarations(dir);
      expect(d).toHaveLength(1);
      expect(d[0]?.file).toContain('retrospective-mode.md');
    });
  });

  it('NÃO acusa MEMORY_DIR em fence bash/sh/console', () => {
    for (const lang of ['bash', 'sh', 'shell', 'console']) {
      withRepo((dir) => {
        writeConvention(dir);
        writeFileSync(
          mkAgentFile(dir, 'skills/x/SKILL.md'),
          ['```' + lang, 'test -f "${MEMORY_DIR}/x.md"', '```', ''].join('\n'),
        );
        expect(findDivergentDeclarations(dir)).toEqual([]);
      });
    }
  });

  it('acusa MEMORY_DIR em prosa MESMO no arquivo que tem o fence legítimo', () => {
    // O fence não saneia o resto do arquivo: um consumidor pode declarar o
    // destino em prosa duas linhas abaixo do próprio fence.
    withRepo((dir) => {
      writeConvention(dir);
      writeFileSync(
        mkAgentFile(dir, 'skills/demand-archiving/SKILL.md'),
        [
          '```bash',
          'test -f "${MEMORY_DIR}/<retro>.md"',
          '```',
          '',
          'Ver `<MEMORY_DIR>/b<N>-result.md`.',
          '',
        ].join('\n'),
      );
      expect(findDivergentDeclarations(dir)).toHaveLength(1);
    });
  });

  it('NÃO acusa o NOME DO PRÓPRIO CHECK escrito em prosa', () => {
    // Falso positivo real, encontrado pela task 2.1: a convenção `guard-classes`
    // precisa CITAR o check que produziu, e o nome do arquivo contém o token
    // que o detector procura. Sem esta isenção, documentar o guard exigiria
    // deformed o nome dele — e um guard que não pode ser nomeado empurra todo
    // mundo a contorná-lo, que é como um guard começa a ser ignorado.
    //
    // A isenção é do NOME, não do arquivo: ela não abre exceção para
    // qualquer ocorrência do token, só para a menção `check-memory-dir-concordance`.
    withRepo((dir) => {
      writeConvention(dir);
      writeFileSync(
        mkAgentFile(dir, 'specs/conventions/guard-classes.md'),
        [
          '# Convenção',
          '',
          'O `check-memory-dir-concordance` não pega a classe 4 nem a 5,',
          'porque elas são do domínio do parser de redirect.',
          '',
        ].join('\n'),
      );
      expect(findDivergentDeclarations(dir)).toEqual([]);
    });
  });

  it('AINDA acusa o token quando NÃO é o nome do check', () => {
    // A isenção do nome não pode virar atalho: `memory-dir` sozinho, fora do
    // nome do check, continua sendo divergência.
    withRepo((dir) => {
      writeConvention(dir);
      writeFileSync(
        mkAgentFile(dir, 'specs/conventions/guard-classes.md'),
        'ver `<memory-dir>/b<N>-result.md`\n',
      );
      expect(findDivergentDeclarations(dir)).toHaveLength(1);
    });
  });

  it('acusa uma segunda declaração DENTRO do arquivo canônico, fora da seção', () => {
    withRepo((dir) => {
      const canon = writeConvention(
        dir,
        '## Outro lugar\n\n`memory/b<N>-result.md` foi decidido em algum lugar.\n',
      );
      const d = findDivergentDeclarations(dir);
      expect(d).toHaveLength(1);
      // O check devolve o caminho RELATIVO ao repoRoot — é assim que o painel
      // do preflight mostra, e assim que o resultado é comparável entre runs.
      expect(d[0]?.file).toBe(relative(dir, canon));
      expect(d[0]?.file).toBe('.agents/specs/conventions/retrospective-capture.md');
    });
  });

  it('não acusa a definição que está na seção canônica', () => {
    withRepo((dir) => {
      writeConvention(dir);
      expect(findDivergentDeclarations(dir)).toEqual([]);
    });
  });

  // Revisão F1.1/F1.2: o guard enumerava diretórios (specs, skills,
  // workflows, agents, memory) e o `.md` de topo do `.agents` ficava fora.
  // `.agents/WORKFLOWS.md` é o índice de workflows — exatamente o tipo de
  // arquivo que alguém edita achando que é uma lista de links, não uma
  // declaração de caminho. A lista fechada também envelhecia: qualquer
  // diretório novo nascia invisível.
  it('acusa uma declaração em .md de topo do .agents (fora dos SCAN_DIRS)', () => {
    withRepo((dir) => {
      writeConvention(dir);
      const alvo = join(dir, '.agents', 'WORKFLOWS.md');
      writeFileSync(alvo, '# Workflows\n\nver `memory/b<N>-result.md`\n');
      const d = findDivergentDeclarations(dir);
      expect(d).toHaveLength(1);
      expect(d[0]?.file).toBe('.agents/WORKFLOWS.md');
    });
  });

  it('acusa em diretório NOVO de .agents, mesmo fora dos SCAN_DIRS', () => {
    withRepo((dir) => {
      writeConvention(dir);
      writeFileSync(
        mkAgentFile(dir, 'prompts/novo.md'),
        'destino: `claude/projects/.../memory/`\n',
      );
      expect(findDivergentDeclarations(dir)).toHaveLength(1);
    });
  });

  it('NÃO acusa .agents/runs (o registro que descreve o defeito)', () => {
    withRepo((dir) => {
      writeConvention(dir);
      writeFileSync(
        mkAgentFile(dir, 'runs/state-snapshot-x.md'),
        'Achado: `test -f .claude/projects/.../b21-result.md` falhava.\n',
      );
      expect(findDivergentDeclarations(dir)).toEqual([]);
    });
  });

  it('acusa mais de um arquivo e nomeia cada um', () => {
    withRepo((dir) => {
      writeConvention(dir);
      writeFileSync(mkAgentFile(dir, 'workflows/a.md'), '`memory/b<N>-result.md`\n');
      writeFileSync(mkAgentFile(dir, 'skills/b.md'), '`claude/projects`\n');
      const d = findDivergentDeclarations(dir);
      expect(d).toHaveLength(2);
      expect(d.map((x) => x.file.split('/').pop())).toEqual(
        expect.arrayContaining(['a.md', 'b.md']),
      );
    });
  });
});

describe('checkMemoryDirConcordance', () => {
  it('o repo real está em concordância', () => {
    const r = checkMemoryDirConcordance({ repoRoot: process.cwd() });
    expect(r.errors).toEqual([]);
    expect(r.skipped).toBeUndefined();
    expect(r.ok).toBe(true);
  });

  it('a derivação canônica descreve o REPO, não o cwd', () => {
    // Este teste já teve dois nomes e duas asserções, e as duas mediam a
    // máquina em vez do repo.
    //
    // 1ª versão: `ok:true, errors:[]` — idêntica à do teste anterior. O nome
    // prometia um dente que a assertion não tinha: uma derivação que apontasse
    // para o vazio passaria calada.
    //
    // 2ª versão: derivava e checava `existsSync(derivado)`. Ganhou dente e
    // perdeu o port: o destino vive em `~/.claude/projects/<slug>/memory`,
    // FORA do repo, e existe na máquina de quem roda o spec porque o Claude
    // Code criou. Num runner do CI o diretório não existe — o teste ficou
    // vermelho no PR #44 com `derivou "/home/runner/.claude/projects/
    // -home-runner-work-projeto-base-projeto-base/memory", que não existe`.
    // Um teste que só é verde na máquina do autor mede o autor.
    //
    // A propriedade que o destino realmente tem — e que vale em qualquer
    // máquina — éESTRUTURAL: o slug descreve o repositório, não o diretório de
    // onde a derivação rodou. É isso que `verifyDerivation` já exige do check,
    // então o dente não foi perdido: mudou de lugar e deixou de depender do
    // disco. Rodar de `.tooling` é o que torna isso observável: de lá, `pwd`
    // e o toplevel divergem.
    const canon = readFileSync(
      join(process.cwd(), '.agents/specs/conventions/retrospective-capture.md'),
      'utf8',
    );
    const line = canon.split('\n').find((l) => l.startsWith('MEMORY_DIR='));
    expect(line, 'a fonte única precisa declarar MEMORY_DIR=').toBeTruthy();

    const out = spawnSync('bash', ['-c', `${line}; printf %s "$MEMORY_DIR"`], {
      cwd: join(process.cwd(), '.tooling'), // de um SUBDIRECTÓRIO: é lá que o bug aparecia
      encoding: 'utf8',
    });
    const memoryDir = out.stdout.trim();

    // Mesmo slug de `verifyDerivation`, derivado do toplevel: `-` + caminho
    // sem a barra inicial, com `/` virando `-`.
    const expectedSlug = `-${resolve(process.cwd()).replace(/^\//, '').replace(/\//g, '-')}`;
    expect(
      memoryDir.endsWith(`/${expectedSlug}/memory`),
      `derivou "${memoryDir}" de um subdiretório; esperava o slug do repo (${expectedSlug})`,
    ).toBe(true);
  });

  it('a derivação sobrevive ao GIT_DIR que o git exporta para todo hook', () => {
    // MEDIDO 2026-10-07: o `pre-push` abortava em TODA máquina, em qualquer
    // clone, inclusive no checkout principal. Causa: o git exporta `GIT_DIR`
    // para os hooks que ele dispara, e com `GIT_DIR` definido
    // `git rev-parse --show-toplevel` devolve o CWD — não a raiz. Rodando de
    // `.tooling`, a derivação descrevia `...-base-.tooling` em vez de
    // `...-base`, e o gate acusava divergência numa derivação que o resto do
    // repo trata como canônica.
    //
    // O teste acima passava calado: ele roda SEM `GIT_DIR`, que é exatamente
    // a condição em que a linha antiga funcionava. A linha quebrada e a
    // corrigida davam o mesmo verde.
    const repoRoot = process.cwd();
    const canon = readFileSync(
      join(repoRoot, '.agents/specs/conventions/retrospective-capture.md'),
      'utf8',
    );
    const line = canon.split('\n').find((l) => l.startsWith('MEMORY_DIR='));
    expect(line, 'a fonte única precisa declarar MEMORY_DIR=').toBeTruthy();

    // O valor REAL que o git exporta, lido do próprio repo. Um path de
    // máquina hardcoded aqui seria verde local e vermelho no CI — verde que
    // não corresponde a nada.
    const gitDir = spawnSync('git', ['rev-parse', '--absolute-git-dir'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).stdout.trim();
    expect(gitDir, 'não consegui ler o gitdir do repo').toBeTruthy();

    // UM PROCESSO SÓ, e a precondição lida DELE.
    //
    // MEDIDO 2026-10-08: a precondição rodava o seu próprio `bash` com o seu
    // próprio `env`, e a medição tinha outro. Reverter a linha canônica para a
    // forma quebrada E tirar o `GIT_DIR` do `env` do spawn medido dava
    // 28/28 verde — o teste que existe para ser o dente do conserto do hook
    // rodava inteiro sem a condição do hook. Compartilhar um objeto de `env`
    // entre os dois spawns NÃO fecha isso: a mutação reintroduz a separação
    // trocando um `env: envMedido` por um objeto novo, e voltamos a 199/199.
    //
    // O que fecha é não existir segunda fonte. O processo medido imprime o
    // `GIT_DIR` que ELE enxergou, antes de derivar — e a precondição é
    // asserção sobre essa linha. Não há outro `env` para divergir.
    const out = spawnSync(
      'bash',
      [
        '-c',
        `printf 'GIT_DIR_VISTO=%s\\n' "\${GIT_DIR:-VAZIO}"; ${line}; printf 'MEMORY_DIR=%s\\n' "$MEMORY_DIR"`,
      ],
      {
        cwd: join(repoRoot, '.tooling'),
        encoding: 'utf8',
        env: { ...process.env, GIT_DIR: gitDir },
      },
    );

    // Precondição anti-vacuidade, lida do MESMO processo que faz a derivação:
    // o filho TEM de ter enxergado o `GIT_DIR`. Se não enxergou, a derivação
    // rodou na condição em que a LINHA ANTIGA funcionava — e o teste estaria
    // medindo o conserto errado.
    expect(
      out.stdout,
      'o GIT_DIR não chegou ao processo que deriva o MEMORY_DIR — o teste mediu a linha quebrada',
    ).toContain(`GIT_DIR_VISTO=${gitDir}`);

    const memoryDir = out.stdout.match(/^MEMORY_DIR=(.*)$/m)?.[1]?.trim() ?? '';
    const expectedSlug = `-${resolve(repoRoot).replace(/^\//, '').replace(/\//g, '-')}`;
    expect(
      memoryDir.endsWith(`/${expectedSlug}/memory`),
      `com GIT_DIR="${gitDir}" a derivação produziu "${memoryDir}"; esperava o slug do repo (${expectedSlug})`,
    ).toBe(true);
  });

  it('convenção ausente → skipped com motivo, nunca ok silencioso', () => {
    withRepo((dir) => {
      const r = checkMemoryDirConcordance({ repoRoot: dir });
      expect(r.ok).toBe(true);
      expect(r.skipped).toBe(true);
      expect(r.reason).toBeTruthy();
    });
  });
});

/**
 * Revisão F1.1/F1.2, P1 — o fence da SKILL `demand-archiving`.
 *
 * O bloco que a SKILL mandava rodar tinha DOIS defeitos, e o segundo só
 * apareceu porque o primeiro foi reproduzido:
 *
 * 1. **Path relativo ao CWD.** Da raiz o `sed` acha a convenção; de qualquer
 *    subdiretório ele falha, `MEMORY_DIR` fica vazio, e o `test -f` dá
 *    vermelho **num retro que existe** — o gate abortando uma elegibilidade
 *    legítima com a mensagem oposta ("retro ausente"). Fail-closed, então não
 *    é risco de segurança: é um gate que mente sobre o motivo. E é a mesma
 *    armadilha que a convenção nomeia um nível acima ("por que `git
 *    rev-parse` e não `pwd`"), reintroduzida por um nível de abstração.
 *
 * 2. **Não é auto-contido.** A derivação estava em linhas COMENTADAS — o
 *    bloco documentava o comando e executava outro. Quem copia só as linhas
 *    executáveis herda `MEMORY_DIR` vazio, mesmo da raiz. Um fence que
 *    precisa de um comentário para funcionar não é um fence.
 *
 * Estes testes executam o fence de verdade, de dois CWDs. Um teste que só lê
 * o texto do fence não distingue path relativo de absoluto, nem comentário de
 * comando — foi assim que os dois defeitos passaram.
 */
describe('fence da SKILL demand-archiving (CWD-independente e auto-contido)', () => {
  const REPO = process.cwd();
  const SKILL = join(REPO, '.agents/skills/demand-archiving/SKILL.md');

  /**
   * Extrai as linhas EXECUTÁVEIS do 1º fence bash da seção "Verificar
   * `retro_ref` existe". Comentários saem: eles são prosa, e é justamente
   * uma prosa que o bloco executável não pode depender.
   */
  function fenceSource(): string {
    const skill = readFileSync(SKILL, 'utf8');
    const start = skill.indexOf('### 2. Verificar');
    expect(start).toBeGreaterThan(-1);
    const body = [...skill.slice(start).matchAll(/```bash\n([\s\S]*?)```/g)][0]?.[1];
    expect(body).toBeTruthy();
    return (body ?? '')
      .split('\n')
      .filter((l) => l.trim() && !l.trimStart().startsWith('#'))
      .join('\n');
  }

  /**
   * Executa o fence substituindo `<retro>`, devolvendo o CÓDIGO DO GATE e o
   * `MEMORY_DIR` derivado.
   *
   * O código tem de ser o do `test -f`, não o do último comando do script.
   * A primeira versão acrescentava `; printf ...` para extrair o valor, e o
   * `printf` — que sempre sai 0 — virava o status: o controle negativo dava
   * VERDE num retro inexistente. Um teste que mede o campo errado passa por
   * cima do gate que ele deveria estar fechando.
   */
  function runFence(
    cwd: string,
    retro = 'b21-result',
    home = process.env.HOME,
  ): { code: number; memoryDir: string } {
    const src = fenceSource().replace(/<retro>/g, retro);
    const run = spawnSync(
      'bash',
      ['-c', `${src}\n__gate=$?\nprintf %s "$MEMORY_DIR"\nexit $__gate`],
      {
        cwd,
        encoding: 'utf8',
        // MEMORY_DIR zerado: se o fence não deriva, tem de ficar vazio e o
        // teste tem de ver isso — nunca herdar o ambiente como verde de sorte.
        // `HOME` é parâmetro porque a derivação é `${HOME}/.claude/projects/
        // <slug>/memory`: sem controlá-lo, a premissa "o retro existe" vira uma
        // propriedade do disco de quem roda o spec. Ver `memoryHomeWith`.
        env: { ...process.env, MEMORY_DIR: '', HOME: home },
      },
    );
    return { code: run.status ?? -1, memoryDir: run.stdout };
  }

  /**
   * Um `HOME` temporário com o destino derivado JÁ populado pelo fixture.
   *
   * `b21-result.md` existe no meu `~/.claude/projects/…/memory` porque eu
   * escrevi lá; no runner do CI esse diretório não existe, o `test -f` dá
   * vermelho, e o spec acusa um gate que está certo — foi o que aconteceu no
   * PR #44. Aqui o arquivo é criado dentro do `HOME` que o fence vai derivar,
   * então "o retro existe" é consequência do fixture e não do estado da
   * máquina. O teste fica verde em qualquer máquina e continua vermelho se o
   * fence parar de derivar.
   */
  function memoryHomeWith(retro: string): string {
    const home = mkdtempSync(join(tmpdir(), 'memhome-'));
    const slug = `-${resolve(REPO).replace(/^\//, '').replace(/\//g, '-')}`;
    const dir = join(home, '.claude', 'projects', slug, 'memory');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${retro}.md`), '# fixture: retro que existe\n');
    return home;
  }

  it('deriva o MESMO destino da raiz e de um subdiretório', () => {
    const fromRoot = runFence(REPO);
    const fromSub = runFence(join(REPO, '.agents', 'skills'));

    // A asserção que importa é a igualdade entre os CWDs. O bug antigo
    // produzia `''` de subdiretório e o `not.toBe('')` do primeiro expect
    // é o que impede a versão quebrada de passar por acidente.
    expect(fromRoot.memoryDir).not.toBe('');
    expect(fromSub.memoryDir).toBe(fromRoot.memoryDir);
  });

  it('o fence é AUTO-CONTIDO: deriva sem nenhum passo externo', () => {
    // O defeito 2 em uma asserção só: as linhas executáveis têm de produzir o
    // destino sozinhas. Sem isto, a linha de cima pode voltar a ser um
    // comentário e ninguém percebe.
    const src = fenceSource();
    expect(src).toMatch(/MEMORY_DIR=/);
    expect(runFence(REPO).memoryDir).toMatch(/\/memory$/);
  });

  it('dá verde para um retro que EXISTE, de qualquer CWD', () => {
    const home = memoryHomeWith('b21-result');
    expect(runFence(REPO, 'b21-result', home).code).toBe(0);
    expect(runFence(join(REPO, '.agents', 'skills'), 'b21-result', home).code).toBe(0);
  });

  it('dá vermelho para um retro que NÃO existe, de qualquer CWD', () => {
    // Controle negativo com o MESMO fence e — o que importa — o MESMO `HOME`,
    // onde `b21-result.md` EXISTE. Só o nome pedido muda. A versão anterior
    // usava um diretório vazio, que também daria vermelho se o fence
    // devolvesse 1 sem nunca procurar nada: ela provava que o gate erra, não
    // que ele discriminate. Aqui o gate tem um alvo ao lado e ainda erra —
    // é a diferença entre "testa que falha" e "testa que mede".
    const home = memoryHomeWith('b21-result');
    expect(runFence(REPO, 'b999-nao-existe', home).code).toBe(1);
    expect(runFence(join(REPO, '.agents', 'skills'), 'b999-nao-existe', home).code).toBe(1);
  });
});
