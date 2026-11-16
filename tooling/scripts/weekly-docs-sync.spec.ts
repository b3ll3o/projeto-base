// tooling/scripts/weekly-docs-sync.spec.ts
//
// pt-BR: testes do gerador do relatório semanal. O alvo são os TRÊS
// defeitos que o artefato do PR #167 mostrou:
//
//   1. a linha em branco do `git log` entrava como arquivo (a "6" sem nome);
//   2. o diretório saía dos 2 primeiros segmentos do PATH (`README.md/`);
//   3. a janela era uma data NUA, que o git resolve com a HORA do momento.
//
// E o quarto: o parecer entrava linha a linha, com as cópias do doc-sync.
//
// Os testes usam LITERAL — a saída de `git log` escrita à mão e as
// asserções comparam com texto escrito à mão. Um teste que re-deriva o
// esperado da implementação não fixa nada.

import { describe, it, expect } from 'vitest';
import {
  diretorioDe,
  normalizaJanela,
  parseSaidaDoGitLog,
  renderizaArtefato,
} from './weekly-docs-sync.js';
import type { DocSyncReport } from './doc-sync.js';

const SEP = '\x1e';
const CAMPO = '\x1f';

/**
 * A saída do `git log --format=%x1e%H%x1f%cI%x1f%an%x1f%s --name-only`:
 * 2 commits, a linha em branco que o git imprime entre eles, e um arquivo
 * na raiz (o caso que virava o diretório `README.md/`).
 */
const SAIDA_DO_GIT_LOG = [
  `${SEP}f66ea99d72b36be32f06e82733b004796b712fe${CAMPO}2026-11-10T21:27:27-03:00${CAMPO}Leonardo Andreazzi${CAMPO}fix(deps): as pendências dos 6 PRs`,
  'AGENTS.md',
  'README.md',
  'apps/api/prisma/schema.prisma',
  '',
  `${SEP}a46300f0000000000000000000000000000000ab${CAMPO}2026-11-09T18:09:35-03:00${CAMPO}Leonardo Andreazzi${CAMPO}chore(deps): atualiza as dependencias`,
  'apps/api/prisma/schema.prisma',
  '.tooling/scripts/ci/preflight.ts',
  '',
].join('\n');

describe('parseSaidaDoGitLog', () => {
  it('lê os commits com data, autor e mensagem', () => {
    const semana = parseSaidaDoGitLog(SAIDA_DO_GIT_LOG);
    expect(semana.commits).toHaveLength(2);
    expect(semana.commits[0]?.sha).toBe('f66ea99d72b36be32f06e82733b004796b712fe');
    expect(semana.commits[0]?.data).toBe('2026-11-10T21:27:27-03:00');
    expect(semana.commits[0]?.autor).toBe('Leonardo Andreazzi');
    expect(semana.commits[0]?.mensagem).toBe('fix(deps): as pendências dos 6 PRs');
  });

  it('NENHUM path vazio entra na lista de arquivos', () => {
    // MEDIDO 2026-11-16: a linha em branco do `git log` entrava como se fosse
    // um arquivo — era a linha "6" (sem nome) da lista de arquivos mais
    // tocados do artefato do PR #167.
    const semana = parseSaidaDoGitLog(SAIDA_DO_GIT_LOG);
    expect(semana.arquivos).toEqual([
      '.tooling/scripts/ci/preflight.ts',
      'AGENTS.md',
      'README.md',
      'apps/api/prisma/schema.prisma',
    ]);
    expect(semana.arquivos.filter((a) => a.trim().length === 0)).toEqual([]);
  });

  it('conta os toques por arquivo e por diretório', () => {
    const semana = parseSaidaDoGitLog(SAIDA_DO_GIT_LOG);
    expect(semana.toquesPorArquivo.get('apps/api/prisma/schema.prisma')).toBe(2);
    expect(semana.toquesPorArquivo.get('README.md')).toBe(1);
    expect(semana.toquesPorDiretorio.get('apps/api')).toBe(2);
    expect(semana.toquesPorDiretorio.get('(raiz)')).toBe(2);
    expect(semana.toquesPorDiretorio.get('.tooling/scripts')).toBe(1);
  });
});

