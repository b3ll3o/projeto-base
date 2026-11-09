import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  auditarAgents,
  checkAgentFrontmatter,
  lacunasDeAgent,
  lerCamposDoFrontmatter,
} from './check-agent-frontmatter';

/** A raiz do repo — o spec roda com `--root .tooling/scripts/ci`. */
const RAIZ = join(__dirname, '../../..');

const AGENTE_BOM = [
  '---',
  'name: code-reviewer',
  'description: Revisa código antes do merge.',
  'tools: Read, Glob, Grep, Bash',
  '---',
  '',
  '# Agent: `code-reviewer`',
  '',
  '## Papel',
  '',
  'Revisar código.',
  '',
].join('\n');

describe('lerCamposDoFrontmatter', () => {
  it('devolve [] quando o arquivo não abre com `---`', () => {
    expect(lerCamposDoFrontmatter('# Agent\n\nsem frontmatter\n')).toEqual([]);
  });

  it('lê name, description e tools com a linha de cada um', () => {
    const campos = lerCamposDoFrontmatter(AGENTE_BOM);
    expect(campos.map((c) => c.campo)).toEqual(['name', 'description', 'tools']);
    expect(campos[0]!.linha).toBe(2);
    expect(campos[0]!.texto).toBe('code-reviewer');
    expect(campos[2]!.linha).toBe(4);
    expect(campos[2]!.texto).toBe('Read, Glob, Grep, Bash');
  });

  it('tira as aspas envolventes do valor', () => {
    const campos = lerCamposDoFrontmatter(
      ['---', 'name: a', 'description: "Com aspas."', 'tools: Read', '---'].join('\n'),
    );
    expect(campos[1]!.texto).toBe('Com aspas.');
  });

  it('valor em bloco (`>`) conta como preenchido', () => {
    const campos = lerCamposDoFrontmatter(
      ['---', 'name: a', 'description: >', '  texto do bloco', 'tools: Read', '---'].join('\n'),
    );
    expect(campos[1]!.texto).toBe('texto do bloco');
  });

  it('lista indentada conta como preenchido', () => {
    const campos = lerCamposDoFrontmatter(
      ['---', 'name: a', 'description: d', 'tools:', '  - Read', '  - Bash', '---'].join('\n'),
    );
    expect(campos[2]!.texto).toBe('Read Bash');
    expect(campos[2]!.vazio).toBe(false);
  });

  it('comentário de linha é valor vazio — o YAML entrega null', () => {
    const campos = lerCamposDoFrontmatter(
      ['---', 'name: a', 'description: # TODO', 'tools: Read', '---'].join('\n'),
    );
    expect(campos[1]!.texto).toBe('');
    expect(campos[1]!.vazio).toBe(true);
  });

  it('`[]`, `null` e `~` são vazios', () => {
    for (const valor of ['[]', 'null', '~']) {
      const campos = lerCamposDoFrontmatter(
        ['---', 'name: a', 'description: d', `tools: ${valor}`, '---'].join('\n'),
      );
      expect(campos[2]!.vazio).toBe(true);
    }
  });

  it('lista de item vazio é vazia', () => {
    const campos = lerCamposDoFrontmatter(
      ['---', 'name: a', 'description: d', 'tools:', '  - ""', '---'].join('\n'),
    );
    expect(campos[2]!.vazio).toBe(true);
  });

  it('ignora o corpo do arquivo', () => {
    const campos = lerCamposDoFrontmatter(
      ['---', 'name: a', '---', '', 'name: isto-e-o-corpo'].join('\n'),
    );
    expect(campos).toHaveLength(1);
    expect(campos[0]!.campo).toBe('name');
  });
});

