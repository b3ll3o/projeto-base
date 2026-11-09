import { describe, expect, it } from 'vitest';
import { INDICE } from './check-skill-coverage';
import {
  citaNome,
  donoDeclarado,
  lacunasDeRegistro,
  lerFrontmatter,
  listarSkills,
  nomesCitadosPorLink,
  type FrontmatterSkill,
} from './check-skill-coverage';

describe('citaNome', () => {
  it('casa o nome como palavra inteira', () => {
    expect(citaNome('a skill `ui-craft` carrega', 'ui-craft')).toBe(true);
  });

  it('NÃO casa um nome que é PREFIXO de outro (a classe 5 de guard-classes)', () => {
    // Sem fronteira, `ui-craft` casaria dentro de `ui-craft-extra` e o gate
    // acusaria uma skill que não existe.
    expect(citaNome('a skill ui-craft-extra existe', 'ui-craft')).toBe(false);
    expect(citaNome('prisma-audit-superseded', 'prisma-audit')).toBe(false);
  });

  it('NÃO casa um nome que é SUFIXO de outro', () => {
    expect(citaNome('legacy-ui-craft', 'ui-craft')).toBe(false);
  });

  it('o `\\b` do JavaScript NÃO serviria: `-` é fronteira de palavra', () => {
    // `\\bui-craft\\b` casaria dentro de `ui-craft-extra`? Não — mas o
    // motivo real é o inverso: `x-ui-craft` também casaria. O teste
    // trava o comportamento correto, que é o lookaround explícito.
    expect(citaNome('x-ui-craft', 'ui-craft')).toBe(false);
  });

  it('nome vazio nunca casa (senão casaria em qualquer lugar)', () => {
    expect(citaNome('qualquer texto', '')).toBe(false);
  });

  it('escapa metacaracteres de regex no nome', () => {
    expect(citaNome('a skill a+b existe', 'a+b')).toBe(true);
    expect(citaNome('a skill axb existe', 'a+b')).toBe(false);
  });
});

describe('nomesCitadosPorLink', () => {
  it('extrai o nome do caminho do link canônico', () => {
    const texto = 'ver [`.agents/skills/ui-craft/SKILL.md`](./.agents/skills/ui-craft/SKILL.md)';
    expect(nomesCitadosPorLink(texto)).toEqual(['ui-craft']);
  });

  it('NÃO extrai um nome de caminho que não é de skill', () => {
    const texto = 'ver [`.agents/agents/explorer.md`](./.agents/agents/explorer.md)';
    expect(nomesCitadosPorLink(texto)).toEqual([]);
  });

  it('deduplica e ordena (a saída precisa ser estável entre execuções)', () => {
    const texto = [
      '`.agents/skills/motion/SKILL.md`',
      '`.agents/skills/ui-craft/SKILL.md`',
      '`.agents/skills/motion/SKILL.md`',
    ].join('\n');
    expect(nomesCitadosPorLink(texto)).toEqual(['motion', 'ui-craft']);
  });
});

describe('donoDeclarado', () => {
  const agents = new Set(['specialist-router', 'explorer']);

  it('extrai o agent do bloco "Quem invoca"', () => {
    const canonico =
      '> **Quem invoca:** `specialist-router` (quando nenhuma skill cobre).\n>\n> **Quando invocar:** sempre.';
    expect(donoDeclarado(canonico, agents)).toBe('specialist-router');
  });

  it('devolve null quando a skill NÃO declara o cabeçalho', () => {
    expect(donoDeclarado('# Skill\n\nsem bloco', agents)).toBeNull();
  });

  it('devolve null quando o nome citado NÃO é um agent conhecido', () => {
    const canonico = '> **Quem invoca:** `skill-que-nao-e-agent` (coisa).';
    expect(donoDeclarado(canonico, agents)).toBeNull();
  });

  it('o bloco é cortado no parágrafo seguinte (não puxa o resto do arquivo)', () => {
    // Sem o corte, "Quem invoca" capturaria o `explorer` citado mais abaixo
    // — e reconciliaria contra o agent errado.
    const canonico = [
      '> **Quem invoca:** `specialist-router` (para demandas sem skill).',
      '>',
      '> **Quando invocar:** sempre.',
      '',
      '## Corpo',
      '',
      'O `explorer` tambem aparece aqui.',
    ].join('\n');
    expect(donoDeclarado(canonico, agents)).toBe('specialist-router');
  });
});

