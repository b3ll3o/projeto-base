import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SKILLS_DE_AUDITORIA,
  ALVOS_DE_REDIRECT_PERMITIDOS,
  CODIGOS_DE_SUCESSO,
  MARCADOR_DE_FALHA,
  TIMEOUT_POR_PASSO_MS,
  checkAuditSkills,
  extrairBlocos,
  linhasDeFalha,
  semComentarios,
  violacoesDoBloco,
  alvosDeRedirect,
} from './check-audit-skills';

/** Um repo mínimo com uma skill de auditoria. */
function repoCom(skills: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'audit-skills-'));
  for (const [nome, conteudo] of Object.entries(skills)) {
    mkdirSync(join(root, '.agents/skills', nome), { recursive: true });
    writeFileSync(join(root, '.agents/skills', nome, 'SKILL.md'), conteudo);
  }
  return root;
}

describe('a lista de skills de auditoria', () => {
  // ⚠️ Este é o teste que impede a reincidência: a lista é o instrumento, e
  // uma lista que alguém encolhe sem querer volta a medir menos.
  it('nomeia as SEIS skills de auditoria do repo', () => {
    expect(SKILLS_DE_AUDITORIA.length).toBe(6);
    expect(SKILLS_DE_AUDITORIA).toContain('prisma-audit');
    expect(SKILLS_DE_AUDITORIA).toContain('openapi-audit');
    expect(SKILLS_DE_AUDITORIA).toContain('otelcol-audit');
    expect(SKILLS_DE_AUDITORIA).toContain('docker-prod-audit');
    expect(SKILLS_DE_AUDITORIA).toContain('release-versioning-audit');
    expect(SKILLS_DE_AUDITORIA).toContain('findings-orchestration');
  });

  it('cada skill da lista tem SKILL.md de verdade', async () => {
    const { readFileSync } = await import('node:fs');
    for (const skill of SKILLS_DE_AUDITORIA) {
      const md = readFileSync(join(process.cwd(), '.agents/skills', skill, 'SKILL.md'), 'utf-8');
      expect(md.length).toBeGreaterThan(100);
    }
  });
});

describe('extrairBlocos()', () => {
  it('acha o bloco bash e a declaração dele', () => {
    const md = [
      '# Skill',
      '',
      '> **Gate:** `run` — lê o schema',
      '',
      '```bash',
      'cat schema.prisma',
      '```',
      '',
      'texto',
      '',
      '```ts',
      'nao conta',
      '```',
    ].join('\n');

    const blocos = extrairBlocos(md, 'x');
    expect(blocos.length).toBe(1);
    expect(blocos[0]!.declaracao).toBe('run');
    expect(blocos[0]!.motivo).toBe('lê o schema');
    expect(blocos[0]!.corpo).toBe('cat schema.prisma');
  });

  it('um bloco sem declaração vem com declaracao null (e o gate trata como erro)', () => {
    const md = ['```bash', 'echo oi', '```'].join('\n');
    const blocos = extrairBlocos(md, 'x');
    expect(blocos[0]!.declaracao).toBeNull();
  });

  it('a declaração `skip` guarda o motivo', () => {
    const md = ['> **Gate:** `skip` — precisa de rede', '', '```bash', 'curl x', '```'].join('\n');
    const blocos = extrairBlocos(md, 'x');
    expect(blocos[0]!.declaracao).toBe('skip');
    expect(blocos[0]!.motivo).toBe('precisa de rede');
  });
});

describe('semComentarios()', () => {
  // MEDIDO em 2026-10-29: sem isto, o denylist acusava os COMENTÁRIOS dos
  // passos (`ex: curl em distroless` casava como "fala com a rede").
  it('tira as linhas de comentário', () => {
    const entrada = ['# comentário com curl', 'grep x file', '  # outro', 'echo oi'].join('\n');
    expect(semComentarios(entrada)).toBe('grep x file\necho oi');
  });

  it('mantém um # que está dentro de uma string', () => {
    const entrada = 'grep -E "a#b" file';
    expect(semComentarios(entrada)).toBe(entrada);
  });
});

describe('violacoesDoBloco()', () => {
  it('acusa a escrita, a rede e o daemon', () => {
    expect(violacoesDoBloco('rm -rf build')).toContain('apaga arquivo');
    expect(violacoesDoBloco('curl https://x')).toContain('fala com a rede');
    expect(violacoesDoBloco('docker run alpine')).toContain('precisa do daemon do Docker');
    expect(violacoesDoBloco('git fetch --tags')).toContain('mexe no git');
  });

  it('NÃO acusa o que só aparece em comentário', () => {
    expect(violacoesDoBloco('# 4.3 (ex: curl em distroless)')).toEqual([]);
    expect(violacoesDoBloco('# (sem `git fetch`)')).toEqual([]);
    expect(violacoesDoBloco('# Esperado: 1 (footer único). Se >1, finding DRIFT.')).toEqual([]);
  });

  it('permite o redirect para /tmp e /dev/null, e acusa o resto', () => {
    expect(violacoesDoBloco('grep x f > /tmp/a.txt')).toEqual([]);
    expect(violacoesDoBloco('grep x f 2>/dev/null')).toEqual([]);
    const para = violacoesDoBloco('grep x f > saida.txt');
    expect(para.length).toBeGreaterThan(0);
  });

  it('os alvos de redirect são capturados, não inferidos', () => {
    expect(alvosDeRedirect('a > /tmp/x.txt')).toContain('/tmp/x.txt');
    expect(alvosDeRedirect('a > /tmp/x.txt')).not.toContain('1,');
    expect(ALVOS_DE_REDIRECT_PERMITIDOS.some((p) => p.test('/tmp/x.txt'))).toBe(true);
  });
});