describe('lacunasDeAgent', () => {
  it('agent completo não tem lacuna', () => {
    expect(lacunasDeAgent('.agents/agents/code-reviewer.md', AGENTE_BOM)).toEqual([]);
  });

  it('sem `tools` — lacuna nomeando o campo e a linha do fim do frontmatter', () => {
    const texto = ['---', 'name: a', 'description: d', '---', '', '# Agent'].join('\n');
    const lacunas = lacunasDeAgent('.agents/agents/a.md', texto);
    expect(lacunas).toHaveLength(1);
    expect(lacunas[0]!.campo).toBe('tools');
    expect(lacunas[0]!.linha).toBe(4);
    expect(lacunas[0]!.motivo).toMatch(/não declara `tools`/);
  });

  it('`description` vazia — lacuna na linha do campo', () => {
    const texto = ['---', 'name: a', 'description:', 'tools: Read', '---'].join('\n');
    const lacunas = lacunasDeAgent('.agents/agents/a.md', texto);
    expect(lacunas).toHaveLength(1);
    expect(lacunas[0]!.campo).toBe('description');
    expect(lacunas[0]!.linha).toBe(3);
    expect(lacunas[0]!.motivo).toMatch(/vazio/);
  });

  it('`name` diferente do nome do arquivo — lacuna', () => {
    const texto = ['---', 'name: outro', 'description: d', 'tools: Read', '---'].join('\n');
    const lacunas = lacunasDeAgent('.agents/agents/a.md', texto);
    expect(lacunas).toHaveLength(1);
    expect(lacunas[0]!.campo).toBe('name');
    expect(lacunas[0]!.motivo).toMatch(/o arquivo é `a\.md`/);
  });

  it('sem frontmatter — lacuna única, na linha 1', () => {
    const lacunas = lacunasDeAgent('.agents/agents/a.md', '# Agent\n\nsem frontmatter\n');
    expect(lacunas).toHaveLength(1);
    expect(lacunas[0]!.campo).toBe('(frontmatter)');
    expect(lacunas[0]!.linha).toBe(1);
  });

  it('arquivo com CRLF não é acusado (o `\r` fica no fim de cada linha)', () => {
    const texto = ['---', 'name: a', 'description: d', 'tools: Read', '---', '', '# A', ''].join(
      '\r\n',
    );
    expect(lacunasDeAgent('.agents/agents/a.md', texto)).toEqual([]);
  });

  it('arquivo com BOM não é acusado (o BOM não é parte do frontmatter)', () => {
    const texto = '﻿' + ['---', 'name: a', 'description: d', 'tools: Read', '---'].join('\n');
    expect(lacunasDeAgent('.agents/agents/a.md', texto)).toEqual([]);
  });

  it('chave repetida é lacuna — YAML de chave duplicada é inválido', () => {
    const texto = ['---', 'name: a', 'description: d', 'tools: Read', 'name: outro', '---'].join(
      '\n',
    );
    const lacunas = lacunasDeAgent('.agents/agents/a.md', texto);
    expect(lacunas).toHaveLength(1);
    expect(lacunas[0]!.campo).toBe('name');
    expect(lacunas[0]!.linha).toBe(5);
    expect(lacunas[0]!.motivo).toMatch(/mais de uma vez/);
  });

  it('frontmatter que nunca fecha é lacuna — o corpo não é frontmatter', () => {
    const texto = ['---', 'name: a', 'description: d', 'tools: Read', '', '# Agent'].join('\n');
    const lacunas = lacunasDeAgent('.agents/agents/a.md', texto);
    expect(lacunas).toHaveLength(1);
    expect(lacunas[0]!.campo).toBe('(frontmatter)');
    expect(lacunas[0]!.motivo).toMatch(/nunca fecha/);
  });

  it('`description: # TODO` é vazio — o YAML entrega null, e o agent fica sem gatilho', () => {
    const texto = ['---', 'name: a', 'description: # TODO', 'tools: Read', '---'].join('\n');
    const lacunas = lacunasDeAgent('.agents/agents/a.md', texto);
    expect(lacunas).toHaveLength(1);
    expect(lacunas[0]!.campo).toBe('description');
    expect(lacunas[0]!.motivo).toMatch(/vazio/);
  });

  it('`tools: []` é vazio — a pool do subagent seria a inteira', () => {
    const texto = ['---', 'name: a', 'description: d', 'tools: []', '---'].join('\n');
    const lacunas = lacunasDeAgent('.agents/agents/a.md', texto);
    expect(lacunas).toHaveLength(1);
    expect(lacunas[0]!.campo).toBe('tools');
  });
});

describe('checkAgentFrontmatter', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'agent-frontmatter-'));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  function writeAgent(nome: string, conteudo: string) {
    const dir = join(tmp, '.agents/agents');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${nome}.md`), conteudo);
  }

  it('skipped quando `.agents/agents/` não existe', () => {
    const r = checkAgentFrontmatter({ repoRoot: tmp });
    expect(r.ok).toBe(true);
    expect(r.skipped).toBe(true);
    expect(r.reason).toMatch(/\.agents\/agents/);
  });

  it('verde quando todo agent declara os três campos', () => {
    writeAgent('code-reviewer', AGENTE_BOM);
    const r = checkAgentFrontmatter({ repoRoot: tmp });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('vermelho nomeando arquivo e linha quando falta `tools`', () => {
    writeAgent('a', ['---', 'name: a', 'description: d', '---', '', '# Agent'].join('\n'));
    const r = checkAgentFrontmatter({ repoRoot: tmp });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/\.agents\/agents\/a\.md:4/);
    expect(r.errors[0]).toMatch(/tools/);
  });

  it('a medição é anunciada mesmo quando é 0 (verde mudo é classe 5)', () => {
    mkdirSync(join(tmp, '.agents/agents'), { recursive: true });
    const r = checkAgentFrontmatter({ repoRoot: tmp });
    expect(r.ok).toBe(true);
    expect((r.advisories ?? []).join('\n')).toMatch(/medido: 0 agent\(s\)/);
  });

  it('ignora `.md` em subdirectório (material de referência, não agent)', () => {
    const dir = join(tmp, '.agents/agents/telemetry-specialist');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'patterns.md'), '# sem frontmatter\n');
    const r = checkAgentFrontmatter({ repoRoot: tmp });
    expect(r.ok).toBe(true);
    expect((r.advisories ?? []).join('\n')).toMatch(/medido: 0 agent\(s\)/);
  });

  it('o repo REAL: todo agent canônico declara name, description e tools', () => {
    const { lacunas, medidos } = auditarAgents(RAIZ);
    expect(lacunas).toEqual([]);
    expect(medidos).toBeGreaterThan(0);
  });
});
