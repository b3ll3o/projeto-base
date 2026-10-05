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
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
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

  // As 6 notações que o repo já usou, todas as 6 têm de ser pegas.
  // Uma guarda que cobre só a forma comum é meia guarda (classe 2).
  const notations: Array<[string, string]> = [
    ['símbolo memory-dir', 'ver `<memory-dir>/b<N>-result.md`'],
    ['path .claude/projects', 'existe em `.claude/projects/.../memory/`'],
    ['path memory/b<N>', 'escreve em `memory/b<N>-result.md`'],
    ['slug de máquina', 'em /home/leo/Documentos/projetos/base/memory/'],
    ['path relativo .claude', 'test -f .claude/projects/-home-leo/memory/x.md'],
    ['MEMORY_DIR repetido', 'MEMORY_DIR="${HOME}/.claude/projects/x/memory"'],
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

  it('a derivação canônica resolve para um diretório que existe de verdade', () => {
    // Se a derivação canônica quebrar, o único lugar que manda no destino
    // para de mandar — e o check tem de dizer isso, não passar calado.
    const r = checkMemoryDirConcordance({ repoRoot: process.cwd() });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
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