describe('lerFrontmatter', () => {
  it('lê `name` e `description` entre aspas', () => {
    const fm = lerFrontmatter(
      [
        '---',
        'name: ui-craft',
        'version: 1.0',
        'description: "a descrição"',
        '---',
        '',
        '# corpo',
      ].join('\n'),
    );
    expect(fm).toEqual({ name: 'ui-craft', description: 'a descrição' });
  });

  it('lê `description` CRUA (sem aspas)', () => {
    const fm = lerFrontmatter(
      ['---', 'name: docker', 'description: Convenções e processos docker', '---'].join('\n'),
    );
    expect(fm).toEqual({ name: 'docker', description: 'Convenções e processos docker' });
  });

  it('lê `description` DOBRADA (`>` + linhas indentadas)', () => {
    const fm = lerFrontmatter(
      ['---', 'name: x', 'description: >', '  primeira parte', '  segunda parte', '---'].join('\n'),
    );
    expect(fm.description).toBe('primeira parte segunda parte');
  });

  it('devolve vazio quando NÃO há frontmatter', () => {
    expect(lerFrontmatter('# só corpo\n')).toEqual({ name: '', description: '' });
  });

  it('NÃO confunde `name` com `updated` (o campo é prefixo de outro)', () => {
    const fm = lerFrontmatter(
      ['---', 'name: x', 'updated: 2026-11-09', 'description: d', '---'].join('\n'),
    );
    expect(fm.name).toBe('x');
  });

  it('`description: # TODO` é VAZIO — o YAML entrega null, e a skill fica sem gatilho', () => {
    const fm = lerFrontmatter(['---', 'name: x', 'description: # TODO', '---'].join('\n'));
    expect(fm.description).toBe('');
  });

  it('`description: []` e `description: null` são VAZIOS — lista vazia e null do YAML', () => {
    for (const valor of ['[]', 'null']) {
      const fm = lerFrontmatter(['---', 'name: x', `description: ${valor}`, '---'].join('\n'));
      expect(fm.description).toBe('');
    }
  });

  it('frontmatter sem o `---` que fecha é VAZIO — o corpo não é frontmatter', () => {
    const fm = lerFrontmatter(
      ['---', 'name: x', 'description: d', '', '# corpo', '', 'name: do-corpo'].join('\n'),
    );
    expect(fm).toEqual({ name: '', description: '' });
  });
});