describe('linhasDeFalha()', () => {
  it('acha o marcador de falha do repo', () => {
    const saida = ['ok', `${MARCADOR_DE_FALHA} algo errado`, 'mais'].join('\n');
    expect(linhasDeFalha(saida).length).toBe(1);
  });

  it('ignora a linha que só contém a marca no meio', () => {
    expect(linhasDeFalha('texto ✗ no meio')).toEqual([]);
  });
});

describe('o gate, sobre um repo sintético', () => {
  /** Um repo com as SEIS skills da lista, cada uma com um passo declarado. */
  function repoCompleto(declaracao?: string): string {
    const skills: Record<string, string> = {};
    for (const skill of SKILLS_DE_AUDITORIA) {
      skills[skill] =
        declaracao === undefined
          ? ['> **Gate:** `run` — mede o arquivo', '', '```bash', 'echo medida', '```'].join('\n')
          : [declaracao, '', '```bash', 'echo medida', '```'].join('\n');
    }
    return repoCom(skills);
  }

  it('passa quando todo passo declarado roda e não reporta falha', () => {
    const root = repoCompleto();
    try {
      const r = checkAuditSkills({ repoRoot: root });
      expect((r.errors ?? []).join('\n')).toBe('');
      expect(r.ok).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('FALHA quando um bloco não está declarado', () => {
    const root = repoCompleto();
    try {
      // A skill `prisma-audit` fica sem a linha de declaração.
      const arquivo = join(root, '.agents/skills/prisma-audit/SKILL.md');
      writeFileSync(arquivo, ['```bash', 'echo medida', '```'].join('\n'));
      const r = checkAuditSkills({ repoRoot: root });
      expect(r.ok).toBe(false);
      expect((r.errors ?? []).join('\n')).toContain('SEM DECLARAÇÃO');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('FALHA quando o passo declara `run` e escreve no repo', () => {
    const root = repoCompleto();
    try {
      const arquivo = join(root, '.agents/skills/prisma-audit/SKILL.md');
      writeFileSync(
        arquivo,
        ['> **Gate:** `run` — mede o arquivo', '', '```bash', 'echo x > saida.txt', '```'].join(
          '\n',
        ),
      );
      const r = checkAuditSkills({ repoRoot: root });
      expect(r.ok).toBe(false);
      expect((r.errors ?? []).join('\n')).toContain('redireciona');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('FALHA quando o passo imprime a marca de falha', () => {
    const root = repoCompleto();
    try {
      const arquivo = join(root, '.agents/skills/prisma-audit/SKILL.md');
      writeFileSync(
        arquivo,
        ['> **Gate:** `run` — mede o arquivo', '', '```bash', 'echo "✗ achou drift"', '```'].join(
          '\n',
        ),
      );
      const r = checkAuditSkills({ repoRoot: root });
      expect(r.ok).toBe(false);
      expect((r.errors ?? []).join('\n')).toContain('REPORTOU falha');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('FALHA quando o passo não produz nenhuma saída (mediu nada)', () => {
    const root = repoCompleto();
    try {
      const arquivo = join(root, '.agents/skills/prisma-audit/SKILL.md');
      writeFileSync(
        arquivo,
        ['> **Gate:** `run` — mede o arquivo', '', '```bash', 'true', '```'].join('\n'),
      );
      const r = checkAuditSkills({ repoRoot: root });
      expect(r.ok).toBe(false);
      expect((r.errors ?? []).join('\n')).toContain('NENHUMA saída');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('o gate, sobre o repo real', () => {
  // A medição de verdade: as skills de auditoria do repo, com os passos
  // executados. É este teste que falha quando um passo quebra.
  it('todos os passos declarados `run` rodam e passam', () => {
    const r = checkAuditSkills({ repoRoot: process.cwd() });
    const detalhe = (r.errors ?? []).join('\n');
    expect(detalhe).toBe('');
    expect(r.ok).toBe(true);
  });

  it('todo bloco bash das skills de auditoria está DECLARADO', () => {
    // A lista não pode encolher em silêncio: um passo novo sem declaração
    // é erro, e este teste é o que impede o gate de medir menos.
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    for (const skill of SKILLS_DE_AUDITORIA) {
      const md = readFileSync(join(process.cwd(), '.agents/skills', skill, 'SKILL.md'), 'utf-8');
      for (const bloco of extrairBlocos(md, skill)) {
        expect(`${skill}:${bloco.linha} ${bloco.declaracao}`).not.toContain('null');
        expect(bloco.motivo.length).toBeGreaterThanOrEqual(8);
      }
    }
  });
});

describe('os limites declarados', () => {
  it('o timeout por passo é generoso o bastante para um grep grande', () => {
    expect(TIMEOUT_POR_PASSO_MS).toBeGreaterThanOrEqual(30_000);
  });

  it('o código 1 (sem match) é sucesso; 2, 126 e 127 são falha', () => {
    expect(CODIGOS_DE_SUCESSO).toContain(0);
    expect(CODIGOS_DE_SUCESSO).toContain(1);
    expect(CODIGOS_DE_SUCESSO).not.toContain(2);
    expect(CODIGOS_DE_SUCESSO).not.toContain(127);
  });
});