describe('diretorioDe', () => {
  it('um arquivo na raiz não vira um diretório chamado como ele', () => {
    // MEDIDO 2026-11-16: `README.md` aparecia na lista de diretórios como
    // `README.md/`, e `docs/STACK.md` como `docs/STACK.md`.
    expect(diretorioDe('README.md')).toBe('(raiz)');
    expect(diretorioDe('AGENTS.md')).toBe('(raiz)');
    expect(diretorioDe('docs/STACK.md')).toBe('docs');
    expect(diretorioDe('apps/api/src/modules/auth/x.ts')).toBe('apps/api');
    expect(diretorioDe('.tooling/scripts/ci/preflight.ts')).toBe('.tooling/scripts');
  });
});

describe('normalizaJanela', () => {
  it('uma data nua vira meia-noite — a hora do momento não entra na janela', () => {
    // MEDIDO 2026-11-16: `--since=2026-11-09` herda a HORA da execução — o
    // mesmo comando mediu 6 e 4 toques no mesmo dia, conforme a hora.
    expect(normalizaJanela('2026-11-09')).toBe('2026-11-09T00:00:00');
    expect(normalizaJanela('2026-11-09T05:45:02')).toBe('2026-11-09T05:45:02');
    expect(normalizaJanela('2026-11-09T05:45:02-03:00')).toBe('2026-11-09T05:45:02-03:00');
  });
});

describe('renderizaArtefato', () => {
  const parecer: DocSyncReport = {
    status: 'success',
    actions: [
      {
        type: 'review',
        doc_file: 'docs/api/auth.md',
        reason: 'Controller auth modificado — verificar contrato e tabela de endpoints',
        severity: 'minor',
        source_file: 'apps/api/src/modules/auth/infrastructure/http/auth.controller.ts',
      },
    ],
    files_changed: ['apps/api/src/modules/auth/infrastructure/http/auth.controller.ts'],
    alerts: 0,
    docs_health_score: 100,
  };

  const artefato = renderizaArtefato({
    repo: 'projeto-base',
    since: '2026-11-09T00:00:00',
    until: '2026-11-16T23:59:59',
    offset: '-03:00',
    base: 'f66ea99d72b36be32f06e82733b004796b712fe',
    semana: parseSaidaDoGitLog(SAIDA_DO_GIT_LOG),
    parecer,
  });

  it('registra a janela e o comando que a reproduz', () => {
    expect(artefato).toContain('**Período:** 2026-11-09T00:00:00 .. 2026-11-16T23:59:59');
    expect(artefato).toContain('git log --since=2026-11-09T00:00:00 --until=2026-11-16T23:59:59');
    expect(artefato).toContain('pnpm weekly:docs-sync --since=2026-11-09T00:00:00');
  });

  it('a lista de arquivos não tem linha sem nome', () => {
    expect(artefato).toContain('| 2 | `apps/api/prisma/schema.prisma` |');
    expect(artefato).not.toMatch(/\|\s*\d+\s*\|\s*`\s*`\s*\|/);
  });

  it('o diretório da raiz é a raiz', () => {
    expect(artefato).toContain('| 2 | `(raiz)` |');
    expect(artefato).not.toContain('README.md/');
  });

  it('o parecer mostra a ORIGEM de cada ação', () => {
    expect(artefato).toContain('| Tipo | Doc | Origem | Motivo |');
    expect(artefato).toContain(
      '| review | `docs/api/auth.md` | ' +
        '`apps/api/src/modules/auth/infrastructure/http/auth.controller.ts` |',
    );
    expect(artefato).toContain('**Ações:** 1 · **Alertas:** 0 · **Health:** 100/100');
  });
});