describe('lacunasDeRegistro', () => {
  // O 4º argumento deixou de ser o conjunto de wrappers (a pasta `.claude/`
  // não existe mais) e passou a ser o **frontmatter** de cada skill — o que
  // o harness lê para descobri-la. `fm()` monta o map de uma skill sadia.
  const fm = (nomes: string[]): Map<string, FrontmatterSkill> =>
    new Map(nomes.map((n) => [n, { name: n, description: `descrição de ${n}` }]));
  const frontmatters = fm(['ui-craft', 'graphify']);

  it('a skill completa NÃO gera lacuna', () => {
    const lacunas = lacunasDeRegistro(
      ['ui-craft'],
      'a skill ui-craft está indexada',
      'o agent carrega ui-craft',
      frontmatters,
    );
    expect(lacunas).toEqual([]);
  });

  it('acusa a skill NÃO INDEXADA', () => {
    const lacunas = lacunasDeRegistro(
      ['ui-craft'],
      'nada aqui',
      'o agent carrega ui-craft',
      frontmatters,
    );
    expect(lacunas.map((l) => l.regra)).toEqual(['indexada']);
    expect(lacunas[0]?.skill).toBe('ui-craft');
  });

  it('acusa a skill SEM DONO (órfã: ninguém a carrega)', () => {
    const lacunas = lacunasDeRegistro(
      ['ui-craft'],
      'a skill ui-craft está indexada',
      'o agent carrega outra coisa',
      frontmatters,
    );
    expect(lacunas.map((l) => l.regra)).toEqual(['sem-dono']);
  });

  it('acusa a skill NÃO DESCOBRÍVEL (frontmatter sem name/description)', () => {
    const lacunas = lacunasDeRegistro(
      ['ui-craft'],
      'a skill ui-craft está indexada',
      'o agent carrega ui-craft',
      new Map([['ui-craft', { name: '', description: '' }]]),
    );
    expect(lacunas.map((l) => l.regra)).toEqual(['descobrivel']);
    expect(lacunas[0]?.detalhe).toContain('name');
  });

  it('acusa a skill cujo `name` do frontmatter NÃO é o nome do diretório', () => {
    const lacunas = lacunasDeRegistro(
      ['ui-craft'],
      'a skill ui-craft está indexada',
      'o agent carrega ui-craft',
      new Map([['ui-craft', { name: 'outro-nome', description: 'd' }]]),
    );
    expect(lacunas.map((l) => l.regra)).toEqual(['descobrivel']);
    expect(lacunas[0]?.detalhe).toContain('outro-nome');
  });

  it('acusa a skill SEM FRONTMATTER LEGÍVEL — ausência é defeito, não "não medido"', () => {
    // Sem o frontmatter, nenhum harness acha a skill. Um gate que passasse
    // por não ter medido seria verde por ausência (classe 5).
    const lacunas = lacunasDeRegistro(
      ['ui-craft'],
      'a skill ui-craft está indexada',
      'o agent carrega ui-craft',
      new Map(),
    );
    expect(lacunas.map((l) => l.regra)).toEqual(['descobrivel']);
  });

  it('acusa a skill FANTASMA (citada no índice, não existe no disco)', () => {
    const lacunas = lacunasDeRegistro(
      [],
      'ver `.agents/skills/skill-que-nao-existe/SKILL.md`',
      '',
      frontmatters,
    );
    expect(lacunas.map((l) => l.regra)).toEqual(['fantasma']);
    expect(lacunas[0]?.skill).toBe('skill-que-nao-existe');
  });

  it('acusa a skill RECÍPROCA (declara um dono que não a cita de volta)', () => {
    const lacunas = lacunasDeRegistro(
      ['find-skills'],
      'a skill find-skills está indexada',
      'outro agent carrega outra coisa',
      fm(['find-skills']),
      new Map([['find-skills', '> **Quem invoca:** `specialist-router` (quando nada cobre).']]),
      new Set(['specialist-router']),
      new Map([['specialist-router', 'o roteador classifica a demanda e nada mais']]),
    );
    expect(lacunas.map((l) => l.regra)).toEqual(['sem-dono', 'reciproca']);
  });

  it('a RECÍPROCA NÃO acusa quando o dono declarado cita a skill', () => {
    const lacunas = lacunasDeRegistro(
      ['find-skills'],
      'a skill find-skills está indexada',
      'o specialist-router carrega find-skills',
      fm(['find-skills']),
      new Map([['find-skills', '> **Quem invoca:** `specialist-router` (quando nada cobre).']]),
      new Set(['specialist-router']),
      new Map([['specialist-router', 'o specialist-router carrega find-skills']]),
    );
    expect(lacunas).toEqual([]);
  });

  it('a RECÍPROCA checa o DONO DECLARADO, não qualquer citador', () => {
    // Outro agent cita a skill, mas o dono declarado não — o drift continua
    // e a regra tem que accusationar.
    const lacunas = lacunasDeRegistro(
      ['find-skills'],
      'a skill find-skills está indexada',
      'outro agent carrega find-skills',
      fm(['find-skills']),
      new Map([['find-skills', '> **Quem invoca:** `specialist-router` (quando nada cobre).']]),
      new Set(['specialist-router']),
      new Map([['specialist-router', 'o roteador classifica a demanda e nada mais']]),
    );
    expect(lacunas.map((l) => l.regra)).toEqual(['reciproca']);
  });

  it('a skill citada SÓ pelo nome conta como indexada (o índice lista 20 assim)', () => {
    const lacunas = lacunasDeRegistro(
      ['prisma-audit'],
      'Skills de auditoria (1:1): `prisma-audit`, `openapi-audit`',
      'o agent prisma-db-specialist carrega prisma-audit',
      fm(['prisma-audit']),
    );
    expect(lacunas).toEqual([]);
  });

  it('a skill citada por LINK conta como indexada', () => {
    const lacunas = lacunasDeRegistro(
      ['graphify'],
      'ver [`.agents/skills/graphify/SKILL.md`](./.agents/skills/graphify/SKILL.md)',
      'o explorer carrega graphify',
      fm(['graphify']),
    );
    expect(lacunas).toEqual([]);
  });

  it('a ORDEM das mensagens é estável (skill, e dentro dela a ordem das regras)', () => {
    const lacunas = lacunasDeRegistro(['zzz-skill', 'aaa-skill'], 'nada', 'nada', new Map());
    expect(lacunas.map((l) => l.skill)).toEqual([
      'aaa-skill',
      'aaa-skill',
      'aaa-skill',
      'zzz-skill',
      'zzz-skill',
      'zzz-skill',
    ]);
    expect(lacunas.map((l) => l.regra)).toEqual([
      'indexada',
      'sem-dono',
      'descobrivel',
      'indexada',
      'sem-dono',
      'descobrivel',
    ]);
  });

  it('acusa a skill FANTASMA citada por um AGENT (não só pelo índice)', () => {
    // O cabeçalho do gate promete "o `AGENTS.md` (ou um agent) cita uma skill
    // que não existe". A primeira versão só varria o índice — e um agent
    // apontando para uma skill inexistente passava.
    const lacunas = lacunasDeRegistro(
      [],
      'nada no índice',
      'ver `.agents/skills/skill-que-nao-existe/SKILL.md`',
      frontmatters,
    );
    expect(lacunas.map((l) => l.regra)).toEqual(['fantasma']);
    expect(lacunas[0]?.skill).toBe('skill-que-nao-existe');
  });

  it('a FANTASMA nomeia ONDE o link quebrado foi encontrado', () => {
    const lacunas = lacunasDeRegistro(
      [],
      'ver `.agents/skills/fantasma-do-indice/SKILL.md`',
      '',
      frontmatters,
    );
    expect(lacunas[0]?.detalhe).toContain(INDICE);
  });

  it('NÃO acusa a skill FANTASMA se ela também existir (o par órfão/fantasma é separado)', () => {
    const lacunas = lacunasDeRegistro(
      ['ui-craft'],
      'ver `.agents/skills/ui-craft/SKILL.md`',
      'o agent carrega ui-craft',
      fm(['ui-craft']),
    );
    expect(lacunas).toEqual([]);
  });
});

describe('listarSkills', () => {
  it('um diretório sem SKILL.md NÃO é uma skill', async () => {
    const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const raiz = mkdtempSync(join(tmpdir(), 'skills-'));
    try {
      mkdirSync(join(raiz, '.agents', 'skills', 'real'), { recursive: true });
      writeFileSync(join(raiz, '.agents', 'skills', 'real', 'SKILL.md'), '---\nname: real\n---\n');
      mkdirSync(join(raiz, '.agents', 'skills', 'lixo'), { recursive: true });
      const skills = await listarSkills(raiz);
      expect(skills).toEqual(['real']);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });

  it('um diretório INEXISTENTE devolve lista vazia (o gate acusa, mas não quebra)', async () => {
    const skills = await listarSkills('/caminho/que/nao/existe');
    expect(skills).toEqual([]);
  });
});
